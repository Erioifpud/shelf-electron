// =================================================================
// SECTION 1: High-Level Factories
// These are the main entry points for creating erpc nodes.
// =================================================================

import type { Transport } from "@eleplug/transport";
import type { Api } from "./api/api";
import { buildFeatures } from "./runtime/factory";
import type { Client } from "./api/client";
import { ResourceManager } from "./features/pin/resource-manager";
import { StreamManager } from "./features/stream/stream-manager";
import { ErrorHandlingFeature } from "./features/error/error.feature";
import { PinFeature } from "./features/pin/pin.feature";
import { TunnelFeature } from "./features/tunnel/tunnel.feature";
import { StreamFeature } from "./features/stream/stream.feature";
import { SerializationFeature } from "./features/serialization/serialization.feature";
import { ProtocolHandlerFeature } from "./features/protocol/protocol.handler.feature";
import { CallManagerFeature } from "./features/call/call-manager.feature";
import { CallExecutorFeature } from "./features/call/call-executor.feature";
import { TransportAdapterFeature } from "./features/transport/transport.adapter.feature";
import { LifecycleFeature } from "./features/lifecycle/lifecycle.feature";
import type { Transferable, TransferableArray } from "./types/common.js";

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
export async function createServer<
  TApi extends Api<void, TransferableArray, Transferable>,
>(transport: Transport, api: TApi) {
  const resourceManager = new ResourceManager();
  const streamManager = new StreamManager();

  // The standard set of features for a full erpc node.
  const features = [
    new ErrorHandlingFeature(),
    new PinFeature(resourceManager),
    new TunnelFeature(),
    new StreamFeature(streamManager),
    new SerializationFeature(),
    new ProtocolHandlerFeature(),
    new CallManagerFeature(),
    new CallExecutorFeature<TApi>(api),
    new TransportAdapterFeature(transport),
    new LifecycleFeature(),
  ] as const;

  const node = await buildFeatures(features);
  return {
    ...node.capability,
    close: node.close,
  };
}

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
export async function createClient<
  TApi extends Api<void, TransferableArray, Transferable>,
>(transport: Transport) {
  const resourceManager = new ResourceManager();
  const streamManager = new StreamManager();

  // The standard set of features for a client-only node.
  const features = [
    new ErrorHandlingFeature(),
    new PinFeature(resourceManager),
    new TunnelFeature(),
    new StreamFeature(streamManager),
    new SerializationFeature(),
    new ProtocolHandlerFeature(),
    new CallManagerFeature(),
    new TransportAdapterFeature(transport),
    new LifecycleFeature(),
  ] as const;

  const node = await buildFeatures(features);
  return {
    ...node.capability,
    procedure: node.capability.procedure as Client<TApi>,
    close: node.close,
  };
}

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
export async function createPeer<
  MyApi extends Api<void, TransferableArray, Transferable>,
  TheirApi extends Api<void, any, any> = any,
>(transport: Transport, api: MyApi) {
  const server = await createServer<MyApi>(transport, api);
  return {
    ...server,
    procedure: server.procedure as Client<TheirApi>,
  };
}

// =================================================================
// SECTION 2: Core Building Blocks
// Tools for defining your erpc API.
// =================================================================

export { rpc } from "./api/init.js";
export { middleware } from "./api/middleware.js";
export { inject, type InjectorFn } from "./api/inject.js";
export { pin, free } from "./features/pin/resource-manager.js";
export { buildClient, type CallProcedure } from "./api/client.js"; // `CallProcedure` was also missing
export { createProcedureBuilder } from "./api/init.js";
export { createProcedureHandlers } from "./api/router.js";

// =================================================================
// SECTION 3: Core Types & Interfaces
// The most common types needed for development.
// =================================================================

// --- API Definition & Inference ---
export type { Api, Router } from "./api/api.js";
export type {
  Procedure,
  AskProcedure,
  TellProcedure,
  DynamicProcedure,
} from "./api/procedure.js";
export type { Client } from "./api/client.js";
export type { ProcedureBuilder } from "./api/init.js";
export type { Middleware } from "./api/middleware.js";
export type { Env } from "./api/env.js";
export type {
  ProcedureHandlers,
  ProcedureExecutionResult,
} from "./api/router.js";

// --- Data & Error Types ---
export type {
  Transferable,
  TransferableArray,
  TransferableObject,
  Schema,
  InferSchemaTuple,
  MaybePromiseVoid,
} from "./types/common.js";
export type { Pin, Pinable } from "./types/pin.js";
export {
  ProcedureError,
  IllegalTypeError,
  IllegalParameterError,
  IllegalResultError,
} from "./types/errors.js";
export type { InferPhantomData } from "./types/common.js"; // For advanced type manipulation

// =================================================================
// SECTION 4: Feature & Manager Classes (For Advanced Customization)
// For users who want to build a custom erpc node.
// =================================================================

export type { Feature } from "./runtime/framework/feature.js";
export { buildFeatures } from "./runtime/factory";

export {
  TransportAdapterFeature,
  SerializationFeature,
  ProtocolHandlerFeature,
  CallManagerFeature,
  CallExecutorFeature,
  ErrorHandlingFeature,
  PinFeature,
  StreamFeature,
  LifecycleFeature,
  TunnelFeature,
};

export { ResourceManager, StreamManager };
export { Serializer } from "./features/serialization/serializer.js";
export type {
  TypeHandler,
  SerializerContext,
} from "./features/serialization/type.handler.js";
export { createPinHandler } from "./features/pin/pin.handler.js";
export { createStreamHandler } from "./features/stream/stream.handler.js";
export { errorHandler } from "./features/error/error.handler.js";
export { illegalTypeErrorHandler } from "./features/error/illegal-type-error.handler.js";

// =================================================================
// SECTION 5: Protocol & Low-Level Types (For Advanced Use Cases)
// For deep integration or debugging.
// =================================================================

// --- Contribution & Event Types ---
import type { CallManagerContribution } from "./features/call/call-manager.feature";
import type { PinContribution } from "./features/pin/pin.feature";
import type {
  ProtocolHandlerContribution,
  SemanticEvents,
} from "./features/protocol/protocol.handler.feature";
import type { SerializationContribution } from "./features/serialization/serialization.feature";
import type { StreamContribution } from "./features/stream/stream.feature";
import type {
  TransportAdapterContribution,
  RawTransportEvents,
} from "./features/transport/transport.adapter.feature";
import type { TunnelContribution } from "./features/tunnel/tunnel.feature";

export type {
  CallManagerContribution,
  PinContribution,
  ProtocolHandlerContribution,
  SerializationContribution,
  StreamContribution,
  TransportAdapterContribution,
  TunnelContribution,
  SemanticEvents,
  RawTransportEvents,
};

// --- Protocol Message Types ---
export {
  isPlaceholder,
  type ControlMessage,
  type NotifyMessage,
  type Placeholder,
  type ReleaseMessage,
  type RpcRequestMessage,
  type RpcResponseMessage,
  type TunnelMessage,
  type StreamTunnelMessage,
  type StreamAbortMessage,
  type StreamDataMessage,
  type StreamEndMessage,
  type StreamMessage,
  type StreamAckMessage,
} from "./types/protocol.js";

// --- Transport Layer Types (re-exported) ---
export type { Transport };
export type {
  JsonValue,
  ChannelId,
  BaseChannel,
  StreamChannel,
  ControlChannel,
  OutgoingStreamChannel,
  IncomingStreamChannel,
} from "@eleplug/transport";

export * from "./types/pin.js";
