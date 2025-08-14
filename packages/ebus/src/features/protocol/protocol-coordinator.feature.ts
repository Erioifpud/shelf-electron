import { v4 as uuid } from "uuid";
import { type Feature } from "@eleplug/erpc";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { BridgeConnectionContribution } from "../bridge/bridge-manager.feature.js";
import type {
  ProtocolMessage,
  SubscriptionUpdateMessage,
  NodeAnnouncementMessage,
  HandshakeMessage,
  P2PMessage,
  BroadcastMessage,
  StreamMessage,
  HandshakeResponseMessage,
} from "../../types/protocol.js";
import type { MessageSource } from "../../session/session.interface.js";
import { EbusError, serializeError } from "../../types/errors.js";

/**
 * An internal manager for tracking requests that require an acknowledgment (ACK).
 * It handles promise resolution/rejection and request timeouts.
 * @internal
 */
class PendingAckManager {
  private readonly pending = new Map<
    string,
    { resolve: (response: any) => void; reject: (reason: any) => void }
  >();

  public create(correlationId: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pending.has(correlationId)) {
          this.pending.delete(correlationId);
          reject(
            new EbusError(
              `Request timed out for correlationId: ${correlationId}`
            )
          );
        }
      }, timeout);

      this.pending.set(correlationId, {
        resolve: (response: any) => {
          clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (reason: any) => {
          clearTimeout(timeoutId);
          reject(reason);
        },
      });
    });
  }

  public resolve(correlationId: string, response: any & { errors?: any[] }) {
    const pending = this.pending.get(correlationId);
    if (pending) {
      this.pending.delete(correlationId);

      if (response.errors && response.errors.length > 0) {
        const firstError = response.errors[0];
        const cause = `Upstream operation failed for ${firstError.nodeId || firstError.topic || "unknown entity"}`;
        // Attach the deserialized error as a cause if available
        pending.reject(new EbusError(cause));
      } else {
        pending.resolve(response);
      }
    }
  }

  public closeAll(error: Error) {
    for (const p of this.pending.values()) {
      p.reject(error);
    }
    this.pending.clear();
  }
}

/**
 * High-level, semantic events emitted by the `ProtocolCoordinatorFeature` after
 * classifying raw protocol messages.
 */
export type SemanticBusEvents = {
  p2p: (message: P2PMessage, source: MessageSource) => void;
  broadcast: (message: BroadcastMessage, source: MessageSource) => void;
  stream: (message: StreamMessage, source: MessageSource) => void;
  subscriptionUpdate: (
    message: SubscriptionUpdateMessage,
    source: MessageSource
  ) => void;
  nodeAnnouncement: (
    message: NodeAnnouncementMessage,
    source: MessageSource
  ) => void;
};

/**
 * The capabilities contributed by the `ProtocolCoordinatorFeature`.
 */
export interface ProtocolCoordinatorContribution {
  /** An event emitter for high-level, protocol-specific semantic events. */
  readonly semanticEvents: AsyncEventEmitter<SemanticBusEvents>;
  /**
   * Sends a request to an adjacent bus and waits for a corresponding response
   * message (e.g., `...-response`).
   */
  sendRequestAndWaitForAck<
    TRequest extends ProtocolMessage & { correlationId: string },
    TResponse extends ProtocolMessage,
  >(
    destination: MessageSource,
    request: TRequest
  ): Promise<TResponse>;
  /**
   * Initiates and completes the handshake protocol with an adjacent bus.
   */
  initiateHandshake(source: MessageSource): Promise<void>;
}

type CoordinatorRequires = BridgeConnectionContribution;

/**
 * A feature that acts as the central protocol dispatcher and coordinator.
 *
 * Its responsibilities are:
 * 1.  Listening to raw `message` events from the `BridgeManagerFeature`.
 * 2.  Classifying each message by its `kind` and emitting a strongly-typed,
 *     semantic event (e.g., 'p2p', 'broadcast').
 * 3.  Managing the lifecycle of reliable, request-response control messages
 *     (like handshakes, subscriptions) using correlation IDs and ACKs.
 * 4.  Providing an abstraction (`sendRequestAndWaitForAck`) for other features
 *     to send such reliable control messages.
 */
