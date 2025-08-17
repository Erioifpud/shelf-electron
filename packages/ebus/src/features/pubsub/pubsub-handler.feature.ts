/**
 * @fileoverview
 * This feature is the core engine for all publish-subscribe (Pub/Sub)
 * communication within the EBUS system. It handles the one-to-many fan-out of
 * broadcast messages, manages the lifecycle of complex request-response sessions
 * (`ask`/`all`), and ensures message isolation between subscribers through deep cloning.
 */

import { v4 as uuid } from "uuid";
import { type Api, type Feature, type Transferable } from "@eleplug/erpc";
import { buildPublisher, type PublisherClient } from "../../api/publisher.js";
import type {
  BroadcastableArray,
  NodeId,
  PublisherOptions,
  Result,
  Topic,
} from "../../types/common.js";
import {
  type BroadcastMessage,
  type P2PMessage,
  type BroadcastAskPayload,
  type BroadcastTellPayload,
  type RpcAckResultPayload,
} from "../../types/protocol.js";
import type { BridgeConnectionContribution } from "../bridge/bridge-manager.feature.js";
import type { LocalNodeContribution } from "../local/local-node-manager.feature.js";
import type { RoutingContribution } from "../route/routing.feature.js";
import type { DispatchContribution } from "../dispatch/dispatch.feature.js";
import type { MessageSource } from "../../session/session.interface.js";
import { SessionManager } from "../../session/managers/session.manager.js";
import {
  AskSession,
  type AskSessionCapability,
} from "../../session/ask-session.js";
import { serializeError } from "../../types/errors.js";

/**
 * Transposes a 2D array (matrix). Useful for distributing cloned message
 * arguments to multiple targets.
 * @param matrix - The matrix to transpose.
 * @returns The transposed matrix.
 * @internal
 */
function transpose(matrix: any[][]): any[][] {
  if (matrix.length === 0 || matrix[0]?.length === 0) return [];
  const numCols = matrix[0].length;
  const transposed: any[][] = Array.from({ length: numCols }, () => []);
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < numCols; j++) {
      transposed[j][i] = matrix[i][j];
    }
  }
  return transposed;
}

/**
 * The capabilities contributed by the PubSubHandlerFeature to the EBUS core.
 */
export interface PubSubContribution {
  /**
   * Creates a type-safe client for publishing messages to a topic.
   * @param options - Configuration for the publisher, including topic and source node ID.
   * @returns A PublisherClient proxy.
   */
  createPublisher<TApi extends Api<BroadcastableArray, Transferable>>(
    options: PublisherOptions
  ): PublisherClient<TApi>;
  /**
   * Checks if a session with the given ID is currently being managed.
   * Used to delegate P2P responses that are part of a Pub/Sub `ask` session.
   * @internal
   */
  isManagingSession(sessionId: string): boolean;
  /**
   * Forwards a P2P message to the appropriate session manager.
   * @internal
   */
  delegateMessageToSession(message: P2PMessage, source: MessageSource): void;
}

type PubSubRequires = RoutingContribution &
  BridgeConnectionContribution &
  LocalNodeContribution &
  DispatchContribution;

/**
 * @class PubSubHandlerFeature
 * This feature orchestrates all one-to-many communication patterns. It uses the
 * Routing feature to identify all potential subscribers for a given topic and then
 * dispatches messages accordingly. For performance, it uses a pre-filtering
 * utility from the BridgeManager to avoid cloning messages for downstream buses
 * that would be blocked anyway. It is also responsible for managing long-lived
 * `ask`/`all` sessions that collect results from multiple subscribers.
 */
