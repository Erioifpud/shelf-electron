import type {
  Api,
  JsonValue,
  Pin,
  Transferable,
  TransferableArray
} from "@eleplug/erpc";

// =================================================================
// Section 1: Core Identifiers
// =================================================================

/** A unique identifier for a node on the EBUS network. */
export type NodeId = string;

/** A string identifier for a message topic. */
export type Topic = string;

/** A unique identifier for a direct child bus connection. */
export type BusId = number;

// =================================================================
// Section 2: Data Transfer Constraints
// =================================================================

/**
 * Represents a value that can be safely broadcast to multiple subscribers.
 *
 * @remarks
 * This is a stricter subset of erpc's `Transferable` type. It explicitly
 * excludes `Transport` objects, as tunneling a transport to multiple
 * destinations is not a supported use case and would introduce significant
 * complexity. All other transferable types, including `Pin`, `Stream`, and
 * `JsonValue`, are allowed.
 */
export type Broadcastable =
  | JsonValue
  | ReadableStream<Broadcastable>
  | WritableStream<Transferable> // Writable streams are fan-in, so their chunks can be Transferable
  | Uint8Array
  | Pin<any>
  | { [key: string]: Broadcastable }
  | Broadcastable[]
  | void;

/** An object where all property values are `Broadcastable`. */
export type BroadcastableObject = { [key: string]: Broadcastable };
/** An array where all elements are `Broadcastable`. */
export type BroadcastableArray = Broadcastable[];

// =================================================================
// Section 3: Public API & Factory Types
// =================================================================

/** The base context available in all EBUS procedure handlers. */
export type BusContext = {
  /** The ID of the node that initiated the call. */
  readonly sourceNodeId: NodeId;
  /** The groups of the node that initiated the call. */
  readonly sourceGroups: string[];
  /** The ID of the local node that is executing the procedure. */
  readonly localNodeId: NodeId;
};

/** The specific context available in Pub/Sub (topic) procedure handlers. */
export type TopicContext = BusContext & {
  /** The topic on which the message was received. */
  readonly topic: Topic;
};

/**
 * Configuration options for joining the EBUS network with a new node.
 */
export interface NodeOptions<
  TApi extends Api<BusContext, TransferableArray, Transferable>,
> {
  /** The unique identifier for this node. */
  id: NodeId;
  /** Optional. Specifies the groups this node belongs to. Defaults to the default group. */
  groups?: string[];
  /** An optional to define the P2P API this node exposes. */
  api?: TApi;
}

/**
 * Configuration options for creating a topic publisher.
 */
export interface PublisherOptions {
  /** The topic to publish to. */
  topic: Topic;
  /** The ID of the node that is the source of the published messages. */
  sourceNodeId: NodeId;
  /**
   * If `true`, messages will be delivered to subscribers on the same source node.
   * Defaults to `true`.
   */
  loopback?: boolean;
}

/** A handle returned from `node.subscribe()`, allowing for cancellation. */
export interface SubscriptionHandle {
  /**
   * Unsubscribes from the topic and tears down the associated consumer API.
   */
  cancel(): Promise<void>;
}

// =================================================================
// Section 4: Result Type Utilities
// =================================================================

/** Represents a successful operation outcome. */
export type Ok<T> = { readonly isOk: true; readonly value: T };
/** Represents a failed operation outcome. */
export type Err<E> = { readonly isOk: false; readonly error: E };
/** A container for an operation that can either succeed (`Ok`) or fail (`Err`). */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** A helper function to create a successful `Result`. */
export const ok = <T>(value: T): Ok<T> => ({ isOk: true, value });
/** A helper function to create a failed `Result`. */
export const err = <E>(error: E): Err<E> => ({ isOk: false, error });