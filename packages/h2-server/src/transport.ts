import { v4 as uuid } from 'uuid';
import {
  constants as http2constants,
  type IncomingHttpHeaders,
  type ServerHttp2Session,
  type ServerHttp2Stream,
} from 'http2';
import type {
  ChannelId,
  ControlChannel,
  Http2Transport,
  IncomingStreamChannel,
  MaybePromise,
  OutgoingStreamChannel,
} from '@eleplug/h2';
import {
  AsyncEventEmitter,
  CONTROL_PATH,
  INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH,
} from '@eleplug/h2';
import { H2ServerControlChannel, H2ServerStreamChannel } from './channel.js';

/** Manages the lifecycle state of the transport. */
enum TransportState {
  OPEN,
  CLOSING,
  CLOSED,
}

type PendingStreamData = { stream: ServerHttp2Stream; headers: IncomingHttpHeaders };
/**
 * Represents a server-initiated stream that is awaiting the client's
 * corresponding incoming `request`.
 * @internal
 */
type PendingOutgoingStream = {
  resolve: (data: PendingStreamData) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
};

/**
 * Implements the eRPC `Transport` interface over a server-side HTTP/2 session.
 * An instance of this class is created for each new client connection.
 *
 * This class manages the session's lifecycle, including:
 * - Handling incoming requests and routing them to control or data channels.
 * - Orchestrating the creation of server-initiated stream channels.
 * - Managing graceful shutdown (`close`) and immediate termination (`abort`).
 */
export class Http2ServerTransport implements Http2Transport {
  private readonly events = new AsyncEventEmitter<{
    close: (reason?: Error) => void;
  }>();

  private onIncomingStreamHandler:
    | ((channel: IncomingStreamChannel) => MaybePromise<void>)
    | null = null;

  private state: TransportState = TransportState.OPEN;
  private isControlChannelEstablished = false;

  // A promise that resolves when the client establishes the control channel.
  private readonly controlChannelPromise: Promise<H2ServerControlChannel>;
  private resolveControlChannel!: (
    channel: H2ServerControlChannel | PromiseLike<H2ServerControlChannel>,
  ) => void;
  private rejectControlChannel!: (reason?: any) => void;

  /**
   * Stores resolvers for pending server-initiated streams, keyed by the
   * `channelId` sent to the client.
   */
  private readonly pendingOutgoingStreams = new Map<
    ChannelId,
    PendingOutgoingStream
  >();

  private readonly closePromise: Promise<void>;
  private resolveClosePromise!: () => void;

  constructor(private readonly session: ServerHttp2Session) {
    this.closePromise = new Promise((resolve) => {
      this.resolveClosePromise = resolve;
    });

    this.controlChannelPromise = new Promise((resolve, reject) => {
      this.resolveControlChannel = resolve;
      this.rejectControlChannel = reject;
    });
    // Suppress unhandled rejections if the transport closes before this is awaited.
    this.controlChannelPromise.catch(() => {});

    this.setupSessionListeners();
  }

  /** Sets up listeners for critical session events. @internal */
  private setupSessionListeners(): void {
    this.session.once('close', () => {
      const reason =
        this.state === TransportState.CLOSING
          ? undefined
          : new Error('HTTP/2 session closed unexpectedly.');
      this.performFinalCleanup(reason);
    });

    this.session.once('error', (err) => this.performFinalCleanup(err));

    this.session.on('goaway', (errorCode, _lastStreamID, opaqueData) => {
      if (errorCode === http2constants.NGHTTP2_NO_ERROR) return; // Graceful
      const reasonText =
        opaqueData?.length > 0
          ? opaqueData.toString()
          : `GOAWAY received with error code ${errorCode}`;
      this.performFinalCleanup(new Error(reasonText));
    });

    // The main entry point for all incoming requests from the client.
    this.session.on('stream', (stream, headers) => {
      try {
        this.handleIncomingStream(stream, headers);
      } catch (err) {
        console.error(
          `[H2-Server] Unhandled error processing incoming stream ${stream.id}:`,
          err,
        );
        if (!stream.closed && !stream.destroyed) {
          stream.close(http2constants.NGHTTP2_INTERNAL_ERROR);
        }
      }
    });
  }

