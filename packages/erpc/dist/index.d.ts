import * as _eleplug_transport from '@eleplug/transport';
import { JsonObject as JsonObject$1, JsonValue as JsonValue$1, ChannelId, Transport, OutgoingStreamChannel, ControlChannel, IncomingStreamChannel, AsyncEventEmitter } from '@eleplug/transport';
export { BaseChannel, ChannelId, ControlChannel, IncomingStreamChannel, JsonValue, OutgoingStreamChannel, StreamChannel, Transport } from '@eleplug/transport';

/** A request that expects a response (an 'ask' call). */
interface RpcRequestMessage extends JsonObject$1 {
    type: 'rpc-request';
    /** The kind of call, used for routing (e.g., 'erpc', 'pin'). */
    kind: string;
    /** A unique ID to correlate the request with its response. */
    callId: string;
    /** The dot-separated path to the target procedure. */
    path: string;
    /** An array of serialized procedure arguments. */
    input: JsonValue$1[];
    /** An array of optional serialized metadata. */
    meta?: JsonValue$1[];
}
/** A response to an `RpcRequestMessage`. */
interface RpcResponseMessage extends JsonObject$1 {
    type: 'rpc-response';
    /** The ID of the original request this response corresponds to. */
    callId: string;
    /** Whether the procedure executed successfully. */
    success: boolean;
    /** The serialized procedure result on success, or a serialized Error on failure. */
    output: JsonValue$1;
}
/** A notification that does not expect a response (a 'tell' call). */
interface NotifyMessage extends JsonObject$1 {
    type: 'notify';
    /** The dot-separated path to the target procedure. */
    path: string;
    /** An array of serialized procedure arguments. */
    input: JsonValue$1[];
    /** An array of optional serialized metadata. */
    meta?: JsonValue$1[];
}
/** A message to release a remote resource (e.g., a pinned object). */
interface ReleaseMessage extends JsonObject$1 {
    type: 'release';
    /** The unique identifier of the resource to be released. */
    resourceId: string;
}
/** A message from the stream receiver to acknowledge full consumption of a stream. */
interface StreamAckMessage extends JsonObject$1 {
    type: 'stream-ack';
    /** The ID of the stream channel being acknowledged. */
    channelId: ChannelId;
}
/** A message that encapsulates a payload for a specific virtual transport (tunnel). */
interface TunnelMessage extends JsonObject$1 {
    type: 'tunnel';
    /** The unique identifier for the tunnel. */
    tunnelId: string;
    /** The actual `ControlMessage` being forwarded through the tunnel. */
    payload: ControlMessage;
}
/** A union of all possible control messages used by erpc. */
type ControlMessage = RpcRequestMessage | RpcResponseMessage | NotifyMessage | ReleaseMessage | StreamAckMessage | TunnelMessage;
/** A handshake message to establish a tunneled stream. */
interface StreamTunnelMessage extends JsonObject$1 {
    type: 'stream-tunnel';
    /** The ID of the tunnel this stream belongs to. */
    tunnelId: string;
    /** A unique identifier for the stream itself within the tunnel context. */
    streamId: string;
    /** Specifies which end of the tunnel this stream is being routed to. */
    targetEndpoint: 'initiator' | 'receiver';
}
/** A message containing a chunk of data for a stream. */
interface StreamDataMessage extends JsonObject$1 {
    type: 'stream-data';
    /**
     * An optional ID sent with the first data chunk to link this stream
     * to a placeholder created during serialization.
     */
    handshakeId?: string;
    /** The actual chunk of stream data. */
    chunk: JsonValue$1;
}
/** A message indicating that the stream has been aborted due to an error. */
interface StreamAbortMessage extends JsonObject$1 {
    type: 'stream-abort';
    /** The reason for the stream's abortion, serialized as a `JsonValue`. */
    reason: JsonValue$1;
}
/** A message indicating that the stream has ended gracefully. */
interface StreamEndMessage extends JsonObject$1 {
    type: 'stream-end';
}
/** A union of all possible stream-related messages used by erpc. */
type StreamMessage = StreamTunnelMessage | StreamDataMessage | StreamAbortMessage | StreamEndMessage;
/**
 * A special JSON object used by the serialization layer to represent a
 * non-natively-serializable type (e.g., a `Date`, `Error`, or `Stream`).
 * This is a core mechanism for enabling rich data transfer.
 */
interface Placeholder extends JsonObject$1 {
    /** A unique string identifier for the type being represented (e.g., 'pin', 'stream_readable'). */
    _erpc_type: string;
}
/**
 * A type guard to check if a given value is an erpc `Placeholder`.
 *
 * @param value The value to check.
 * @returns `true` if the value is a valid `Placeholder`, `false` otherwise.
 */
declare function isPlaceholder(value: unknown): value is Placeholder;

/**
 * A proxy implementation of the `Transport` interface that represents a
 * virtual transport tunneled over a host erpc connection.
 *
 * It is created on the "client" side of a tunneled connection (i.e., the side
 * that deserializes a `Transport` object). All its operations are forwarded
 * to the host connection via a `TunnelManager`.
 * @internal
 */
declare class ProxyTransport implements Transport {
    readonly tunnelId: string;
    private readonly sendControlMessageToHost;
    private readonly openStreamChannelOnHost;
    private readonly emitter;
    private readonly controlChannel;
    constructor(tunnelId: string, sendControlMessageToHost: (payload: ControlMessage) => Promise<void>, openStreamChannelOnHost: () => Promise<OutgoingStreamChannel>);
    getControlChannel(): Promise<ControlChannel>;
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => void): void;
    onClose(handler: (reason?: Error) => void): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
    /** Called by `TunnelManager` when a message for this tunnel arrives. */
    _handleIncomingMessage(message: ControlMessage): void;
    /** Called by `TunnelManager` when a stream for this tunnel arrives. */
    _handleIncomingStream(channel: IncomingStreamChannel): void;
    /** Called by `TunnelManager` to shut down this proxy transport. */
    _handleClose(reason?: Error): void;
}

/**
 * Manages all tunneled transports, acting as a central router.
 *
 * It handles two main roles:
 * 1. **Bridging**: Connecting a real, local `Transport` instance to the host
 *    connection, allowing it to be used by the remote peer. This is initiated
 *    when a local `Transport` is serialized.
 * 2. **Proxying**: Creating a local `ProxyTransport` object that represents a
 *    remote `Transport`. This is initiated when a `Transport` placeholder is
 *    deserialized.
 *
 * @internal
 */
declare class TunnelManager {
    private readonly bridges;
    private readonly proxies;
    private readonly hostSend;
    private readonly hostOpenStream;
    constructor(capability: {
        sendRawMessage: (message: ControlMessage) => Promise<void>;
        openOutgoingStreamChannel: () => Promise<OutgoingStreamChannel>;
    });
    /**
     * "Bridges" a local transport, making it accessible to the remote peer.
     * @param localTransport The local `Transport` instance to bridge.
     * @returns The unique `tunnelId` for this new bridge.
     */
    bridgeLocalTransport(localTransport: Transport): string;
    /**
     * Creates or retrieves a proxy for a remote transport.
     * @param tunnelId The ID of the remote transport.
     * @returns A `ProxyTransport` instance.
     */
    getProxyForRemote(tunnelId: string): ProxyTransport;
    /**
     * Routes an incoming stream from the host to the correct bridge or proxy.
     * @param hostIncomingChannel The incoming stream channel from the host transport.
     * @param message The handshake message containing routing information.
     */
    routeIncomingStream(hostIncomingChannel: IncomingStreamChannel, message: StreamTunnelMessage): Promise<void>;
    /**
     * Routes an incoming control message from the host to the correct bridge or proxy.
     * @param tunnelId The ID of the target tunnel.
     * @param payload The control message to route.
     */
    routeIncomingMessage(tunnelId: string, payload: ControlMessage): void;
    /** Destroys all bridges and proxies, typically on host connection closure. */
    destroyAll(error: Error): void;
    private cleanupBridge;
    private forwardIncomingStreamFromBridge;
    /**
     * Pumps data and close events bidirectionally between two stream channels.
     * @param source The source channel.
     * @param destination The destination channel (or a promise for it).
     */
    private pumpStream;
}

/**
 * Represents a value that can be either synchronous (`T`) or asynchronous (`Promise<T>`).
 * This utility type is widely used for event handlers and other functions that may
 * or may not perform asynchronous operations.
 *
 * @template T The type of the value.
 */
type MaybePromise<T> = T | Promise<T>;
/**
 * Represents a primitive value that is directly serializable to JSON.
 *
 * @remarks
 * This type definition includes special considerations:
 * - `Uint8Array` is included to natively support binary payloads. It is expected
 *   that a higher-level serialization layer (e.g., one with custom transformers)
 *   will handle its conversion, often to a Base64 string.
 * - `bigint` is explicitly excluded as it lacks a standard JSON representation and
 *   requires deliberate conversion (e.g., to a string) before serialization.
 */
type JsonPrimitive = string | number | boolean | null | undefined | Uint8Array;
/**
 * Represents a JSON-serializable array, where each element is a valid `JsonValue`.
 */
type JsonArray = JsonValue[];
/**
 * Represents a JSON-serializable object, mapping string keys to valid `JsonValue` types.
 */
