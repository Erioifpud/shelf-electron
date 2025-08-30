import { type ClientHttp2Session, constants as http2constants } from 'http2';
import type {
  ChannelId,
  ControlChannel,
  Http2Transport,
  IncomingStreamChannel,
  MaybePromise,
  OutgoingStreamChannel,
  ServerSignal,
} from '@eleplug/h2';
import {
  AsyncEventEmitter,
  CONTROL_PATH,
  INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH,
} from '@eleplug/h2';
import { H2ClientControlChannel, H2ClientStreamChannel } from './channel.js';

/** Manages the lifecycle state of the transport. */
enum TransportState {
  /** The transport is active and can create new channels. */
  OPEN,
  /** A graceful close has been initiated (`close()` was called). No new channels can be created. */
  CLOSING,
  /** The transport is fully terminated (due to close, abort, or error) and is unusable. */
  CLOSED,
}

/**
 * Implements the eRPC `Transport` interface over a client-side HTTP/2 session.
 *
 * This class manages the entire lifecycle of the connection, including:
 * - Establishing and caching the primary control channel.
 * - Opening new outgoing stream channels.
 * - Handling server-initiated stream channels via signals.
 * - Managing graceful shutdown (`close`) and immediate termination (`abort`).
 * - Reacting to session-level events like 'error', 'close', and 'goaway'.
 */
export class Http2ClientTransport implements Http2Transport {
  private readonly events = new AsyncEventEmitter<{
    /** Emitted exactly once when the transport closes for any reason. */
    close: (reason?: Error) => void;
  }>();

  private onIncomingStreamHandler:
    | ((channel: IncomingStreamChannel) => MaybePromise<void>)
    | null = null;

  private state: TransportState = TransportState.OPEN;
  private controlChannelPromise: Promise<H2ClientControlChannel> | null = null;

  /** A promise that resolves when the transport is fully closed. */
  private readonly closePromise: Promise<void>;
  private resolveClosePromise!: () => void;

  constructor(private readonly session: ClientHttp2Session) {
    this.closePromise = new Promise((resolve) => {
      this.resolveClosePromise = resolve;
    });

    this.setupSessionListeners();
  }

  /**
   * Sets up listeners for critical session events to manage the transport lifecycle.
   * @internal
   */
  private setupSessionListeners(): void {
    // 'close' is the final, definitive event for a session, indicating all
    // streams are terminated.
    this.session.once('close', () => {
      const reason =
        this.state === TransportState.CLOSING
          ? undefined // This was a graceful, expected closure.
          : new Error('HTTP/2 session closed unexpectedly.');
      this.performFinalCleanup(reason);
    });

    // 'error' indicates a non-recoverable error in the session.
    this.session.once('error', (err) => {
      this.performFinalCleanup(err);
    });

    // 'goaway' is a signal from the server that it will no longer accept
    // new streams.
    this.session.on('goaway', (errorCode, _lastStreamID, opaqueData) => {
      // A GOAWAY with NO_ERROR is part of a graceful shutdown initiated by the server.
      // We can let the session close naturally.
      if (errorCode === http2constants.NGHTTP2_NO_ERROR) {
        return;
      }
      // Any other error code signifies an abrupt termination by the server.
      const reasonText =
        opaqueData?.length > 0
          ? opaqueData.toString()
          : `GOAWAY received with error code ${errorCode}`;
      this.performFinalCleanup(new Error(reasonText));
    });
  }

  /**
   * The single, idempotent entry point for all transport shutdown logic.
   * This ensures cleanup happens exactly once and emits the final 'close' event.
   * @internal
   */
  private performFinalCleanup(reason?: Error): void {
    if (this.state === TransportState.CLOSED) return;
    this.state = TransportState.CLOSED;

    // Reject any pending request for the control channel.
    // The `catch` prevents unhandled rejection warnings if it was never awaited.
    this.controlChannelPromise?.catch(() => {});
    this.controlChannelPromise = null;

    // Emit the single, final lifecycle event to our consumers.
    this.events.emit('close', reason);
    this.events.removeAllListeners();

    // Ensure the underlying session is fully destroyed. This is idempotent.
    if (!this.session.destroyed) {
      this.session.destroy(reason);
    }

    // Fulfill the public `close()` or `abort()` promise.
    this.resolveClosePromise();
  }

  // #region Public API (Transport Interface Implementation)

