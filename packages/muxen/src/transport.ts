import {
  AsyncEventEmitter,
  type ControlChannel,
  type IncomingStreamChannel,
  type MaybePromise,
  type OutgoingStreamChannel,
  type Transport,
} from '@eleplug/transport';
import { v4 as uuid } from 'uuid';
import {
  DuplexControlChannel,
  DuplexStreamChannel,
  type MuxChannelBase,
} from './channel.js';
import { Muxer } from './muxer.js';
import type {
  AckPacket,
  ChannelPacket,
  DataPacket,
  MuxenChannelId,
  OpenStreamAckPacket,
} from './protocol.js';
import { CONTROL_CHANNEL_ID } from './protocol.js';
import type { DuplexTransportOptions } from './types.js';
import type { Link } from './link.js';

const defaultOptions: Required<DuplexTransportOptions> = {
  heartbeatInterval: 5000,
  heartbeatTimeout: 10000,
  ackTimeout: 2000,
  sendWindowSize: 64,
  receiveBufferSize: 128,
};

/**
 * Defines the top-level events for the transport layer.
 * @internal
 */
type TransportEvents = {
  close: (reason?: Error) => MaybePromise<void>;
};

/**
 * A full-featured, multiplexed transport implementation built on top of a
 * simple, message-based `Link`. It provides reliable, ordered, and flow-
 * controlled channels for both control messages and data streams, conforming
 * to the standard `@eleplug/transport` `Transport` interface.
 */
export class DuplexTransport implements Transport {
  private readonly events = new AsyncEventEmitter<TransportEvents>();
  private readonly muxer: Muxer;
  private readonly options: Required<DuplexTransportOptions>;
  private readonly channels = new Map<MuxenChannelId, MuxChannelBase>();
  private _onIncomingStreamChannelHandler:
    | ((channel: IncomingStreamChannel) => MaybePromise<void>)
    | null = null;
  private _isClosed = false;
  private controlChannel: DuplexControlChannel | null = null;

  constructor(link: Link, options?: DuplexTransportOptions) {
    this.options = { ...defaultOptions, ...options };
    this.muxer = new Muxer(link, this.options);
    this.bindMuxerListeners();
  }

  /**
   * Binds the transport's packet and lifecycle handlers to the Muxer.
   * @internal
   */
  private bindMuxerListeners(): void {
    this.muxer.on('channelPacket', (packet) => this.handlePacket(packet));
    this.muxer.on('close', (reason) => this.finalCleanup(reason));
  }

  /**
   * The main packet router for the transport. It receives all channel-related
   * packets from the Muxer and routes them to the correct channel instance
   * or handles channel lifecycle packets.
   * @internal
   */
  private handlePacket(packet: ChannelPacket): void {
    if (this._isClosed) return;

    // Route packets for the special control channel.
    if (packet.channelId === CONTROL_CHANNEL_ID) {
      this._getOrCreateControlChannel().handleIncomingPacket(
        packet as DataPacket | AckPacket | OpenStreamAckPacket,
      );
      return;
    }

    // Handle channel closure requests from the remote peer.
    if (packet.type === 'close-channel') {
      const channelToClose = this.channels.get(packet.channelId);
      if (channelToClose) {
        const reason = packet.reason
          ? new Error(`Channel closed by remote: ${String(packet.reason)}`)
          : undefined;
        // Destroy the channel locally. Its `onClose` handler will remove it from the map.
        channelToClose.destroy(reason);
      }
      return;
    }

    const existingChannel = this.channels.get(packet.channelId);

    if (existingChannel) {
      // Route the packet to its existing channel.
      existingChannel.handleIncomingPacket(
        packet as DataPacket | AckPacket | OpenStreamAckPacket,
      );
    } else {
      // If no channel exists, `open-stream` or `data` packets imply the
      // remote peer is creating a new incoming stream.
      if (packet.type === 'open-stream' || packet.type === 'data') {
        const channel = this._createIncomingStream(packet.channelId);
        if (packet.type === 'open-stream') {
          // Acknowledge the peer's request to open this channel.
          channel.acknowledgeAndEstablish();
        }
        // Now that the channel exists, handle the packet that triggered its creation.
        if (packet.type === 'data') {
          channel.handleIncomingPacket(packet);
        }
      } else {
        // We received a packet (e.g., an ack) for a channel we don't know about.
        // This can happen if we just closed a channel. It's safe to ignore.
        console.warn(
          `[muxen] Received packet of type '${packet.type}' for unknown channel ${packet.channelId}. Ignoring.`,
        );
      }
    }
  }