type JsonObject = {
    [key: string]: JsonValue;
};
/**
 * Represents any value that can be losslessly converted to a JSON string
 * and back again. This is the universal type for all data payloads exchanged
 * over the transport layer.
 */
type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Represents the full environment available within a procedure's handler
 * or a middleware function. It encapsulates all contextual information
 * for a single RPC call.
 *
 * @template C The type of the final, processed context object. This context
 * is the result of the initial context being passed through all applicable
 * middleware.
 */
interface Env<C> {
    /**
     * The context object for the current call. It starts as the initial
     * context and is then transformed by any middleware in the chain.
     */
    readonly ctx: C;
    /**
     * Optional metadata passed from the client alongside the procedure call.
     *
     * This is useful for passing call-specific, out-of-band information like
     * authentication tokens or tracing IDs, without including them as formal
     * procedure parameters. It is always an array of JSON-compatible values.
     */
    readonly meta?: JsonValue$1[];
    /**
     * Returns `true` if the server has initiated its shutdown process.
     *
     * Procedures can check this flag to avoid starting new long-running tasks
     * or to perform cleanup during a graceful shutdown.
     */
    readonly isClosing: () => boolean;
}

/** @internal */
declare const PIN_ID_KEY: unique symbol;
/** @internal */
declare const PIN_FREE_KEY: unique symbol;
/** @internal */
declare const PIN_REQUEST_KEY: unique symbol;
/** @internal */
declare const __pin_brand: unique symbol;
/** Transforms a function into an async version that returns a Promise. @internal */
type PromisifyFunction<F> = F extends (...args: infer TArgs) => infer TReturn ? (...args: TArgs) => Promise<Awaited<TReturn>> : F;
/**
 * Transforms a property into an overloaded function for remote access.
 * e.g., `name: string` becomes `name: { (): Promise<string>; (newValue: string): Promise<void> }`.
 * Calling `remote.name()` acts as a getter, `remote.name('new')` as a setter.
 * @internal
 */
type OverloadedProperty<TProp> = {
    (): Promise<Awaited<TProp>>;
    (newValue: TProp): Promise<void>;
};
/**
 * Recursively transforms an object type `T` into its remote proxy representation.
 * - Methods are promisified.
 * - Properties become overloaded async getter/setter functions.
 * @internal
 */
type PromisifyObject<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? PromisifyFunction<T[K]> : OverloadedProperty<T[K]>;
};
/**
 * Defines the special, non-enumerable properties attached to a remote pin proxy.
 * @internal
 */
type PinSpecialProperties<T extends object> = {
    /** The unique identifier for the pinned resource on the remote peer. @internal */
    readonly [PIN_ID_KEY]?: string;
    /** A function to manually release the remote resource. @internal */
    readonly [PIN_FREE_KEY]?: () => Promise<void>;
    /** A unique brand to identify the type and preserve the original type `T`. @internal */
    readonly [__pin_brand]: T;
};
/**
 * Constructs the final remote proxy type from a validated object type `T`.
 * @internal
 */
type _BuildPinProxy<T extends object> = T extends (...args: infer TArgs) => infer TReturn ? ((...args: TArgs) => Promise<Awaited<TReturn>>) & PinSpecialProperties<T> : PromisifyObject<T> & PinSpecialProperties<T>;
/**
 * Represents a remote proxy for a local object or function of type `T`.
 *
 * This is a fully type-safe representation that transforms the original type `T`
 * into an asynchronous interface:
 * - Methods are "promisified" to return `Promise<..._>`.
 * - Properties are converted into async getter/setter functions.
 *
 * If `T` is not a "pin-able" type (see `Pinable<T>`), this type resolves to a
 * descriptive error message, providing immediate feedback in the IDE.
 */
type Pin<T> = Pinable<T> extends T ? _BuildPinProxy<T & object> : Pinable<T>;
/** A marker for properties that are not transferable, used for validation. @internal */
interface _InvalidProperty {
    readonly __invalid_property_brand: unique symbol;
}
/** Recursively checks if a type is composed entirely of `Transferable` types. @internal */
type _IsTransferable<T> = T extends void ? true : T extends JsonValue$1 ? true : T extends Uint8Array ? true : T extends Transport ? true : T extends {
    [__pin_brand]: any;
} ? true : T extends ReadableStream<infer U> ? _IsTransferable<U> : T extends WritableStream<infer U> ? _IsTransferable<U> : T extends {
    [key: string]: infer V;
} ? _IsTransferable<V> : T extends (infer E)[] ? _IsTransferable<E> : false;
/** Checks if a function's arguments and return value are transferable. @internal */
type _IsPinableFunction<T> = T extends (...args: infer TArgs) => infer TReturn ? [
    _IsTransferable<Awaited<TReturn>>,
    _IsTransferable<TArgs>
] extends [true, true] ? true : false : false;
/** Recursively marks properties of an object that are not transferable. @internal */
type _MarkInvalidProperties<T> = _IsPinableFunction<T> extends true ? T : T extends Function ? _InvalidProperty : T extends object ? {
    [K in keyof T]: _IsTransferable<T[K]> extends true ? T[K] : _MarkInvalidProperties<T[K]>;
} : _InvalidProperty;
/** Checks if a type, after marking, contains any invalid properties. @internal */
type _HasInvalidProperties<T> = {
    [K in keyof T]: T[K] extends _InvalidProperty ? true : never;
}[keyof T] extends never ? false : true;
/** A utility to make optional properties explicitly `T | undefined`. @internal */
type OptionalToUndefined<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? T[K] | undefined : T[K];
};
/** A branded type to represent a pin constraint violation with an error message. @internal */
interface PinConstraintViolation<_ extends string> {
    readonly brand: unique symbol;
}
/**
 * A type constraint that validates if a type `T` can be safely "pinned".
 *
 * A type is "pin-able" if it's an object or function where all its properties,
 * method arguments, and return values are themselves `Transferable`. This check
 * is performed recursively. If the constraint is violated, this type resolves
 * to a `PinConstraintViolation` with a descriptive error message.
 */
type Pinable<T> = _HasInvalidProperties<_MarkInvalidProperties<OptionalToUndefined<T>>> extends true ? PinConstraintViolation<"Error: The provided type is not 'pin-able'. It may contain non-serializable values (like Date or RegExp) or functions with non-transferable arguments/return types."> : T;

/**
 * A type that holds no runtime value but carries a generic type parameter.
 * It's used to attach compile-time type information to runtime objects
 * without any performance overhead.
 * @template _ The "phantom" type this object carries.
 */
type PhantomData<_> = {};
/**
 * A utility type to extract the inner "phantom" type from a `PhantomData` object.
 * @template T The `PhantomData` object.
 */
type InferPhantomData<T> = T extends PhantomData<infer R> ? R : never;
/**
 * A union of all types that can be transferred between eRPC peers.
 *
 * This includes:
 * - JSON-compatible primitives and structures (`JsonValue`).
 * - WHATWG Streams for efficient data streaming.
 * - `Uint8Array` for binary data.
 * - Proxied objects/functions via `Pin<T>`.
 * - Nested `Transferable` objects and arrays.
 * - Proxied `Transport` objects for tunneling.
 * - `void` for procedures that don't return a value.
 */
type Transferable$1 = JsonValue$1 | ReadableStream<Transferable$1> | WritableStream<Transferable$1> | Uint8Array | Pin<any> | TransferableObject | TransferableArray | Transport | void;
/** An object where all property values are `Transferable`. */
type TransferableObject = {
    [key: string]: Transferable$1;
};
/** An array where all elements are `Transferable`. */
type TransferableArray = Transferable$1[];
/**
 * An abstract interface for a data validation schema.
 * erpc uses this to integrate with validation libraries like Zod, Yup, etc.
 * Any library that provides a `.parse()` method matching this signature is compatible.
 * @template T The type of the parsed data.
 */
interface Schema<T = any> {
    /**
     * Parses and validates the input data, throwing an error on failure.
     * @param data The unknown data to validate.
     * @returns The parsed data, typed as `T`.
     */
    parse(data: unknown): T;
}
/**
 * A utility type that infers a tuple of types from a tuple of `Schema`s.
 * @template TSchemas A `readonly` tuple of `Schema` objects.
 */
type InferSchemaTuple<TSchemas extends readonly Schema[]> = {
    [K in keyof TSchemas]: TSchemas[K] extends Schema<infer T> ? T : never;
} extends infer T ? T & unknown[] : never;
/**
 * A utility type representing a function that may return `void` or `Promise<void>`.
 */
type MaybePromiseVoid = Promise<void> | void;

/**
 * A unique symbol used to mark a type that should not be transformed by a
 * middleware, but rather passed through to the next link in the chain.
 * @internal
 */
declare const __passThrough: unique symbol;
/**
 * A sentinel type indicating that a value (like context or input) should be
 * passed through a middleware without modification.
 */
type PassThrough = {
    [__passThrough]: void;
};
/**
 * Defines the type transformation signature of a middleware.
 *
 * This definition describes how a middleware modifies the four key aspects of a
 * procedure call as it flows through the "onion":
 * - `Ctx`: The context object.
 * - `Entr` (Entry): The input arguments array.
 * - `Exit`: The final return value (output).
 */