  public getControlChannel(): Promise<ControlChannel> {
    if (this.state !== TransportState.OPEN) {
      return Promise.reject(new Error('Transport is not open.'));
    }

    // Return the cached promise if it exists (either resolved or in-flight).
    if (this.controlChannelPromise) {
      return this.controlChannelPromise;
    }

    // Create and cache a new promise for the control channel.
    const promise = new Promise<H2ClientControlChannel>((resolve, reject) => {
      if (this.session.destroyed || this.session.closed) {
        return reject(new Error('HTTP/2 session is already closed.'));
      }

      // 1. Create a new HTTP/2 stream (request).
      const stream = this.session.request({
        ':method': 'POST',
        ':path': CONTROL_PATH,
      });

      // 2. Set up temporary listeners for the stream setup phase.
      const onError = (err: Error) => {
        stream.removeListener('response', onResponse);
        reject(err);
      };

      const onResponse = (headers: { ':status'?: number }) => {
        stream.removeListener('error', onError);

        // 3. Check if the server accepted the channel.
        if (headers[':status'] !== 200) {
          const err = new Error(
            `Server rejected control channel with status ${headers[':status']}`,
          );
          if (!stream.destroyed) stream.destroy(err);
          return reject(err);
        }

        // 4. Promote the raw stream to a full-featured channel.
        const channel = new H2ClientControlChannel(stream);

        // 5. Hook into the new channel's lifecycle.
        channel.onSignal((signal) => this.handleServerSignal(signal));
        channel.onClose((channelReason) => {
          // If the control channel dies while the transport is supposed to be
          // open, it's a critical failure. Shut down the entire transport.
          if (this.state === TransportState.OPEN) {
            const transportError =
              channelReason ?? new Error('Control channel closed unexpectedly.');
            this.performFinalCleanup(transportError);
          }
        });

        resolve(channel);
      };

      stream.once('error', onError);
      stream.once('response', onResponse);
    });

    // Cache the promise. If it fails, clear the cache to allow for a retry.
    this.controlChannelPromise = promise;
    promise.catch(() => {
      if (this.controlChannelPromise === promise) {
        this.controlChannelPromise = null;
      }
    });

    return promise;
  }

  public openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    if (this.state !== TransportState.OPEN) {
      return Promise.reject(new Error('Transport is not open.'));
    }

    return new Promise((resolve, reject) => {
      const stream = this.session.request({
        ':method': 'POST',
        ':path': STREAM_PATH,
      });

      stream.on('response', (headers) => {
        if (headers[':status'] !== 200) {
          const err = new Error(
            `Server rejected stream channel with status ${headers[':status']}`,
          );
          if (!stream.destroyed) stream.destroy(err);
          return reject(err);
        }

        const channelId = String(stream.id);
        const channel = new H2ClientStreamChannel(stream, channelId);
        resolve(channel);
      });

      stream.once('error', reject);
    });
  }

  public onIncomingStreamChannel(
    handler: (channel: IncomingStreamChannel) => MaybePromise<void>,
  ): void {
    this.onIncomingStreamHandler = handler;
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public close(): Promise<void> {
    if (this.state === TransportState.CLOSED) {
      return this.closePromise;
    }
    if (this.state === TransportState.OPEN) {
      this.state = TransportState.CLOSING;
      // Initiate graceful shutdown. The session's 'close' event will
      // eventually trigger `performFinalCleanup`.
      if (!this.session.closed) {
        this.session.close();
      }
    }
    return this.closePromise;
  }

  public abort(reason: Error): Promise<void> {
    if (this.state === TransportState.CLOSED) {
      return this.closePromise;
    }
    // Aborting bypasses the CLOSING state and goes directly to cleanup.
    this.performFinalCleanup(reason);
    return this.closePromise;
  }

  // #endregion

  // #region Internal Signal Handling

  /**
   * Processes signals received from the server on the control channel.
   * @internal
   */
  private handleServerSignal(signal: ServerSignal): void {
    if (this.state !== TransportState.OPEN) return;

    if (signal.type === 'open-stream-request') {
      this.handleOpenStreamRequest(signal.channelId);
    }
  }

  /**
   * Handles a server's request to open a new stream channel by creating a new
   * outgoing request that the server can correlate.
   * @internal
   */
  private handleOpenStreamRequest(channelId: ChannelId): void {
    if (this.state !== TransportState.OPEN) return;

    const handler = this.onIncomingStreamHandler;
    if (!handler) {
      console.error(
        `[H2-Client] Server requested to open stream ${channelId}, but no handler is registered via onIncomingStreamChannel. Ignoring.`,
      );
      return;
    }

    // The client complies by making a new request and "tagging" it with the
    // channel ID provided by the server.
    const stream = this.session.request({
      ':method': 'POST',
      ':path': STREAM_PATH,
      [INITIATING_CHANNEL_ID_HEADER]: channelId,
    });

    stream.on('response', (headers) => {
      if (headers[':status'] !== 200) {
        console.error(
          `[H2-Client] Server rejected our attempt to open server-initiated stream ${channelId}. Status: ${headers[':status']}`,
        );
        if (!stream.destroyed) stream.destroy();
        return;
      }

      const channel = new H2ClientStreamChannel(stream, channelId);

      // Pass the new channel to the registered application handler.
      // We wrap the handler call in a Promise to catch both sync and async errors.
      try {
        Promise.resolve(handler(channel)).catch((err) => {
          console.error(
            `[H2-Client] Error in onIncomingStreamChannel handler for channel ${channelId}:`,
            err,
          );
          channel.close();
        });
      } catch (err) {
        console.error(
          `[H2-Client] Synchronous error in onIncomingStreamChannel handler for channel ${channelId}:`,
          err,
        );
        channel.close();
      }
    });

    stream.once('error', (err) => {
      console.error(
        `[H2-Client] Error on server-initiated stream for channel ${channelId}:`,
        err,
      );
    });
  }
  // #endregion
}