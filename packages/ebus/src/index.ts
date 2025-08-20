import {
  buildFeatures,
  type Api,
  type Transport,
  type Client,
  ResourceManager,
  StreamManager,
} from "@eleplug/erpc";

// --- EBUS Core Features ---
import { ApiFeature } from "./features/api/api.feature.js";
import { BridgeManagerFeature } from "./features/bridge/bridge-manager.feature.js";
import { LocalNodeManagerFeature } from "./features/local/local-node-manager.feature.js";
import { P2PHandlerFeature } from "./features/p2p/p2p-handler.feature.js";
import { PubSubHandlerFeature } from "./features/pubsub/pubsub-handler.feature.js";
import { RoutingFeature } from "./features/route/routing.feature.js";
import { DispatchFeature } from "./features/dispatch/dispatch.feature.js";
import { ProtocolCoordinatorFeature } from "./features/protocol/protocol-coordinator.feature.js";
import { StreamDispatchFeature } from "./features/stream/stream-dispatching.feature.js";
import { PinDispatchFeature } from "./features/pin/pin-dispatch.feature.js";

/**
 * Creates a new EBUS instance.
 * @param parentTransport An optional erpc `Transport` to connect this bus as a
 *                        child to a parent bus, forming a larger network.
 * @returns A promise that resolves to the fully initialized EBUS instance.
 */
async function createEbusInstance(parentTransport?: Transport) {
  // Shared managers for erpc resources across all peer stacks.
  const resourceManager = new ResourceManager();
  const streamManager = new StreamManager();

  const features = [
    // --- Level 1: Core Infrastructure & Connectivity ---
    // Manages all direct bus-to-bus connections and their erpc stacks.
    new BridgeManagerFeature(resourceManager, streamManager, parentTransport),
    // Decodes raw messages and manages reliable control message flows (e.g., handshakes).
    new ProtocolCoordinatorFeature(),
    // Manages all locally hosted nodes, their APIs, and procedure execution.
    new LocalNodeManagerFeature(),

    // --- Level 2: Utilities & Routing Logic ---
    // Provides the core message cloning/dispatching service.
    new DispatchFeature(),
    // Plugin: Adds Stream cloning capabilities to the Dispatcher.
    new StreamDispatchFeature(),
    // Plugin: Adds Pin cloning capabilities to the Dispatcher.
    new PinDispatchFeature(),
    // Manages P2P and Pub/Sub routing tables based on network state.
    new RoutingFeature(),

    // --- Level 3: Communication Pattern Handlers ---
    // Handles all Pub/Sub logic, including message broadcasting and ask/all sessions.
    new PubSubHandlerFeature(),
    // Handles all P2P logic, including client creation and message routing.
    new P2PHandlerFeature(),

    // --- Level 4: Public API Facade ---
    // Composes all underlying capabilities into the final user-facing API.
    new ApiFeature(),
  ] as const;

  const bus = await buildFeatures(features);

  return {
    ...bus.capability,
    close: bus.close,
  };
}

/**
 * Creates a new, standalone EBUS root instance.
 * A root bus is the top-level entity in a bus network.
 * @returns A promise that resolves to the fully initialized EBUS instance.
 */
export async function root() {
  return createEbusInstance();
}

/**
 * Creates a new EBUS instance and bridges it to a parent bus via the
 * provided transport. This instance will act as a child in the network.
 * @param parentTransport The erpc `Transport` to connect to the parent bus.
 * @returns A promise that resolves to the fully initialized EBUS instance.
 */
export async function bridge(parentTransport: Transport) {
  if (!parentTransport) {
    throw new Error("A transport must be provided to bridge to a parent bus.");
  }
  return createEbusInstance(parentTransport);
}

/** The type of a fully initialized EBUS instance. */
export type Bus = Awaited<ReturnType<typeof createEbusInstance>>;

// --- Public API & Type Exports ---
export { p2p, pubsub } from './api/init.js';
export { Node } from "./api/node.js";
export type { PublisherClient } from "./api/publisher.js";
export {
  EbusError,
  NodeNotFoundError,
  GroupPermissionError,
  ProcedureNotReadyError,
} from "./types/errors.js";
export type {
  NodeId,
  Topic,
  NodeOptions,
  PublisherOptions,
  SubscriptionHandle,
  Result,
  Ok,
  Err,
  BusContext,
  TopicContext,
} from "./types/common.js";
export { ok, err } from "./types/common.js";
// Re-export key types from erpc for convenience.
export type { Api, Client, Transport };