type MiddlewareDef = {
    /** The context type the middleware expects to receive (`Ctx In`). */
    CtxIn?: unknown;
    /** The context type the middleware will pass to the next step (`Ctx Out`). */
    CtxOut?: unknown;
    /** The input arguments array the middleware expects from the previous step (`Entry In`). */
    EntrIn?: unknown[];
    /** The input arguments array the middleware will pass to the next step (`Entry Out`). */
    EntrOut?: unknown[];
    /** The output type (return value) the middleware expects from the next step (`Exit In`). */
    ExitIn?: unknown;
    /** The final output type the middleware will produce (`Exit Out`). */
    ExitOut?: unknown;
};
/** @internal Extracts the input context type from a middleware definition. */
type GetCtxIn<TDef extends MiddlewareDef> = TDef extends {
    CtxIn: any;
} ? TDef['CtxIn'] : PassThrough;
/** @internal Extracts the output context type from a middleware definition. */
type GetCtxOut<TDef extends MiddlewareDef> = TDef extends {
    CtxOut: any;
} ? TDef['CtxOut'] : GetCtxIn<TDef>;
/** @internal Extracts the input arguments type from a middleware definition. */
type GetEntrIn<TDef extends MiddlewareDef> = TDef extends {
    EntrIn: any[];
} ? TDef['EntrIn'] : PassThrough[];
/** @internal Extracts the output arguments type from a middleware definition. */
type GetEntrOut<TDef extends MiddlewareDef> = TDef extends {
    EntrOut: any[];
} ? TDef['EntrOut'] : GetEntrIn<TDef>;
/** @internal Extracts the expected return type from the next step. */
type GetExitIn<TDef extends MiddlewareDef> = TDef extends {
    ExitIn: any;
} ? TDef['ExitIn'] : PassThrough;
/** @internal Extracts the final return type of the middleware. */
type GetExitOut<TDef extends MiddlewareDef> = TDef extends {
    ExitOut: any;
} ? TDef['ExitOut'] : GetExitIn<TDef>;
/**
 * The core implementation function for a middleware.
 *
 * @param opts An object containing the current state of the call.
 * @param opts.ctx The current context object.
 * @param opts.input The current input arguments.
 * @param opts.meta Optional metadata from the client.
 * @param opts.path The full path of the procedure being called.
 * @param opts.type The type of the call ('ask' or 'tell').
 * @param opts.next A function to call the next middleware or handler in the chain.
 *   It can be awaited and may be called with a transformed context or input.
 * @returns The final result of the call, possibly transformed by this middleware.
 */
type MiddlewareHandler<TDef extends MiddlewareDef> = (opts: {
    ctx: GetCtxIn<TDef>;
    input: GetEntrIn<TDef>;
    meta: JsonValue$1[];
    path: string;
    type: 'ask' | 'tell';
    next: (opts?: {
        ctx?: GetCtxOut<TDef>;
        input?: GetEntrOut<TDef>;
        meta?: JsonValue$1[];
    }) => Promise<GetExitIn<TDef>>;
}) => Promise<GetExitOut<TDef>>;
/**
 * Represents a middleware, bundling its type definition and its handler function.
 */
type Middleware<TDef extends MiddlewareDef> = {
    /** A phantom type carrying the middleware's type definition. */
    def: PhantomData<TDef>;
    /** The actual middleware implementation. */
    handler: MiddlewareHandler<TDef>;
};
/**
 * A factory function for creating a new, type-safe middleware.
 * This is the standard way to define a middleware, as it provides strong
 * type inference for the handler's options and return value.
 *
 * @example
 * ```ts
 * const loggingMiddleware = middleware(async (opts) => {
 *   console.log(`Calling ${opts.path}`);
 *   const result = await opts.next(); // Call the next middleware/handler
 *   console.log(`Finished ${opts.path}`);
 *   return result;
 * });
 * ```
 */
declare function middleware<const TDef extends MiddlewareDef>(handler: MiddlewareHandler<TDef>): Middleware<TDef>;

/**
 * A unique symbol used to brand procedure objects.
 * This allows for reliable runtime type checking via `isProcedure`.
 * @internal
 */
declare const __procedure_brand: unique symbol;
/**
 * The base type for all erpc procedures.
 * It carries compile-time type information about its context, input, and output,
 * as well as runtime information like its type and associated middlewares.
 *
 * @template Ctx The context type required by the procedure's handler.
 * @template Input The tuple type of the procedure's input arguments.
 * @template Output The return type of the procedure.
 */
type Procedure<Ctx, Input extends Array<unknown>, Output> = {
    /** @internal */
    [__procedure_brand]: void;
    /** A phantom type carrying the procedure's expected context type. */
    context: PhantomData<Ctx>;
    /** A phantom type carrying the procedure's expected input arguments type. */
    input: PhantomData<Input>;
    /** A phantom type carrying the procedure's expected output type. */
    output: PhantomData<Output>;
    /** The type of the procedure, e.g., 'ask', 'tell', or 'dynamic'. */
    type: string;
    /** An array of middlewares to be executed before the handler. */
    middlewares: Middleware<any>[];
};
/**
 * A procedure for request-response (RPC) style communication.
 * It expects a handler that returns a value.
 */
type AskProcedure<Ctx, Input extends Array<unknown>, Output> = Procedure<Ctx, Input, Output> & {
    type: 'ask';
    /** @internal The internal handler function for this procedure. */
    _handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<Output>;
};
/**
 * A procedure for fire-and-forget (notification) style communication.
 * It does not return a value to the caller.
 */
type TellProcedure<Ctx, Input extends Array<unknown>> = Procedure<Ctx, Input, void> & {
    type: 'tell';
    /** @internal The internal handler function for this procedure. */
    _handler: (env: Env<Ctx>, ...args: Input) => MaybePromise<void>;
};
/**
 * A procedure that can handle calls to any sub-path.
 * Useful for implementing dynamic routing or forwarding.
 */
type DynamicProcedure<Ctx, TInput extends Array<unknown>, TOutput> = Procedure<Ctx, TInput, TOutput> & {
    type: 'dynamic';
    /** @internal The internal handler function for this procedure. */
    _handler: (env: Env<Ctx>, path: string[], args: TInput, type: 'ask' | 'tell') => Promise<TOutput>;
};

/**
 * Represents a composable API definition in erpc.
 *
 * An `Api` can be either a single endpoint (a `Procedure`) or a nested
 * collection of endpoints (a `Router`).
 *
 * @template TInput The expected type of the input arguments array for procedures within this API.
 * @template TOutput The expected return type for procedures within this API.
 */
type Api<TInput extends Array<unknown>, TOutput> = Router<TInput, TOutput> | Procedure<any, TInput, TOutput>;
/**
 * Represents a collection of named API endpoints, which can be other Routers
 * or Procedures.
 *
 * This allows for creating nested, organized API structures, for example:
 * `e.router({ posts: { create: e.procedure.ask(...) } })`.
 *
 * @template TInput The expected type of the input arguments array for procedures within this router.
 * @template TOutput The expected return type for procedures within this router.
 */
type Router<TInput extends Array<unknown>, TOutput> = {
    [key: string]: Api<TInput, TOutput>;
};

/** The client-side type for an 'ask' procedure. */
type StubAskProcedure<TProc extends AskProcedure<any, any, any>> = (...args: InferPhantomData<TProc['input']>) => Promise<Awaited<InferPhantomData<TProc['output']>>>;
/** The client-side type for a 'tell' procedure. */
type StubTellProcedure<TProc extends TellProcedure<any, any>> = (...args: InferPhantomData<TProc['input']>) => Promise<void>;
/** The client-side type for a 'dynamic' procedure. */
type StubDynamicProcedure = StubDynamic;
/** Maps a server-side procedure type to its corresponding client-side stub type. */
type StubProcedure<TProc> = TProc extends AskProcedure<any, any, any> ? {
    ask: StubAskProcedure<TProc>;
} : TProc extends TellProcedure<any, any> ? {
    tell: StubTellProcedure<TProc>;
} : TProc extends DynamicProcedure<any, any, any> ? StubDynamicProcedure : never;
/**
 * The client-side type for a dynamic router endpoint.
 * It allows arbitrary nesting and terminates with `ask`, `tell`, `invoke`, or `meta`.
 */
type StubDynamic = {
    [key: string]: StubDynamic;
} & {
    ask: (...args: any[]) => Promise<any>;
    tell: (...args: any[]) => Promise<void>;
    invoke: Invoker;
    meta: (...meta: JsonValue[]) => StubDynamic;
};
/**
 * The type for the `.invoke()` method, allowing dynamic procedure calls
 * on a client instance with a string path.
 */
type Invoker = <A extends 'ask' | 'tell', T = any>(path: string, action: A, ...args: any[]) => A extends 'ask' ? Promise<T> : Promise<void>;
/**
 * Recursively builds the client-side type definition (the "stub") from a
 * server-side `Api` definition.
 *
 * This powerful conditional type is the heart of eRPC's end-to-end type safety.
 * It inspects the structure of the API and generates a matching client interface.
 *
 * @template TApi The server-side API definition.
 */
