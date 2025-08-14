import serbin from '@eleplug/serbin';
import type { ClientHttp2Stream } from 'http2';
import type {
  ChannelId,
  ControlChannel,
  IncomingStreamChannel,
  JsonValue,
  MaybePromise,
  OutgoingStreamChannel,
  ServerSignal,
} from '@eleplug/h2';
import {
  AsyncEventEmitter,
  FrameParser,
  H2ChannelBase,
  isServerSignal,
} from '@eleplug/h2';

/**
 * Implements the client-side `ControlChannel` over an HTTP/2 stream.
 *
 * This channel is responsible for two primary functions:
 * 1. Sending and receiving standard eRPC control messages.
 * 2. Receiving and processing special `ServerSignal` messages, which instruct
 *    the client to perform transport-level actions (e.g., open a new stream).
 */
export class H2ClientControlChannel
  extends H2ChannelBase<ClientHttp2Stream>
  implements ControlChannel
{
  private readonly messageEvents = new AsyncEventEmitter<{
    message: (message: JsonValue) => MaybePromise<void>;
    signal: (signal: ServerSignal) => MaybePromise<void>;
  }>();

  constructor(stream: ClientHttp2Stream) {
    const parser = new FrameParser();
    super(stream, parser);

    // Connect the raw stream to the frame parser. pipe() handles data flow
    // and backpressure automatically.
    stream.pipe(parser);

    // Listen for fully-formed frames emitted by the parser.
    parser.on('data', async (frame: Buffer) => {
      try {
        // Deserialize the frame's payload from a string into a JS value.
        const parsed = serbin.from(frame);
        if (isServerSignal(parsed)) {
          // If it's a signal, route it to the internal signal handler.
          await this.messageEvents.emitAsync('signal', parsed);
        } else {
          // Otherwise, it's a standard message for the application layer.
          await this.messageEvents.emitAsync('message', parsed as JsonValue);
        }
      } catch (err: any) {
        // A deserialization error is fatal for this channel.
        this.parser.destroy(err);
      }
    });
  }

  public send(data: JsonValue): Promise<void> {
    const payload = Buffer.from(serbin.byteify(data));
    return this.sendFrame(payload);
  }

  /**
   * Internal helper to enforce the replacement semantic for message handlers.
   * @private
   */
  private _setListener(
    handler: (msg: JsonValue) => MaybePromise<void>,
    once: boolean,
  ): void {
    this.messageEvents.removeAllListeners('message');
    const eventHandler = once
      ? this.messageEvents.once.bind(this.messageEvents)
      : this.messageEvents.on.bind(this.messageEvents);
    eventHandler('message', handler);
  }

  public onMessage(handler: (data: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, false);
  }

  public onceMessage(handler: (data: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, true);
  }

  /**
   * Registers a handler for server-sent signals. This is used internally
   * by the `Http2ClientTransport` to react to server commands.
   * @internal
   */
  public onSignal(handler: (signal: ServerSignal) => MaybePromise<void>): void {
    this.messageEvents.on('signal', handler);
  }
}

/**
 * Implements both `IncomingStreamChannel` and `OutgoingStreamChannel` for the
 * client over a single bidirectional HTTP/2 stream.
 */
export class H2ClientStreamChannel
  extends H2ChannelBase<ClientHttp2Stream>
  implements IncomingStreamChannel, OutgoingStreamChannel
{
  public readonly id: ChannelId;
  private readonly dataEvents = new AsyncEventEmitter<{
    data: (chunk: JsonValue) => MaybePromise<void>;
  }>();

  constructor(stream: ClientHttp2Stream, channelId: ChannelId) {
    const parser = new FrameParser();
    super(stream, parser);
    this.id = channelId;

    stream.pipe(parser);

    parser.on('data', async (frame: Buffer) => {
      try {
        const message = serbin.from(frame);
        await this.dataEvents.emitAsync('data', message as JsonValue);
      } catch (err: any) {
        this.parser.destroy(err);
      }
    });
  }

  public send(chunk: JsonValue): Promise<void> {
    const payload = Buffer.from(serbin.byteify(chunk));
    return this.sendFrame(payload);
  }

  /**
   * Internal helper to enforce the replacement semantic for data handlers.
   * @private
   */
  private _setListener(
    handler: (msg: JsonValue) => MaybePromise<void>,
    once: boolean,
  ): void {
    this.dataEvents.removeAllListeners('data');
    const eventHandler = once
      ? this.dataEvents.once.bind(this.dataEvents)
      : this.dataEvents.on.bind(this.dataEvents);
    eventHandler('data', handler);
  }

  public onData(handler: (chunk: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, false);
  }

  public onceData(handler: (chunk: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, true);
  }
}