import {
  createProcedureHandlers,
  type Api,
  type ProcedureExecutionResult,
  type ProcedureHandlers,
  type Feature,
  type Env,
  type Transferable,
  type TransferableArray,
  inject,
  type InjectorFn,
} from "@eleplug/erpc";
import {
  NodeNotFoundError,
  EbusError,
  ProcedureNotReadyError,
  GroupPermissionError,
} from "../../types/errors.js";
import type {
  NodeOptions,
  NodeId,
  BusContext,
  Topic,
  TopicContext,
  BroadcastableArray,
} from "../../types/common.js";
import type {
  P2PAskPayload,
  P2PTellPayload,
  BroadcastAskPayload,
  BroadcastTellPayload,
} from "../../types/protocol.js";

// --- Internal Data Structures ---

/**
 * A type alias for the pre-compiled, executable procedure handlers.
 * @internal
 */
type ApiHandlers<TInput extends Array<unknown>, TOutput> = ProcedureHandlers<
  TInput,
  TOutput
>;

/**
 * Represents the complete configuration and state of a locally managed node.
 * It stores the executable handlers, which have already been processed
 * to include the necessary context injection.
 * @internal
 */
type NodeProfile = {
  groups: Set<string>;
  p2pApiHandlers: ApiHandlers<TransferableArray, Transferable> | null;
  subscriptions: Map<Topic, ApiHandlers<BroadcastableArray, Transferable>>;
};

// --- Feature Definition ---

/**
 * The capabilities contributed by the `LocalNodeManagerFeature`.
 * These methods form the internal API for other features to interact with
 * locally hosted nodes.
 */
export interface LocalNodeContribution {
  registerNode(
    options: NodeOptions<Api<BusContext, TransferableArray, Transferable>>
  ): Promise<void>;
  updateNodeApi(
    nodeId: NodeId,
    api: Api<BusContext, TransferableArray, Transferable>
  ): Promise<void>;
  addSubscription(
    nodeId: NodeId,
    topic: Topic,
    consumerApi: Api<TopicContext, BroadcastableArray, Transferable>
  ): Promise<void>;
  removeSubscription(nodeId: NodeId, topic: Topic): void;
  hasNode(nodeId: NodeId): boolean;
  getLocalNodeIds(): NodeId[];
  getLocalNodeGroups(nodeId: NodeId): Set<string> | undefined;
  getTopicsForNode(nodeId: NodeId): Topic[];
  removeNode(nodeId: NodeId): void;
  markAsClosing(nodeId: NodeId): Promise<void>;
  executeP2PProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    sourceGroups: string[],
    payload: P2PAskPayload | P2PTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void>;
  executeBroadcastProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    sourceGroups: string[],
    topic: Topic,
    payload: BroadcastAskPayload | BroadcastTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void>;
}

/**
 * A feature that manages the registration, API lifecycle, and procedure execution
 * for all locally hosted EBUS nodes. It is the final destination for any
 * message routed to a local node.
 *
 * This feature's key responsibility is to bridge the EBUS world with the generic
 * erpc world. It does this by creating EBUS-specific `InjectorFn` functions and
 * using erpc's standard `inject` utility to transform a user's context-aware API
 * (`Api<BusContext, ...>`) into a self-sufficient, executable API (`Api<void, ...>`).
 */
