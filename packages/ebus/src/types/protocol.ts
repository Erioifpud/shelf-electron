import type { JsonValue, Transferable, TransferableArray } from "@eleplug/erpc";
import type {
  Broadcastable,
  BroadcastableArray,
  NodeId,
  Topic,
} from "./common.js";
import type { SerializableEbusError } from "./errors.js";

// =================================================================
// Section 1: RPC & Stream Payloads
// These are the "contents" of the message envelopes.
// =================================================================

// --- P2P RPC Payloads (Point-to-Point) ---

/** The payload for a P2P `tell` (fire-and-forget) call. Can contain any `Transferable`. */
export type P2PTellPayload = {
  readonly type: "tell";
  readonly path: string;
  readonly args: TransferableArray;
  readonly meta?: JsonValue[];
};

/** The payload for a P2P `ask` (request-response) call. Can contain any `Transferable`. */
export type P2PAskPayload = {
  readonly type: "ask";
  readonly callId: string;
  readonly path: string;
  readonly args: TransferableArray;
  readonly meta?: JsonValue[];
};

// --- Broadcast RPC Payloads (Pub/Sub) ---

/** The payload for a broadcast `tell` call. Arguments are restricted to `Broadcastable`. */
export type BroadcastTellPayload = {
  readonly type: "tell";
  readonly path: string;
  readonly args: BroadcastableArray;
  readonly meta?: JsonValue[];
};

/** The payload for a broadcast `ask`/`all` call. Arguments are restricted to `Broadcastable`. */
export type BroadcastAskPayload = {
  readonly type: "ask";
  readonly callId: string; // Used as the session ID for collecting results.
  readonly path: string;
  readonly args: BroadcastableArray;
  readonly meta?: JsonValue[];
};

// --- Common RPC Response Payloads ---

/**
 * A payload carrying a single result from an `ask` call.
 * @remarks This is sent P2P from the consumer back towards the original caller.
 */
export type RpcAckResultPayload = {
  readonly type: "ack_result";
  readonly callId: string;
  readonly sourceId: NodeId; // The ID of the node that generated this result.
  readonly resultSeq: number; // For P2P this is 0; for broadcast 'ask' it's an incrementing sequence.
  readonly result:
    | { success: true; data: Transferable }
    | { success: false; error: SerializableEbusError };
};

/**
 * A payload signaling that a downstream branch has finished sending all its results for an `ask` call.
 */
export type RpcAckFinPayload = {
  readonly type: "ack_fin";
  readonly callId: string;
  readonly totalResults: number; // The total number of results that were sent from this branch.
};

/** A union of all possible RPC response payloads. */
export type RpcResponsePayload = RpcAckResultPayload | RpcAckFinPayload;

// --- Stream Payloads ---

/** A payload to control a stream's lifecycle (end, abort). */
export type StreamControlPayload = {
  readonly type: "stream_control";
  readonly streamId: string;
  readonly action: "end" | "abort" | "contributor_end" | "contributor_abort";
  readonly reason?: any;
};

/** A payload carrying a single chunk of data for a stream. */
export type StreamDataPayload = {
  readonly type: "stream_data";
  readonly streamId: string;
  readonly chunk: Broadcastable | Transferable;
};

/** A union of all possible stream-related payloads. */
export type StreamPayload = StreamControlPayload | StreamDataPayload;

// =================================================================
// Section 2: Message Envelopes
// These wrap the payloads with routing and kind information.
// =================================================================

/** An envelope for P2P messages. */
export type P2PMessage = {
  readonly kind: "p2p";
  readonly sourceId: NodeId | string; // Can be a system ID for error responses.
  readonly sourceGroups: string[];
  readonly destinationId: NodeId | string;
  readonly payload: P2PAskPayload | P2PTellPayload | RpcResponsePayload;
};

/** An envelope for broadcast (Pub/Sub) messages. */
export type BroadcastMessage = {
  readonly kind: "broadcast";
  readonly sourceId: NodeId;
  readonly sourceGroups: string[];
  readonly topic: Topic;
  readonly loopback?: boolean;
  readonly payload: BroadcastAskPayload | BroadcastTellPayload;
};

/** An envelope for stream-related messages. */
export type StreamMessage = {
  readonly kind: "stream";
  readonly sourceId: NodeId | string;
  readonly destinationId?: NodeId | string; // Used for P2P streams.
  readonly topic?: Topic; // Used for broadcast streams.
  readonly payload: StreamPayload;
};

// --- Bus-to-Bus Control Messages (for routing and state sync) ---

/** [Request] A child bus informs its parent about its interest in topics. */
export type SubscriptionUpdateMessage = {
  readonly kind: "sub-update";
  readonly correlationId: string;
  readonly updates: Array<{
    topic: Topic;
    isSubscribed: boolean; // True if the child (or its network) has any subscribers.
  }>;
};

/** [Response] A parent acknowledges a `SubscriptionUpdateMessage`. */
export type SubscriptionUpdateResponseMessage = {
  readonly kind: "sub-update-response";
  readonly correlationId: string;
  readonly errors?: Array<{ topic: Topic; error: SerializableEbusError }>;
};

/** [Request] A child bus announces node availability in its network to its parent. */
export type NodeAnnouncementMessage = {
  readonly kind: "node-announcement";
  readonly correlationId: string;
  readonly announcements: Array<{
    nodeId: NodeId;
    isAvailable: boolean;
    groups: string[];
  }>;
};

/** [Response] A parent acknowledges a `NodeAnnouncementMessage`. */
export type NodeAnnouncementResponseMessage = {
  readonly kind: "node-announcement-response";
  readonly correlationId: string;
  readonly errors?: Array<{ nodeId: NodeId; error: SerializableEbusError }>;
};

/** [Request] Initiates a handshake with a newly connected adjacent bus. */
export type HandshakeMessage = {
  readonly kind: "handshake";
  readonly correlationId: string;
};

/** [Response] Acknowledges a successful handshake. */
export type HandshakeResponseMessage = {
  readonly kind: "handshake-response";
  readonly correlationId: string;
};

// =================================================================
// Section 3: Protocol Message Union
// =================================================================

/**
 * A discriminated union of all possible message types that can be passed
 * between bus instances.
 */
export type ProtocolMessage =
  | P2PMessage
  | BroadcastMessage
  | StreamMessage
  | SubscriptionUpdateMessage
  | NodeAnnouncementMessage
  | NodeAnnouncementResponseMessage
  | SubscriptionUpdateResponseMessage
  | HandshakeMessage
  | HandshakeResponseMessage;