import type { MaybePromise } from '@eleplug/transport';
import type { MultiplexedPacket } from './protocol.js';

/**
 * Describes an abstract, full-duplex communication link.
 *
 * This interface serves as the foundation for the `DuplexTransport`, allowing it
 * to operate over various underlying mechanisms (e.g., WebSockets, WebRTC, IPC)
 * so long as they conform to this contract. The link is responsible for sending
 * and receiving raw `MultiplexedPacket` objects.
 */
export interface Link {
  /**
   * Registers a handler that is invoked when a message is received from the
   * remote peer. The transport will provide one handler for the lifetime of the link.
   * @param handler The function to process the incoming message.
   */
  onMessage(handler: (message: MultiplexedPacket) => MaybePromise<void>): void;

  /**
   * Sends a message over the link.
   * @param message The multiplexed packet to send.
   * @returns A promise that resolves when the message has been successfully
   * queued for sending by the underlying mechanism.
   */
  sendMessage(message: MultiplexedPacket): Promise<void>;

  /**
   * Registers a handler for when the link is closed for any reason.
   * The transport will provide one handler for the lifetime of the link.
   * @param handler The function to handle the close event, which may receive
   * an `Error` object if the closure was abnormal.
   */
  onClose(handler: (reason?: Error) => MaybePromise<void>): void;

  /**
   * Aborts the link immediately. This should trigger the `onClose` handler
   * with the provided reason.
   * @param reason An `Error` object explaining the reason for the abort.
   * @returns A promise that resolves when the abort operation is initiated.
   */
  abort(reason: Error): Promise<void>;

  /**
   * Closes the link gracefully. This should eventually trigger the `onClose`
   * handler with an `undefined` reason.
   * @returns A promise that resolves when the close operation is initiated.
   */
  close(): Promise<void>;
}