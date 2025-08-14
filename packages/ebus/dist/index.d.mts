import * as _eleplug_erpc from '@eleplug/erpc';
import { JsonValue, Transferable, Pin, Api, TransferableArray, ErpcInstance, Procedure, AskProcedure, InferPhantomData, TellProcedure, Router, Client, Transport } from '@eleplug/erpc';
export { Api, Client, Transport } from '@eleplug/erpc';
import { DefaultEventMap, EventEmitter } from 'tseep';

/**
 * Provides context to a `DispatchHandler` during a dispatch operation.
 * Its primary role is to enable recursive dispatching for nested objects and arrays.
 */
interface DispatchContext {
    /**
     * Recursively calls the main dispatch function.
     * A handler should use this to process nested properties of an object it is handling.
     *
     * @param value The value to be dispatched (cloned).
     * @param count The number of copies to create.
     * @returns An array containing `count` new instances of the value.
     */
    dispatch: <T>(value: T, count: number) => T[];
}
/**
 * Defines the interface for a dispatch handler, a plugin that specifies how to
 * "clone" a particular data type for broadcasting.
 *
 * For simple objects, this is deep cloning. For complex types like streams or
 * pinned objects, it involves creating multiple proxy objects that correctly
 * interact with the single original source (fan-out/fan-in).
 *
 * @template TValue The type of value this handler can process.
 */
interface DispatchHandler<TValue extends object = object> {
    /**
     * Checks if a given value should be processed by this handler.
     * This is called for each value during the dispatch process.
     *
     * @param value The value to check.
     * @returns `true` if this handler can process the value, otherwise `false`.
     */
    canHandle(value: unknown): value is TValue;
    /**
     * Creates `count` semantically equivalent copies of a value.
     *
     * @param value The original value to be dispatched.
     * @param count The number of copies to create.
     * @param context Provides the ability to recursively dispatch nested values.
     * @returns An array containing `count` new instances.
     */
    dispatch(value: TValue, count: number, context: DispatchContext): TValue[];
}

/** A unique identifier for a node on the EBUS network. */
type NodeId = string;
/** A string identifier for a message topic. */
type Topic = string;
/** A unique identifier for a direct child bus connection. */
type BusId = number;
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
type Broadcastable = JsonValue | ReadableStream<Broadcastable> | WritableStream<Transferable> | Uint8Array | Pin<any> | {
    [key: string]: Broadcastable;
} | Broadcastable[] | void;
/** An array where all elements are `Broadcastable`. */
type BroadcastableArray = Broadcastable[];
/** The base context available in all EBUS procedure handlers. */
type BusContext = {
    /** The ID of the node that initiated the call. */
    readonly sourceNodeId: NodeId;
    /** The ID of the local node that is executing the procedure. */
    readonly localNodeId: NodeId;
};
/** The specific context available in Pub/Sub (topic) procedure handlers. */
type TopicContext = BusContext & {
    /** The topic on which the message was received. */
    readonly topic: Topic;
};
/**
 * Defines a factory function for creating a node's P2P (point-to-point) API.
 * The procedures within this API can accept and return any `Transferable` type.
 *
 * @param t An erpc instance pre-configured with the `BusContext` middleware.
 */
type ApiFactory<TApi extends Api<TransferableArray, Transferable>> = (t: ErpcInstance<BusContext, TransferableArray, Transferable>) => TApi | Promise<TApi>;
/**
 * Defines a factory function for creating a consumer's API for a specific topic.
 * The procedures within this API are constrained to `Broadcastable` arguments.
 *
 * @param t An erpc instance pre-configured with the `TopicContext` middleware.
 */
type ConsumerFactory<TApi extends Api<BroadcastableArray, Transferable>> = (t: ErpcInstance<TopicContext, BroadcastableArray, Transferable>) => TApi | Promise<TApi>;
/**
 * Configuration options for joining the EBUS network with a new node.
 */
interface NodeOptions<TApi extends Api<TransferableArray, Transferable>> {
    /** The unique identifier for this node. */
    id: NodeId;
    /** An optional factory to define the P2P API this node exposes. */
    apiFactory?: ApiFactory<TApi>;
}
/**
 * Configuration options for creating a topic publisher.
 */