export class ProtocolCoordinatorFeature
  implements Feature<ProtocolCoordinatorContribution, CoordinatorRequires>
{
  private capability!: CoordinatorRequires;
  private readonly semanticEvents = new AsyncEventEmitter<SemanticBusEvents>();
  private readonly pendingAcks = new PendingAckManager();

  public contribute(): ProtocolCoordinatorContribution {
    return {
      semanticEvents: this.semanticEvents,
      sendRequestAndWaitForAck: this.sendRequestAndWaitForAck.bind(this),
      initiateHandshake: this.initiateHandshake.bind(this),
    };
  }

  public init(capability: CoordinatorRequires): void {
    this.capability = capability;
    capability.busEvents.on("message", ({ source, message }) => {
      this.dispatchMessage(source, message);
    });
  }

  private dispatchMessage(
    source: MessageSource,
    message: ProtocolMessage
  ): void {
    switch (message.kind) {
      // Data plane messages are emitted as semantic events for other features.
      case "p2p":
        this.semanticEvents.emit("p2p", message, source);
        break;
      case "broadcast":
        this.semanticEvents.emit("broadcast", message, source);
        break;
      case "stream":
        this.semanticEvents.emit("stream", message, source);
        break;

      // Control plane messages are handled here or emitted.
      case "sub-update":
        this.semanticEvents.emit("subscriptionUpdate", message, source);
        break;
      case "node-announcement":
        this.semanticEvents.emit("nodeAnnouncement", message, source);
        break;

      // Handshake is a special control message handled directly.
      case "handshake":
        this.handleHandshakeRequest(message, source);
        break;

      // Response messages resolve pending ACK promises.
      case "sub-update-response":
      case "node-announcement-response":
      case "handshake-response":
        this.pendingAcks.resolve(message.correlationId, message);
        break;
    }
  }

  private async handleHandshakeRequest(
    message: HandshakeMessage,
    source: MessageSource
  ): Promise<void> {
    const response: HandshakeResponseMessage = {
      kind: "handshake-response",
      correlationId: message.correlationId,
    };

    if (source.type === "parent") {
      await this.capability.sendToParent(response).catch((err) => {
        console.error(
          `[PCF] Failed to send handshake response to parent:`,
          err
        );
      });
    } else if (source.type === "child") {
      await this.capability.sendToChild(source.busId, response).catch((err) => {
        console.error(
          `[PCF] Failed to send handshake response to child ${source.busId}:`,
          err
        );
      });
    }
  }

  public async initiateHandshake(source: MessageSource): Promise<void> {
    // Cannot handshake with self. This is a logical safeguard.
    if (source.type === "local") return;

    const handshakeMessage: HandshakeMessage = {
      kind: "handshake",
      correlationId: uuid(),
    };
    await this.sendRequestAndWaitForAck(source, handshakeMessage);
  }

  public async sendRequestAndWaitForAck<
    TRequest extends ProtocolMessage & { correlationId: string },
    TResponse extends ProtocolMessage,
  >(destination: MessageSource, request: TRequest): Promise<TResponse> {
    if (destination.type === "local") {
      throw new EbusError("Cannot send ACK request to 'local' source.");
    }

    const promise = this.pendingAcks.create(request.correlationId);

    const sendAction =
      destination.type === "parent"
        ? this.capability.sendToParent(request)
        : this.capability.sendToChild(destination.busId, request);

    // If the initial send fails, immediately reject the pending promise.
    sendAction.catch((err) => {
      this.pendingAcks.resolve(request.correlationId, {
        // Construct a synthetic response-like object with the error.
        kind: `${request.kind}-response`,
        correlationId: request.correlationId,
        errors: [{ error: serializeError(err) }],
      });
    });

    return promise;
  }

  public close(): void {
    this.semanticEvents.removeAllListeners();
    this.pendingAcks.closeAll(
      new EbusError("Protocol Coordinator is closing.")
    );
  }
}