type BuildStub<TApi> = 0 extends (1 & TApi) ? StubDynamic : TApi extends Procedure<any, any, any> ? StubProcedure<TApi> : TApi extends Api<any, any> ? {
    [K in string & keyof TApi as TApi[K] extends Api<any, any> ? K : never]: TApi[K] extends Procedure<any, any, any> ? StubProcedure<TApi[K]> : TApi[K] extends Router<any, any> ? BuildStub<TApi[K]> : never;
} & {
    /** Allows calling procedures dynamically using a string path. */
    invoke: Invoker;
    /** Attaches metadata to the next procedure call. */
    meta: (...meta: JsonValue[]) => BuildStub<TApi>;
} : never;

/**
 * The user-facing eRPC client type.
 * It takes a server-side `Api` definition and resolves to a strongly-typed
 * client-side interface via the `BuildStub` utility type.
 */
type Client<TApi extends Api<any, any>> = BuildStub<TApi>;
/**
 * A function that executes a remote procedure call.
 *
 * This type defines the contract for the transport-agnostic call executor,
 * using function overloading to provide distinct return types for 'ask' and 'tell'.
 * The client proxy relies on this function to send requests to the remote peer.
 */
type CallProcedure<TInput extends Array<unknown>, TOutput> = {
    (path: string, action: 'ask', args: TInput, meta?: JsonValue[]): Promise<TOutput>;
    (path: string, action: 'tell', args: TInput, meta?: JsonValue[]): Promise<void>;
};
/**
 * Builds the runtime proxy for the eRPC client.
 *
 * This function is decoupled from any specific transport. It accepts a `callProcedure`
 * function, which encapsulates the logic for sending an RPC call and receiving a response.
 *
 * @param callProcedure A function that executes the remote procedure.
 * @returns A fully-typed, runtime eRPC client proxy.
 * @internal
 */
declare function buildClient<TApi extends Api<any, any> = any>(callProcedure: CallProcedure<any, any>): Client<TApi>;

/**
 * Manages all locally pinned resources for an erpc node.
 *
 * This class acts as a central registry for objects and functions that are
 * passed by reference. It handles resource pinning, reference counting, and
 * release, decoupling this logic from the core erpc features.
 * Its own lifecycle is managed by a use counter (`acquire`/`release`).
 */
declare class ResourceManager {
    private readonly resources;
    /** A counter for how many features are currently using this manager instance. */
    private useCount;
    /**
     * Called by a feature to signal that it is using this resource manager.
     * Increments the use counter.
     */
    acquire(): void;
    /**
     * Called by a feature to signal that it has finished using this manager.
     * When the last user releases it, the manager is automatically destroyed.
     */
    release(): void;
    /**
     * Pins an object, making it available for remote invocation, and returns its unique ID.
     * If the object is already pinned, its reference count is incremented.
     * @param obj The object or function to pin.
     * @returns The unique resource ID for the pinned object.
     */
    pin<T extends object>(obj: T): string;
    /**
     * Retrieves a pinned resource by its ID.
     * @param id The unique resource ID.
     * @returns The pinned resource, or `undefined` if not found.
     */
    get(id: string): any | undefined;
    /**
     * Decrements the reference count of a specific pinned resource.
     * If the count drops to zero, the resource is removed from the manager.
     * This is typically called in response to a 'release' message from a remote peer.
     * @param id The ID of the resource to release.
     */
    releaseResource(id: string): void;
    /**
     * Destroys the manager, forcibly releasing all pinned resources.
     * This is called when the last feature using the manager calls `release()`.
     */
    private destroy;
}
/**
 * Marks a local object or function to be passed by reference in an RPC call.
 *
 * When an object wrapped with `pin()` is included in procedure arguments or
 * return values, the erpc serializer will not serialize its content. Instead,
* it will "pin" the object on the local peer and send a remote proxy to the
 * other peer. All interactions with this proxy will be forwarded back to the
 * original object.
 *
 * @param obj The local object or function to pin.
 * @returns A type-safe proxy representation of the object, `Pin<T>`.
 *
 * @example
 * ```ts
 * const localApi = {
 *   counter: 0,
 *   increment() { this.counter++; }
 * };
 *
 * // In a procedure:
 * return { remoteApi: pin(localApi) };
 *
 * // On the client:
 * const result = await client.getApi.ask();
 * await result.remoteApi.increment(); // This call executes on the server.
 * ```
 */
declare function pin<T extends object>(obj: T): Pin<T>;
/**
 * Manually releases a remote pinned object.
 *
 * This function notifies the peer holding the original object that it is no
 * longer needed, allowing it to be garbage collected. While erpc uses a
 * `FinalizationRegistry` for automatic cleanup, calling `free()` explicitly
 * is good practice for managing resource lifetimes, especially in long-lived
 * applications.
 *
 * @param pinnedProxy The remote proxy object received from an RPC call.
 */
declare function free(pinnedProxy: Pin<any>): Promise<void>;

/**
 * Provides context to a `TypeHandler` during serialization and deserialization.
 *
 * This context object allows a handler to perform recursive serialization/deserialization,
 * ensuring that the entire process is consistent (e.g., for circular reference detection).
 */
interface SerializerContext {
    /**
     * A function for recursive serialization.
     *
     * Handlers should use this method to serialize any nested properties that
     * they do not handle themselves.
     *
     * @param value The value to be recursively serialized.
     * @returns The serialized `JsonValue`.
     */
    serialize: (value: any) => JsonValue$1;
    /**
     * A function for recursive deserialization.
     *
     * Handlers can use this method to deserialize child properties within their payload.
     *
     * @param value The `JsonValue` to be recursively deserialized.
     * @returns The deserialized, original value.
     */
    deserialize: (value: JsonValue$1) => any;
}
/**
 * Defines the interface for a plugin that handles the serialization and
 * deserialization of a specific data type.
 *
 * @template TValue The local value type that this handler can process (e.g., `Error`, `ReadableStream`).
 * @template TPlaceholder The corresponding serialized placeholder type.
 */
interface TypeHandler<TValue extends object = object, TPlaceholder extends Placeholder = Placeholder> {
    /**
     * The type name(s) for the placeholder, used for quick lookups during deserialization.
     *
     * This must match the `_erpc_type` property of `TPlaceholder`. It can be a
     * single string or an array of strings if one handler supports multiple related types.
     */
    name: TPlaceholder['_erpc_type'] | Array<TPlaceholder['_erpc_type']>;
    /**
     * Checks if a given value should be handled by this handler.
     * @param value The value to check.
     * @returns `true` if this handler can process the value, otherwise `false`.
     */
    canHandle(value: unknown): value is TValue;
    /**
     * Serializes the local value into a JSON-safe placeholder object.
     * @param value The local value to serialize.
     * @param context The serializer context for recursive operations.
     * @returns A JSON-compatible placeholder object.
     */
    serialize(value: TValue, context: SerializerContext): TPlaceholder;
    /**
     * Deserializes the placeholder object back into its local value.
     * @param placeholder The placeholder object from the remote peer.
     * @param context The serializer context for recursive operations.
     * @returns The deserialized local value (e.g., a `Stream` or a remote proxy).
     */
    deserialize(placeholder: TPlaceholder, context: SerializerContext): TValue;
}

/**
 * Defines the context (dependencies) required to process a single stream channel.
 * This context is provided by the calling feature (e.g., `StreamFeature`).
 * @internal
 */
