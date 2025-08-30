import type { JsonValue } from '@eleplug/transport';

/** A unique identifier for a multiplexed channel within a transport. */
export type MuxenChannelId = string;

/**
 * A constant identifier for the special control channel, used for all
 * non-stream-related RPC communication.
 */
export const CONTROL_CHANNEL_ID: MuxenChannelId = '__control__';

/**
 * The sender window size for a stream channel before its handshake is acknowledged.
 * This allows a small amount of data to be sent speculatively along with the
 * `open-stream` request to reduce round-trip latency.
 */
export const PRE_HANDSHAKE_WINDOW_SIZE = 8;

// =============================================================================
// Packet Definitions
// =============================================================================

/** A base interface for packets that belong to a specific channel. */
interface BaseChannelPacket {
  type: string;
  channelId: MuxenChannelId;
}

/** A packet containing an application data payload. */
export interface DataPacket extends BaseChannelPacket {
  type: 'data';
  /** A sequence number for ordering and acknowledgment. */
  seq: number;
  /**
   * The application-level payload. Its structure is opaque to the muxen layer,
   * allowing for generic data transport.
   */
  payload: JsonValue;
}

/** A packet sent to acknowledge the receipt of a `DataPacket`. */
export interface AckPacket extends BaseChannelPacket {
  type: 'ack';
  /** The sequence number of the `DataPacket` being acknowledged. */
  ackSeq: number;
}

/** A packet sent to request the opening of a new stream channel. */
export interface OpenStreamPacket extends BaseChannelPacket {
  type: 'open-stream';
}

/** A packet sent to acknowledge the opening of a new stream channel. */
export interface OpenStreamAckPacket extends BaseChannelPacket {
  type: 'open-stream-ack';
}

/** A packet sent to gracefully close a specific channel. */
export interface CloseChannelPacket extends BaseChannelPacket {
  type: 'close-channel';
  /** An optional, serializable reason for the closure. */
  reason?: JsonValue;
}

/** A heartbeat packet sent to check for connection liveness. */
export interface HeartbeatPingPacket {
  type: 'ping';
}

/** A heartbeat packet sent in response to a `ping`. */
export interface HeartbeatPongPacket {
  type: 'pong';
}

// =============================================================================
// Packet Union Types and Type Guards
// =============================================================================

/** A union of all packet types that are associated with a channel. */
export type ChannelPacket =
  | DataPacket
  | AckPacket
  | OpenStreamPacket
  | OpenStreamAckPacket
  | CloseChannelPacket;

/** A union of all link-level heartbeat packets. */
export type HeartbeatPacket = HeartbeatPingPacket | HeartbeatPongPacket;

/** A union of all possible packet types in the muxen protocol. */
export type MultiplexedPacket = ChannelPacket | HeartbeatPacket;

/** Type guard to check if a value is a `ChannelPacket`. */
export function isChannelPacket(value: any): value is ChannelPacket {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.channelId !== 'string'
  ) {
    return false;
  }
  switch (value.type) {
    case 'data':
      return typeof value.seq === 'number' && 'payload' in value;
    case 'ack':
      return typeof value.ackSeq === 'number';
    case 'open-stream':
    case 'open-stream-ack':
    case 'close-channel':
      return true;
    default:
      return false;
  }
}

/** Type guard to check if a value is a `HeartbeatPacket`. */
export function isHeartbeatPacket(value: any): value is HeartbeatPacket {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return value.type === 'ping' || value.type === 'pong';
}

/** Type guard to check if a value is a valid `MultiplexedPacket`. */
export function isMultiplexedPacket(value: any): value is MultiplexedPacket {
  return isChannelPacket(value) || isHeartbeatPacket(value);
}