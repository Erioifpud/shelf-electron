import {
  AsyncEventEmitter,
  type ControlChannel,
  type IncomingStreamChannel,
  type OutgoingStreamChannel,
  type Transport,
  type JsonValue,
} from '@eleplug/transport';
import type { ControlMessage } from '../../types/protocol';

/**
 * A proxy implementation of a `ControlChannel`.
 *
 * Its operations (e.g., `send`) are forwarded to the host transport, while its
 * events (e.g., `onMessage`) are triggered externally by the `ProxyTransport`
 * when a tunneled message arrives.
 * @internal
 */
class ProxyControlChannel implements ControlChannel {
  public isClosed = false;
  private readonly emitter = new AsyncEventEmitter<{
    message: (message: ControlMessage) => void;
    close: (reason?: Error) => void;
  }>();

  constructor(
    private readonly sendToHost: (payload: ControlMessage) => Promise<void>,
  ) {}

  public send(message: JsonValue): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error('ProxyControlChannel is closed.'));
    }
    // Forward the send operation to the host transport.
    return this.sendToHost(message as ControlMessage);
  }

  // Enforces a single-listener policy by removing previous listeners.
  private _setListener(handler: (msg: JsonValue) => void, once: boolean): void {
    this.emitter.removeAllListeners('message');
    const typedHandler = handler as (msg: ControlMessage) => void;
    if (once) {
      this.emitter.once('message', typedHandler);
    } else {
      this.emitter.on('message', typedHandler);
    }
  }

  public onMessage(handler: (message: JsonValue) => void): void {
    this._setListener(handler, false);
  }

  public onceMessage(handler: (message: JsonValue) => void): void {
    this._setListener(handler, true);
  }

  public onClose(handler: (reason?: Error) => void): void {
    this.emitter.on('close', handler);
  }

  public async close(): Promise<void> {
    // A graceful, local close of the channel.
    this._emitClose();
  }

  /** Delivers an incoming message from the host. Called by `ProxyTransport`. */
  public _emitMessage(message: ControlMessage): void {
    if (this.isClosed) return;
    this.emitter.emit('message', message);
  }

  /** Triggers the closure of this channel. Called by `ProxyTransport`. */
  public _emitClose(reason?: Error): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.emitter.emit('close', reason);
    this.emitter.removeAllListeners();
  }
}

/**
 * A proxy implementation of the `Transport` interface that represents a
 * virtual transport tunneled over a host erpc connection.
 *
 * It is created on the "client" side of a tunneled connection (i.e., the side
 * that deserializes a `Transport` object). All its operations are forwarded
 * to the host connection via a `TunnelManager`.
 * @internal
 */
export class ProxyTransport implements Transport {
  private readonly emitter = new AsyncEventEmitter<{
    incomingStream: (channel: IncomingStreamChannel) => void;
    close: (reason?: Error) => void;
  }>();
  private readonly controlChannel: ProxyControlChannel;

  constructor(
    public readonly tunnelId: string,
    private readonly sendControlMessageToHost: (payload: ControlMessage) => Promise<void>,
    private readonly openStreamChannelOnHost: () => Promise<OutgoingStreamChannel>,
  ) {
    this.controlChannel = new ProxyControlChannel(this.sendControlMessageToHost);
  }

  public getControlChannel(): Promise<ControlChannel> {
    return Promise.resolve(this.controlChannel);
  }

  public openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    return this.openStreamChannelOnHost();
  }

  public onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => void): void {
    this.emitter.on('incomingStream', handler);
  }

  public onClose(handler: (reason?: Error) => void): void {
    this.emitter.on('close', handler);
  }

  public async close(): Promise<void> {
    // A graceful close. Can be enhanced to send a "tunnel-close" message.
    this._handleClose();
  }

  public async abort(reason: Error): Promise<void> {
    // An abnormal close. Can be enhanced to send a "tunnel-abort" message.
    this._handleClose(reason);
  }

  /** Called by `TunnelManager` when a message for this tunnel arrives. */
  public _handleIncomingMessage(message: ControlMessage): void {
    this.controlChannel._emitMessage(message);
  }

  /** Called by `TunnelManager` when a stream for this tunnel arrives. */
  public _handleIncomingStream(channel: IncomingStreamChannel): void {
    this.emitter.emit('incomingStream', channel);
  }

  /** Called by `TunnelManager` to shut down this proxy transport. */
  public _handleClose(reason?: Error): void {
    this.controlChannel._emitClose(reason);
    this.emitter.emit('close', reason);
    this.emitter.removeAllListeners();
  }
}