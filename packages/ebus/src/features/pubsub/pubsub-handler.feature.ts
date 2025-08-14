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
 * Transposes a 2D array (matrix).
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

// --- Feature Definition ---

/** The capabilities contributed by the `PubSubHandlerFeature`. */
export interface PubSubContribution {
  createPublisher<TApi extends Api<BroadcastableArray, Transferable>>(
    options: PublisherOptions
  ): PublisherClient<TApi>;
  /** Checks if a session with the given ID is currently being managed. */
  isManagingSession(sessionId: string): boolean;
  /** Forwards a P2P message to the appropriate session manager. */
  delegateMessageToSession(message: P2PMessage, source: MessageSource): void;
}

type PubSubRequires = RoutingContribution &
  BridgeConnectionContribution &
  LocalNodeContribution &
  DispatchContribution;

/**
 * A feature that handles all publish/subscribe (Pub/Sub) communication.
 *
 * Its responsibilities are:
 * - Creating publisher clients (`.emiter()`) for broadcasting messages.
 * - Routing broadcast messages to all interested subscribers (local and remote)
 *   based on routing information.
 * - Using the `DispatchFeature` to create deep copies of messages for each
 *   downstream branch, ensuring message isolation.
 * - Managing the lifecycle of broadcast `ask`/`all` calls via the `SessionManager`.
 */
export class PubSubHandlerFeature
  implements Feature<PubSubContribution, PubSubRequires>
{
  private capability!: PubSubRequires;
  private sessionManager!: SessionManager;

  private readonly sessionCapability: AskSessionCapability = {
    sendTo: (source, message) => {
      if (source.type === "parent") {
        this.capability.sendToParent(message);
      } else if (source.type === "child") {
        this.capability.sendToChild(source.busId, message);
      }
    },
  };

  public init(capability: PubSubRequires): void {
    this.capability = capability;
    this.sessionManager = new SessionManager({ connection: capability });

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
        topic,
        loopback: options.loopback,
        payload,
      };
      return this.initiateBroadcast(message);
    }, options.topic);
  }

  private initiateBroadcast(
    message: BroadcastMessage
  ): AsyncIterable<Result<Transferable>> | Promise<void> {
    // A broadcast initiated locally starts with the source type 'local'.
    return this.dispatchBroadcast(message, { type: "local" });
  }

  private dispatchBroadcast(
    message: BroadcastMessage,
    source: MessageSource
  ): AsyncIterable<Result<Transferable>> | Promise<void> {
    const { topic, sourceId, loopback } = message;

    // 1. Determine all downstream paths for this broadcast.
    const allDownstreams = this.capability.getBroadcastDownstream(
      topic,
      source
    );
    const remoteDownstreams = allDownstreams.filter(
      (ds) => ds.type !== "local"
    ) as Exclude<MessageSource, { type: "local" }>[];

    // 2. Determine local targets, applying the loopback rule if necessary.
    let localTargetNodes: string[];
    const localSubscribers = this.capability.getLocalSubscribers(topic);
    if (source.type === "local") {
      localTargetNodes =
        (loopback ?? true)
          ? localSubscribers
          : localSubscribers.filter((nodeId) => nodeId !== sourceId);
    } else {
      localTargetNodes = allDownstreams.some((ds) => ds.type === "local")
        ? localSubscribers
        : [];
    }

    // 3. If no targets, exit early.
    if (remoteDownstreams.length === 0 && localTargetNodes.length === 0) {
      return message.payload.type === "ask"
        ? (async function* () {})()
        : Promise.resolve();
    }

    // 4. For 'ask' calls, create and register a session to manage the lifecycle.
    if (message.payload.type === "ask") {
      const session = new AskSession(
        message.payload.callId,
        source,
        remoteDownstreams,
        this.sessionCapability
      );
      this.sessionManager.register(session);

      // Inform the session how many local results to expect.
      session.handleLocalDeliveryFin(localTargetNodes.length);

      this.routeBroadcast(message, remoteDownstreams, localTargetNodes);

      // If the call originated locally, return the async iterable for consuming results.
      return source.type === "local"
        ? session.getAsyncIterable()
        : Promise.resolve();
    } else {
      // For 'tell' calls, just route the message.
      this.routeBroadcast(message, remoteDownstreams, localTargetNodes);
      return Promise.resolve();
    }
  }

  private routeBroadcast(
    originalMessage: BroadcastMessage,
    remoteDownstreams: Exclude<MessageSource, { type: "local" }>[],
    localTargetNodes: NodeId[]
  ): void {
    const totalTargets = remoteDownstreams.length + localTargetNodes.length;
    if (totalTargets === 0) {
      // This can happen if the last target unsubscribes during processing.
      // Ensure the session is properly terminated.
      if (originalMessage.payload.type === "ask") {
        const session = this.sessionManager.get(
          originalMessage.payload.callId
        ) as AskSession | undefined;
        session?.handleLocalDeliveryFin(0); // Tell it to expect no local results
      }
      return;
    }

    const originalPayload = originalMessage.payload;

    // Create deep copies of arguments and metadata for each target to ensure isolation.
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

    // Route to remote downstreams.
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

    // Route to local nodes.
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
          originalMessage.sourceId
        );
      } else {
        this.capability
          .executeBroadcastProcedure(
            nodeId,
            originalMessage.sourceId,
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

  private async executeLocalAsk(
    payload: BroadcastAskPayload,
    topic: Topic,
    nodeId: NodeId,
    sourceId: NodeId
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
      topic,
      payload
    );

    // A result of `undefined` means the node was not subscribed; the session should ignore it.
    if (result && this.sessionManager.get(payload.callId)) {
      const responsePayload: RpcAckResultPayload = {
        type: "ack_result",
        callId: payload.callId,
        sourceId: nodeId,
        resultSeq: 0, // Sequencing is handled by the session manager if needed.
        result: result.success
          ? { success: true, data: result.data }
          : { success: false, error: serializeError(result.error) },
      };
      session.handleLocalResult(responsePayload);
    }
  }
}