interface StreamProcessingContext {
    serializer: {
        serialize: (value: any) => JsonValue$1;
        deserialize: (value: JsonValue$1) => any;
        registerHandler: (handler: TypeHandler<any, any>) => void;
    };
    sendRawMessage: (msg: ControlMessage) => Promise<void>;
    routeTunneledStream: (channel: IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
}
/**
 * A shareable manager for handling non-tunneled data streams.
 *
 * It manages incoming stream buffers, handshakes, and data deserialization.
 * It is designed to be stateless regarding any specific connection; all
 * connection-specific dependencies are injected via the `context` parameter
 * in its methods. Its lifecycle is managed via a use counter.
 */
declare class StreamManager {
    private readonly buffers;
    private readonly pendingHandshakes;
    private useCount;
    /** Increments the manager's use counter. */
    acquire(): void;
    /** Decrements the use counter. When it reaches zero, all resources are destroyed. */
    release(error?: Error): void;
    /** Destroys all buffers and rejects all pending handshakes. */
    private destroy;
    /**
     * The entry point for handling a new incoming stream channel from the transport.
     * It inspects the first message to determine if the stream is standard or tunneled.
     * @param channel The new incoming stream channel.
     * @param context The dependencies required for processing.
     */
    routeIncomingStreamChannel(channel: IncomingStreamChannel, context: StreamProcessingContext): void;
    /**
     * Processes a new stream that is confirmed to be a standard (non-tunneled) stream.
     * @param channel The stream channel.
     * @param firstMessage The already-read first message from the channel.
     * @param context The processing dependencies.
     */
    private processNewStream;
    /**
     * Closes a specific incoming stream and cleans up its associated buffer.
     * @param channelId The ID of the channel to close.
     * @param error The optional reason for closure.
     */
    closeIncoming(channelId: ChannelId, error?: Error): void;
    private getOrCreateHandshake;
    /**
     * Handles a single incoming message for a specific stream channel.
     * @param channelId The ID of the channel.
     * @param message The stream message to process.
     * @param context The processing dependencies.
     */
    private handleIncomingMessage;
    /**
     * Creates a pull-based `ReadableStream` that waits for data from a remote source,
     * linked via a `handshakeId`.
     * @param handshakeId The unique ID to link this reader with an incoming stream.
     * @returns A WHATWG `ReadableStream`.
     */
    createPullReader(handshakeId: string): ReadableStream<JsonValue$1>;
}

/**
 * Defines the standard interface for a pluggable module in erpc.
 *
 * A Feature encapsulates a piece of functionality (e.g., streaming, pinning)
 * and manages its own lifecycle. The erpc runtime orchestrates features in
 * a three-phase process: contribute, initialize, and close.
 *
 * @template C The capabilities that this Feature **C**ontributes to the system.
 *   This is an object type that will be merged into the global capabilities object.
 * @template R The dependencies that this Feature **R**equires from other features.
 *   This is an object type that the global capabilities object must satisfy.
 */
interface Feature<C extends object = {}, R extends object = {}> {
    /**
     * **Phase 1: Contribute**
     * This method is called first for all features. It should return the
     * capabilities object that this feature provides to the system. The returned
     * object must not depend on any other features, as they have not been
     * initialized yet.
     */
    contribute(): C;
    /**
     * **Phase 2: Initialize**
     * This method is called after all features have contributed their capabilities.
     * It receives the fully assembled `capability` object, which contains the
     * contributions from all features, allowing this feature to access its
     * required dependencies in a type-safe manner.
     *
     * @param capability The complete capabilities object, satisfying this feature's requirements `R`.
     */
    init(capability: R): Promise<void> | void;
    /**
     * **Phase 3: Close**
     * This method is called when the erpc node is shutting down. It should be
     * used to clean up resources, such as event listeners or timers. Features
     * are closed in the reverse order of their initialization.
     *
     * @param contribution The specific capabilities object that this feature contributed.
     * @param error An optional error indicating the reason for the shutdown.
     */
    close(contribution: C, error?: Error): Promise<void> | void;
}
/** Extracts the contributed type `C` from a Feature type. @internal */
type Contributes<T> = T extends Feature<infer C, any> ? C : {};
/** Extracts the required type `R` from a Feature type. @internal */
type Requires<T> = T extends Feature<any, infer R> ? R : {};
/**
 * A standard utility to convert a union type (e.g., `A | B`) into an
 * intersection type (e.g., `A & B`). This is key to combining the capabilities
 * from multiple features into a single object type.
 * @internal
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
/**
 * Aggregates all contributed types `C` from a tuple of Features into a single
 * intersection type.
 *
 * It works by:
 * 1. Mapping over the feature tuple to get each feature's contribution type.
 * 2. Creating a union of all these contribution types.
 * 3. Converting this union into a single intersection type.
 *
 * @template T A `readonly` tuple of `Feature` types.
 */
type AllContributions<T extends readonly Feature<any, any>[]> = UnionToIntersection<{
    [K in keyof T]: Contributes<T[K]>;
}[number]>;
/**
 * Aggregates all required types `R` from a tuple of Features into a single
 * intersection type, using the same mechanism as `AllContributions`.
 *
 * @template T A `readonly` tuple of `Feature` types.
 */
type AllRequirements<T extends readonly Feature<any, any>[]> = UnionToIntersection<{
    [K in keyof T]: Requires<T[K]>;
}[number]>;

/**
 * The capabilities contributed by the `SerializationFeature`.
 * It provides a centralized, extensible serialization service.
 */
interface SerializationContribution {
    serializer: {
        /** Serializes a value into a `JsonValue`, handling special types via handlers. */
        serialize: (value: any) => JsonValue$1;
        /** Deserializes a `JsonValue` back into its original type. */
        deserialize: (value: JsonValue$1) => any;
        /** Registers a custom `TypeHandler` to support a new data type. */
        registerHandler: (handler: TypeHandler<any, any>) => void;
    };
}
/**
 * A feature that provides a powerful, extensible serialization system.
 *
 * This feature allows erpc to transfer rich data types that are not natively
 * supported by JSON, such as Streams, Dates, or custom classes. It works by
 * allowing other features to register `TypeHandler` plugins.
 *
 * It employs a two-phase initialization strategy to resolve circular dependencies:
 * 1. `contribute`: Provides a proxy interface. `registerHandler` collects handlers.
 * 2. `init`: Instantiates the real `Serializer` with all collected handlers.
 */
declare class SerializationFeature implements Feature<SerializationContribution> {
    private handlersToRegister;
    private serializerInstance;
    contribute(): SerializationContribution;
    /**
     * Initializes the feature by creating the `Serializer` instance.
     * At this point, all other features have had a chance to register their
     * `TypeHandler`s via the contributed `registerHandler` method.
     */
    init(_capability: unknown): void;
    close(_contribution: SerializationContribution, _error?: Error): void;
}

type ErrorHandlingRequires = SerializationContribution;
/**
 * A built-in feature that provides serialization support for Error objects.
 *
 * This feature ensures that standard `Error` instances and custom erpc errors
 * (like `IllegalParameterError`) can be correctly transmitted between peers,
 * preserving their name, message, and stack trace.
 */
declare class ErrorHandlingFeature implements Feature<{}, ErrorHandlingRequires> {
    contribute(): {};
    /**
     * Initializes the feature by registering its type handlers with the
     * serialization service.
     */
    init(capability: ErrorHandlingRequires): void;
    close(): void;
}

/**
 * Defines the raw events emitted by the `TransportAdapterFeature`.
 * These events are a direct, un-interpreted feed from the underlying transport layer.
 */
type RawTransportEvents = {
    /** Emitted when a raw message is received on the control channel. */
    message: (message: ControlMessage) => void;
    /** Emitted when the remote peer opens a new incoming stream channel. */
    incomingStreamChannel: (channel: IncomingStreamChannel) => void;
    /** Emitted exactly once when the transport connection is closed, for any reason. */
    close: (error?: Error) => void;
};
/**
 * The capabilities contributed by the `TransportAdapterFeature`.
 * It provides a standardized interface to the underlying transport layer.
 */
interface TransportAdapterContribution {
    /** An event emitter for raw transport-level events. */
    readonly rawEmitter: AsyncEventEmitter<RawTransportEvents>;
    /** Sends a raw control message over the transport. */
    sendRawMessage: (message: ControlMessage) => Promise<void>;
    /** Opens a new outgoing stream channel on the transport. */
    openOutgoingStreamChannel: () => Promise<OutgoingStreamChannel>;
}
/**
 * A feature that adapts a generic `Transport` implementation for use by the erpc runtime.
 *
 * This feature is the bridge between the abstract transport layer (e.g., WebSockets,
 * WebRTC) and the rest of the erpc system. It normalizes events and actions into a
 * consistent, high-level API for other features to consume.
 */
declare class TransportAdapterFeature implements Feature<TransportAdapterContribution, {}> {
    private readonly transport;
    private readonly rawEmitter;
    private controlChannel?;
    private closing;
    constructor(transport: Transport);
    contribute(): TransportAdapterContribution;
    init(_capability: any): Promise<void>;
    /**
     * Handles the transport closure event, ensuring it's processed only once.
     * This prevents race conditions if multiple close signals are received.
     * @param reason The optional error that caused the closure.
     */
    private handleClose;
    private sendRawMessage;
    private openOutgoingStreamChannel;
    close(_contribution: TransportAdapterContribution, error?: Error): void;
}

/**
 * Defines the high-level semantic events emitted by the `ProtocolHandlerFeature`.
 * These events represent specific application-level actions within the erpc protocol.
 */
type SemanticEvents = {
    /** Emitted for an 'ask' (request-response) RPC call. */
    ask: (message: RpcRequestMessage) => void;
    /** Emitted for a 'tell' (fire-and-forget) notification. */
    tell: (message: NotifyMessage) => void;
    /** Emitted for an RPC call targeting a pinned resource. */
    pinCall: (message: RpcRequestMessage) => void;
    /** Emitted when an RPC response is received. */
    response: (message: RpcResponseMessage) => void;
    /** Emitted when a request to release a pinned resource is received. */
    release: (message: ReleaseMessage) => void;
    /** Emitted when a stream is fully acknowledged by the consumer. */
    streamAck: (message: StreamAckMessage) => void;
    /** Emitted when a message for a tunneled transport is received. */
    tunnel: (message: TunnelMessage) => void;
};
/**
 * The capabilities contributed by the `ProtocolHandlerFeature`.
 */
interface ProtocolHandlerContribution {
    /** An event emitter for high-level, protocol-specific semantic events. */
    semanticEmitter: AsyncEventEmitter<SemanticEvents>;
}
type ProtocolHandlerRequires = TransportAdapterContribution;
/**
 * A feature that processes raw control messages from the transport layer and
 * dispatches them as strongly-typed, high-level semantic events.
 *
 * This feature acts as the primary protocol parser and dispatcher, allowing
 * other features to listen for specific actions (like 'ask' or 'response')
 * without needing to know the low-level message structure.
 */
declare class ProtocolHandlerFeature implements Feature<ProtocolHandlerContribution, ProtocolHandlerRequires> {
    private readonly semanticEmitter;
    contribute(): ProtocolHandlerContribution;
    init(capability: ProtocolHandlerRequires): void;
    /**
     * Parses a raw `JsonValue`, validates it as a `ControlMessage`, and emits
     * a corresponding semantic event based on its `type` and `kind`.
     * @param message The raw, un-parsed `JsonValue` from the transport.
     */
    private processMessage;
    close(contribution: ProtocolHandlerContribution): void;
}

/**
 * The capabilities contributed by the `CallManagerFeature`.
 */
interface CallManagerContribution {
    /** The fully typed, user-facing eRPC client proxy. */
    readonly procedure: Client<any>;
    /**
     * Sends an 'ask' request and tracks it for a response.
     * @internal Used by features like Pinning that need to make RPC calls.
     */
    trackAsk: (path: string, args: any[], meta?: JsonValue[], kind?: string) => Promise<any>;
    /**
     * Sends a 'tell' (fire-and-forget) notification.
     * @internal
     */
    sendTell: (path: string, args: any[], meta?: JsonValue[]) => Promise<void>;
}
type CallManagerRequires = ProtocolHandlerContribution & SerializationContribution & TransportAdapterContribution;
/**
 * A feature that manages outgoing RPC calls from the client side.
 *
 * It is responsible for:
 * - Building the user-facing client proxy.
 * - Serializing call arguments and constructing request messages.
 * - Sending requests over the transport.
 * - Tracking pending 'ask' calls and matching them with incoming responses.
 * - Handling connection closure by rejecting all pending calls.
 */
declare class CallManagerFeature implements Feature<CallManagerContribution, CallManagerRequires> {
    private pending;
    private isDestroyed;
    private capability;
    contribute(): CallManagerContribution;
    init(capability: CallManagerRequires): void;
    /**
     * The callback provided to `buildClient`, routing proxy calls to the appropriate sender method.
     */
    private callProcedure;
    trackAsk(path: string, args: any[], meta?: JsonValue[], kind?: string): Promise<any>;
    sendTell(path: string, args: any[], meta?: JsonValue[]): Promise<void>;
    /**
     * Handles an incoming `RpcResponseMessage`.
     */
    private handleResponse;
    /**
     * Cleans up all pending calls when the connection is terminated.
     */
    handleClose(error?: Error): void;
    close(_contribution: CallManagerContribution, error?: Error): void;
}

interface PinContribution {
    resourceManager: ResourceManager;
}
type PinRequires = ProtocolHandlerContribution & SerializationContribution & TransportAdapterContribution & CallManagerContribution;
/**
 * A feature that provides object pinning capabilities.
 *
 * This feature enables passing objects and functions by reference. On the server
 * side, it listens for incoming RPC calls targeting pinned resources, executes
 * the requested operations on the actual local objects, and returns the results.
 */
declare class PinFeature implements Feature<PinContribution, PinRequires> {
    private resourceManager;
    private capability;
    constructor(resourceManager: ResourceManager);
    contribute(): PinContribution;
    init(capability: PinRequires): void;
    /**
     * Handles an RPC call targeting a locally pinned resource.
     * @param message The incoming RPC request message.
     */
    private handlePinCall;
    close(contribution: PinContribution, _error?: Error): void;
}

/**
 * The capabilities contributed by the `TunnelFeature`.
 */
interface TunnelContribution {
    /** The central manager for all tunneled transports. */
    tunnelManager: TunnelManager;
    /**
     * An internal routing function used by `StreamFeature` to forward
     * tunneled streams to the `TunnelManager`.
     * @internal
     */
    routeIncomingStream: (channel: IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
}
type TunnelRequires = TransportAdapterContribution & SerializationContribution & ProtocolHandlerContribution;
/**
 * A feature that enables transport tunneling (multiplexing virtual transports
 * over a single real transport).
 *
 * This feature orchestrates the `TunnelManager` and integrates `Transport`
 * serialization into the erpc system, allowing a `Transport` object to be
- * passed as a procedure argument or return value.
 */
declare class TunnelFeature implements Feature<TunnelContribution, TunnelRequires> {
    private tunnelManager;
    contribute(): TunnelContribution;
    init(capability: TunnelRequires & TunnelContribution): void;
    close(_contribution: TunnelContribution, error?: Error): void;
}

interface StreamContribution {
    streamManager: StreamManager;
    createPushWriter: (handshakeId: string) => WritableStream<JsonValue$1>;
    openPullReader: (handshakeId: string) => ReadableStream<JsonValue$1>;
}
type StreamCapability = TransportAdapterContribution & SerializationContribution & ProtocolHandlerContribution & TunnelContribution;
/**
 * A feature that provides support for streaming data using WHATWG Streams.
 *
 * It coordinates the `StreamManager` for handling incoming data, integrates
 * with the `SerializationFeature` via a `StreamHandler`, and provides APIs
 * for creating push-based writers and pull-based readers. It also routes
 * streams to the `TunnelFeature` when necessary.
 */
declare class StreamFeature implements Feature<StreamContribution, StreamCapability> {
    private streamManager;
    private capability;
    private readonly ackManager;
    constructor(streamManager: StreamManager);
    contribute(): StreamContribution;
    init(capability: StreamCapability): void;
    /**
     * Creates a push-based `WritableStream`. Data written to this stream will be
     * sent to the remote peer over a dedicated stream channel.
     * @param handshakeId A unique ID to link this writer with a remote reader.
     * @returns A WHATWG `WritableStream`.
     */
    private createPushWriter;
    close(_contribution: StreamContribution, error?: Error): void;
}

/**
 * The capabilities contributed by the `LifecycleFeature`.
 */
interface LifecycleContribution {
    /**
     * Checks if the erpc node is in the process of shutting down.
     * Procedures can use this to reject new long-running tasks during graceful shutdown.
     * @returns `true` if the node is closing, otherwise `false`.
     */
    isClosing: () => boolean;
}
/**
 * A feature that manages the lifecycle state of the erpc node, specifically
 * its closing status.
 *
 * It provides a centralized `isClosing()` method that other parts of the system
 * can query to implement graceful shutdown behavior.
 */
declare class LifecycleFeature implements Feature<LifecycleContribution, TransportAdapterContribution> {
    private _isClosing;
    contribute(): LifecycleContribution;
    init(capability: TransportAdapterContribution): void;
    /**
     * When the erpc node's top-level `close()` method is called, this lifecycle
     * hook is triggered, marking the node as closing.
     */
    close(_contribution: LifecycleContribution, _error?: Error): void;
}

type CallExecutorRequires = ProtocolHandlerContribution & SerializationContribution & TransportAdapterContribution & CallManagerContribution & LifecycleContribution;
/**
 * A feature that executes incoming RPC calls on the server side.
 *
 * This feature is the ultimate consumer of 'ask' and 'tell' requests. It
 * deserializes incoming arguments, invokes the appropriate procedure handler
 * for the given API, and sends back a serialized response for 'ask' calls.
 *
 * @template TApi The server's API definition.
 */
declare class CallExecutorFeature<TApi extends Api<TransferableArray, Transferable$1>> implements Feature<{}, CallExecutorRequires> {
    private handlers;
    /**
     * @param api The user-defined API router. The handlers are pre-built here for efficient execution.
     */
    constructor(api: TApi);
    contribute(): {};
    init(capability: CallExecutorRequires): void;
    close(): void;
}

/**
 * The core instance returned by `initERPC.create()`.
 * It provides the main building blocks for defining an API.
 */
type ErpcInstance<Ctx, TInput extends Array<unknown>, TOutput> = {
    /**
     * The procedure builder for this erpc instance.
     * Use this to define individual RPC endpoints with middleware, validation, and handlers.
     */
    procedure: ProcedureBuilder<TInput, TOutput, Ctx, any[], any>;
    /**
     * The router factory. Use this to group procedures and other routers
     * into a nested API structure. It's an identity function that preserves types.
     */
    router: <TRouter extends Router<TInput, TOutput>>(route: TRouter) => TRouter;
};
/**
 * A type-safe, fluent builder for creating procedures.
 *
 * This builder uses generic parameters to track the state of the procedure's
 * types (`CurrentCtx`, `NextInput`, `ExpectedExit`) as middlewares and
 * validators are applied, providing excellent autocompletion and compile-time
 * error checking.
 */
type ProcedureBuilder<TInput extends Array<unknown>, TOutput, CurrentCtx, NextInput extends Array<unknown>, ExpectedExit> = {
    /**
     * Applies a middleware to the procedure.
     *
     * The complex conditional types in this method's signature are a key feature
     * of eRPC's developer experience. They perform compile-time checks to ensure
     * that the middleware being added is compatible with the current state of
     * the procedure chain (in terms of context, input, and output types).
     * If there's a mismatch, a descriptive error is shown in the IDE.
     */
    use<NextDef extends MiddlewareDef>(middleware: Middleware<NextDef> & ([
        CurrentCtx
    ] extends [GetCtxIn<NextDef>] ? unknown : GetCtxIn<NextDef> extends PassThrough ? unknown : {
        readonly __error: "Middleware context mismatch: The context from the preceding chain is incompatible with this middleware's expected input context.";
        readonly expected_context_type: GetCtxIn<NextDef>;
        readonly actual_context_type: CurrentCtx;
    }) & ([
        NextInput
    ] extends [GetEntrIn<NextDef>] ? unknown : GetEntrIn<NextDef> extends PassThrough[] ? unknown : {
        readonly __error: "Middleware input mismatch: The arguments from the preceding chain are incompatible with this middleware's expected input arguments.";
        readonly expected_input_type: GetEntrIn<NextDef>;
        readonly actual_input_type: NextInput;
    }) & ([
        GetExitOut<NextDef>
    ] extends [ExpectedExit] ? unknown : ExpectedExit extends PassThrough ? unknown : {
        readonly __error: "Middleware output mismatch: The final return value from this middleware is incompatible with what the preceding chain expects to receive.";
        readonly middleware_returns: GetExitOut<NextDef>;
        readonly chain_expects: ExpectedExit;
    })): ProcedureBuilder<TInput, TOutput, GetCtxOut<NextDef> extends PassThrough ? CurrentCtx : GetCtxOut<NextDef>, GetEntrOut<NextDef> extends PassThrough[] ? NextInput : GetEntrOut<NextDef>, GetExitIn<NextDef> extends PassThrough ? ExpectedExit : GetExitIn<NextDef>>;
    /**
     * Validates the input arguments of the procedure using an array of schemas.
     * This is syntactic sugar for applying a validation middleware.
     *
     * @param schemas An array of schemas (e.g., from Zod) to validate arguments.
     * The length of the array must match the number of expected arguments.
     */
    input<const TSchemas extends readonly Schema[]>(...schemas: TSchemas): ProcedureBuilder<TInput, TOutput, CurrentCtx, InferSchemaTuple<TSchemas>, // The parsed output becomes the new input for the next step.
    ExpectedExit>;
    /**
     * Validates the return value of the procedure.
     * This is syntactic sugar for applying a validation middleware.
     *
     * @param schema A schema (e.g., from Zod) to validate the return value.
     */
    output<const TSchema extends Schema>(schema: TSchema): ProcedureBuilder<TInput, TOutput, CurrentCtx, NextInput, TSchema extends Schema<infer T> ? T : never>;
    /**
     * Defines a request-response procedure ('ask').
     * The chain is terminated, and a final handler is provided.
     *
     * @param handler The final logic to execute. The type annotation ensures
     * the handler's input signature matches the output of the preceding middleware chain.
     */
    ask<Input extends TInput, Output extends (ExpectedExit extends PassThrough ? TOutput : ExpectedExit)>(handler: ((env: Env<CurrentCtx>, ...args: Input) => Output | Promise<Output>) & (Input extends NextInput ? unknown : {
        __error: "Handler's input type does not match the middleware chain's output type";
        expected: NextInput;
        got: Input;
    })): AskProcedure<CurrentCtx, NextInput extends PassThrough[] | unknown[] ? Input : NextInput, Output extends Transferable ? Output : void>;
    /**
     * Defines a fire-and-forget procedure ('tell').
     * The chain is terminated, and a final handler is provided.
     *
     * @param handler The final logic to execute. Its return value is ignored.
     */
    tell<Input extends TInput>(handler: ((env: Env<CurrentCtx>, ...args: Input) => (void extends ExpectedExit ? void : ExpectedExit) | Promise<void extends ExpectedExit ? void : ExpectedExit>) & (Input extends NextInput ? unknown : {
        __error: "Handler's input type does not match the middleware chain's output type";
        expected: NextInput;
        got: Input;
    })): TellProcedure<CurrentCtx, NextInput extends PassThrough[] | unknown[] ? Input : NextInput>;
    /**
     * Defines a dynamic procedure that can handle any sub-path.
     * The chain is terminated, and a final handler is provided.
     *
     * @param handler A handler that receives the remaining path segments and arguments.
     */
    dynamic(handler: ((env: Env<CurrentCtx>, path: string[], args: TInput, type: 'ask' | 'tell') => Promise<void | TOutput>)): DynamicProcedure<CurrentCtx, TInput, TOutput>;
};
/**
 * The main entry point for creating an eRPC API definition.
 *
 * @example
 * ```ts
 * const e = initERPC.create();
 *
 * const appRouter = e.router({
 *   greeting: e.procedure.ask(
 *     (env, name: string) => `Hello, ${name}!`
 *   ),
 * });
 * ```
 */
declare const initERPC: {
    /**
     * Creates a new erpc instance with a default `void` context.
     * This is the starting point for defining any eRPC API.
     *
     * @template TInput The default input type for procedures, defaults to `TransferableArray`.
     * @template TOutput The default output type for procedures, defaults to `Transferable`.
     */
    create<TInput extends Array<unknown> = TransferableArray, TOutput = Transferable>(): ErpcInstance<void, TInput, TOutput>;
};

/**
 * A discriminated union representing the result of a procedure execution.
 * @template TOutput The type of the data on success.
 */
type ProcedureExecutionResult<TOutput> = {
    success: true;
    data: TOutput;
} | {
    success: false;
    error: Error;
};
/**
 * A collection of pure functions for handling RPC requests for a given API definition.
 * These handlers are decoupled from the transport layer, focusing solely on
 * procedure lookup and execution.
 * @internal
 */
type ProcedureHandlers<TInput extends Array<unknown>, TOutput> = {
    /** A function to execute an 'ask' (request-response) call. */
    handleAsk: (env: Env<any>, path: string, input: TInput) => Promise<ProcedureExecutionResult<TOutput> | void>;
    /** A function to execute a 'tell' (fire-and-forget) call. */
    handleTell: (env: Env<any>, path: string, input: TInput) => Promise<void>;
};
/**
 * Creates a set of pure handlers for a given API definition.
 *
 * This function is a cornerstone of the server-side implementation. It traverses
 * the user-defined API router, indexes all procedures, and returns a simple
 * object with methods to execute those procedures. This decouples the core
 * execution logic from the transport and protocol layers.
 *
 * @param api The complete API definition (a router or a single procedure).
 * @returns An object with `handleAsk` and `handleTell` methods for executing procedures.
 */
declare function createProcedureHandlers<TInput extends Array<unknown>, TOutput, TApi extends Api<TInput, TOutput>>(api: TApi): ProcedureHandlers<TInput, TOutput>;

/**
 * The base class for all custom validation errors within eRPC.
 * This allows for specific error handling and serialization.
 */
declare class IllegalTypeError extends Error {
    constructor(message: string, cause?: unknown);
}
/**
 * An error thrown specifically when a procedure's input argument
 * validation fails.
 */
declare class IllegalParameterError extends IllegalTypeError {
    constructor(message: string, cause?: unknown);
}
/**
 * An error thrown specifically when a procedure's return value
 * validation fails.
 */
declare class IllegalResultError extends IllegalTypeError {
    constructor(message: string, cause?: unknown);
}
/**
 * A generic error representing a failure during a remote procedure call.
 * It is often used to wrap an error received from the remote peer,
 * preserving the original error's message and cause.
 */
declare class ProcedureError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}

/**
 * Constructs an erpc node by assembling a list of features, performing
 * compile-time dependency validation.
 *
 * This factory function is the heart of the erpc runtime. It orchestrates the
 * lifecycle of all provided features and produces a single `capability` object
 * that exposes all their functionalities, along with a `close` function for
 * graceful shutdown.
 *
 * @template TFeatures A `readonly` tuple of `Feature` instances. The `const`
 *   assertion is crucial for TypeScript to infer the exact feature types.
 * @param features An array of feature instances to assemble.
 * @returns A promise that resolves to an object containing the aggregated
 *   `capability` and a `close` function.
 *
 * @example
 * ```ts
 * const features = [new FeatureA(), new FeatureB()] as const;
 * const node = await buildFeatures(features);
 * // node.capability now has methods from both FeatureA and FeatureB.
 * await node.close();
 * ```
 *
 * **Compile-Time Dependency Check:**
 * The return type of this function includes a powerful conditional type:
 * `AllContributions<TFeatures> extends AllRequirements<TFeatures> ? ... : ...`
 * This check ensures that the union of all capabilities contributed by the
 * features satisfies the union of all their requirements. If a dependency is
* missing, this type resolves to an error object, causing a TypeScript
 * compilation error with a descriptive message.
 */
declare function buildFeatures<const TFeatures extends readonly Feature<any, any>[]>(features: TFeatures): Promise<AllContributions<TFeatures> extends AllRequirements<TFeatures> ? {
    capability: AllContributions<TFeatures>;
    close: (error?: Error) => Promise<void>;
} : {
    readonly __error: "A feature's requirement was not met by the provided contributions. Please check the feature list.";
}>;

/**
 * The core engine for erpc's serialization system.
 *
 * It iterates through a collection of `TypeHandler`s to transform complex
 * JavaScript objects into JSON-compatible values (`JsonValue`) and back.
 * It also handles cyclical references and standard JSON data types.
 * @internal
 */
declare class Serializer {
    private readonly handlers;
    private readonly handlerMap;
    private readonly context;
    constructor(handlers: TypeHandler<any, any>[]);
    /**
     * Serializes a value into a `JsonValue`.
     * @param value The value to serialize.
     * @returns The serialized `JsonValue`.
     */
    serialize(value: any): JsonValue;
    private _serialize;
    /**
     * Deserializes a `JsonValue` back to its original type.
     * @param value The `JsonValue` to deserialize.
     * @returns The deserialized value.
     */
    deserialize(value: JsonValue): any;
}

/** The placeholder structure for a serialized pinned object. */
interface PinPlaceholder extends Placeholder {
    _erpc_type: 'pin';
    resourceId: string;
}
/**
 * Creates the `TypeHandler` for the Pinning feature.
 * This factory function ensures the handler is created with access to the
 * necessary runtime capabilities.
 * @param resourceManager The local resource manager instance.
 * @param capability The required capabilities for communication.
 * @returns A `TypeHandler` instance for processing pinned objects.
 * @internal
 */
declare function createPinHandler(resourceManager: ResourceManager, capability: CallManagerContribution & TransportAdapterContribution): TypeHandler<object, PinPlaceholder>;

/** The placeholder for a serialized `ReadableStream`. */
interface ReadableStreamPlaceholder extends Placeholder {
    _erpc_type: 'stream_readable';
    handshakeId: string;
}
/** The placeholder for a serialized `WritableStream`. */
interface WritableStreamPlaceholder extends Placeholder {
    _erpc_type: 'stream_writable';
    handshakeId: string;
}
/**
 * Creates the `TypeHandler` for WHATWG Streams.
 *
 * This handler integrates stream transport with the serialization system.
 * It transforms local streams into placeholders for transmission and reconstructs
 * them on the receiving end as corresponding proxy streams.
 *
 * @param capability The capabilities provided by the `StreamFeature`.
 * @returns A `TypeHandler` instance for processing streams.
 * @internal
 */
declare function createStreamHandler(capability: StreamContribution): TypeHandler<ReadableStream | WritableStream, ReadableStreamPlaceholder | WritableStreamPlaceholder>;

/**
 * The placeholder structure for a serialized standard `Error` object.
 */
interface ErrorPlaceholder extends Placeholder {
    _erpc_type: 'error_placeholder';
    name: string;
    message: string;
    stack?: string;
}
/**
 * A `TypeHandler` for serializing and deserializing standard `Error` objects.
 * This ensures that basic error information (name, message, stack) can be
 * transmitted across the wire.
 *
 * @remarks The order of handler registration is important. This handler should
 * be registered before more specific error handlers if they also extend `Error`.
 */
declare const errorHandler: TypeHandler<Error, ErrorPlaceholder>;

/**
 * The placeholder structure for a serialized `IllegalTypeError` object.
 */
interface IllegalTypeErrorPlaceholder extends Placeholder {
    _erpc_type: 'illegal_type_error';
    name: string;
    message: string;
    stack?: string;
}
/**
 * A `TypeHandler` for serializing and deserializing `IllegalTypeError` and its subclasses.
 * This allows for transmitting erpc's specific validation errors.
 */
declare const illegalTypeErrorHandler: TypeHandler<IllegalTypeError, IllegalTypeErrorPlaceholder>;

/**
 * Creates a standard erpc node with both client and server capabilities.
 *
 * This is the most common factory for creating a peer that can both serve an API
 * and call remote procedures.
 *
 * @param transport The underlying transport instance for communication.
 * @param api The API definition this server will expose to the remote peer.
 * @returns A promise that resolves to the fully initialized erpc node,
 *   exposing all its capabilities and a `close` function.
 */
declare function createServer<TApi extends Api<TransferableArray, Transferable$1>>(transport: Transport, api: TApi): Promise<{
    close: (error?: Error) => Promise<void>;
    serializer: {
        serialize: (value: any) => _eleplug_transport.JsonValue;
        deserialize: (value: _eleplug_transport.JsonValue) => any;
        registerHandler: (handler: TypeHandler<any, any>) => void;
    };
    semanticEmitter: _eleplug_transport.AsyncEventEmitter<SemanticEvents>;
    rawEmitter: _eleplug_transport.AsyncEventEmitter<RawTransportEvents>;
    sendRawMessage: (message: ControlMessage) => Promise<void>;
    openOutgoingStreamChannel: () => Promise<_eleplug_transport.OutgoingStreamChannel>;
    procedure: Client<any>;
    trackAsk: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[], kind?: string) => Promise<any>;
    sendTell: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[]) => Promise<void>;
    resourceManager: ResourceManager;
    tunnelManager: TunnelManager;
    routeIncomingStream: (channel: _eleplug_transport.IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
    streamManager: StreamManager;
    createPushWriter: (handshakeId: string) => WritableStream<_eleplug_transport.JsonValue>;
    openPullReader: (handshakeId: string) => ReadableStream<_eleplug_transport.JsonValue>;
    isClosing: () => boolean;
}>;
/**
 * Creates a dedicated erpc client node.
 *
 * This factory is for creating a peer that only acts as a client and does not
 * expose its own API.
 *
 * @param transport The underlying transport instance for communication.
 * @returns A promise that resolves to the fully initialized client node,
 *   providing the `procedure` proxy for making calls.
 */