export class LocalNodeManagerFeature
  implements Feature<LocalNodeContribution, {}>
{
  private readonly localNodes = new Map<NodeId, NodeProfile>();
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
      getLocalNodeGroups: this.getLocalNodeGroups.bind(this),
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
    options: NodeOptions<Api<BusContext, TransferableArray, Transferable>>
  ): Promise<void> {
    if (this.localNodes.has(options.id)) {
      throw new EbusError(
        `Node with ID '${options.id}' is already registered.`
      );
    }

    let p2pApiHandlers: ApiHandlers<TransferableArray, Transferable> | null =
      null;
    if (options.api) {
      // The user provides an API that depends on `BusContext`.
      // We make it server-ready by injecting our context provider.
      const serverReadyApi = this._injectP2PContext(options.api);
      p2pApiHandlers = createProcedureHandlers(serverReadyApi);
    }

    this.localNodes.set(options.id, {
      groups: new Set(options.groups ?? [""]),
      p2pApiHandlers,
      subscriptions: new Map(),
    });
  }

  public async updateNodeApi(
    nodeId: NodeId,
    api: Api<BusContext, TransferableArray, Transferable>
  ): Promise<void> {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);

    const serverReadyApi = this._injectP2PContext(api);
    nodeProfile.p2pApiHandlers = createProcedureHandlers(serverReadyApi);
  }

  public async addSubscription(
    nodeId: NodeId,
    topic: Topic,
    consumerApi: Api<TopicContext, BroadcastableArray, Transferable>
  ): Promise<void> {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);

    const serverReadyApi = this._injectPubSubContext(consumerApi);
    const handlers = createProcedureHandlers(serverReadyApi);
    nodeProfile.subscriptions.set(topic, handlers as any);
  }

  // --- CONTEXT INJECTION HELPERS ---

  /**
   * Transforms a P2P API into a server-ready API by injecting the `BusContext` provider.
   * @param api The user-provided API that requires a `BusContext`.
   * @returns An `Api<void, ...>` that is self-sufficient.
   * @internal
   */
  private _injectP2PContext(
    api: Api<BusContext, any, any>
  ): Api<void, any, any> {
    const p2pInjector: InjectorFn<BusContext> = async (meta) => {
      if (
        !Array.isArray(meta) ||
        meta.length === 0 ||
        !this._isBusContext(meta[0])
      ) {
        throw new EbusError(
          "Internal Error: EBUS P2P context was not provided in meta or had an invalid shape."
        );
      }
      const remainingMeta = [...meta];
      const context = remainingMeta.shift() as BusContext;
      return { context, meta: remainingMeta };
    };
    return inject(api, p2pInjector);
  }

  /**
   * Transforms a consumer API into a server-ready API by injecting the `TopicContext` provider.
   * @param api The user-provided consumer API that requires a `TopicContext`.
   * @returns An `Api<void, ...>` that is self-sufficient.
   * @internal
   */
  private _injectPubSubContext(
    api: Api<TopicContext, any, any>
  ): Api<void, any, any> {
    const pubsubInjector: InjectorFn<TopicContext> = async (meta) => {
      if (
        !Array.isArray(meta) ||
        meta.length === 0 ||
        !this._isTopicContext(meta[0])
      ) {
        throw new EbusError(
          "Internal Error: EBUS Pub/Sub context was not provided in meta or had an invalid shape."
        );
      }
      const remainingMeta = [...meta];
      const context = remainingMeta.shift() as TopicContext;
      return { context, meta: remainingMeta };
    };
    return inject(api, pubsubInjector);
  }

  // --- EXECUTION LOGIC ---

  public executeP2PProcedure(
    destinationId: NodeId,
    sourceId: NodeId,
    sourceGroups: string[],
    payload: P2PAskPayload | P2PTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void> {
    // Stage 1: Pre-execution checks (closing, existence, permissions)
    if (this.closingNodes.has(destinationId)) {
      const error = new EbusError(`Node '${destinationId}' is shutting down.`);
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      console.error(error.message);
      return Promise.resolve();
    }

    const nodeProfile = this.localNodes.get(destinationId);
    if (!nodeProfile?.p2pApiHandlers) {
      const error = nodeProfile
        ? new ProcedureNotReadyError(destinationId)
        : new NodeNotFoundError(destinationId);
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      return Promise.resolve();
    }

    const destinationGroups = nodeProfile.groups;
    if (!sourceGroups.some((g) => destinationGroups.has(g))) {
      const error = new GroupPermissionError(
        `Node '${sourceId}' (groups: [${sourceGroups.join(", ")}]) lacks permission to call node '${destinationId}' (groups: [${Array.from(destinationGroups).join(", ")}]).`
      );
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      console.error(error.message);
      return Promise.resolve();
    }

    // Stage 2: Prepare the environment for the injected handlers
    const ctx: BusContext = {
      sourceNodeId: sourceId,
      sourceGroups: sourceGroups,
      localNodeId: destinationId,
    };
    const finalMeta = [ctx, ...(payload.meta || [])];
    const env: Env<void> = {
      ctx: undefined,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId),
    };

    // Stage 3: Execute
    const { p2pApiHandlers: handlers } = nodeProfile;
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
    sourceGroups: string[],
    topic: Topic,
    payload: BroadcastAskPayload | BroadcastTellPayload
  ): Promise<ProcedureExecutionResult<Transferable> | void> {
    // Stage 1: Pre-execution checks

    // Check if the destination node is in the process of shutting down.
    if (this.closingNodes.has(destinationId)) {
      if (payload.type === "ask") {
        const error = new EbusError(
          `Node '${destinationId}' is shutting down and cannot accept new calls.`
        );
        return Promise.resolve({ success: false, error });
      }
      // For 'tell' calls, we simply drop the message and do not throw.
      return Promise.resolve();
    }

    // Check if the destination node exists locally.
    const nodeProfile = this.localNodes.get(destinationId);
    if (!nodeProfile) {
      // If the node doesn't exist, it's not an error in a broadcast scenario.
      // It just means there's no local subscriber here. We return `undefined`
      // for 'ask' calls to signify 'no result from this path'.
      if (payload.type === "ask") return Promise.resolve(undefined);
      return Promise.resolve();
    }

    // Check if the existing node is subscribed to the topic.
    const subHandlers = nodeProfile.subscriptions.get(topic);
    if (!subHandlers) {
      // Similarly, no subscription is not an error, just no local target.
      if (payload.type === "ask") return Promise.resolve(undefined);
      return Promise.resolve();
    }

    // Permission Check: Ensure source and destination nodes share a common group.
    // At this point, `nodeProfile` is guaranteed to be defined.
    const destinationGroups = nodeProfile.groups;
    if (!sourceGroups.some((g) => destinationGroups.has(g))) {
      // No common group means this message is silently ignored for this target.
      if (payload.type === "ask") return Promise.resolve(undefined);
      return Promise.resolve();
    }

    // Stage 2: Prepare the environment for the procedure handlers.
    // The API handlers were created from an API that expects a `TopicContext`.
    // We create that context here at runtime.

    const ctx: TopicContext = {
      sourceNodeId: sourceId,
      sourceGroups: sourceGroups,
      localNodeId: destinationId,
      topic,
    };

    // The context is prepended to the meta array, which the injected middleware
    // within the procedure's chain will consume to populate `env.ctx`.
    const finalMeta = [ctx, ...(payload.meta || [])];

    // We execute the procedure handlers with a standard Env<void>, because the
    // API was transformed by `inject` to be self-sufficient.
    const env: Env<void> = {
      ctx: undefined,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId),
    };

    // Stage 3: Execute the appropriate handler.

    if (payload.type === "tell") {
      subHandlers.handleTell(env, payload.path, payload.args).catch((err) => {
        // Log server-side errors for fire-and-forget calls for debugging.
        console.error(
          `[LNM] Unhandled error in broadcast 'tell' on topic '${topic}' for node '${destinationId}':`,
          err
        );
      });
      return Promise.resolve(); // 'tell' calls resolve immediately.
    }

    // For 'ask' calls, we await and return the result.
    return subHandlers.handleAsk(env, payload.path, payload.args);
  }

  // --- UTILITY AND STATE MANAGEMENT METHODS ---

  /**
   * Checks if an object has the essential properties of a BusContext.
   * This is the correct way to check for a base interface.
   * @internal
   */
  private _isBusContext(obj: any): obj is BusContext {
    return (
      typeof obj === "object" &&
      obj !== null &&
      typeof obj.sourceNodeId === "string" &&
      typeof obj.localNodeId === "string" &&
      Array.isArray(obj.sourceGroups)
    );
  }

  /**
   * Checks if an object is a TopicContext by first verifying it has
   * the base BusContext properties, and then checking for the specific 'topic' property.
   * @internal
   */
  private _isTopicContext(obj: any): obj is TopicContext {
    return this._isBusContext(obj) && typeof (obj as any).topic === "string";
  }

  public hasNode(nodeId: NodeId): boolean {
    return this.localNodes.has(nodeId);
  }

  public removeSubscription(nodeId: NodeId, topic: Topic): void {
    this.localNodes.get(nodeId)?.subscriptions.delete(topic);
  }

  public getLocalNodeGroups(nodeId: NodeId): Set<string> | undefined {
    return this.localNodes.get(nodeId)?.groups;
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
