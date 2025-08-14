import type { ProtocolMessage } from "../types/protocol.js";
import type { BusId } from "../types/common.js";

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
export type MessageSource =
  | { type: "parent" }
  | { type: "child"; busId: BusId }
  | { type: "local" };

/**
 * Defines the standard interface for all stateful, long-running communication
 * sessions, such as broadcast `ask` calls or streaming.
 *
 * This interface allows the `SessionManager` to handle different types of
 * sessions polymorphically, managing their lifecycle without needing to know
 * their internal logic.
 */
export interface ISession {
  /** The unique identifier for this session (e.g., an `ask` call's `callId`). */
  readonly sessionId: string;

  /**
   * Processes an incoming protocol message relevant to this session,
   * updating the session's internal state.
   *
   * @param message The protocol message from the network.
   * @param source The direct source of the message.
   */
  update(message: ProtocolMessage, source: MessageSource): void;

  /**
   * Forcibly terminates the session.
   *
   * This is called by the `SessionManager` or internal logic on completion,
   * timeout, or unrecoverable error.
   *
   * @param error If provided, indicates the session should end in a failed state.
   */
  terminate(error?: Error): void;

  /**
   * Notifies the session that a downstream connection has been lost.
   *
   * The session should update its state accordingly, potentially marking
   * a branch as complete or aborting the entire session if the connection
   * was critical.
   *
   * @param source The downstream connection that was dropped.
   */
  handleDownstreamDisconnect(source: MessageSource): void;
}