export class PubSubHandlerFeature
  implements Feature<PubSubContribution, PubSubRequires>
{
  private capability!: PubSubRequires;
  private sessionManager!: SessionManager;

  /**
   * @internal
   * Provides the necessary capabilities for an AskSession to send messages
   * back into the bus network and query node information.
   */
  private readonly sessionCapability: AskSessionCapability = {
    sendTo: (source, message) => {
      if (source.type === "parent") {
        this.capability.sendToParent(message);
      } else if (source.type === "child") {
        this.capability.sendToChild(source.busId, message);
      }
    },
    /**
     * Pass through the getNodeGroups capability so that AskSession can resolve
     * node groups when forwarding results.
     */
    getNodeGroups: (nodeId: NodeId) => this.capability.getNodeGroups(nodeId),
  };

  public init(capability: PubSubRequires): void {
    this.capability = capability;
    this.sessionManager = new SessionManager({ connection: capability });

    // Listen for incoming broadcast messages from other buses.
    capability.busEvents.on("message", ({ source, message }) => {
      if (message.kind === "broadcast") {
        this.dispatchBroadcast(message, source);
      }
    });
  }

  public contribute(): PubSubContribution {
    return {
      createPublisher: this.createPublisher.bind(this),
      isManagingSession: (sessionId: string) =>
        !!this.sessionManager.get(sessionId),
      delegateMessageToSession: (message, source) => {
        const sessionId =
          message.payload.type === "ack_result" ||
          message.payload.type === "ack_fin"
            ? message.payload.callId
            : undefined;
        if (sessionId) {
          this.sessionManager.get(sessionId)?.update(message, source);
        }
      },
    };
  }

  public close(): void {
    this.sessionManager.closeAll(new Error("EBUS instance is closing."));
  }

  public createPublisher<TApi extends Api<BroadcastableArray, Transferable>>(
    options: PublisherOptions
  ): PublisherClient<TApi> {
    return buildPublisher((topic, path, action, args, meta) => {
      const sourceGroups = Array.from(
        this.capability.getLocalNodeGroups(options.sourceNodeId) ?? [""]
      );

      const payload: BroadcastAskPayload | BroadcastTellPayload =
        action === "all"
          ? {
              type: "ask",
              callId: `${options.sourceNodeId}:${uuid()}`,
              path,
              args,
              meta,
            }
          : { type: "tell", path, args, meta };

      const message: BroadcastMessage = {
        kind: "broadcast",
        sourceId: options.sourceNodeId,
        sourceGroups: sourceGroups,
        topic,
        loopback: options.loopback,
        payload,
      };
      return this.initiateBroadcast(message);
    }, options.topic);
  }

  /**
   * Entry point for a broadcast initiated by a local publisher.
   * @param message - The broadcast message to be sent.
   * @returns An async iterable for 'ask' calls, or a promise for 'tell' calls.
   * @internal
   */
  private initiateBroadcast(
    message: BroadcastMessage
  ): AsyncIterable<Result<Transferable>> | Promise<void> {
    return this.dispatchBroadcast(message, { type: "local" });
  }

  /**
   * The main broadcast routing logic. It determines all local and remote targets,
   * performs pre-filtering for performance, and then initiates the dispatch.
   * @param message - The broadcast message.
   * @param source - The message source (local, parent, or a child bus).
   * @internal
   */
  private dispatchBroadcast(
    message: BroadcastMessage,
    source: MessageSource
  ): AsyncIterable<Result<Transferable>> | Promise<void> {
    const { topic, sourceId, loopback, sourceGroups } = message;

    // 1. Get all potential downstream paths from the routing table.
    const allDownstreams = this.capability.getBroadcastDownstream(
      topic,
      source
    );

    // 2. OPTIMIZATION: Pre-filter downstream children using the bridge's utility.
    // This avoids cloning/sending messages to child buses that would be blocked by group policies anyway.
    const childDownstreams = allDownstreams.filter(
      (ds) => ds.type === "child"
    ) as Extract<MessageSource, { type: "child" }>[];
    const parentDownstream = allDownstreams.find((ds) => ds.type === "parent");
    const allowedChildBusIds = this.capability.filterDownstreamChildren(
      childDownstreams.map((ds) => ds.busId),
      sourceGroups
    );
    const allowedRemoteDownstreams: Exclude<
      MessageSource,
      { type: "local" }
    >[] = childDownstreams.filter((ds) =>
      allowedChildBusIds.includes(ds.busId)
    );
    if (parentDownstream) {
      allowedRemoteDownstreams.push(
        parentDownstream as Exclude<MessageSource, { type: "local" }>
      );
    }

    // 3. Determine local targets, applying the loopback rule.
    const localSubscribers = this.capability.getLocalSubscribers(topic);
    const localTargetNodes =
      source.type === "local"
        ? (loopback ?? true)
          ? localSubscribers
          : localSubscribers.filter((nodeId) => nodeId !== sourceId)
        : allDownstreams.some((ds) => ds.type === "local")
          ? localSubscribers
          : [];

    // 4. If no targets exist after filtering, exit early.
    if (
      allowedRemoteDownstreams.length === 0 &&
      localTargetNodes.length === 0
    ) {
      return message.payload.type === "ask"
        ? (async function* () {})()
        : Promise.resolve();
    }

    // 5. For 'ask' calls, create and manage a session to collect results.
    if (message.payload.type === "ask") {
      const session = new AskSession(
        message.payload.callId,
        source,
        allowedRemoteDownstreams, // The session only needs to track the filtered remote targets.
        this.sessionCapability
      );
      this.sessionManager.register(session);
      session.handleLocalDeliveryFin(localTargetNodes.length);
      this.routeBroadcast(message, allowedRemoteDownstreams, localTargetNodes);
      return source.type === "local"
        ? session.getAsyncIterable()
        : Promise.resolve();
    } else {
      // For 'tell' calls, simply dispatch to the filtered targets.
      this.routeBroadcast(message, allowedRemoteDownstreams, localTargetNodes);
      return Promise.resolve();
    }
  }

  /**
   * Handles the physical dispatch of a broadcast message to a finalized list of targets.
   * This includes deep-cloning the message payload for each target to ensure isolation.
   * @param originalMessage - The message to be sent.
   * @param remoteDownstreams - The filtered list of remote bus destinations.
   * @param localTargetNodes - The filtered list of local node destinations.
   * @internal
   */
  private routeBroadcast(
    originalMessage: BroadcastMessage,
    remoteDownstreams: Exclude<MessageSource, { type: "local" }>[],
    localTargetNodes: NodeId[]
  ): void {
    const totalTargets = remoteDownstreams.length + localTargetNodes.length;
    if (totalTargets === 0) {
      if (originalMessage.payload.type === "ask") {
        const session = this.sessionManager.get(
          originalMessage.payload.callId
        ) as AskSession | undefined;
        session?.handleLocalDeliveryFin(0);
      }
      return;
    }

    const originalPayload = originalMessage.payload;

    // Use the Dispatch feature to create isolated copies for each target.
    const argsByTarget = transpose(
      originalPayload.args.map((arg) =>
        this.capability.dispatcher.dispatch(arg, totalTargets)
      )
    );
    const metaByTarget = originalPayload.meta
      ? transpose(
          originalPayload.meta.map((m) =>
            this.capability.dispatcher.dispatch(m, totalTargets)
          )
        )
      : [];

    let targetIndex = 0;

    // Dispatch to remote downstreams
    remoteDownstreams.forEach((ds) => {
      const messageForRemote: BroadcastMessage = {
        ...originalMessage,
        payload: {
          ...originalPayload,
          args: argsByTarget[targetIndex],
          meta: originalPayload.meta ? metaByTarget[targetIndex] : undefined,
        },
      };
      targetIndex++;
      if (ds.type === "parent") {
        this.capability.sendToParent(messageForRemote);
      } else if (ds.type === "child") {
        this.capability.sendToChild(ds.busId, messageForRemote);
      }
    });

    // Dispatch to local nodes
    localTargetNodes.forEach((nodeId) => {
      const clonedPayload = {
        ...originalPayload,
        args: argsByTarget[targetIndex],
        meta: originalPayload.meta ? metaByTarget[targetIndex] : undefined,
      };
      targetIndex++;

      if (clonedPayload.type === "ask") {
        this.executeLocalAsk(
          clonedPayload,
          originalMessage.topic,
          nodeId,
          originalMessage.sourceId,
          originalMessage.sourceGroups
        );
      } else {
        this.capability
          .executeBroadcastProcedure(
            nodeId,
            originalMessage.sourceId,
            originalMessage.sourceGroups,
            originalMessage.topic,
            clonedPayload
          )
          .catch((err) => {
            console.error(
              `[PubSub] Unhandled error in 'tell' to ${nodeId}:`,
              err
            );
          });
      }
    });
  }

  /**
   * Helper to execute an 'ask' call on a local subscriber and pipe the result
   * back into the correct session manager.
   * @internal
   */
  private async executeLocalAsk(
    payload: BroadcastAskPayload,
    topic: Topic,
    nodeId: NodeId,
    sourceId: NodeId,
    sourceGroups: string[]
  ): Promise<void> {
    const session = this.sessionManager.get(payload.callId) as
      | AskSession
      | undefined;
    if (!session) {
      console.warn(
        `[PubSub] No session for callId '${payload.callId}' during local ask. Result will be dropped.`
      );
      return;
    }

    const result = await this.capability.executeBroadcastProcedure(
      nodeId,
      sourceId,
      sourceGroups,
      topic,
      payload
    );

    // A `undefined` result means the node was not subscribed or blocked by group rules, so we ignore it.
    if (result && this.sessionManager.get(payload.callId)) {
      const responsePayload: RpcAckResultPayload = {
        type: "ack_result",
        callId: payload.callId,
        sourceId: nodeId,
        resultSeq: 0,
        result: result.success
          ? { success: true, data: result.data }
          : { success: false, error: serializeError(result.error) },
      };
      session.handleLocalResult(responsePayload);
    }
  }
}