declare function createClient<TApi extends Api<TransferableArray, Transferable$1>>(transport: Transport): Promise<{
    procedure: Client<TApi>;
    close: (error?: Error) => Promise<void>;
    serializer: {
        serialize: (value: any) => _eleplug_transport.JsonValue;
        deserialize: (value: _eleplug_transport.JsonValue) => any;
        registerHandler: (handler: TypeHandler<any, any>) => void;
    };
    semanticEmitter: _eleplug_transport.AsyncEventEmitter<SemanticEvents>;
    rawEmitter: _eleplug_transport.AsyncEventEmitter<RawTransportEvents>;
    sendRawMessage: (message: ControlMessage) => Promise<void>;
    openOutgoingStreamChannel: () => Promise<_eleplug_transport.OutgoingStreamChannel>;
    trackAsk: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[], kind?: string) => Promise<any>;
    sendTell: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[]) => Promise<void>;
    resourceManager: ResourceManager;
    tunnelManager: TunnelManager;
    routeIncomingStream: (channel: _eleplug_transport.IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
    streamManager: StreamManager;
    createPushWriter: (handshakeId: string) => WritableStream<_eleplug_transport.JsonValue>;
    openPullReader: (handshakeId: string) => ReadableStream<_eleplug_transport.JsonValue>;
    isClosing: () => boolean;
}>;
/**
 * Creates an erpc peer for bidirectional communication.
 *
 * This is a convenient alias for `createServer`. It returns a node that exposes
 * `MyApi` and provides a typed client proxy for calling `TheirApi`.
 *
 * @param transport The underlying transport instance.
 * @param api The API that this peer will expose.
 * @returns A promise that resolves to the erpc node.
 */
