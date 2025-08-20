import { createProcedureBuilder, type ProcedureBuilder } from "@eleplug/erpc";
import type {
  BusContext,
  TopicContext,
  BroadcastableArray,
} from "../types/common";
import type { Transferable, TransferableArray } from "@eleplug/erpc";

/**
 * A pre-configured procedure builder for EBUS Point-to-Point (P2P) APIs.
 *
 * Procedures created with this builder will automatically have their `env.ctx`
 * typed as `BusContext`, providing access to P2P-specific information like
 * the source node's ID and groups.
 *
 * @example
 * ```ts
 * import { p2p } from '@eleplug/ebus';
 *
 * const myApi = {
 *   // env is automatically typed with `BusContext`
 *   greet: p2p.ask((env, name: string) => {
 *     console.log(`Received greeting from node: ${env.ctx.sourceNodeId}`);
 *     return `Hello, ${name}!`;
 *   })
 * };
 *
 * // The type of myApi is correctly inferred as Api<BusContext, ...>
 * ```
 */
export const p2p: ProcedureBuilder<
  BusContext,
  TransferableArray,
  Transferable,
  BusContext, // CurrentCtx starts as BusContext
  any[], // NextInput is any before validation
  any // ExpectedExit is any
> = createProcedureBuilder<BusContext, TransferableArray, Transferable>(); // Runtime-wise it's the same, the cast handles the type magic.

/**
 * A pre-configured procedure builder for EBUS Publish-Subscribe (Pub/Sub) APIs.
 *
 * Procedures created with this builder will automatically have their `env.ctx`
 * typed as `TopicContext`, providing access to topic-specific information.
 * Argument types are also constrained to be `Broadcastable`.
 *
 * @example
 * ```ts
 * import { pubsub } from '@eleplug/ebus';
 *
 * const myConsumerApi = {
 *   // env is automatically typed with `TopicContext`
 *   onOrderCreated: pubsub.tell((env, order: { id: string }) => {
 *     console.log(`Processing order ${order.id} from topic '${env.ctx.topic}'`);
 *   })
 * };
 *
 * // The type of myConsumerApi is correctly inferred as Api<TopicContext, ...>
 * ```
 */
export const pubsub: ProcedureBuilder<
  TopicContext,
  BroadcastableArray,
  Transferable,
  TopicContext, // CurrentCtx starts as TopicContext
  any[],
  any
> = createProcedureBuilder<TopicContext, BroadcastableArray, Transferable>(); // Also a typed alias at its core.
