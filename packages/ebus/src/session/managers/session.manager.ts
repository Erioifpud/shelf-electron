import type { BridgeConnectionContribution } from "../../features/bridge/bridge-manager.feature.js";
import type { ISession, MessageSource } from "../session.interface.js";

/**
 * A generic session manager.
 *
 * It is not concerned with the specific logic of any session type. Its sole
 * responsibilities are:
 * 1. Storing and retrieving active sessions by their ID.
 * 2. Listening for global events (like connection drops) and dispatching them
 *    to all relevant sessions.
 * 3. Injecting common cleanup logic when a session terminates.
 */
export class SessionManager {
  private readonly sessions = new Map<string, ISession>();

  constructor(capability: { connection: BridgeConnectionContribution }) {
    // Listen for connection drop events and notify all active sessions.
    capability.connection.busEvents.on("connectionDropped", ({ source }) => {
      for (const session of this.sessions.values()) {
        session.handleDownstreamDisconnect(source as MessageSource);
      }
    });
  }

  /**
   * Registers a new session and begins managing its lifecycle.
   * This method injects cleanup logic by wrapping the session's `terminate` method.
   * @param session The session instance to register.
   */
  public register(session: ISession): void {
    if (this.sessions.has(session.sessionId)) {
      // This can happen in rare race conditions; warn and proceed.
      console.warn(
        `[SessionManager] Session with ID ${session.sessionId} already exists. Overwriting.`
      );
    }
    this.sessions.set(session.sessionId, session);

    // By wrapping `terminate`, we ensure that any session, regardless of how it ends,
    // is always removed from the manager.
    const originalTerminate = session.terminate.bind(session);
    session.terminate = (error?: Error) => {
      if (this.sessions.has(session.sessionId)) {
        this.sessions.delete(session.sessionId);
        originalTerminate(error);
      }
    };
  }

  /**
   * Finds an active session by its ID.
   * @param sessionId The unique ID of the session.
   */
  public get(sessionId: string): ISession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Forcibly terminates all active sessions, typically on EBUS instance shutdown.
   * @param error The error indicating the reason for the shutdown.
   */
  public closeAll(error: Error): void {
    for (const session of this.sessions.values()) {
      session.terminate(error);
    }
    this.sessions.clear();
  }
}
