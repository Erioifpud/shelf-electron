import { AsyncEventEmitter, type JsonValue } from '@eleplug/transport';
import type { Muxer } from './muxer.js';
import type { DataPacket } from './protocol.js';
import type { DuplexTransportOptions } from './types.js';

/**
 * Defines the events for the receiver.
 * @internal
 */
type ReceiverEvents = {
  /** Emitted when a payload is received in the correct order. */
  payload: (payload: JsonValue) => void;
};

/**
 * Manages the reliable reception of data packets for a single channel.
 *
 * It is responsible for:
 * - Acknowledging every received packet.
 * - Buffering out-of-order packets.
 * - Re-sequencing packets into their correct order.
 * - Delivering an ordered stream of payloads to the application layer.
 *
 * It uses a sliding window algorithm implemented with a circular buffer.
 * @internal
 */
export class ChannelReceiver {
  private readonly events = new AsyncEventEmitter<ReceiverEvents>();
  private nextReceiveSeq = 0;
  private readonly receiveSlots: (DataPacket | null)[];

  constructor(
    private readonly channelId: string,
    private readonly muxer: Muxer,
    private readonly options: Required<DuplexTransportOptions>,
  ) {
    this.receiveSlots = new Array(this.options.receiveBufferSize).fill(null);
  }

  /** Registers a handler for correctly ordered, incoming payloads. */
  public onPayload(handler: (payload: JsonValue) => void): void {
    this.events.on('payload', handler);
  }

  /**
   * Processes an incoming data packet from the wire. This is the main entry
   * point for the receiver's logic.
   * @param packet The data packet received from the Muxer.
   */
  public handleDataPacket(packet: DataPacket): void {
    // 1. Immediately send an ACK for the received sequence number. This allows
    // the sender to clear its retransmission timer and advance its window.
    this.muxer
      .sendPacket({ type: 'ack', channelId: this.channelId, ackSeq: packet.seq })
      .catch((err) =>
        console.error(
          `[muxen] Failed to send ACK for seq=${packet.seq} on channel ${this.channelId}:`,
          err,
        ),
      );

    const { seq } = packet;
    const { receiveBufferSize } = this.options;

    // 2. Discard obsolete packets (i.e., duplicates of packets we have
    // already processed and delivered).
    if (seq < this.nextReceiveSeq) {
      return;
    }

    // 3. Discard packets that are too far in the future, i.e., outside the
    // current receive window. This prevents a malicious or buggy peer from
    // forcing us to buffer an infinite number of packets.
    const windowEnd = this.nextReceiveSeq + receiveBufferSize;
    if (seq >= windowEnd) {
      console.warn(
        `[muxen] Packet seq=${seq} is outside the receive window [${
          this.nextReceiveSeq
        }, ${windowEnd - 1}] on channel ${this.channelId}. Discarding.`,
      );
      return;
    }

    // 4. Place the valid, in-window packet in its corresponding slot in the
    // circular buffer.
    const slotIndex = seq % receiveBufferSize;
    if (this.receiveSlots[slotIndex]) {
        // This indicates a duplicate packet within the window, which is
        // unusual but possible in some network conditions. We ignore it.
        console.warn(`[muxen] Slot collision at index ${slotIndex} on channel ${this.channelId}. Discarding packet seq=${seq}.`);
        return;
    }
    this.receiveSlots[slotIndex] = packet;

    // 5. Attempt to process any contiguous packets starting from the one we
    // are currently waiting for (`nextReceiveSeq`).
    this._slideWindowAndProcess();
  }

  /**
   * Scans the circular buffer from the `nextReceiveSeq` position, processing
   * and dispatching all available in-order packets.
   */
  private _slideWindowAndProcess(): void {
    const { receiveBufferSize } = this.options;

    while (true) {
      const currentSlotIndex = this.nextReceiveSeq % receiveBufferSize;
      const packetToProcess = this.receiveSlots[currentSlotIndex];

      // If the slot is empty or contains a non-sequential packet, we stop.
      if (!packetToProcess || packetToProcess.seq !== this.nextReceiveSeq) {
        break;
      }

      // Process the packet:
      // a. Clear its slot in the buffer.
      this.receiveSlots[currentSlotIndex] = null;
      // b. Dispatch its payload to the application layer.
      this._dispatchPayload(packetToProcess.payload);
      // c. Advance the window by incrementing the next expected sequence number.
      this.nextReceiveSeq++;
    }
  }

  /** Dispatches the payload to the listener. */
  private _dispatchPayload(payload: JsonValue): void {
    this.events.emitAsync('payload', payload).catch((err) => {
      console.error(
        `[muxen] Unhandled error in payload handler for channel ${this.channelId}:`,
        err,
      );
    });
  }

  /** Cleans up all internal state and resources. */
  public destroy(): void {
    this.receiveSlots.length = 0; // Clear the buffer.
    this.events.removeAllListeners();
  }
}