declare function createPeer<MyApi extends Api<TransferableArray, Transferable$1>, TheirApi extends Api<any, any> = any>(transport: Transport, api: MyApi): Promise<{
    procedure: Client<TheirApi>;
    close: (error?: Error) => Promise<void>;
    serializer: {
        serialize: (value: any) => _eleplug_transport.JsonValue;
        deserialize: (value: _eleplug_transport.JsonValue) => any;
        registerHandler: (handler: TypeHandler<any, any>) => void;
    };
    semanticEmitter: _eleplug_transport.AsyncEventEmitter<SemanticEvents>;
    rawEmitter: _eleplug_transport.AsyncEventEmitter<RawTransportEvents>;
    sendRawMessage: (message: ControlMessage) => Promise<void>;
    openOutgoingStreamChannel: () => Promise<_eleplug_transport.OutgoingStreamChannel>;
    trackAsk: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[], kind?: string) => Promise<any>;
    sendTell: (path: string, args: any[], meta?: _eleplug_transport.JsonValue[]) => Promise<void>;
    resourceManager: ResourceManager;
    tunnelManager: TunnelManager;
    routeIncomingStream: (channel: _eleplug_transport.IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
    streamManager: StreamManager;
    createPushWriter: (handshakeId: string) => WritableStream<_eleplug_transport.JsonValue>;
    openPullReader: (handshakeId: string) => ReadableStream<_eleplug_transport.JsonValue>;
    isClosing: () => boolean;
}>;

