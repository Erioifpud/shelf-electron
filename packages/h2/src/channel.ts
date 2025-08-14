import type { ClientHttp2Stream, ServerHttp2Stream } from 'http2';
import { AsyncEventEmitter, type MaybePromise } from '@eleplug/transport';
import type { FrameParser } from './framing.js';

/**
 * A special message sent from the server to the client over the control channel
 * to signal that the client must initiate a new stream. This is how the server
 * "pushes" a new channel to the client.
 */
export type ServerSignal = {
  /** Internal marker to identify the object type. */
  readonly _h2_signal_: true;
  /** The type of signal being sent. */
  readonly type: 'open-stream-request';
  /** The unique ID for the channel that the client should open. */
  readonly channelId: string;
};

/**
 * Type guard to check if a received message is a `ServerSignal`.
 * @param data The data to check.
 * @returns `true` if the data is a valid `ServerSignal`, otherwise `false`.
 */
export function isServerSignal(data: unknown): data is ServerSignal {
  const d = data as any;
  return d && d._h2_signal_ === true && typeof d.type === 'string';
}

type H2Stream = ClientHttp2Stream | ServerHttp2Stream;

/**
 * An abstract base class for all eRPC-over-HTTP/2 channel implementations.
 *
 * It encapsulates common logic for managing the lifecycle of an underlying
 * Node.js `Http2Stream`. Its responsibilities include:
 * - Unifying 'close' and 'error' events from the stream and its parser.
 * - Providing a promise-based `sendFrame` method with backpressure support.
 * - Exposing standard `onClose` and `close` methods.
 *
 * @template StreamType The specific type of the underlying `Http2Stream`.
 */
export abstract class H2ChannelBase<StreamType extends H2Stream> {
  protected readonly events = new AsyncEventEmitter<{
    close: (reason?: Error) => void;
  }>();

  /** Indicates whether the channel has been closed. */
  public get isClosed(): boolean {
    return this._isClosed || this.stream.destroyed;
  }
  private _isClosed = false;

  /**
   * @param stream The underlying Node.js HTTP/2 stream.
   * @param parser The `FrameParser` instance that will consume data from the stream.
   */
  constructor(
    protected readonly stream: StreamType,
    protected readonly parser: FrameParser,
  ) {
    // A channel's lifecycle is tied to both the raw stream and its parser.
    // An error or closure in either component signifies the end of the channel.
    // We listen to these events once to trigger a unified cleanup.
    this.parser.once('error', (err) => this.handleStreamClose(err));
    this.parser.once('close', () => this.handleStreamClose());
    this.stream.once('error', (err) => this.handleStreamClose(err));
    this.stream.once('close', () => this.handleStreamClose());
  }

  /**
   * Central, idempotent handler for stream closure. This ensures that cleanup
   * logic runs exactly once, regardless of which event triggered it.
   * @internal
   */
  private handleStreamClose(err?: Error): void {
    if (this._isClosed) return;
    this._isClosed = true;

    // Emit the public 'close' event to any listeners.
    this.events.emit('close', err);
    this.events.removeAllListeners();

    // Ensure both stream and parser are fully destroyed to prevent resource leaks.
    if (!this.stream.destroyed) {
      this.stream.destroy(err);
    }
    if (!this.parser.destroyed) {
      this.parser.destroy(err);
    }
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public close(): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }
    // Gracefully end the writable side of the stream. This will eventually
    // trigger the 'close' event cascade, leading to `handleStreamClose`.
    if (!this.stream.destroyed) {
      this.stream.end();
    }
    return Promise.resolve();
  }

  /**
   * Sends a payload as a single length-prefixed frame. This method correctly
   * handles stream backpressure.
   * @param payload The raw data to send in the frame.
   * @returns A promise that resolves when the data has been successfully
   * written or buffered, or rejects on error.
   */
  protected sendFrame(payload: Buffer): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error('Channel is closed.'));
    }

    // Prepend a 4-byte big-endian length prefix to the payload.
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);

    return new Promise((resolve, reject) => {
      if (this.stream.destroyed) {
        return reject(new Error('Stream was destroyed before writing.'));
      }

      // The `write` callback is executed when the data is flushed from the
      // internal buffer. An error here is definitive.
      const writeCallback = (err?: Error | null) => {
        if (err) {
          reject(err);
        }
        // NOTE: The promise is resolved *outside* this callback if `write`
        // returns true, or in the 'drain' event handler if it returns false.
      };

      // `stream.write()` returns `false` if the internal buffer is full,
      // signaling that we should wait for the 'drain' event.
      const canContinueImmediately = this.stream.write(frame, writeCallback);

      if (canContinueImmediately) {
        // The write buffer had space. The operation is considered complete
        // for the caller, and the callback will handle any latent errors.
        resolve();
      } else {
        // Backpressure is active. We must wait for the 'drain' event.
        const onDrain = () => {
          // Clean up the error listener to prevent memory leaks.
          this.stream.removeListener('error', onError);
          resolve();
        };
        const onError = (err: Error) => {
          this.stream.removeListener('drain', onDrain);
          reject(err);
        };
        // Listen for 'drain' to resolve the promise, and 'error' to reject it.
        this.stream.once('drain', onDrain);
        this.stream.once('error', onError);
      }
    });
  }
}