interface PublisherOptions {
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
interface SubscriptionHandle {
    /**
     * Unsubscribes from the topic and tears down the associated consumer API.
     */
    cancel(): Promise<void>;
}
/** Represents a successful operation outcome. */
type Ok<T> = {
    readonly isOk: true;
    readonly value: T;
};
/** Represents a failed operation outcome. */
type Err<E> = {
    readonly isOk: false;
    readonly error: E;
};
/** A container for an operation that can either succeed (`Ok`) or fail (`Err`). */
type Result<T, E = Error> = Ok<T> | Err<E>;
/** A helper function to create a successful `Result`. */
declare const ok: <T>(value: T) => Ok<T>;
/** A helper function to create a failed `Result`. */
declare const err: <E>(error: E) => Err<E>;

/**
 * The base class for all custom errors within the EBUS system.
 */
declare class EbusError extends Error {
    constructor(message: string);
}
/**
 * Thrown when an operation targets a node that cannot be found or reached.
 */
declare class NodeNotFoundError extends EbusError {
    readonly details: {
        nodeId: string;
    };
    constructor(nodeId: string);
}
/**
 * Thrown when a call is made to a node that has joined the network but
 * has not yet had its API set via `node.setApi()`.
 */
declare class ProcedureNotReadyError extends EbusError {
    readonly details: {
        nodeId: string;
    };
    constructor(nodeId: string);
}
/**
 * A serializable, network-transferable representation of an error.
 */
type SerializableEbusError = {
    name: string;
    message: string;
    stack?: string;
    details?: {
        [key: string]: any;
    };
};

/** The payload for a P2P `tell` (fire-and-forget) call. Can contain any `Transferable`. */
type P2PTellPayload = {
    readonly type: "tell";
    readonly path: string;
    readonly args: TransferableArray;
    readonly meta?: JsonValue[];
};
/** The payload for a P2P `ask` (request-response) call. Can contain any `Transferable`. */
type P2PAskPayload = {
    readonly type: "ask";
    readonly callId: string;
    readonly path: string;
    readonly args: TransferableArray;
    readonly meta?: JsonValue[];
};
/** The payload for a broadcast `tell` call. Arguments are restricted to `Broadcastable`. */
type BroadcastTellPayload = {
    readonly type: "tell";
    readonly path: string;
    readonly args: BroadcastableArray;
    readonly meta?: JsonValue[];
};
/** The payload for a broadcast `ask`/`all` call. Arguments are restricted to `Broadcastable`. */
type BroadcastAskPayload = {
    readonly type: "ask";
    readonly callId: string;
    readonly path: string;
    readonly args: BroadcastableArray;
    readonly meta?: JsonValue[];
};
/**
 * A payload carrying a single result from an `ask` call.
 * @remarks This is sent P2P from the consumer back towards the original caller.
 */
type RpcAckResultPayload = {
    readonly type: "ack_result";
    readonly callId: string;
    readonly sourceId: NodeId;
    readonly resultSeq: number;
    readonly result: {
        success: true;
        data: Transferable;
    } | {
        success: false;
        error: SerializableEbusError;
    };
};
/**
 * A payload signaling that a downstream branch has finished sending all its results for an `ask` call.
 */
type RpcAckFinPayload = {
    readonly type: "ack_fin";
    readonly callId: string;
    readonly totalResults: number;
};
/** A union of all possible RPC response payloads. */
type RpcResponsePayload = RpcAckResultPayload | RpcAckFinPayload;
/** A payload to control a stream's lifecycle (end, abort). */
type StreamControlPayload = {
    readonly type: "stream_control";
    readonly streamId: string;
    readonly action: "end" | "abort" | "contributor_end" | "contributor_abort";
    readonly reason?: any;
};
/** A payload carrying a single chunk of data for a stream. */
type StreamDataPayload = {
    readonly type: "stream_data";
    readonly streamId: string;
    readonly chunk: Broadcastable | Transferable;
};
/** A union of all possible stream-related payloads. */
type StreamPayload = StreamControlPayload | StreamDataPayload;
/** An envelope for P2P messages. */
type P2PMessage = {
    readonly kind: "p2p";
    readonly sourceId: NodeId | string;
    readonly destinationId: NodeId | string;
    readonly payload: P2PAskPayload | P2PTellPayload | RpcResponsePayload;
};
/** An envelope for broadcast (Pub/Sub) messages. */
type BroadcastMessage = {
    readonly kind: "broadcast";
    readonly sourceId: NodeId;
    readonly topic: Topic;
    readonly loopback?: boolean;
    readonly payload: BroadcastAskPayload | BroadcastTellPayload;
};
/** An envelope for stream-related messages. */
type StreamMessage = {
    readonly kind: "stream";
    readonly sourceId: NodeId | string;
    readonly destinationId?: NodeId | string;
    readonly topic?: Topic;
    readonly payload: StreamPayload;
};
/** [Request] A child bus informs its parent about its interest in topics. */
type SubscriptionUpdateMessage = {
    readonly kind: "sub-update";
    readonly correlationId: string;
    readonly updates: Array<{
        topic: Topic;
        isSubscribed: boolean;
    }>;
};
/** [Response] A parent acknowledges a `SubscriptionUpdateMessage`. */
type SubscriptionUpdateResponseMessage = {
    readonly kind: "sub-update-response";
    readonly correlationId: string;
    readonly errors?: Array<{
        topic: Topic;
        error: SerializableEbusError;
    }>;
};
/** [Request] A child bus announces node availability in its network to its parent. */
type NodeAnnouncementMessage = {
    readonly kind: "node-announcement";
    readonly correlationId: string;
    readonly announcements: Array<{
        nodeId: NodeId;
        isAvailable: boolean;
    }>;
};
/** [Response] A parent acknowledges a `NodeAnnouncementMessage`. */
type NodeAnnouncementResponseMessage = {
    readonly kind: "node-announcement-response";
    readonly correlationId: string;
    readonly errors?: Array<{
        nodeId: NodeId;
        error: SerializableEbusError;
    }>;
};
/** [Request] Initiates a handshake with a newly connected adjacent bus. */
type HandshakeMessage = {
    readonly kind: "handshake";
    readonly correlationId: string;
};
/** [Response] Acknowledges a successful handshake. */
type HandshakeResponseMessage = {
    readonly kind: "handshake-response";
    readonly correlationId: string;
};
/**
 * A discriminated union of all possible message types that can be passed
 * between bus instances.
 */
type ProtocolMessage = P2PMessage | BroadcastMessage | StreamMessage | SubscriptionUpdateMessage | NodeAnnouncementMessage | NodeAnnouncementResponseMessage | SubscriptionUpdateResponseMessage | HandshakeMessage | HandshakeResponseMessage;

/**
 * Represents the direct source of a message or connection event.
 *
 * This is crucial for routing responses and managing state based on which
 * adjacent bus a message came from.
 *
 * - `{ type: 'parent' }`: The message came from the single parent bus.
 * - `{ type: 'child', busId: ... }`: The message came from a specific child bus.
 * - `{ type: 'local' }`: The session was initiated by a node on this bus instance.
 */
type MessageSource = {
    type: "parent";
} | {
    type: "child";
    busId: BusId;
} | {
    type: "local";
};

/**
 * High-level, semantic events emitted by the `ProtocolCoordinatorFeature` after
 * classifying raw protocol messages.
 */
type SemanticBusEvents = {
    p2p: (message: P2PMessage, source: MessageSource) => void;
    broadcast: (message: BroadcastMessage, source: MessageSource) => void;
    stream: (message: StreamMessage, source: MessageSource) => void;
    subscriptionUpdate: (message: SubscriptionUpdateMessage, source: MessageSource) => void;
    nodeAnnouncement: (message: NodeAnnouncementMessage, source: MessageSource) => void;
};

/**
 * The events emitted by the `BridgeManagerFeature`, representing raw
 * connection state changes and incoming messages from adjacent buses.
 */
type BridgeConnectionEvents = {
    /** Emitted when a message is received from any connected bus. */
    message: (event: {
        source: MessageSource;
        message: ProtocolMessage;
    }) => void;
    /** Emitted when a connection to an adjacent bus is lost. */
    connectionDropped: (event: {
        source: MessageSource;
        error?: Error;
    }) => void;
    /** Emitted when a new connection to an adjacent bus is established and ready. */
    connectionReady: (event: {
        source: MessageSource;
    }) => void;
};

/**
 * An enhanced event emitter that provides sophisticated asynchronous event
 * handling. It extends `tseep`'s `EventEmitter` with methods for concurrent,
 * serial, and queued event emission, making it ideal for managing complex,
 * potentially async, workflows.
 *
 * @template EventMap - A map of event names to their listener signatures.
 */
declare class AsyncEventEmitter<EventMap extends DefaultEventMap = DefaultEventMap> extends EventEmitter<EventMap> {
    /**
     * Emits an event and waits for all listeners to complete concurrently.
     * Listeners are executed in parallel via `Promise.all`. This is suitable
     * for I/O-bound tasks that can run simultaneously without interference.
     *
     * @example
     * ```ts
     * emitter.on('data', async (chunk) => await processChunk(chunk));
     * // Waits for all `processChunk` calls to complete in parallel.
     * await emitter.emitAsync('data', 'some-chunk');
     * ```
     *
     * @param event The name of the event to emit.
     * @param args The arguments to pass to the listeners.
     * @returns A promise that resolves when all listeners have completed.
     */
    emitAsync<E extends keyof EventMap>(event: E, ...args: Parameters<EventMap[E]>): Promise<void>;
    /**
     * Emits an event and waits for each listener to complete serially.
     * Listeners are executed one after another in the order they were registered.
     * This is crucial for tasks that must not overlap.
     *
     * @example
     * ```ts
     * emitter.on('task', async (id) => {
     *   console.log(`Starting task ${id}`);
     *   await longRunningTask(id);
     *   console.log(`Finished task ${id}`);
     * });
     * // Executes the first listener, waits for it to finish, then executes the next.
     * await emitter.emitSerial('task', 1);
     * ```
     *
     * @param event The name of the event to emit.
     * @param args The arguments to pass to the listeners.
     * @returns A promise that resolves when the last listener has completed.
     */
    emitSerial<E extends keyof EventMap>(event: E, ...args: Parameters<EventMap[E]>): Promise<void>;
    /** A private promise chain to ensure queued emissions are processed serially. */
    private queue;
    /**
     * Enqueues an event to be emitted after all previously queued events have
     * been processed. This guarantees that entire `emit` invocations are executed
     * in sequence, preventing race conditions between different event emissions.
     *
     * @remarks
     * While the emission of *separate* events is serialized, the listeners for a
     * *single* queued event are still run concurrently via `emitAsync`.
     *
     * @example
     * ```ts
     * // The 'update' for data2 will not start until all listeners
     * // for the 'update' of data1 have completed.
     * emitter.emitQueued('update', data1);
     * emitter.emitQueued('update', data2);
     * ```
     *
     * @param event The name of the event to emit.
     * @param args The arguments to pass to the listeners.
     * @returns A promise that resolves when this specific queued event has been
     * fully handled by all its listeners.
     */
    emitQueued<E extends keyof EventMap>(event: E, ...args: Parameters<EventMap[E]>): Promise<void>;
}

/** Transforms a server-side 'ask' procedure into its publisher client counterpart. */
type PublisherClientAskProcedure<TProc extends AskProcedure<any, any, any>> = 
/**
 * Broadcasts a request and returns an async iterable of all results.
 * @param args The arguments for the procedure, matching the consumer's API.
 * @returns An `AsyncIterable` that yields a `Result` for each responding subscriber.
 */
(...args: InferPhantomData<TProc["input"]>) => AsyncIterable<Result<Awaited<InferPhantomData<TProc["output"]>>>>;
/** The 'tell' procedure signature remains the same in the publisher client. */
type PublisherClientTellProcedure<TProc extends TellProcedure<any, any>> = 
/**
 * Broadcasts a fire-and-forget notification to all subscribers.
 * @param args The arguments for the procedure.
 * @returns A promise that resolves when the broadcast has been initiated.
 */
(...args: InferPhantomData<TProc["input"]>) => Promise<void>;
/** Maps a server-side procedure type to its corresponding publisher client method. */
type PublisherClientProcedure<TProc> = TProc extends AskProcedure<any, any, any> ? {
    all: PublisherClientAskProcedure<TProc>;
} : TProc extends TellProcedure<any, any> ? {
    tell: PublisherClientTellProcedure<TProc>;
} : never;
/**
 * Recursively builds the publisher client's type from a consumer API definition.
 * This utility type is the core of the publisher's type-safety.
 * @internal
 */
type BuildPublisherClient<TApi> = 0 extends 1 & TApi ? any : TApi extends Procedure<any, any, any> ? PublisherClientProcedure<TApi> : TApi extends Router<any, any> ? {
    [K in string & keyof TApi as TApi[K] extends Api<BroadcastableArray, Transferable> ? K : never]: BuildPublisherClient<TApi[K]>;
} : never;
/**
 * The user-facing type for a Publisher Client.
 *
 * It is a deeply-typed proxy that transforms a consumer's `erpc` API shape
 * into a publisher's API. For example, a consumer procedure `add(a: number, b: number)`
 * is invoked on the publisher via `publisher.add.all(a, b)`.
 *
 * @template THandlerApi The API shape of the consumers of this topic.
 */
type PublisherClient<THandlerApi extends Api<BroadcastableArray, Transferable>> = BuildPublisherClient<THandlerApi>;

/**
 * The user-facing, top-level API for an EBUS instance, contributed by `ApiFeature`.
 */
interface EbusApi {
    /**
     * Creates and registers a new logical node on this EBUS instance.
     * @param options Configuration for the new node, including its ID and optional P2P API.
     * @returns A promise that resolves to a `Node` instance, the main handle for
     *          interacting with the EBUS network.
     */
    join<TApi extends Api<TransferableArray, Transferable> = any>(options: NodeOptions<TApi>): Promise<Node<TApi>>;
    /**
     * An internal method used by `node.connectTo()` to create a P2P client.
     * @internal
     */
    connectTo<TApi extends Api<TransferableArray, Transferable>>(sourceNodeId: NodeId, targetNodeId: NodeId): Promise<Client<TApi>>;
}

/**
 * Defines the core functionalities required by a `Node` instance.
 * This interface decouples the user-facing `Node` class from the internal
 * feature implementations that provide these capabilities.
 * @internal
 */
interface NodeDependencies<TApi extends Api<TransferableArray, Transferable>> {
    setApi(apiFactory: ApiFactory<TApi>): Promise<void>;
    subscribe(topic: Topic, consumerFactory: ConsumerFactory<Api<BroadcastableArray, Transferable>>): Promise<SubscriptionHandle>;
    emiter<T extends Api<BroadcastableArray, Transferable>>(options: PublisherOptions): PublisherClient<T>;
    closeNode(): Promise<void>;
}
/**
 * Represents an addressable entity on the EBUS network.
 * This class provides the primary user-facing interface for an application to
 * interact with the EBUS, including P2P communication, Pub/Sub, and lifecycle management.
 *
 * @template TApi The P2P API shape this node exposes to other nodes.
 */
declare class Node<TApi extends Api<TransferableArray, Transferable> = any> {
    /** The unique identifier of this node. */
    readonly id: NodeId;
    private readonly busApi;
    private readonly deps;
    /**
     * @internal
     * Nodes should be created via `ebus.join()`, not constructed directly.
     */
    constructor(id: NodeId, busApi: EbusApi, dependencies: NodeDependencies<TApi>);
    /**
     * Sets or replaces the P2P API for this node.
     * The procedures in the API can accept and return any `Transferable` type.
     *
     * @param apiFactory A factory function that returns the erpc API definition.
     */
    setApi(apiFactory: ApiFactory<TApi>): Promise<void>;
    /**
     * Creates a typed client for point-to-point communication with another node.
     *
     * @template TheirApi The API shape of the target node.
     * @param targetNodeId The unique ID of the node to connect to.
     * @returns A promise that resolves to a type-safe erpc client.
     */
    connectTo<TheirApi extends Api<TransferableArray, Transferable>>(targetNodeId: NodeId): Promise<Client<TheirApi>>;
    /**
     * Subscribes to a topic and provides an API to handle messages published to it.
     * The procedure arguments in the handler API must be `Broadcastable`.
     *
     * @param topic The topic to subscribe to.
     * @param consumerFactory A factory function that returns the erpc API for handling messages.
     * @returns A promise that resolves to a `SubscriptionHandle`, which can be used to cancel.
     */
    subscribe<THandlerApi extends Api<BroadcastableArray, Transferable>>(topic: Topic, consumerFactory: ConsumerFactory<THandlerApi>): Promise<SubscriptionHandle>;
    /**
     * Creates a publisher client for sending broadcast messages to a topic.
     *
     * @template THandlerApi The API shape of the consumers for this topic.
     * @param topic The topic to publish to.
     * @param options Optional publisher settings, such as `loopback`.
     * @returns A `PublisherClient` for making type-safe broadcast calls.
     */
    emiter<THandlerApi extends Api<BroadcastableArray, Transferable>>(topic: string, options?: {
        loopback?: boolean;
    }): PublisherClient<THandlerApi>;
    /**
     * Gracefully closes this node, deregistering it from the network.
     * This will immediately reject any new incoming calls to this node.
     */
    close(): Promise<void>;
}

/**
 * Creates a new EBUS instance.
 * @param parentTransport An optional erpc `Transport` to connect this bus as a
 *                        child to a parent bus, forming a larger network.
 * @returns A promise that resolves to the fully initialized EBUS instance.
 */
declare function createEbusInstance(parentTransport?: Transport): Promise<{
    close: (error?: Error) => Promise<void>;
    semanticEvents: AsyncEventEmitter<SemanticBusEvents>;
    sendRequestAndWaitForAck<TRequest extends ProtocolMessage & {
        correlationId: string;
    }, TResponse extends ProtocolMessage>(destination: MessageSource, request: TRequest): Promise<TResponse>;
    initiateHandshake(source: MessageSource): Promise<void>;
    ebusId: string;
    busEvents: AsyncEventEmitter<BridgeConnectionEvents>;
    sendToParent(message: ProtocolMessage): Promise<void>;
    sendToChild(busId: BusId, message: ProtocolMessage): Promise<void>;
    bridge(transport: Transport): Promise<void>;
    hasParentConnection(): boolean;
    getActiveChildBusIds(): BusId[];
    dispatcher: {
        dispatch: <T>(value: T, count: number) => T[];
        registerHandler: (handler: DispatchHandler<any>) => void;
    };
    registerNode(options: NodeOptions<any>): Promise<void>;
    updateNodeApi(nodeId: NodeId, apiFactory: ApiFactory<any>): Promise<void>;
    addSubscription(nodeId: NodeId, topic: Topic, consumerFactory: ConsumerFactory<any>): Promise<void>;
    removeSubscription(nodeId: NodeId, topic: Topic): void;
    hasNode(nodeId: NodeId): boolean;
    getLocalNodeIds(): NodeId[];
    getTopicsForNode(nodeId: NodeId): Topic[];
    removeNode(nodeId: NodeId): void;
    markAsClosing(nodeId: NodeId): Promise<void>;
    executeP2PProcedure(destinationId: NodeId, sourceId: NodeId, payload: P2PAskPayload | P2PTellPayload): Promise<_eleplug_erpc.ProcedureExecutionResult<_eleplug_erpc.Transferable> | void>;
    executeBroadcastProcedure(destinationId: NodeId, sourceId: NodeId, topic: Topic, payload: BroadcastAskPayload | BroadcastTellPayload): Promise<_eleplug_erpc.ProcedureExecutionResult<_eleplug_erpc.Transferable> | void>;
    announceNode(nodeId: NodeId, isAvailable: boolean): Promise<void>;
    updateLocalSubscription(nodeId: NodeId, topic: Topic, isSubscribed: boolean): Promise<void>;
    getNextHop(destination: NodeId): ({
        type: "local";
    } | {
        type: "parent";
    } | {
        type: "child";
        busId: BusId;
    }) | null;
    getBroadcastDownstream(topic: Topic, source: MessageSource): MessageSource[];
    getLocalSubscribers(topic: Topic): NodeId[];
    createPublisher<TApi extends Api<BroadcastableArray, _eleplug_erpc.Transferable>>(options: PublisherOptions): PublisherClient<TApi>;
    isManagingSession(sessionId: string): boolean;
    delegateMessageToSession(message: P2PMessage, source: MessageSource): void;
    createP2PClient<TApi extends Api<_eleplug_erpc.TransferableArray, _eleplug_erpc.Transferable>>(sourceNodeId: NodeId, targetNodeId: NodeId): Client<TApi>;
    routeP2PMessage(message: P2PMessage): void;
    join<TApi extends Api<_eleplug_erpc.TransferableArray, _eleplug_erpc.Transferable> = any>(options: NodeOptions<TApi>): Promise<Node<TApi>>;
    connectTo<TApi extends Api<_eleplug_erpc.TransferableArray, _eleplug_erpc.Transferable>>(sourceNodeId: NodeId, targetNodeId: NodeId): Promise<Client<TApi>>;
}>;
/**
 * The main entry point for creating an EBUS instance.
 *
 * @example
 * ```ts
 * import { initEBUS } from '@eleplug/ebus';
 *
 * // Create a standalone bus
 * const bus = await initEBUS.create();
 *
 * // Create a bus connected to a parent
 * const childBus = await initEBUS.create(someTransport);
 * ```
 */
declare const initEBUS: {
    create: typeof createEbusInstance;
};
/** The type of a fully initialized EBUS instance. */
type Bus = Awaited<ReturnType<typeof createEbusInstance>>;

export { type ApiFactory, type Bus, type BusContext, type ConsumerFactory, EbusError, type Err, Node, type NodeId, NodeNotFoundError, type NodeOptions, type Ok, ProcedureNotReadyError, type PublisherClient, type PublisherOptions, type Result, type SubscriptionHandle, type Topic, type TopicContext, err, initEBUS, ok };
