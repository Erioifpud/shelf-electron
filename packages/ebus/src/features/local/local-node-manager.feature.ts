import {
  createProcedureHandlers,
  type Api,
  type ProcedureExecutionResult,
  type ProcedureHandlers,
  type Feature,
  type Env,
  type Transferable,
  type TransferableArray,
  initERPC,
} from "@eleplug/erpc";
import {
  NodeNotFoundError,
  EbusError,
  ProcedureNotReadyError,
} from "../../types/errors.js";
import type {
  NodeOptions,
  NodeId,
  BusContext,
  Topic,
  ConsumerFactory,
  TopicContext,
  ApiFactory,
  BroadcastableArray,
} from "../../types/common.js";
import type {
  P2PAskPayload,
  P2PTellPayload,
  BroadcastAskPayload,
  BroadcastTellPayload,
} from "../../types/protocol.js";
import {
  p2pContextMiddleware,
  pubsubContextMiddleware,
} from "./context.middleware.js";

// --- Internal Data Structures ---

/**
 * Represents a node's API implementation and its pre-compiled handlers.
 * @internal
 */
type ApiProfile<TInput extends Array<unknown>, TOutput> = {
  api: Api<TInput, TOutput>;
  handlers: ProcedureHandlers<TInput, TOutput>;
};

/**
 * Represents the complete configuration and state of a locally managed node.
 * @internal
 */
type NodeProfile = {
  p2pApi: ApiProfile<TransferableArray, Transferable> | null;
  subscriptions: Map<Topic, ApiProfile<BroadcastableArray, Transferable>>;
};

// --- Feature Definition ---

/**
 * The capabilities contributed by the `LocalNodeManagerFeature`.
 */
export interface LocalNodeContribution {
  registerNode(options: NodeOptions<any>): Promise<void>;
  updateNodeApi(nodeId: NodeId, apiFactory: ApiFactory<any>): Promise<void>;
  addSubscription(
    nodeId: NodeId,
    topic: Topic,
    consumerFactory: ConsumerFactory<any>
  ): Promise<void>;
  removeSubscription(nodeId: NodeId, topic: Topic): void;
  hasNode(nodeId: NodeId): boolean;
  getLocalNodeIds(): NodeId[];
  getTopicsForNode(nodeId: NodeId): Topic[];
  removeNode(nodeId: NodeId): void;
  /**
   * Marks a local node as closing, immediately rejecting new incoming calls.
   * This corresponds to the "immediate interrupt" shutdown strategy.
   */
  markAsClosing(nodeId: NodeId): Promise<void>;
  executeP2PProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    payload: P2PAskPayload | P2PTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void>;
  executeBroadcastProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    topic: Topic,
    payload: BroadcastAskPayload | BroadcastTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void>;
}

/**
 * A feature that manages the registration, API lifecycle, and procedure execution
 * for all locally hosted EBUS nodes. It is the final destination for any
 * message routed to a local node.
 */
