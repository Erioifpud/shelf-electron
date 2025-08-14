import { AsyncEventEmitter, type JsonValue } from '@eleplug/transport';
import type { Muxer } from './muxer.js';
import type { AckPacket, DataPacket, MuxenChannelId } from './protocol.js';
import { PRE_HANDSHAKE_WINDOW_SIZE } from './protocol.js';
import { ChannelStatus, type DuplexTransportOptions } from './types.js';

/**
 * Represents a packet that has been sent but not yet acknowledged by the peer.
 * @internal
 */
type UnackedPacket = {
  /** The original data packet that was sent. */
  packet: DataPacket;
  /** The retransmission timer associated with this packet. */
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Manages the reliable sending of data packets for a single channel.
 *
 * It implements a sliding window protocol for flow control and an ACK-based
 * retransmission mechanism for reliability.
 *
 * It provides true backpressure: the `send()` method returns a promise that
 * will not resolve until there is space in the sending window, effectively
 * pausing the caller.
 *
 * @internal
 */
export class ChannelSender {
  private nextSendSeq = 0;
  private readonly unackedPackets = new Map<number, UnackedPacket>();

  private readonly events = new AsyncEventEmitter<{ ready: () => void }>();
  private isReady = true;

  constructor(
    private readonly channelId: MuxenChannelId,
    private readonly muxer: Muxer,
    private readonly options: Required<DuplexTransportOptions>,
    private readonly getChannelStatus: () => ChannelStatus,
  ) {}

  /**
   * Sends a payload with reliability and backpressure.
   * If the sending window is full, this method will wait asynchronously until
   * space becomes available.
   * @param payload The JSON-serializable value to send.
   */
  public async send(payload: JsonValue): Promise<void> {
    // This loop implements backpressure. If the window is full (`isReady` is
    // false), we wait here until an 'ack' arrives and frees up space, which
    // will trigger the 'ready' event.
    while (!this.isReady) {
      await new Promise<void>((resolve) => this.events.once('ready', resolve));
    }

    // Now that we are ready, construct and send the next packet.
    const packet: DataPacket = {
      type: 'data',
      channelId: this.channelId,
      seq: this.nextSendSeq++,
      payload,
    };

    this._sendPacket(packet);

    // After sending, immediately update the ready state. This will likely set
    // `isReady` to false if the window has just become full.
    this._updateReadyState();
  }

  /**
   * Processes an incoming acknowledgment packet from the peer.
   * @param packet The incoming ACK packet.
   */
  public handleAck(packet: AckPacket): void {
    const unacked = this.unackedPackets.get(packet.ackSeq);
    if (unacked) {
      // The packet was successfully received. Clear its retransmission timer.
      clearTimeout(unacked.timer);
      this.unackedPackets.delete(packet.ackSeq);

      // An ACK means there is now more space in the sending window.
      // Update our state, which may unblock a waiting `send()` call.
      this._updateReadyState();
    }
  }

  /**
   * Checks if the sending window has space and updates the `isReady` flag.
   * If space becomes available, it emits a 'ready' event to unblock waiters.
   */
  private _updateReadyState(): void {
    const status = this.getChannelStatus();
    // The window size is smaller before the channel handshake is complete.
    const windowSize =
      status === ChannelStatus.PRE_HANDSHAKE
        ? PRE_HANDSHAKE_WINDOW_SIZE
        : this.options.sendWindowSize;

    const hasWindowSpace = this.unackedPackets.size < windowSize;

    if (hasWindowSpace && !this.isReady) {
      // We have transitioned from "full" to "not full".
      this.isReady = true;
      // Emit 'ready' to wake up any `send` calls waiting in the while loop.
      this.events.emit('ready');
    } else {
      this.isReady = hasWindowSpace;
    }
  }

  /**
   * Sends a single data packet to the muxer and sets a retransmission timer.
   * @param packet The data packet to send.
   */
  private _sendPacket(packet: DataPacket): void {
    this.muxer.sendPacket(packet).catch((err) => {
      // This is a critical failure. The muxer's own error handling will
      // likely tear down the connection, which will destroy this sender.
      console.error(
        `[muxen] Muxer failed to send packet for channel ${this.channelId}:`,
        err,
      );
    });

    // Set a timer. If we don't receive an ACK for this packet in time,
    // we will retransmit it.
    const timer = setTimeout(
      () => this._resendPacket(packet.seq),
      this.options.ackTimeout,
    );
    this.unackedPackets.set(packet.seq, { packet, timer });
  }

  /**
   * Retransmits a packet that has not been acknowledged within the timeout.
   * @param seq The sequence number of the packet to resend.
   */
  private _resendPacket(seq: number): void {
    const unacked = this.unackedPackets.get(seq);
    if (!unacked) {
      // The packet was likely acknowledged just before the timer fired. Ignore.
      return;
    }

    console.warn(
      `[muxen] Retransmitting packet seq=${seq} on channel ${this.channelId}`,
    );
    // Clear the old timer and send again, which will set a new timer.
    clearTimeout(unacked.timer);
    this._sendPacket(unacked.packet);
  }

  /**
   * Cleans up all internal resources, including pending timers and waiters.
   * @param _error Not used directly, but part of the destroy signature.
   */
  public destroy(_error?: Error): void {
    // Clear all retransmission timers to prevent them from firing after destruction.
    this.unackedPackets.forEach((p) => clearTimeout(p.timer));
    this.unackedPackets.clear();

    // Ensure we no longer accept new sends.
    this.isReady = false;

    // Emit 'ready' one last time to unblock any promises waiting in the `send`
    // method's while loop. They will then fail because the parent channel will
    // be closed.
    this.events.emit('ready');
    this.events.removeAllListeners();
  }
}