  /** Single, idempotent entry point for all transport shutdown logic. @internal */
  private performFinalCleanup(reason?: Error): void {
    if (this.state === TransportState.CLOSED) return;
    this.state = TransportState.CLOSED;

    const cleanupError = reason ?? new Error('Transport closed.');

    // Reject all pending promises.
    this.rejectControlChannel(cleanupError);
    this.pendingOutgoingStreams.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(cleanupError);
    });
    this.pendingOutgoingStreams.clear();

    this.events.emit('close', reason);
    this.events.removeAllListeners();

    if (!this.session.destroyed) {
      this.session.destroy(
        reason,
        reason
          ? http2constants.NGHTTP2_INTERNAL_ERROR
          : http2constants.NGHTTP2_NO_ERROR,
      );
    }

    this.resolveClosePromise();
  }

  /** Routes an incoming HTTP/2 stream to the appropriate handler. @internal */
  private handleIncomingStream(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
  ) {
    if (this.state !== TransportState.OPEN) {
      if (!stream.closed) stream.close(http2constants.NGHTTP2_REFUSED_STREAM);
      return;
    }

    const path = headers[':path'];
    switch (path) {
      case CONTROL_PATH:
        this.handleControlStream(stream);
        break;
      case STREAM_PATH:
        this.handleDataStream(stream, headers);
        break;
      default:
        if (!stream.headersSent) {
          stream.respond({ ':status': 404 }, { endStream: true });
        }
        break;
    }
  }

  /** Handles the establishment of the single control channel. @internal */
  private handleControlStream(stream: ServerHttp2Stream) {
    if (this.isControlChannelEstablished) {
      console.error(
        '[H2-Server] Client attempted to open a second control channel. Rejecting.',
      );
      stream.close(http2constants.NGHTTP2_PROTOCOL_ERROR);
      return;
    }
    this.isControlChannelEstablished = true;

    if (!stream.headersSent) {
      stream.respond({ ':status': 200 });
    }

    const channel = new H2ServerControlChannel(stream);
    channel.onClose((channelReason) => {
      if (this.state === TransportState.OPEN) {
        const err = channelReason ?? new Error('Control channel closed unexpectedly.');
        this.performFinalCleanup(err);
      }
    });

    this.resolveControlChannel(channel);
  }

  /** Handles an incoming data stream (client- or server-initiated). @internal */
  private handleDataStream(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
  ) {
    const requestedChannelId = headers[INITIATING_CHANNEL_ID_HEADER] as ChannelId | undefined;

    if (!stream.headersSent) {
      stream.respond({ ':status': 200 });
    }

    // Check if this stream corresponds to a pending server-initiated channel.
    if (requestedChannelId && this.pendingOutgoingStreams.has(requestedChannelId)) {
      // This is the client fulfilling our `open-stream-request` signal.
      const pending = this.pendingOutgoingStreams.get(requestedChannelId)!;
      clearTimeout(pending.timeoutId);
      this.pendingOutgoingStreams.delete(requestedChannelId);
      // Resolve the promise that `openOutgoingStreamChannel` is awaiting.
      pending.resolve({ stream, headers });
    } else {
      // This is a new stream initiated by the client.
      const handler = this.onIncomingStreamHandler;
      if (handler) {
        const channel = new H2ServerStreamChannel(stream);
        try {
          Promise.resolve(handler(channel)).catch((err) => {
            console.error(`[H2-Server] Error in onIncomingStreamChannel handler for ${channel.id}:`, err);
            channel.close();
          });
        } catch (err) {
          console.error(`[H2-Server] Sync error in onIncomingStreamChannel handler for ${channel.id}:`, err);
          channel.close();
        }
      } else {
        console.warn(`[H2-Server] No handler for client-initiated stream ${stream.id}. Closing.`);
        if (!stream.closed) {
          stream.close(http2constants.NGHTTP2_REFUSED_STREAM);
        }
      }
    }
  }

  // #region Public API (Transport Interface Implementation)

  public async openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    if (this.state !== TransportState.OPEN) {
      throw new Error('Transport is not open.');
    }

    // 1. We must have a control channel to send the signal.
    const controlChannel = await this.controlChannelPromise;
    if (controlChannel.isClosed) {
      throw new Error('Control channel is closed.');
    }

    const channelId = uuid();

    // 2. Set up a promise that will resolve when the client opens the corresponding stream.
    const streamPromise = new Promise<PendingStreamData>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingOutgoingStreams.delete(channelId);
        reject(new Error(`Timeout: Client did not open stream for channel ${channelId} within 10s.`));
      }, 10000);
      this.pendingOutgoingStreams.set(channelId, { resolve, reject, timeoutId });
    });

    // 3. Signal the client, requesting it to open a new stream with our channelId.
    await controlChannel.sendSignal({
      _h2_signal_: true,
      type: 'open-stream-request',
      channelId,
    });

    // 4. Wait for the client to comply. The `handleDataStream` method will resolve this.
    const { stream: h2Stream } = await streamPromise;

    // 5. Create and return the channel, now backed by a real stream.
    return new H2ServerStreamChannel(h2Stream, channelId);
  }

  public getControlChannel(): Promise<ControlChannel> {
    if (this.state === TransportState.CLOSED) {
      return Promise.reject(new Error('Transport is closed.'));
    }
    return this.controlChannelPromise;
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
    if (this.state !== TransportState.OPEN) {
      return this.closePromise;
    }
    this.state = TransportState.CLOSING;
    if (!this.session.closed) {
      // Triggers graceful shutdown. The session's 'close' event will do the final cleanup.
      this.session.close();
    }
    return this.closePromise;
  }

  public abort(reason: Error): Promise<void> {
    if (this.state === TransportState.CLOSED) {
      return this.closePromise;
    }
    this.performFinalCleanup(reason);
    return this.closePromise;
  }
  // #endregion
}