  /**
   * Creates and registers a new incoming stream channel upon request from a peer.
   * @internal
   */
  private _createIncomingStream(
    channelId: MuxenChannelId,
  ): DuplexStreamChannel {
    const streamChannel = new DuplexStreamChannel(
      channelId,
      this.muxer,
      this.options,
    );
    this.channels.set(channelId, streamChannel);

    // CRITICAL: Ensure that when the channel closes (for any reason), we
    // remove it from the active channels map to prevent memory leaks.
    streamChannel.onClose(() => {
      this.channels.delete(channelId);
    });

    if (this._onIncomingStreamChannelHandler) {
      // Pass the new channel to the application-level handler.
      // We wrap the handler call in a Promise to catch both sync and async errors.
      Promise.resolve(this._onIncomingStreamChannelHandler(streamChannel)).catch(
        (err) => {
          console.error(
            `[muxen] Error in onIncomingStreamChannel handler for ${channelId}, closing channel.`,
            err,
          );
          streamChannel.close();
        },
      );
    } else {
      console.warn(
        `[muxen] Incoming stream ${channelId} opened, but no handler was registered via onIncomingStreamChannel. Closing it.`,
      );
      streamChannel.close();
    }
    return streamChannel;
  }

  /**
   * The final, idempotent cleanup logic for the entire transport. This is
   * triggered when the underlying link closes.
   * @internal
   */
  private finalCleanup(reason?: Error): void {
    if (this._isClosed) return;
    this._isClosed = true;

    const cleanupError = reason ?? new Error('Transport closed gracefully.');

    // Destroy all active channels.
    this.channels.forEach((ch) => ch.destroy(cleanupError));
    this.channels.clear();

    this.controlChannel?.destroy(cleanupError);
    this.controlChannel = null;

    // Emit the final close event to consumers.
    this.events.emitSerial('close', reason);

    // Clean up all resources.
    this.muxer.destroy();
    this.events.removeAllListeners();
  }

  /**
   * Lazily creates the singleton control channel on first access.
   * @internal
   */
  private _getOrCreateControlChannel(): DuplexControlChannel {
    if (!this.controlChannel || this.controlChannel.isClosed) {
      this.controlChannel = new DuplexControlChannel(
        CONTROL_CHANNEL_ID,
        this.muxer,
        this.options,
      );
    }
    return this.controlChannel;
  }

  // #region Transport Interface Implementation
  public getControlChannel(): Promise<ControlChannel> {
    if (this._isClosed) {
      return Promise.reject(new Error('Transport is closed.'));
    }
    return Promise.resolve(this._getOrCreateControlChannel());
  }

  public openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    if (this._isClosed) {
      return Promise.reject(new Error('Transport is closed.'));
    }
    const channelId = uuid();
    const channel = new DuplexStreamChannel(
      channelId,
      this.muxer,
      this.options,
    );
    this.channels.set(channelId, channel);

    // Ensure the channel is removed from the map upon closure.
    channel.onClose(() => {
      this.channels.delete(channelId);
    });

    // Initiate the handshake by sending an `open-stream` packet.
    this.muxer
      .sendPacket({ type: 'open-stream', channelId })
      .catch((err) => channel.destroy(err as Error));

    return Promise.resolve(channel);
  }

  public onIncomingStreamChannel(
    handler: (channel: IncomingStreamChannel) => MaybePromise<void>,
  ): void {
    this._onIncomingStreamChannelHandler = handler;
  }

  public onClose(handler: (reason?: Error) => MaybePromise<void>): void {
    this.events.on('close', handler);
  }

  public close(): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    // Delegate closure to the underlying link, which will trigger the
    // `muxer.on('close')` event chain, leading to `finalCleanup`.
    return this.muxer.link.close();
  }

  public abort(reason: Error): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    // Delegate abortion to the link, which will also trigger the close chain.
    return this.muxer.link.abort(reason);
  }
  // #endregion
}