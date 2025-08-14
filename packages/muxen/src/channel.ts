import {
  AsyncEventEmitter,
  type ControlChannel,
  type IncomingStreamChannel,
  type JsonValue,
  type MaybePromise,
  type OutgoingStreamChannel,
} from '@eleplug/transport';
import type { Muxer } from './muxer.js';
import type {
  AckPacket,
  DataPacket,
  MuxenChannelId,
  OpenStreamAckPacket,
} from './protocol.js';
import { CONTROL_CHANNEL_ID } from './protocol.js';
import { ChannelReceiver } from './receiver.js';
import { ChannelSender } from './sender.js';
import { ChannelStatus, type DuplexTransportOptions } from './types.js';

/**
 * Defines the internal events for a channel's application-facing interface.
 * @internal
 */
type ChannelEvents = {
  data: (payload: JsonValue) => MaybePromise<void>;
  close: (reason?: Error) => MaybePromise<void>;
};

/**
 * The base class for all multiplexed channels.
 *
 * It serves as a lightweight coordinator for a `ChannelSender` and a
 * `ChannelReceiver` pair, which handle the heavy lifting of reliability and
 * flow control. This base class manages its own lifecycle, state (`ChannelStatus`),
 * and routing of incoming packets to the correct component.
 *
 * @internal
 */
export abstract class MuxChannelBase {
  public readonly id: MuxenChannelId;
  protected readonly events = new AsyncEventEmitter<ChannelEvents>();
  protected _isClosed = false;

  protected status: ChannelStatus;
  protected readonly sender: ChannelSender;
  protected readonly receiver: ChannelReceiver;

  constructor(
    id: MuxenChannelId,
    protected readonly muxer: Muxer,
    protected readonly options: Required<DuplexTransportOptions>,
  ) {
    this.id = id;
    this.status = ChannelStatus.PRE_HANDSHAKE;

    this.sender = new ChannelSender(this.id, this.muxer, this.options, () => this.status);
    this.receiver = new ChannelReceiver(this.id, this.muxer, this.options);
  }

  public get isClosed(): boolean {
    return this._isClosed || this.muxer.isClosed;
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  /**
   * Initiates a graceful closure by sending a `close-channel` packet.
   * The actual destruction is deferred to allow the packet to be sent.
   */
  public close(): Promise<void> {
    if (this.isClosed) return Promise.resolve();

    // The control channel is special and cannot be closed this way.
    // Its lifecycle is tied to the transport itself.
    if (this.id !== CONTROL_CHANNEL_ID) {
      this.muxer
        .sendPacket({ type: 'close-channel', channelId: this.id })
        .catch((err) =>
          console.warn(
            `[muxen] Failed to send close-channel packet for ${this.id}:`,
            (err as Error).message,
          ),
        );
    }

    // Schedule the actual destruction to run in the next microtask, giving
    // the I/O for the close packet a chance to be dispatched.
    queueMicrotask(() => this.destroy());
    return Promise.resolve();
  }

  /**
   * Immediately destroys the channel and all its sub-components, cleaning
   * up all resources.
   */
  public destroy(error?: Error): void {
    if (this._isClosed) return;
    this._isClosed = true;

    this.sender.destroy(error);
    this.receiver.destroy();

    this.events.emit('close', error);
    this.events.removeAllListeners();
  }

  /**
   * The internal send method, delegating to the `ChannelSender`.
   */
  protected _send(payload: JsonValue): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Channel ${this.id} is closed.`));
    }
    return this.sender.send(payload);
  }

  /**
   * The main packet router for an individual channel.
   * @param packet The incoming packet for this channel.
   */
  public handleIncomingPacket(
    packet: DataPacket | AckPacket | OpenStreamAckPacket,
  ): void {
    if (this.isClosed) return;

    switch (packet.type) {
      case 'data':
        this.receiver.handleDataPacket(packet);
        break;
      case 'ack':
        this.sender.handleAck(packet);
        break;
      case 'open-stream-ack':
        // The peer has acknowledged our channel; move to established state.
        this._establish();
        break;
    }
  }

  /** Moves the channel to the established state. */
  private _establish(): void {
    if (this.status === ChannelStatus.ESTABLISHED) return;
    this.status = ChannelStatus.ESTABLISHED;
  }

  /**
   * Acknowledges an incoming channel request from a peer and moves the channel
   * to the established state.
   */
  public acknowledgeAndEstablish(): void {
    if (this.status === ChannelStatus.ESTABLISHED) return;

    // Send the ACK to the peer.
    this.muxer
      .sendPacket({ type: 'open-stream-ack', channelId: this.id })
      .catch((err) => {
        const error = new Error(
          `Failed to send open-stream-ack for channel ${this.id}`,
          { cause: err },
        );
        this.destroy(error);
      });

    this._establish();
  }
}

/**
 * The implementation of a multiplexed `ControlChannel`.
 */
export class DuplexControlChannel extends MuxChannelBase implements ControlChannel {
  /** Buffers messages that arrive before a listener is attached. */
  private messageQueue: JsonValue[] = [];
  private hasListener = false;

  constructor(id: MuxenChannelId, muxer: Muxer, options: Required<DuplexTransportOptions>) {
    super(id, muxer, options);
    // Control channel is considered established immediately.
    this.status = ChannelStatus.ESTABLISHED;
    this.receiver.onPayload((payload) => this._receivePayload(payload));
  }

  private _receivePayload(payload: JsonValue) {
    if (this.hasListener) {
      this.events.emitAsync('data', payload).catch(err => this.destroy(err as Error));
    } else {
      this.messageQueue.push(payload);
    }
  }

  /** Enforces a single-listener, replacement semantic for `onMessage`. */
  private _setListener(handler: (msg: JsonValue) => void, once: boolean) {
    this.events.removeAllListeners('data');
    
    const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
    eventHandler('data', handler);

    this.hasListener = true;
    // Dispatch any queued messages now that we have a listener.
    if (this.messageQueue.length > 0) {
      const queue = this.messageQueue;
      this.messageQueue = [];
      queue.forEach(p => this._receivePayload(p));
    }
  }

  public send(data: JsonValue): Promise<void> { return this._send(data); }
  public onMessage(handler: (msg: JsonValue) => void): void { this._setListener(handler, false); }
  public onceMessage(handler: (msg: JsonValue) => void): void { this._setListener(handler, true); }
}

/**
 * The implementation of a multiplexed, bidirectional `StreamChannel`.
 */
export class DuplexStreamChannel extends MuxChannelBase implements IncomingStreamChannel, OutgoingStreamChannel {
    constructor(id: MuxenChannelId, muxer: Muxer, options: Required<DuplexTransportOptions>) {
        super(id, muxer, options);
        this.receiver.onPayload((payload) => {
            this.events.emitAsync('data', payload).catch(err => this.destroy(err as Error));
        });
    }
    
    /** Enforces a single-listener, replacement semantic for `onData`. */
    private _setListener(handler: (msg: JsonValue) => void, once: boolean) {
        this.events.removeAllListeners('data');

        const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
        eventHandler('data', handler);
    }
    
    public send(chunk: JsonValue): Promise<void> { return this._send(chunk); }
    public onData(handler: (msg: JsonValue) => void): void { this._setListener(handler, false); }
    public onceData(handler: (msg: JsonValue) => void): void { this._setListener(handler, true); }
}