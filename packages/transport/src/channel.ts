import type { JsonValue, MaybePromise } from './types.js';

/**
 * A unique identifier for a stream channel.
 *
 * @remarks
 * The transport layer is responsible for generating and managing this ID, ensuring
 * its uniqueness within the scope of a single connection.
 */
export type ChannelId = string;

/**
 * The base interface for all channel types, defining common properties and
 * lifecycle events.
 */
export interface BaseChannel {
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
export interface ControlChannel extends BaseChannel {
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
export interface StreamChannel extends BaseChannel {
  /** The unique identifier for this stream channel. */
  readonly id: ChannelId;
}

/**
 * A uni-directional channel for sending a stream of data to the remote peer.
 */
export interface OutgoingStreamChannel extends StreamChannel {
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
export interface IncomingStreamChannel extends StreamChannel {
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