import type { ChannelId, JsonObject, JsonValue } from '@eleplug/transport';

// =================================================================
// Control Messages
// These messages define the erpc application-level protocol exchanged over
// the primary ControlChannel.
// =================================================================

/** A request that expects a response (an 'ask' call). */
export interface RpcRequestMessage extends JsonObject {
  type: 'rpc-request';
  /** The kind of call, used for routing (e.g., 'erpc', 'pin'). */
  kind: string;
  /** A unique ID to correlate the request with its response. */
  callId: string;
  /** The dot-separated path to the target procedure. */
  path: string;
  /** An array of serialized procedure arguments. */
  input: JsonValue[];
  /** An array of optional serialized metadata. */
  meta?: JsonValue[];
}

/** A response to an `RpcRequestMessage`. */
export interface RpcResponseMessage extends JsonObject {
  type: 'rpc-response';
  /** The ID of the original request this response corresponds to. */
  callId: string;
  /** Whether the procedure executed successfully. */
  success: boolean;
  /** The serialized procedure result on success, or a serialized Error on failure. */
  output: JsonValue;
}

/** A notification that does not expect a response (a 'tell' call). */
export interface NotifyMessage extends JsonObject {
  type: 'notify';
  /** The dot-separated path to the target procedure. */
  path: string;
  /** An array of serialized procedure arguments. */
  input: JsonValue[];
  /** An array of optional serialized metadata. */
  meta?: JsonValue[];
}

/** A message to release a remote resource (e.g., a pinned object). */
export interface ReleaseMessage extends JsonObject {
  type: 'release';
  /** The unique identifier of the resource to be released. */
  resourceId: string;
}

/** A message from the stream receiver to acknowledge full consumption of a stream. */
export interface StreamAckMessage extends JsonObject {
  type: 'stream-ack';
  /** The ID of the stream channel being acknowledged. */
  channelId: ChannelId;
}

/** A message that encapsulates a payload for a specific virtual transport (tunnel). */
export interface TunnelMessage extends JsonObject {
  type: 'tunnel';
  /** The unique identifier for the tunnel. */
  tunnelId: string;
  /** The actual `ControlMessage` being forwarded through the tunnel. */
  payload: ControlMessage;
}

/** A union of all possible control messages used by erpc. */
export type ControlMessage =
  | RpcRequestMessage
  | RpcResponseMessage
  | NotifyMessage
  | ReleaseMessage
  | StreamAckMessage
  | TunnelMessage;

// =================================================================
// Stream Messages
// These messages are exchanged over dedicated StreamChannels to manage
// the lifecycle of a data stream.
// =================================================================

/** A handshake message to establish a tunneled stream. */
export interface StreamTunnelMessage extends JsonObject {
  type: 'stream-tunnel';
  /** The ID of the tunnel this stream belongs to. */
  tunnelId: string;
  /** A unique identifier for the stream itself within the tunnel context. */
  streamId: string;
  /** Specifies which end of the tunnel this stream is being routed to. */
  targetEndpoint: 'initiator' | 'receiver';
}

/** A message containing a chunk of data for a stream. */
export interface StreamDataMessage extends JsonObject {
  type: 'stream-data';
  /**
   * An optional ID sent with the first data chunk to link this stream
   * to a placeholder created during serialization.
   */
  handshakeId?: string;
  /** The actual chunk of stream data. */
  chunk: JsonValue;
}

/** A message indicating that the stream has been aborted due to an error. */
export interface StreamAbortMessage extends JsonObject {
  type: 'stream-abort';
  /** The reason for the stream's abortion, serialized as a `JsonValue`. */
  reason: JsonValue;
}

/** A message indicating that the stream has ended gracefully. */
export interface StreamEndMessage extends JsonObject {
  type: 'stream-end';
}

/** A union of all possible stream-related messages used by erpc. */
export type StreamMessage =
  | StreamTunnelMessage
  | StreamDataMessage
  | StreamAbortMessage
  | StreamEndMessage;

/**
 * A special JSON object used by the serialization layer to represent a
 * non-natively-serializable type (e.g., a `Date`, `Error`, or `Stream`).
 * This is a core mechanism for enabling rich data transfer.
 */
export interface Placeholder extends JsonObject {
  /** A unique string identifier for the type being represented (e.g., 'pin', 'stream_readable'). */
  _erpc_type: string;
}

/**
 * A type guard to check if a given value is an erpc `Placeholder`.
 *
 * @param value The value to check.
 * @returns `true` if the value is a valid `Placeholder`, `false` otherwise.
 */
export function isPlaceholder(value: unknown): value is Placeholder {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '_erpc_type' in value &&
    typeof (value as { _erpc_type: unknown })._erpc_type === 'string'
  );
}