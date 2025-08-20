import {
  buildFeatures,
  ErrorHandlingFeature,
  PinFeature,
  StreamFeature,
  SerializationFeature,
  ProtocolHandlerFeature,
  CallManagerFeature,
  CallExecutorFeature,
  TransportAdapterFeature,
  ResourceManager,
  StreamManager,
  type Transport,
  TunnelFeature,
  rpc,
} from "@eleplug/erpc";
import type { ProtocolMessage } from "../../types/protocol.js";

/**
 * Defines the callback interface between a peer stack and its host (the bus core).
 * This is the sole channel through which a peer stack reports events to the bus core.
 * @internal
 */
export interface BusBridge {
  /**
   * Called when the peer stack receives an EBUS message that needs routing.
   * @param message The deserialized protocol message from the adjacent bus.
   * @param fromBusPublicId The public ID of the bus that sent the message.
   */
  onMessageReceived(message: ProtocolMessage, fromBusPublicId: string): void;

  /**
   * Called when the peer stack's underlying connection is terminated.
   * @param reason An optional error that caused the connection to drop.
   */
  onConnectionClosed(reason?: Error): void;
}

/**
 * A factory that builds a new, state-isolated erpc node (a "peer stack")
 * for a given transport and bridge callback. Each peer stack represents one
 * direct connection to an adjacent bus.
 *
 * @param transport The underlying transport instance for this connection.
 * @param bridge The bridge object for reporting events back to the bus core.
 * @param resourceManager A shared manager for pinned objects.
 * @param streamManager A shared manager for data streams.
 * @returns A promise that resolves to the fully constructed peer stack instance.
 * @internal
 */
export async function createPeerStack(
  transport: Transport,
  bridge: BusBridge,
  resourceManager: ResourceManager,
  streamManager: StreamManager
) {
  // 1. Define the handler logic for the internal API.
  const internalApiImpl = {
    forwardMessage: rpc.tell(
      (_env, message: ProtocolMessage, fromBusPublicId: string) => {
        // When an adjacent bus calls this procedure, report the message
        // up to the bus core via the bridge.
        bridge.onMessageReceived(message, fromBusPublicId);
      }
    ),
  };

  // 2. Assemble the erpc features that constitute the peer stack.
  // This stack is self-contained and does not include a LifecycleFeature,
  // as its lifecycle is managed directly by the BridgeManagerFeature.
  const peerFeatures = [
    // Core Capabilities - using shared managers for resource efficiency
    new ErrorHandlingFeature(),
    new PinFeature(resourceManager),
    new TunnelFeature(),
    new StreamFeature(streamManager),
    new SerializationFeature(),

    // Protocol Handling - Client calls the other peer's forwardMessage,
    // Executor runs our own implementation.
    new ProtocolHandlerFeature(),
    new CallManagerFeature(),
    new CallExecutorFeature(internalApiImpl),

    // Transport Adaptation
    new TransportAdapterFeature(transport),
  ] as const;

  // 3. Build the isolated erpc node instance.
  const stack = await buildFeatures(peerFeatures);

  // 4. Listen for the transport adapter's close event, as this signals
  // the termination of the peer stack's connection.
  stack.capability.rawEmitter.on("close", (reason) => {
    bridge.onConnectionClosed(reason);
  });

  return stack;
}