export { type Api, type AskProcedure, CallExecutorFeature, type CallManagerContribution, CallManagerFeature, type CallProcedure, type Client, type ControlMessage, type DynamicProcedure, type Env, type ErpcInstance, ErrorHandlingFeature, type Feature, IllegalParameterError, IllegalResultError, IllegalTypeError, type InferPhantomData, type InferSchemaTuple, LifecycleFeature, type MaybePromiseVoid, type Middleware, type NotifyMessage, PIN_FREE_KEY, PIN_ID_KEY, PIN_REQUEST_KEY, type Pin, type PinConstraintViolation, type PinContribution, PinFeature, type Pinable, type Placeholder, type Procedure, type ProcedureBuilder, ProcedureError, type ProcedureExecutionResult, type ProcedureHandlers, type ProtocolHandlerContribution, ProtocolHandlerFeature, type RawTransportEvents, type ReleaseMessage, ResourceManager, type Router, type RpcRequestMessage, type RpcResponseMessage, type Schema, type SemanticEvents, type SerializationContribution, SerializationFeature, Serializer, type SerializerContext, type StreamAbortMessage, type StreamAckMessage, type StreamContribution, type StreamDataMessage, type StreamEndMessage, StreamFeature, StreamManager, type StreamMessage, type StreamTunnelMessage, type TellProcedure, type Transferable$1 as Transferable, type TransferableArray, type TransferableObject, type TransportAdapterContribution, TransportAdapterFeature, type TunnelContribution, TunnelFeature, type TunnelMessage, type TypeHandler, type _InvalidProperty, __pin_brand, buildClient, buildFeatures, createClient, createPeer, createPinHandler, createProcedureHandlers, createServer, createStreamHandler, errorHandler, free, illegalTypeErrorHandler, initERPC, isPlaceholder, middleware, pin };