export class LocalNodeManagerFeature
  implements Feature<LocalNodeContribution, {}>
{
  private readonly localNodes = new Map<NodeId, NodeProfile>();
  /** A set of node IDs that are currently in the process of shutting down. */
  private readonly closingNodes = new Set<NodeId>();

  public contribute(): LocalNodeContribution {
    return {
      registerNode: this.registerNode.bind(this),
      updateNodeApi: this.updateNodeApi.bind(this),
      addSubscription: this.addSubscription.bind(this),
      hasNode: this.hasNode.bind(this),
      removeSubscription: this.removeSubscription.bind(this),
      executeP2PProcedure: this.executeP2PProcedure.bind(this),
      executeBroadcastProcedure: this.executeBroadcastProcedure.bind(this),
      getLocalNodeIds: () => Array.from(this.localNodes.keys()),
      getTopicsForNode: this.getTopicsForNode.bind(this),
      markAsClosing: this.markAsClosing.bind(this),
      removeNode: this.removeNode.bind(this),
    };
  }

  public init() {}
  public close(): void {
    this.localNodes.clear();
    this.closingNodes.clear();
  }

  public async registerNode(
    options: NodeOptions<Api<TransferableArray, Transferable>>
  ): Promise<void> {
    if (this.localNodes.has(options.id)) {
      throw new EbusError(
        `Node with ID '${options.id}' is already registered.`
      );
    }

    let apiProfile: ApiProfile<TransferableArray, Transferable> | null = null;
    if (options.apiFactory) {
      // Create an erpc instance pre-configured with the P2P context middleware.
      const t_p2p = initERPC.create<TransferableArray, Transferable>();
      const procedureBuilderWithMiddleware =
        t_p2p.procedure.use(p2pContextMiddleware);

      const api = await options.apiFactory({
        ...t_p2p,
        procedure: procedureBuilderWithMiddleware,
      });
      const handlers = createProcedureHandlers<
        TransferableArray,
        Transferable,
        typeof api
      >(api);
      apiProfile = { api, handlers };
    }

    this.localNodes.set(options.id, {
      p2pApi: apiProfile,
      subscriptions: new Map(),
    });
  }

  public async updateNodeApi(
    nodeId: NodeId,
    apiFactory: ApiFactory<any>
  ): Promise<void> {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);

    const t_p2p = initERPC.create<TransferableArray, Transferable>();
    const procedureBuilderWithMiddleware =
      t_p2p.procedure.use(p2pContextMiddleware);

    const api = await apiFactory({
      ...t_p2p,
      procedure: procedureBuilderWithMiddleware,
    } as any);
    const handlers = createProcedureHandlers<
      TransferableArray,
      Transferable,
      typeof api
    >(api);
    nodeProfile.p2pApi = { api, handlers };
  }

  public hasNode(nodeId: NodeId): boolean {
    return this.localNodes.has(nodeId);
  }

  public async addSubscription(
    nodeId: NodeId,
    topic: Topic,
    consumnerFactory: ConsumerFactory<any>
  ): Promise<void> {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);

    const t_pubsub = initERPC.create<BroadcastableArray, Transferable>();
    const procedureBuilderWithMiddleware = t_pubsub.procedure.use(
      pubsubContextMiddleware
    );

    const api = await consumnerFactory({
      ...t_pubsub,
      procedure: procedureBuilderWithMiddleware,
    } as any);
    const handlers = createProcedureHandlers<
      BroadcastableArray,
      Transferable,
      typeof api
    >(api);
    nodeProfile.subscriptions.set(topic, { api, handlers });
  }

  public removeSubscription(nodeId: NodeId, topic: Topic): void {
    this.localNodes.get(nodeId)?.subscriptions.delete(topic);
  }

  public executeP2PProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    payload: P2PAskPayload | P2PTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void> {
    // Immediately reject calls to nodes that are shutting down.
    if (this.closingNodes.has(destinationId)) {
      const error = new EbusError(
        `Node '${destinationId}' is shutting down and cannot accept new calls.`
      );
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      console.error(error.message); // Log for fire-and-forget calls.
      return Promise.resolve();
    }

    const nodeProfile = this.localNodes.get(destinationId);
    if (!nodeProfile?.p2pApi) {
      const error = nodeProfile
        ? new ProcedureNotReadyError(destinationId)
        : new NodeNotFoundError(destinationId);
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      return Promise.resolve();
    }

    // Prepend the EBUS context to the user's metadata array.
    const ctx: BusContext = {
      sourceNodeId: sourceId,
      localNodeId: destinationId,
    };
    const finalMeta = [ctx, ...(payload.meta || [])];
    const env: Env<void> = {
      ctx: undefined,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId),
    };

    const { handlers } = nodeProfile.p2pApi;
    if (payload.type === "tell") {
      handlers.handleTell(env, payload.path, payload.args).catch((err) => {
        console.error(
          `[LNM] Unhandled error in P2P 'tell' on node '${destinationId}':`,
          err
        );
      });
      return Promise.resolve();
    }

    return handlers.handleAsk(env, payload.path, payload.args);
  }

  public executeBroadcastProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    topic: Topic,
    payload: BroadcastAskPayload | BroadcastTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void> {
    if (this.closingNodes.has(destinationId)) {
      const error = new EbusError(
        `Node '${destinationId}' is shutting down (broadcast).`
      );
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      return Promise.resolve();
    }

    const nodeProfile = this.localNodes.get(destinationId);
    const subProfile = nodeProfile?.subscriptions.get(topic);
    if (!subProfile) {
      // This is not an error, as not all local nodes are expected to subscribe to all topics.
      // For 'ask' calls, we must return undefined, which the caller (PubSubHandler) will ignore.
      if (payload.type === "ask") return Promise.resolve(undefined);
      return Promise.resolve();
    }

    const ctx: TopicContext = {
      sourceNodeId: sourceId,
      localNodeId: destinationId,
      topic,
    };
    const finalMeta = [ctx, ...(payload.meta || [])];
    const env: Env<void> = {
      ctx: undefined,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId),
    };

    const { handlers } = subProfile;
    if (payload.type === "tell") {
      handlers.handleTell(env, payload.path, payload.args).catch((err) => {
        console.error(
          `[LNM] Unhandled error in broadcast 'tell' on topic '${topic}' for node '${destinationId}':`,
          err
        );
      });
      return Promise.resolve();
    }

    return handlers.handleAsk(env, payload.path, payload.args);
  }

  public getTopicsForNode(nodeId: NodeId): Topic[] {
    return this.localNodes.get(nodeId)
      ? Array.from(this.localNodes.get(nodeId)!.subscriptions.keys())
      : [];
  }

  public async markAsClosing(nodeId: NodeId): Promise<void> {
    this.closingNodes.add(nodeId);
  }

  public removeNode(nodeId: NodeId): void {
    this.localNodes.delete(nodeId);
    this.closingNodes.delete(nodeId);
  }
}
