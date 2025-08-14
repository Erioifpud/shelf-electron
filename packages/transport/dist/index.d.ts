import { DefaultEventMap, EventEmitter } from 'tseep';
export { DefaultEventMap } from 'tseep';

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
 * A unique identifier for a stream channel.
 *
 * @remarks
 * The transport layer is responsible for generating and managing this ID, ensuring
 * its uniqueness within the scope of a single connection.
 */
type ChannelId = string;
/**
 * The base interface for all channel types, defining common properties and
 * lifecycle events.
 */
interface BaseChannel {
    /**
     * Indicates whether the channel has been closed. Once `true`, the channel is
     * permanently unusable.
     */
    readonly isClosed: boolean;
    /**
     * Registers a handler for the channel's closure, which is the single, final
     * event in a channel's lifecycle.
     *
     * @remarks
     * The handler is guaranteed to be called exactly once.
     *
     * @param handler The function to execute when the channel closes. It receives
     * an optional `Error` object if the closure was due to an error, or
     * `undefined` for a graceful closure.
     */
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    /**
     * Closes the channel gracefully. This action is idempotent.
     *
     * @remarks
     * This will eventually trigger the `onClose` handlers with an `undefined` reason.
     *
     * @returns A promise that resolves when the close operation has been initiated.
     * It does not wait for the channel to be fully closed.
     */
    close(): Promise<void>;
}
/**
 * A specialized channel for exchanging individual, non-streamed control messages.
 *
 * @remarks
 * Typically, a single, long-lived control channel exists per connection for
 * exchanging metadata, signals, and small RPC payloads.
 */
interface ControlChannel extends BaseChannel {
    /**
     * Sends a JSON-serializable message to the remote peer. The structure of the
     * message is opaque to the transport layer.
     *
     * @param message The message to send.
     * @returns A promise that resolves when the message is successfully buffered
     * for sending. It may reject if the channel is closed or encounters an error.
     */
    send(message: JsonValue): Promise<void>;
    /**
     * Registers a handler for incoming messages.
     *
     * @remarks
     * Implementations typically enforce a single-listener policy, where calling
     * this method replaces any previously registered handler.
     *
     * @param handler The function to execute when a message is received.
     */
    onMessage(handler: (message: JsonValue) => MaybePromise<void>): void;
    /**
     * Registers a one-time handler for the next incoming message. After the
     * handler is executed once, it is automatically removed.
     *
     * @remarks
     * This method is often provided for convenience.
     *
     * @param handler The function to execute when the next message is received.
     */
    onceMessage(handler: (message: JsonValue) => MaybePromise<void>): void;
}
/**
 * The base interface for channels that handle data streams, uniquely
 * identified by an `id`.
 */
interface StreamChannel extends BaseChannel {
    /** The unique identifier for this stream channel. */
    readonly id: ChannelId;
}
/**
 * A uni-directional channel for sending a stream of data to the remote peer.
 */
interface OutgoingStreamChannel extends StreamChannel {
    /**
     * Sends a JSON-serializable data chunk as part of the stream.
     *
     * @param data The stream data chunk to send.
     * @returns A promise that resolves when the data is successfully buffered
     * for sending. It may reject if the channel is closed or encounters an error.
     */
    send(data: JsonValue): Promise<void>;
}
/**
 * A uni-directional channel for receiving a stream of data from the remote peer.
 */
interface IncomingStreamChannel extends StreamChannel {
    /**
     * Registers a handler for incoming stream data chunks.
     *
     * @remarks
     * Implementations typically enforce a single-listener policy, where calling
     * this method replaces any previously registered handler.
     *
     * @param handler The function to execute when a data chunk is received.
     */
    onData(handler: (data: JsonValue) => MaybePromise<void>): void;
    /**
     * Registers a one-time handler for the next incoming stream data chunk. After
     * the handler is executed once, it is automatically removed.
     *
     * @param handler The function to execute when the next data chunk is received.
     */
    onceData(handler: (data: JsonValue) => MaybePromise<void>): void;
}

/**
 * Defines the abstract interface for a transport layer.
 *
 * A transport is responsible for the raw data exchange between two peers,
 * abstracting away the underlying communication mechanism (e.g., WebSockets,
 * WebRTC, MessagePort). It provides multiplexed channels for control and data
 * streams over a single physical connection.
 */
interface Transport {
    /**
     * Retrieves the single, long-lived channel for control messages.
     *
     * @remarks
     * A transport implementation MUST manage and return the same `ControlChannel`
     * instance for the lifetime of the connection.
     *
     * @returns A promise that resolves to the control channel. It may be rejected
     * if the transport is closed or the channel cannot be established.
     */
    getControlChannel(): Promise<ControlChannel>;
    /**
     * Opens a new uni-directional channel for sending stream data to the remote peer.
     * The transport is responsible for generating a unique channel ID.
     *
     * @returns A promise that resolves to the newly created outgoing stream channel.
     * It may be rejected if the transport is not in a state to create new channels.
     */
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    /**
     * Registers a handler that is called whenever the remote peer initiates a new
     * incoming stream channel.
     *
     * @param handler The function to execute with the newly opened channel.
     */
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => MaybePromise<void>): void;
    /**
     * Registers a handler for the transport connection's closure. This is the
     * single, final event in the transport's lifecycle.
     *
     * @param handler The function to execute upon connection closure. It receives
     * an optional `Error` object if the closure was abnormal. An `undefined` reason
     * signifies a graceful shutdown.
     */
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    /**
     * Closes the connection gracefully. This is an idempotent action.
     * This should eventually trigger the `onClose` handlers on both peers with an
     * `undefined` reason.
     *
     * @returns A promise that resolves when the close operation is initiated.
     */
    close(): Promise<void>;
    /**
     * Aborts the connection immediately due to an error. This is an idempotent action.
     * This should trigger the `onClose` handlers on both peers with the provided
     * `Error` object as the reason.
     *
     * @param reason An `Error` object explaining the reason for the abort.
     * @returns A promise that resolves when the abort operation is initiated.
     */
    abort(reason: Error): Promise<void>;
}

export { AsyncEventEmitter, type BaseChannel, type ChannelId, type ControlChannel, type IncomingStreamChannel, type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type MaybePromise, type OutgoingStreamChannel, type StreamChannel, type Transport };
