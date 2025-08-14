import { v4 as uuid } from 'uuid';
import type {
  ChannelId,
  ControlChannel,
  IncomingStreamChannel,
  JsonValue,
  MaybePromise,
  OutgoingStreamChannel,
  Transport,
} from '@eleplug/transport';
import { AsyncEventEmitter } from '@eleplug/transport';

// #region Event Type Definitions
/**
 * Defines the internal events used by the MemoryTransport for coordination.
 * @internal
 */
type MemoryTransportEvents = {
  _internalControlChannel: (channel: ControlChannel) => void;
  incomingStreamChannel: (channel: IncomingStreamChannel) => void;
  close: (reason?: Error) => void;
};
// #endregion

// #region Channel Implementations

/**
 * An in-memory implementation of the ControlChannel. It uses an internal queue
 * to ensure reliable, non-blocking delivery of control messages even if the
 * receiver attaches its listener after messages have been sent.
 * @internal
 */
class MemoryControlChannel implements ControlChannel {
  private readonly events = new AsyncEventEmitter<{
    message: (message: JsonValue) => void;
    close: (reason?: Error) => void;
  }>();
  public isClosed = false;

  private messageQueue: JsonValue[] = [];
  private hasListener = false;

  constructor(private readonly remote: MemoryTransport) {}

