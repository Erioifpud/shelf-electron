import { AsyncEventEmitter, type MaybePromise } from '@eleplug/transport';
import type { ChannelPacket, MultiplexedPacket } from './protocol.js';
import { isMultiplexedPacket } from './protocol.js';
import type { DuplexTransportOptions } from './types.js';
import type { Link } from './link.js';

/**
 * Defines the events emitted by the Muxer to its owner (the DuplexTransport).
 * @internal
 */
type MuxerEvents = {
  /** Emitted when a packet belonging to a channel is received and parsed. */
  channelPacket: (packet: ChannelPacket) => MaybePromise<void>;
  /**
   * Emitted exactly once when the underlying link closes, for any reason.
   * @param reason An optional Error if the closure was abnormal.
   */
  close: (reason?: Error) => void;
};

/**
 * The Muxer is the core engine of the DuplexTransport. It sits between the raw
 * `Link` and the `Channel`s, performing two main functions:
 *
 * 1.  **Demultiplexing**: It parses raw incoming messages from the `Link`,
 *     identifies their type, and routes them appropriately. Heartbeats are handled
 *     directly, while channel-specific packets are emitted for the transport to handle.
 * 2.  **Liveness**: It implements a heartbeat mechanism (`ping`/`pong`) to detect
 *     unresponsive or "zombie" connections, ensuring timely cleanup.
 *
 * @internal
 */
export class Muxer extends AsyncEventEmitter<MuxerEvents> {
  private _isClosed = false;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _link: Link,
    private readonly options: Required<DuplexTransportOptions>,
  ) {
    super();
    this.bindLinkListeners();
    this.startHeartbeat();
  }

  /** Binds to the message and close events of the underlying link. */
  private bindLinkListeners(): void {
    this._link.onMessage(this.handleMessage.bind(this));
    this._link.onClose(this.handleClose.bind(this));
  }

  /** Processes a raw message received from the link. */
  private handleMessage(data: unknown): void {
    if (this._isClosed) return;

    if (!isMultiplexedPacket(data)) {
      console.warn('[muxen] Received malformed packet, ignoring.', data);
      return;
    }

    // Handle link-level packets (heartbeats) directly here.
    if (data.type === 'ping') {
      this.sendPacket({ type: 'pong' }).catch((err) =>
        console.error('[muxen] Failed to send pong.', err),
      );
      return;
    }
    if (data.type === 'pong') {
      this.handlePong();
      return;
    }

    // Delegate channel-specific packets to the transport layer to be routed.
    this.emit('channelPacket', data);
  }

  /** The single, unified handler for link termination. */
  private handleClose(reason?: Error): void {
    if (this._isClosed) return;

    // Emit the close event to the DuplexTransport first, so it can clean
    // up its channels before the muxer is fully destroyed.
    this.emit('close', reason);
    this.destroy();
  }

  public get link(): Link {
    return this._link;
  }

  public get isClosed(): boolean {
    return this._isClosed;
  }

  /** Sends a multiplexed packet over the underlying link. */
  public sendPacket(packet: MultiplexedPacket): Promise<void> {
    if (this._isClosed) {
      return Promise.reject(new Error('Muxer is closed. Cannot send packet.'));
    }
    try {
      // The link's sendMessage is expected to return a promise.
      return Promise.resolve(this._link.sendMessage(packet));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // #region Heartbeating Logic

  private startHeartbeat(): void {
    if (this._isClosed) return;
    this.stopHeartbeat(); // Ensure no existing timers are running.
    this.heartbeatIntervalId = setInterval(
      () => this.sendPing(),
      this.options.heartbeatInterval,
    );
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
    if (this.heartbeatTimeoutId) clearTimeout(this.heartbeatTimeoutId);
    this.heartbeatIntervalId = null;
    this.heartbeatTimeoutId = null;
  }

  private sendPing(): void {
    if (this._isClosed) return;

    // Set a timeout. If a pong is not received in time, the link is dead.
    this.heartbeatTimeoutId = setTimeout(() => {
      const timeoutError = new Error(
        `Heartbeat timeout: No pong received within ${this.options.heartbeatTimeout}ms.`,
      );
      // Trigger the standard close handler with an error.
      this.handleClose(timeoutError);
    }, this.options.heartbeatTimeout);

    this.sendPacket({ type: 'ping' }).catch((err) => {
      const sendError = new Error('Heartbeat failed: Could not send ping.', {
        cause: err,
      });
      // A failure to send is a fatal link error.
      this.handleClose(sendError);
    });
  }

  private handlePong(): void {
    // A pong was received, so the connection is alive. Clear the timeout.
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  // #endregion

  /**
   * Destroys the muxer, cleaning up all internal resources like timers
   * and event listeners. This is the final step in the shutdown process.
   */
  public destroy(): void {
    if (this._isClosed) return;
    this._isClosed = true;
    this.stopHeartbeat();
    this.removeAllListeners();
  }
}