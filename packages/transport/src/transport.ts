import type {
  ControlChannel,
  IncomingStreamChannel,
  OutgoingStreamChannel,
} from './channel.js';
import type { MaybePromise } from './types.js';

/**
 * Defines the abstract interface for a transport layer.
 *
 * A transport is responsible for the raw data exchange between two peers,
 * abstracting away the underlying communication mechanism (e.g., WebSockets,
 * WebRTC, MessagePort). It provides multiplexed channels for control and data
 * streams over a single physical connection.
 */
export interface Transport {
  // #region Channel Management

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
  onIncomingStreamChannel(
    handler: (channel: IncomingStreamChannel) => MaybePromise<void>,
  ): void;

  // #endregion

  // #region Lifecycle Events

  /**
   * Registers a handler for the transport connection's closure. This is the
   * single, final event in the transport's lifecycle.
   *
   * @param handler The function to execute upon connection closure. It receives
   * an optional `Error` object if the closure was abnormal. An `undefined` reason
   * signifies a graceful shutdown.
   */
  onClose(handler: (reason?: Error) => MaybePromise<void>): void;

  // #endregion

  // #region Lifecycle Actions

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

  // #endregion
}