  public send(message: JsonValue): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error('Control channel is closed.'));
    }
    // Asynchronously deliver the message to the remote peer to simulate
    // network latency and prevent re-entrant calls.
    queueMicrotask(() => this.remote._receiveControlMessage(message));
    return Promise.resolve();
  }

  /**
   * Called by the remote transport to deliver a message. If a listener is
   * present, the message is emitted; otherwise, it's queued.
   * @internal
   */
  public _receiveMessage(message: JsonValue): void {
    if (this.isClosed) return;

    if (this.hasListener) {
      this.events.emitAsync('message', message).catch((err) => {
        this._destroy(err instanceof Error ? err : new Error(String(err)));
      });
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Sets the message handler, enforcing replacement semantics and flushing
   * the message queue.
   * @internal
   */
  private _setListener(
    handler: (msg: JsonValue) => MaybePromise<void>,
    once: boolean,
  ): void {
    this.events.removeAllListeners('message');

    const eventHandler = once
      ? this.events.once.bind(this.events)
      : this.events.on.bind(this.events);
    eventHandler('message', handler);

    this.hasListener = true;

    // Flush the queue if it contains pending messages.
    if (this.messageQueue.length > 0) {
      const queue = this.messageQueue;
      this.messageQueue = [];
      queue.forEach((msg) => this._receiveMessage(msg));
    }
  }

  public onMessage(handler: (msg: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, false);
  }

  public onceMessage(handler: (msg: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, true);
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public close(): Promise<void> {
    this._destroy();
    return Promise.resolve();
  }

  /**
   * Central, idempotent cleanup logic for the channel.
   * @internal
   */
  public _destroy(reason?: Error): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.messageQueue = [];
    queueMicrotask(() => this.events.emitAsync('close', reason));
  }
}

/**
 * An in-memory implementation of a bidirectional StreamChannel. It simulates
 * network flow control by requiring the receiver to attach a data listener
 * (`onData`) before the sender can successfully send messages.
 * @internal
 */
class MemoryStreamChannel
  implements OutgoingStreamChannel, IncomingStreamChannel
{
  private readonly events = new AsyncEventEmitter<{
    data: (message: JsonValue) => void;
    close: (reason?: Error) => void;
  }>();
  public isClosed = false;

  /** A promise that resolves when the remote peer calls `onData`. */
  private readonly isReadyPromise: Promise<void>;
  private resolveIsReady!: () => void;
  private hasListener = false;

  constructor(
    public readonly id: ChannelId,
    private remote?: MemoryTransport,
  ) {
    this.isReadyPromise = new Promise((resolve) => {
      this.resolveIsReady = resolve;
    });
  }

  /** Links this channel to its remote counterpart's transport. @internal */
  public _setRemote(remote: MemoryTransport): void {
    this.remote = remote;
  }

  /**
   * Sends a stream message, applying back-pressure by waiting until the
   * remote peer signals readiness (by calling `onData`).
   */
  public async send(message: JsonValue): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Stream channel ${this.id} is closed.`));
    }
    if (!this.remote) {
      return Promise.reject(new Error(`Stream channel ${this.id} is not linked.`));
    }

    // Apply back-pressure: wait for the remote peer's `onData` to be called.
    await this.remote._getStreamChannelReadyPromise(this.id);

    // Check if the channel was closed while we were waiting.
    if (this.isClosed) {
      throw new Error(`Stream channel ${this.id} closed while waiting for ready signal.`);
    }

    queueMicrotask(() => this.remote!._receiveStreamMessage(this.id, message));
  }

  /** Called by the remote transport to deliver data. @internal */
  public _receiveData(message: JsonValue): void {
    if (this.isClosed) return;
    this.events.emitAsync('data', message).catch((err) => this._destroy(err as Error));
  }

  /** Sets the data handler and manages the back-pressure signal. @internal */
  private _setListener(
    handler: (msg: JsonValue) => MaybePromise<void>,
    once: boolean,
  ): void {
    this.events.removeAllListeners('data');

    const eventHandler = once
      ? this.events.once.bind(this.events)
      : this.events.on.bind(this.events);
    eventHandler('data', handler);

    // Signal readiness to the remote sender if this is the first listener.
    if (!this.hasListener) {
      this.hasListener = true;
      this.resolveIsReady();
    }
  }

  public onData(handler: (msg: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, false);
  }

  public onceData(handler: (msg: JsonValue) => MaybePromise<void>): void {
    this._setListener(handler, true);
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public close(): Promise<void> {
    this._destroy();
    return Promise.resolve();
  }

  /** Central, idempotent cleanup logic for the stream channel. @internal */
  public _destroy(reason?: Error): void {
    if (this.isClosed) return;
    this.isClosed = true;

    // Unblock any waiting senders to prevent deadlocks on shutdown.
    if (!this.hasListener) {
      this.resolveIsReady();
    }

    // Notify the remote peer to also close its end of the channel.
    if (this.remote) {
      this.remote._closeStreamChannel(this.id, reason);
    }

    queueMicrotask(() => this.events.emitAsync('close', reason));
  }
}
// #endregion

/**
 * An in-memory transport implementation, ideal for testing and in-process
 * communication. It connects two `MemoryTransport` instances directly,
 * simulating a full-duplex network connection.
 */
export class MemoryTransport implements Transport {
  private readonly events = new AsyncEventEmitter<MemoryTransportEvents>();
  private remoteTransport!: MemoryTransport;
  private _isClosed = false;

  private controlChannel: MemoryControlChannel | null = null;
  private controlChannelPromise: Promise<ControlChannel> | null = null;
  private readonly streamChannels = new Map<ChannelId, MemoryStreamChannel>();

  /** Links this transport to its peer. @internal */
  public _link(remote: MemoryTransport): void {
    this.remoteTransport = remote;
  }

  /** Receives an incoming control message from the linked peer. @internal */
  public _receiveControlMessage(message: JsonValue): void {
    if (this._isClosed) return;
    if (!this.controlChannel) {
      this.controlChannel = new MemoryControlChannel(this.remoteTransport);
      this.events.emit('_internalControlChannel', this.controlChannel);
    }
    this.controlChannel._receiveMessage(message);
  }

  /** Receives an incoming stream message from the linked peer. @internal */
  public _receiveStreamMessage(
    channelId: ChannelId,
    message: JsonValue,
  ): void {
    if (this._isClosed) return;
    const channel = this._getOrCreateStreamChannel(channelId);
    channel._receiveData(message);
  }

  /**
   * Used by a remote channel to await this side's readiness signal.
   * @internal
   */
  public _getStreamChannelReadyPromise(channelId: ChannelId): Promise<void> {
    // We access the internal promise directly for this simulation.
    return this._getOrCreateStreamChannel(channelId)['isReadyPromise'];
  }

  /** Lazily creates an incoming stream channel upon first message. @internal */
  private _getOrCreateStreamChannel(
    channelId: ChannelId,
  ): MemoryStreamChannel {
    let channel = this.streamChannels.get(channelId);
    if (!channel) {
      channel = new MemoryStreamChannel(channelId);
      this.streamChannels.set(channelId, channel);
      this.events.emit('incomingStreamChannel', channel);
    }
    return channel;
  }

  /** Closes a stream channel when signaled by the remote peer. @internal */
  public _closeStreamChannel(channelId: ChannelId, reason?: Error): void {
    const channel = this.streamChannels.get(channelId);
    if (channel && !channel.isClosed) {
      channel._destroy(reason);
    }
    this.streamChannels.delete(channelId);
  }

  /** Central, idempotent cleanup logic for the transport. @internal */
  public _destroy(reason?: Error): void {
    if (this._isClosed) return;
    this._isClosed = true;

    const channelsToClose = new Set([
      this.controlChannel,
      ...this.streamChannels.values(),
    ]);
    channelsToClose.forEach((ch) => ch?._destroy(reason));

    this.streamChannels.clear();
    this.controlChannel = null;
    this.controlChannelPromise = null;

    this.events.emit('close', reason);
    this.events.removeAllListeners();
  }

  public getControlChannel(): Promise<ControlChannel> {
    if (this._isClosed)
      return Promise.reject(new Error('Transport is closed.'));
    if (this.controlChannel) return Promise.resolve(this.controlChannel);
    if (this.controlChannelPromise) return this.controlChannelPromise;

    this.controlChannelPromise = new Promise((resolve) => {
      this.events.once('_internalControlChannel', resolve);
      // Eagerly create the channel to unblock the other side if it sends first.
      if (!this.controlChannel) {
        const newChannel = new MemoryControlChannel(this.remoteTransport);
        this.controlChannel = newChannel;
        resolve(newChannel);
      }
    });
    return this.controlChannelPromise;
  }

  public openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    if (this._isClosed)
      return Promise.reject(new Error('Transport is closed.'));
    const channelId = uuid();
    const channel = new MemoryStreamChannel(channelId, this.remoteTransport);
    this.streamChannels.set(channelId, channel);

    // Eagerly create the channel on the remote side and link them.
    this.remoteTransport._getOrCreateStreamChannel(channelId)._setRemote(this);

    return Promise.resolve(channel);
  }

  public onIncomingStreamChannel(
    handler: (channel: IncomingStreamChannel) => MaybePromise<void>,
  ): void {
    this.events.on('incomingStreamChannel', handler);
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public abort(reason: Error): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    // Schedule destruction to happen asynchronously.
    queueMicrotask(() => {
      if (!this.remoteTransport._isClosed) {
        this.remoteTransport._destroy(reason);
      }
      this._destroy(reason);
    });
    return Promise.resolve();
  }

  public close(): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remoteTransport._isClosed) {
        this.remoteTransport._destroy();
      }
      this._destroy();
    });
    return Promise.resolve();
  }
}

/**
 * A utility class that creates a pair of linked `MemoryTransport` instances,
 * representing a client and a server for in-process communication.
 */
export class MemoryConnector {
  public readonly client: Transport;
  public readonly server: Transport;

  constructor() {
    const clientTransport = new MemoryTransport();
    const serverTransport = new MemoryTransport();
    clientTransport._link(serverTransport);
    serverTransport._link(clientTransport);
    this.client = clientTransport;
    this.server = serverTransport;
  }
}