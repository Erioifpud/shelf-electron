// src/index.ts
import {
  buildFeatures as buildFeatures2,
  ResourceManager as ResourceManager3,
  StreamManager as StreamManager3
} from "@eleplug/erpc";

// src/features/api/api.feature.ts
import "@eleplug/erpc";

// src/api/node.ts
var Node = class {
  /** The unique identifier of this node. */
  id;
  busApi;
  deps;
  /**
   * @internal
   * Nodes should be created via `ebus.join()`, not constructed directly.
   */
  constructor(id, busApi, dependencies) {
    this.id = id;
    this.busApi = busApi;
    this.deps = dependencies;
  }
  /**
   * Sets or replaces the P2P API for this node.
   * The procedures in the API can accept and return any `Transferable` type.
   *
   * @param apiFactory A factory function that returns the erpc API definition.
   */
  async setApi(apiFactory) {
    return this.deps.setApi(apiFactory);
  }
  /**
   * Creates a typed client for point-to-point communication with another node.
   *
   * @template TheirApi The API shape of the target node.
   * @param targetNodeId The unique ID of the node to connect to.
   * @returns A promise that resolves to a type-safe erpc client.
   */
  connectTo(targetNodeId) {
    return this.busApi.connectTo(this.id, targetNodeId);
  }
  /**
   * Subscribes to a topic and provides an API to handle messages published to it.
   * The procedure arguments in the handler API must be `Broadcastable`.
   *
   * @param topic The topic to subscribe to.
   * @param consumerFactory A factory function that returns the erpc API for handling messages.
   * @returns A promise that resolves to a `SubscriptionHandle`, which can be used to cancel.
   */
  async subscribe(topic, consumerFactory) {
    return this.deps.subscribe(topic, consumerFactory);
  }
  /**
   * Creates a publisher client for sending broadcast messages to a topic.
   *
   * @template THandlerApi The API shape of the consumers for this topic.
   * @param topic The topic to publish to.
   * @param options Optional publisher settings, such as `loopback`.
   * @returns A `PublisherClient` for making type-safe broadcast calls.
   */
  emiter(topic, options) {
    return this.deps.emiter({
      topic,
      sourceNodeId: this.id,
      loopback: options?.loopback
    });
  }
  /**
   * Gracefully closes this node, deregistering it from the network.
   * This will immediately reject any new incoming calls to this node.
   */
  async close() {
    await this.deps.closeNode();
  }
};

// src/features/api/api.feature.ts
var ApiFeature = class {
  capability;
  init(capability) {
    this.capability = capability;
  }
  contribute() {
    return {
      join: this.join.bind(this),
      connectTo: this.connectTo.bind(this)
    };
  }
  close() {
  }
  async join(options) {
    await this.capability.registerNode(options);
    await this.capability.announceNode(options.id, true);
    return new Node(options.id, this, {
      setApi: (factory) => this.capability.updateNodeApi(options.id, factory),
      subscribe: (topic, factory) => this.subscribe(options.id, topic, factory),
      emiter: (pubOptions) => this.capability.createPublisher(pubOptions),
      closeNode: () => this.closeNode(options.id)
    });
  }
  /** The implementation for `node.close()`. */
  async closeNode(nodeId) {
    if (!this.capability.hasNode(nodeId)) {
      console.warn(
        `[API] Attempted to close a non-local node ('${nodeId}'). Ignoring.`
      );
      return;
    }
    const topics = this.capability.getTopicsForNode(nodeId);
    const announcements = [
      ...topics.map(
        (topic) => this.capability.updateLocalSubscription(nodeId, topic, false)
      ),
      this.capability.announceNode(nodeId, false)
    ];
    await Promise.allSettled(announcements);
    await this.capability.markAsClosing(nodeId);
    this.capability.removeNode(nodeId);
  }
  async connectTo(sourceNodeId, targetNodeId) {
    return this.capability.createP2PClient(sourceNodeId, targetNodeId);
  }
  async subscribe(nodeId, topic, consumerFactory) {
    await this.capability.addSubscription(nodeId, topic, consumerFactory);
    await this.capability.updateLocalSubscription(nodeId, topic, true);
    return {
      cancel: async () => {
        await this.capability.updateLocalSubscription(nodeId, topic, false);
        this.capability.removeSubscription(nodeId, topic);
      }
    };
  }
};

// src/features/bridge/bridge-manager.feature.ts
import { v4 as uuid } from "uuid";
import "@eleplug/erpc";
import { AsyncEventEmitter } from "@eleplug/transport";

// src/types/errors.ts
var EbusError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EbusError";
  }
};
var NodeNotFoundError = class extends EbusError {
  details;
  constructor(nodeId) {
    super(`Node '${nodeId}' not found or unreachable.`);
    this.name = "NodeNotFoundError";
    this.details = { nodeId };
  }
};
var ProcedureNotReadyError = class extends EbusError {
  details;
  constructor(nodeId) {
    super(`The API for node '${nodeId}' has not been set yet.`);
    this.name = "ProcedureNotReadyError";
    this.details = { nodeId };
  }
};
function serializeError(e) {
  const error = e instanceof Error ? e : new EbusError(String(e));
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    details: error.details
    // Preserve custom details if they exist
  };
}
function deserializeError(error) {
  let ebusError;
  if (error.name === "NodeNotFoundError" && error.details?.nodeId) {
    ebusError = new NodeNotFoundError(error.details.nodeId);
  } else if (error.name === "ProcedureNotReadyError" && error.details?.nodeId) {
    ebusError = new ProcedureNotReadyError(error.details.nodeId);
  } else {
    ebusError = new EbusError(error.message);
  }
  ebusError.name = error.name || "EbusError";
  ebusError.stack = error.stack;
  if (error.details) {
    ebusError.details = error.details;
  }
  return ebusError;
}

// src/features/bridge/peer-stack.factory.ts
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
  initERPC,
  TunnelFeature
} from "@eleplug/erpc";
async function createPeerStack(transport, bridge, resourceManager, streamManager) {
  const t = initERPC.create();
  const internalApiImpl = t.router({
    forwardMessage: t.procedure.tell(
      (_env, message, fromBusPublicId) => {
        bridge.onMessageReceived(message, fromBusPublicId);
      }
    )
  });
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
    new TransportAdapterFeature(transport)
  ];
  const stack = await buildFeatures(peerFeatures);
  stack.capability.rawEmitter.on("close", (reason) => {
    bridge.onConnectionClosed(reason);
  });
  return stack;
}

// src/features/bridge/bridge-manager.feature.ts
var BridgeManagerFeature = class {
  constructor(resourceManager, streamManager, parentTransport) {
    this.resourceManager = resourceManager;
    this.streamManager = streamManager;
    this.parentTransport = parentTransport;
  }
  ebusId = uuid();
  busEvents = new AsyncEventEmitter();
  parentPeerStack = null;
  childPeerStacks = /* @__PURE__ */ new Map();
  nextBusId = 1;
  capability;
  async init(capability) {
    this.capability = capability;
    if (this.parentTransport) {
      this.connectToParent(this.parentTransport);
    }
  }
  contribute() {
    return {
      ebusId: this.ebusId,
      busEvents: this.busEvents,
      sendToParent: this.sendToParent.bind(this),
      sendToChild: this.sendToChild.bind(this),
      bridge: this.bridge.bind(this),
      hasParentConnection: () => !!this.parentPeerStack,
      getActiveChildBusIds: () => Array.from(this.childPeerStacks.keys())
    };
  }
  bridge(transport) {
    const busId = this.nextBusId++;
    const source = { type: "child", busId };
    return new Promise((resolve, reject) => {
      const handshakeTimeout = setTimeout(() => {
        cleanupListeners();
        reject(new EbusError(`Handshake timeout for child bus ${busId}.`));
      }, 5e3);
      const messageListener = (event) => {
        if (event.source.type === "child" && event.source.busId === busId && event.message.kind === "handshake") {
          cleanupListeners();
          resolve();
        }
      };
      const dropListener = (event) => {
        if (event.source.type === "child" && event.source.busId === busId) {
          cleanupListeners();
          reject(
            event.error || new EbusError(
              `Connection with child bus ${busId} dropped before handshake.`
            )
          );
        }
      };
      const cleanupListeners = () => {
        clearTimeout(handshakeTimeout);
        this.busEvents.off("message", messageListener);
        this.busEvents.off("connectionDropped", dropListener);
      };
      this.busEvents.on("message", messageListener);
      this.busEvents.on("connectionDropped", dropListener);
      const bridgeInterface = {
        onMessageReceived: (message, _fromBusPublicId) => {
          this.busEvents.emit("message", { source, message });
        },
        onConnectionClosed: (error) => {
          if (this.childPeerStacks.has(busId)) {
            this.childPeerStacks.delete(busId);
            this.busEvents.emit("connectionDropped", { source, error });
          }
        }
      };
      createPeerStack(
        transport,
        bridgeInterface,
        this.resourceManager,
        this.streamManager
      ).then((stack) => {
        this.childPeerStacks.set(busId, stack);
        this.busEvents.emit("connectionReady", { source });
      }).catch((err2) => {
        cleanupListeners();
        reject(
          new EbusError(
            `Failed to create peer stack for child bus ${busId}: ${err2.message}`
          )
        );
      });
    });
  }
  connectToParent(transport) {
    const source = { type: "parent" };
    const bridgeInterface = {
      onMessageReceived: (message, _fromBusPublicId) => {
        this.busEvents.emit("message", { source, message });
      },
      onConnectionClosed: (error) => {
        if (this.parentPeerStack) {
          this.parentPeerStack = null;
          this.busEvents.emit("connectionDropped", { source, error });
        }
      }
    };
    createPeerStack(
      transport,
      bridgeInterface,
      this.resourceManager,
      this.streamManager
    ).then(async (stack) => {
      this.parentPeerStack = stack;
      this.busEvents.emit("connectionReady", { source });
      try {
        await this.capability.initiateHandshake(source);
      } catch (handshakeError) {
        await stack.close(handshakeError);
      }
    }).catch((err2) => {
      this.busEvents.emit("connectionDropped", { source, error: err2 });
    });
  }
  async sendToParent(message) {
    if (!this.parentPeerStack) return;
    await this.parentPeerStack.capability.procedure.forwardMessage.tell(
      message,
      this.ebusId
    );
  }
  async sendToChild(busId, message) {
    const stack = this.childPeerStacks.get(busId);
    if (!stack) return;
    await stack.capability.procedure.forwardMessage.tell(message, this.ebusId);
  }
  async close() {
    const closePromises = [
      this.parentPeerStack?.close(),
      ...Array.from(this.childPeerStacks.values()).map((s) => s.close())
    ].filter(Boolean);
    await Promise.allSettled(closePromises);
    this.busEvents.removeAllListeners();
  }
};

// src/features/local/local-node-manager.feature.ts
import {
  createProcedureHandlers,
  initERPC as initERPC2
} from "@eleplug/erpc";

// src/features/local/context.middleware.ts
import { middleware } from "@eleplug/erpc";
function isBusContext(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.sourceNodeId === "string" && typeof obj.localNodeId === "string" && !("topic" in obj);
}
function isTopicContext(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.sourceNodeId === "string" && typeof obj.localNodeId === "string" && typeof obj.topic === "string";
}
function createContextInjectorMiddleware(validator, errorMessage) {
  return middleware(async ({ meta, next, input }) => {
    if (!Array.isArray(meta) || meta.length === 0) {
      throw new EbusError(`Internal Error: ${errorMessage}`);
    }
    const remainingMeta = [...meta];
    const context = remainingMeta.shift();
    if (!validator(context)) {
      throw new EbusError(
        `Internal Error: Invalid context object found in meta array. It did not match the expected shape for this procedure type.`
      );
    }
    return next({
      ctx: context,
      // `context` is now correctly typed as TContext.
      meta: remainingMeta,
      input
    });
  });
}
var p2pContextMiddleware = createContextInjectorMiddleware(
  isBusContext,
  "EBUS P2P context was not prepended to the meta array."
);
var pubsubContextMiddleware = createContextInjectorMiddleware(
  isTopicContext,
  "EBUS Pub/Sub context was not prepended to the meta array."
);

// src/features/local/local-node-manager.feature.ts
var LocalNodeManagerFeature = class {
  localNodes = /* @__PURE__ */ new Map();
  /** A set of node IDs that are currently in the process of shutting down. */
  closingNodes = /* @__PURE__ */ new Set();
  contribute() {
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
      removeNode: this.removeNode.bind(this)
    };
  }
  init() {
  }
  close() {
    this.localNodes.clear();
    this.closingNodes.clear();
  }
  async registerNode(options) {
    if (this.localNodes.has(options.id)) {
      throw new EbusError(
        `Node with ID '${options.id}' is already registered.`
      );
    }
    let apiProfile = null;
    if (options.apiFactory) {
      const t_p2p = initERPC2.create();
      const procedureBuilderWithMiddleware = t_p2p.procedure.use(p2pContextMiddleware);
      const api = await options.apiFactory({
        ...t_p2p,
        procedure: procedureBuilderWithMiddleware
      });
      const handlers = createProcedureHandlers(api);
      apiProfile = { api, handlers };
    }
    this.localNodes.set(options.id, {
      p2pApi: apiProfile,
      subscriptions: /* @__PURE__ */ new Map()
    });
  }
  async updateNodeApi(nodeId, apiFactory) {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);
    const t_p2p = initERPC2.create();
    const procedureBuilderWithMiddleware = t_p2p.procedure.use(p2pContextMiddleware);
    const api = await apiFactory({
      ...t_p2p,
      procedure: procedureBuilderWithMiddleware
    });
    const handlers = createProcedureHandlers(api);
    nodeProfile.p2pApi = { api, handlers };
  }
  hasNode(nodeId) {
    return this.localNodes.has(nodeId);
  }
  async addSubscription(nodeId, topic, consumnerFactory) {
    const nodeProfile = this.localNodes.get(nodeId);
    if (!nodeProfile) throw new NodeNotFoundError(nodeId);
    const t_pubsub = initERPC2.create();
    const procedureBuilderWithMiddleware = t_pubsub.procedure.use(
      pubsubContextMiddleware
    );
    const api = await consumnerFactory({
      ...t_pubsub,
      procedure: procedureBuilderWithMiddleware
    });
    const handlers = createProcedureHandlers(api);
    nodeProfile.subscriptions.set(topic, { api, handlers });
  }
  removeSubscription(nodeId, topic) {
    this.localNodes.get(nodeId)?.subscriptions.delete(topic);
  }
  executeP2PProcedure(destinationId, sourceId, payload) {
    if (this.closingNodes.has(destinationId)) {
      const error = new EbusError(
        `Node '${destinationId}' is shutting down and cannot accept new calls.`
      );
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      console.error(error.message);
      return Promise.resolve();
    }
    const nodeProfile = this.localNodes.get(destinationId);
    if (!nodeProfile?.p2pApi) {
      const error = nodeProfile ? new ProcedureNotReadyError(destinationId) : new NodeNotFoundError(destinationId);
      if (payload.type === "ask")
        return Promise.resolve({ success: false, error });
      return Promise.resolve();
    }
    const ctx = {
      sourceNodeId: sourceId,
      localNodeId: destinationId
    };
    const finalMeta = [ctx, ...payload.meta || []];
    const env = {
      ctx: void 0,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId)
    };
    const { handlers } = nodeProfile.p2pApi;
    if (payload.type === "tell") {
      handlers.handleTell(env, payload.path, payload.args).catch((err2) => {
        console.error(
          `[LNM] Unhandled error in P2P 'tell' on node '${destinationId}':`,
          err2
        );
      });
      return Promise.resolve();
    }
    return handlers.handleAsk(env, payload.path, payload.args);
  }
  executeBroadcastProcedure(destinationId, sourceId, topic, payload) {
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
      if (payload.type === "ask") return Promise.resolve(void 0);
      return Promise.resolve();
    }
    const ctx = {
      sourceNodeId: sourceId,
      localNodeId: destinationId,
      topic
    };
    const finalMeta = [ctx, ...payload.meta || []];
    const env = {
      ctx: void 0,
      meta: finalMeta,
      isClosing: () => this.closingNodes.has(destinationId)
    };
    const { handlers } = subProfile;
    if (payload.type === "tell") {
      handlers.handleTell(env, payload.path, payload.args).catch((err2) => {
        console.error(
          `[LNM] Unhandled error in broadcast 'tell' on topic '${topic}' for node '${destinationId}':`,
          err2
        );
      });
      return Promise.resolve();
    }
    return handlers.handleAsk(env, payload.path, payload.args);
  }
  getTopicsForNode(nodeId) {
    return this.localNodes.get(nodeId) ? Array.from(this.localNodes.get(nodeId).subscriptions.keys()) : [];
  }
  async markAsClosing(nodeId) {
    this.closingNodes.add(nodeId);
  }
  removeNode(nodeId) {
    this.localNodes.delete(nodeId);
    this.closingNodes.delete(nodeId);
  }
};

// src/features/p2p/p2p-handler.feature.ts
import { v4 as uuid2 } from "uuid";
import {
  buildClient
} from "@eleplug/erpc";
var P2PHandlerFeature = class {
  capability;
  pendingCalls = /* @__PURE__ */ new Map();
  init(capability) {
    this.capability = capability;
    capability.busEvents.on("message", ({ source, message }) => {
      if (message.kind === "p2p") {
        if (message.payload.type === "ack_result" || message.payload.type === "ack_fin") {
          if (this.capability.isManagingSession(message.payload.callId)) {
            this.capability.delegateMessageToSession(message, source);
            return;
          }
        }
        this.routeP2PMessage(message);
      }
    });
  }
  contribute() {
    return {
      createP2PClient: this.createP2PClient.bind(this),
      routeP2PMessage: this.routeP2PMessage.bind(this)
    };
  }
  close() {
    const error = new Error("EBUS instance is closing.");
    this.pendingCalls.forEach((p) => p.reject(error));
    this.pendingCalls.clear();
  }
  createP2PClient(sourceNodeId, targetNodeId) {
    const callProcedure = (path, action, args, meta) => {
      if (action === "ask") {
        const payload = {
          type: "ask",
          callId: `${sourceNodeId}:${uuid2()}`,
          path,
          args,
          meta
        };
        const message = {
          kind: "p2p",
          sourceId: sourceNodeId,
          destinationId: targetNodeId,
          payload
        };
        const promise = new Promise((resolve, reject) => {
          this.pendingCalls.set(payload.callId, { resolve, reject });
        });
        this.routeP2PMessage(message);
        return promise;
      } else {
        const payload = {
          type: "tell",
          path,
          args,
          meta
        };
        const message = {
          kind: "p2p",
          sourceId: sourceNodeId,
          destinationId: targetNodeId,
          payload
        };
        this.routeP2PMessage(message);
        return Promise.resolve();
      }
    };
    return buildClient(callProcedure);
  }
  async routeP2PMessage(message) {
    const { destinationId, sourceId, payload } = message;
    const nextHop = this.capability.getNextHop(destinationId);
    if (nextHop?.type === "local") {
      if (payload.type === "ask" || payload.type === "tell") {
        const result = await this.capability.executeP2PProcedure(
          destinationId,
          sourceId,
          payload
        );
        if (payload.type === "ask" && result) {
          const responsePayload = {
            type: "ack_result",
            callId: payload.callId,
            sourceId: destinationId,
            resultSeq: 0,
            result: result.success ? { success: true, data: result.data } : { success: false, error: serializeError(result.error) }
          };
          const responseMessage = {
            kind: "p2p",
            sourceId: destinationId,
            destinationId: sourceId,
            payload: responsePayload
          };
          this.routeP2PMessage(responseMessage);
        }
      } else if (payload.type === "ack_result" || payload.type === "ack_fin") {
        const pending = this.pendingCalls.get(payload.callId);
        if (pending) {
          this.pendingCalls.delete(payload.callId);
          if (payload.type === "ack_result") {
            if (payload.result.success) {
              pending.resolve(payload.result.data);
            } else {
              pending.reject(deserializeError(payload.result.error));
            }
          }
        }
      }
      return;
    }
    if (nextHop) {
      if (nextHop.type === "parent") {
        await this.capability.sendToParent(message);
      } else if (nextHop.type === "child") {
        await this.capability.sendToChild(nextHop.busId, message);
      }
      return;
    }
    if (payload.type === "ask") {
      const error = new NodeNotFoundError(destinationId);
      const errorResponsePayload = {
        type: "ack_result",
        callId: payload.callId,
        sourceId: "ebus-system",
        resultSeq: 0,
        result: { success: false, error: serializeError(error) }
      };
      const responseMessage = {
        kind: "p2p",
        sourceId: "ebus-system",
        destinationId: sourceId,
        payload: errorResponsePayload
      };
      this.routeP2PMessage(responseMessage);
    }
  }
};

// src/features/pubsub/pubsub-handler.feature.ts
import { v4 as uuid3 } from "uuid";
import "@eleplug/erpc";

// src/api/publisher.ts
function createPublisherProxy(handler, path = [], meta) {
  const proxy = new Proxy(() => {
  }, {
    get: (_target, prop) => {
      if (prop === "then" || typeof prop === "symbol") return void 0;
      if (prop === "meta") {
        return (...newMetas) => {
          const existingMeta = Array.isArray(meta) ? meta : [];
          return createPublisherProxy(handler, path, [
            ...existingMeta,
            ...newMetas
          ]);
        };
      }
      return createPublisherProxy(handler, [...path, prop], meta);
    },
    apply: (_target, _thisArg, args) => {
      return handler(path, args, meta);
    }
  });
  return proxy;
}
function buildPublisher(publishProcedure, topic) {
  const handler = (path, args, meta) => {
    const action = path.at(-1);
    const procedurePathSegments = path.slice(0, -1);
    const procedurePathString = procedurePathSegments.join(".");
    if (action === "all" || action === "tell") {
      return publishProcedure(topic, procedurePathString, action, args, meta);
    } else {
      const fullInvalidPath = path.join(".");
      return Promise.reject(
        new EbusError(
          `Invalid publisher call on path '${fullInvalidPath}'. A publisher path must be terminated with .all(...) or .tell(...).`
        )
      );
    }
  };
  return createPublisherProxy(handler);
}

// src/session/managers/session.manager.ts
var SessionManager = class {
  sessions = /* @__PURE__ */ new Map();
  constructor(capability) {
    capability.connection.busEvents.on("connectionDropped", ({ source }) => {
      for (const session of this.sessions.values()) {
        session.handleDownstreamDisconnect(source);
      }
    });
  }
  /**
   * Registers a new session and begins managing its lifecycle.
   * This method injects cleanup logic by wrapping the session's `terminate` method.
   * @param session The session instance to register.
   */
  register(session) {
    if (this.sessions.has(session.sessionId)) {
      console.warn(
        `[SessionManager] Session with ID ${session.sessionId} already exists. Overwriting.`
      );
    }
    this.sessions.set(session.sessionId, session);
    const originalTerminate = session.terminate.bind(session);
    session.terminate = (error) => {
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
  get(sessionId) {
    return this.sessions.get(sessionId);
  }
  /**
   * Forcibly terminates all active sessions, typically on EBUS instance shutdown.
   * @param error The error indicating the reason for the shutdown.
   */
  closeAll(error) {
    for (const session of this.sessions.values()) {
      session.terminate(error);
    }
    this.sessions.clear();
  }
};

// src/types/common.ts
var ok = (value) => ({ isOk: true, value });
var err = (error) => ({ isOk: false, error });

// src/session/ask-session.ts
var AskSession = class {
  sessionId;
  source;
  capability;
  /** State for remote downstream branches (parent/children). Key is a stringified `MessageSource`. */
  downstreamState = /* @__PURE__ */ new Map();
  /** State for local node deliveries. */
  localDelivery = {
    status: "pending",
    expectedResults: 0,
    receivedResults: 0
  };
  iteratorController;
  asyncIterable;
  constructor(sessionId, source, initialDownstreams, capability) {
    this.sessionId = sessionId;
    this.source = source;
    this.capability = capability;
    initialDownstreams.forEach((ds) => {
      if (ds.type !== "local") {
        this.downstreamState.set(JSON.stringify(ds), {
          status: "pending",
          expectedResults: 0,
          receivedResults: 0
        });
      }
    });
    if (this.source.type === "local") {
      const { controller, iterable } = this.createAsyncIterator();
      this.iteratorController = controller;
      this.asyncIterable = iterable;
    } else {
      this.iteratorController = {
        yield: () => {
        },
        close: () => {
        },
        error: () => {
        }
      };
      this.asyncIterable = { [Symbol.asyncIterator]: async function* () {
      } };
    }
  }
  /**
   * Returns the async iterable for consuming results if the call originated locally.
   */
  getAsyncIterable() {
    return this.asyncIterable;
  }
  update(message, source) {
    if (message.kind !== "p2p") return;
    switch (message.payload.type) {
      case "ack_result":
        this.handleAckResult(message.payload, source);
        break;
      case "ack_fin":
        this.handleAckFin(message.payload, source);
        break;
    }
  }
  /** Called by `PubSubHandlerFeature` when a result from a local subscriber is ready. */
  handleLocalResult(payload) {
    this.localDelivery.receivedResults++;
    this.processResult(payload);
    this.checkCompletion();
  }
  /** Called by `PubSubHandlerFeature` when it knows how many local subscribers were targeted. */
  handleLocalDeliveryFin(totalLocalTargets) {
    this.localDelivery.status = "fin_received";
    this.localDelivery.expectedResults = totalLocalTargets;
    this.checkCompletion();
  }
  handleDownstreamDisconnect(source) {
    const sourceKey = JSON.stringify(source);
    if (this.downstreamState.has(sourceKey)) {
      this.handleAckFin(
        { type: "ack_fin", callId: this.sessionId, totalResults: 0 },
        source
      );
    }
  }
  terminate(error) {
    if (error) {
      this.iteratorController.error(error);
    } else {
      this.iteratorController.close();
    }
  }
  /**
   * Creates a robust, pull-based async iterator using a producer-consumer pattern.
   */
  createAsyncIterator() {
    const valueQueue = [];
    const waiterQueue = [];
    let done = false;
    let error = null;
    const controller = {
      yield: (value) => {
        if (done) return;
        if (waiterQueue.length > 0) {
          waiterQueue.shift().resolve({ value, done: false });
        } else {
          valueQueue.push(value);
        }
      },
      close: () => {
        if (done) return;
        done = true;
        waiterQueue.forEach((w) => w.resolve({ value: void 0, done: true }));
        waiterQueue.length = 0;
      },
      error: (err2) => {
        if (done) return;
        done = true;
        error = err2;
        waiterQueue.forEach((w) => w.reject(err2));
        waiterQueue.length = 0;
      }
    };
    const iterable = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (error) throw error;
          if (valueQueue.length > 0)
            return { value: valueQueue.shift(), done: false };
          if (done) return { value: void 0, done: true };
          return new Promise((resolve, reject) => {
            waiterQueue.push({ resolve, reject });
          });
        },
        return: async () => {
          this.terminate(
            new Error("AsyncIterator was manually closed by consumer.")
          );
          return { done: true, value: void 0 };
        }
      })
    };
    return { controller, iterable };
  }
  /**
   * Either yields a result to the local iterator or forwards it upstream.
   */
  processResult(payload) {
    if (this.source.type === "local") {
      const result = payload.result.success ? ok(payload.result.data) : err(deserializeError(payload.result.error));
      this.iteratorController.yield(result);
    } else {
      const responseMessage = {
        kind: "p2p",
        sourceId: payload.sourceId,
        // Preserve the original result source
        destinationId: "upstream",
        // A conceptual target
        payload
      };
      this.capability.sendTo(this.source, responseMessage);
    }
  }
  handleAckResult(payload, source) {
    const state = this.downstreamState.get(JSON.stringify(source));
    if (state) {
      state.receivedResults++;
    }
    this.processResult(payload);
    this.checkCompletion();
  }
  handleAckFin(payload, source) {
    const state = this.downstreamState.get(JSON.stringify(source));
    if (state) {
      state.status = "fin_received";
      state.expectedResults = payload.totalResults;
    }
    this.checkCompletion();
  }
  /**
   * Checks if all local and remote branches have finished sending their results.
   * If so, terminates the session.
   */
  checkCompletion() {
    const isLocalDone = this.localDelivery.status === "fin_received" && this.localDelivery.receivedResults >= this.localDelivery.expectedResults;
    const areDownstreamsDone = Array.from(this.downstreamState.values()).every(
      (state) => state.status === "fin_received" && state.receivedResults >= state.expectedResults
    );
    if (isLocalDone && areDownstreamsDone) {
      if (this.source.type !== "local") {
        const totalResults = this.localDelivery.expectedResults + Array.from(this.downstreamState.values()).reduce(
          (sum, s) => sum + s.expectedResults,
          0
        );
        const finPayload = {
          type: "ack_fin",
          callId: this.sessionId,
          totalResults
        };
        const finMessage = {
          kind: "p2p",
          sourceId: "ebus-system",
          // System-generated message
          destinationId: "upstream",
          payload: finPayload
        };
        this.capability.sendTo(this.source, finMessage);
      }
      this.terminate();
    }
  }
};

// src/features/pubsub/pubsub-handler.feature.ts
function transpose(matrix) {
  if (matrix.length === 0 || matrix[0]?.length === 0) return [];
  const numCols = matrix[0].length;
  const transposed = Array.from({ length: numCols }, () => []);
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < numCols; j++) {
      transposed[j][i] = matrix[i][j];
    }
  }
  return transposed;
}
var PubSubHandlerFeature = class {
  capability;
  sessionManager;
  sessionCapability = {
    sendTo: (source, message) => {
      if (source.type === "parent") {
        this.capability.sendToParent(message);
      } else if (source.type === "child") {
        this.capability.sendToChild(source.busId, message);
      }
    }
  };
  init(capability) {
    this.capability = capability;
    this.sessionManager = new SessionManager({ connection: capability });
    capability.busEvents.on("message", ({ source, message }) => {
      if (message.kind === "broadcast") {
        this.dispatchBroadcast(message, source);
      }
    });
  }
  contribute() {
    return {
      createPublisher: this.createPublisher.bind(this),
      isManagingSession: (sessionId) => !!this.sessionManager.get(sessionId),
      delegateMessageToSession: (message, source) => {
        const sessionId = message.payload.type === "ack_result" || message.payload.type === "ack_fin" ? message.payload.callId : void 0;
        if (sessionId) {
          this.sessionManager.get(sessionId)?.update(message, source);
        }
      }
    };
  }
  close() {
    this.sessionManager.closeAll(new Error("EBUS instance is closing."));
  }
  createPublisher(options) {
    return buildPublisher((topic, path, action, args, meta) => {
      const payload = action === "all" ? {
        type: "ask",
        callId: `${options.sourceNodeId}:${uuid3()}`,
        path,
        args,
        meta
      } : { type: "tell", path, args, meta };
      const message = {
        kind: "broadcast",
        sourceId: options.sourceNodeId,
        topic,
        loopback: options.loopback,
        payload
      };
      return this.initiateBroadcast(message);
    }, options.topic);
  }
  initiateBroadcast(message) {
    return this.dispatchBroadcast(message, { type: "local" });
  }
  dispatchBroadcast(message, source) {
    const { topic, sourceId, loopback } = message;
    const allDownstreams = this.capability.getBroadcastDownstream(
      topic,
      source
    );
    const remoteDownstreams = allDownstreams.filter(
      (ds) => ds.type !== "local"
    );
    let localTargetNodes;
    const localSubscribers = this.capability.getLocalSubscribers(topic);
    if (source.type === "local") {
      localTargetNodes = loopback ?? true ? localSubscribers : localSubscribers.filter((nodeId) => nodeId !== sourceId);
    } else {
      localTargetNodes = allDownstreams.some((ds) => ds.type === "local") ? localSubscribers : [];
    }
    if (remoteDownstreams.length === 0 && localTargetNodes.length === 0) {
      return message.payload.type === "ask" ? async function* () {
      }() : Promise.resolve();
    }
    if (message.payload.type === "ask") {
      const session = new AskSession(
        message.payload.callId,
        source,
        remoteDownstreams,
        this.sessionCapability
      );
      this.sessionManager.register(session);
      session.handleLocalDeliveryFin(localTargetNodes.length);
      this.routeBroadcast(message, remoteDownstreams, localTargetNodes);
      return source.type === "local" ? session.getAsyncIterable() : Promise.resolve();
    } else {
      this.routeBroadcast(message, remoteDownstreams, localTargetNodes);
      return Promise.resolve();
    }
  }
  routeBroadcast(originalMessage, remoteDownstreams, localTargetNodes) {
    const totalTargets = remoteDownstreams.length + localTargetNodes.length;
    if (totalTargets === 0) {
      if (originalMessage.payload.type === "ask") {
        const session = this.sessionManager.get(
          originalMessage.payload.callId
        );
        session?.handleLocalDeliveryFin(0);
      }
      return;
    }
    const originalPayload = originalMessage.payload;
    const argsByTarget = transpose(
      originalPayload.args.map(
        (arg) => this.capability.dispatcher.dispatch(arg, totalTargets)
      )
    );
    const metaByTarget = originalPayload.meta ? transpose(
      originalPayload.meta.map(
        (m) => this.capability.dispatcher.dispatch(m, totalTargets)
      )
    ) : [];
    let targetIndex = 0;
    remoteDownstreams.forEach((ds) => {
      const messageForRemote = {
        ...originalMessage,
        payload: {
          ...originalPayload,
          args: argsByTarget[targetIndex],
          meta: originalPayload.meta ? metaByTarget[targetIndex] : void 0
        }
      };
      targetIndex++;
      if (ds.type === "parent") {
        this.capability.sendToParent(messageForRemote);
      } else if (ds.type === "child") {
        this.capability.sendToChild(ds.busId, messageForRemote);
      }
    });
    localTargetNodes.forEach((nodeId) => {
      const clonedPayload = {
        ...originalPayload,
        args: argsByTarget[targetIndex],
        meta: originalPayload.meta ? metaByTarget[targetIndex] : void 0
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
        this.capability.executeBroadcastProcedure(
          nodeId,
          originalMessage.sourceId,
          originalMessage.topic,
          clonedPayload
        ).catch((err2) => {
          console.error(
            `[PubSub] Unhandled error in 'tell' to ${nodeId}:`,
            err2
          );
        });
      }
    });
  }
  async executeLocalAsk(payload, topic, nodeId, sourceId) {
    const session = this.sessionManager.get(payload.callId);
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
    if (result && this.sessionManager.get(payload.callId)) {
      const responsePayload = {
        type: "ack_result",
        callId: payload.callId,
        sourceId: nodeId,
        resultSeq: 0,
        // Sequencing is handled by the session manager if needed.
        result: result.success ? { success: true, data: result.data } : { success: false, error: serializeError(result.error) }
      };
      session.handleLocalResult(responsePayload);
    }
  }
};

// src/features/route/routing.feature.ts
import { v4 as uuid4 } from "uuid";
import "@eleplug/erpc";
var RoutingFeature = class {
  // Key: NodeId, Value: The next hop to reach that node.
  nodeRoutes = /* @__PURE__ */ new Map();
  // Key: Topic, Value: Set of child BusIds interested in this topic.
  remoteTopicHops = /* @__PURE__ */ new Map();
  // Key: Topic, Value: Set of local NodeIds subscribed to this topic.
  localNodeSubscriptions = /* @__PURE__ */ new Map();
  capability;
  init(capability) {
    this.capability = capability;
    const { semanticEvents, busEvents } = this.capability;
    semanticEvents.on("subscriptionUpdate", (message, source) => {
      if (source.type === "child") this.handleControlMessage(message, source);
    });
    semanticEvents.on("nodeAnnouncement", (message, source) => {
      if (source.type === "child") this.handleControlMessage(message, source);
    });
    busEvents.on("connectionDropped", ({ source }) => {
      this.purgeEntriesForSource(source);
    });
    busEvents.on("connectionReady", ({ source }) => {
      if (source.type === "parent") {
        this.propagateFullStateUpstream();
      }
    });
  }
  contribute() {
    return {
      announceNode: this.announceNode.bind(this),
      updateLocalSubscription: this.updateLocalSubscription.bind(this),
      getNextHop: this.getNextHop.bind(this),
      getBroadcastDownstream: this.getBroadcastDownstream.bind(this),
      getLocalSubscribers: this.getLocalSubscribers.bind(this)
    };
  }
  close() {
    this.nodeRoutes.clear();
    this.remoteTopicHops.clear();
    this.localNodeSubscriptions.clear();
  }
  async announceNode(nodeId, isAvailable) {
    if (isAvailable) {
      this.nodeRoutes.set(nodeId, { type: "local" });
    } else {
      this.nodeRoutes.delete(nodeId);
    }
    await this.propagateNodeChangeUpstream([{ nodeId, isAvailable }]);
  }
  async updateLocalSubscription(nodeId, topic, isSubscribed) {
    const hadInterestBefore = this.hasInterest(topic);
    const subscribers = this.localNodeSubscriptions.get(topic) || /* @__PURE__ */ new Set();
    if (isSubscribed) {
      subscribers.add(nodeId);
    } else {
      subscribers.delete(nodeId);
    }
    if (subscribers.size > 0) {
      this.localNodeSubscriptions.set(topic, subscribers);
    } else {
      this.localNodeSubscriptions.delete(topic);
    }
    const hasInterestNow = this.hasInterest(topic);
    if (hadInterestBefore !== hasInterestNow) {
      await this.propagateSubscriptionChangeUpstream([
        { topic, isSubscribed: hasInterestNow }
      ]);
    }
  }
  getNextHop(destination) {
    if (this.capability.hasNode(destination)) {
      return { type: "local" };
    }
    const hop = this.nodeRoutes.get(destination);
    if (hop) {
      return hop;
    }
    if (this.capability.hasParentConnection()) {
      return { type: "parent" };
    }
    return null;
  }
  getBroadcastDownstream(topic, source) {
    const downstreams = /* @__PURE__ */ new Set();
    if (source.type !== "local" && this.getLocalSubscribers(topic).length > 0) {
      downstreams.add(JSON.stringify({ type: "local" }));
    }
    const sourceBusId = source.type === "child" ? source.busId : void 0;
    this.remoteTopicHops.get(topic)?.forEach((busId) => {
      if (busId !== sourceBusId) {
        downstreams.add(JSON.stringify({ type: "child", busId }));
      }
    });
    if (source.type !== "parent" && this.capability.hasParentConnection()) {
      downstreams.add(JSON.stringify({ type: "parent" }));
    }
    return Array.from(downstreams).map((s) => JSON.parse(s));
  }
  getLocalSubscribers(topic) {
    return Array.from(this.localNodeSubscriptions.get(topic) || []);
  }
  async handleControlMessage(message, source) {
    const messageKind = message.kind;
    try {
      if (messageKind === "node-announcement") {
        await this.handleNodeAnnouncementMessage(message, source);
      } else {
        await this.handleRemoteSubscriptionUpdate(message, source);
      }
      const response = {
        kind: `${messageKind}-response`,
        correlationId: message.correlationId
      };
      this.sendMessage(source, response);
    } catch (error) {
      const response = {
        kind: `${messageKind}-response`,
        correlationId: message.correlationId,
        errors: [
          {
            [messageKind === "node-announcement" ? "nodeId" : "topic"]: "unknown",
            error: serializeError(error)
          }
        ]
      };
      this.sendMessage(source, response);
      throw error;
    }
  }
  async handleNodeAnnouncementMessage(message, from) {
    const fromHop = { type: "child", busId: from.busId };
    const changesMade = [];
    for (const ann of message.announcements) {
      if (ann.isAvailable) {
        const existingHop = this.nodeRoutes.get(ann.nodeId);
        if (existingHop && (existingHop.type !== "child" || existingHop.busId !== from.busId)) {
          this.revertNodeChanges(changesMade);
          throw new EbusError(`Node ID '${ann.nodeId}' conflict detected.`);
        }
        changesMade.push({ nodeId: ann.nodeId, previousHop: existingHop });
        this.nodeRoutes.set(ann.nodeId, fromHop);
      } else {
        const currentHop = this.nodeRoutes.get(ann.nodeId);
        if (currentHop?.type === "child" && currentHop.busId === from.busId) {
          changesMade.push({ nodeId: ann.nodeId, previousHop: currentHop });
          this.nodeRoutes.delete(ann.nodeId);
        }
      }
    }
    try {
      await this.propagateNodeChangeUpstream(message.announcements);
    } catch (upstreamError) {
      this.revertNodeChanges(changesMade);
      throw upstreamError;
    }
  }
  async handleRemoteSubscriptionUpdate(message, source) {
    const busId = source.busId;
    const changesToPropagate = [];
    const changesMade = [];
    for (const update of message.updates) {
      const hadInterestBefore = this.hasInterest(update.topic);
      const hops = this.remoteTopicHops.get(update.topic) || /* @__PURE__ */ new Set();
      const hadHopBefore = hops.has(busId);
      if (update.isSubscribed) {
        if (!hadHopBefore) {
          hops.add(busId);
          changesMade.push({ topic: update.topic, wasAdded: true });
        }
      } else {
        if (hadHopBefore) {
          hops.delete(busId);
          changesMade.push({ topic: update.topic, wasAdded: false });
        }
      }
      if (hops.size > 0) this.remoteTopicHops.set(update.topic, hops);
      else this.remoteTopicHops.delete(update.topic);
      const hasInterestNow = this.hasInterest(update.topic);
      if (hadInterestBefore !== hasInterestNow) {
        changesToPropagate.push({
          topic: update.topic,
          isSubscribed: hasInterestNow
        });
      }
    }
    if (changesToPropagate.length > 0) {
      try {
        await this.propagateSubscriptionChangeUpstream(changesToPropagate);
      } catch (upstreamError) {
        this.revertSubscriptionChanges(changesMade, busId);
        throw upstreamError;
      }
    }
  }
  revertNodeChanges(changes) {
    for (const change of changes.reverse()) {
      if (change.previousHop) {
        this.nodeRoutes.set(change.nodeId, change.previousHop);
      } else {
        this.nodeRoutes.delete(change.nodeId);
      }
    }
  }
  revertSubscriptionChanges(changes, busId) {
    for (const change of changes.reverse()) {
      const hops = this.remoteTopicHops.get(change.topic);
      if (change.wasAdded) {
        hops?.delete(busId);
        if (hops?.size === 0) this.remoteTopicHops.delete(change.topic);
      } else {
        const existingHops = hops || /* @__PURE__ */ new Set();
        existingHops.add(busId);
        this.remoteTopicHops.set(change.topic, existingHops);
      }
    }
  }
  sendMessage(dest, msg) {
    if (dest.type === "parent") {
      this.capability.sendToParent(msg).catch(() => {
      });
    } else if (dest.type === "child") {
      this.capability.sendToChild(dest.busId, msg).catch(() => {
      });
    }
  }
  async propagateSubscriptionChangeUpstream(updates) {
    if (!this.capability.hasParentConnection() || updates.length === 0) return;
    const message = {
      kind: "sub-update",
      updates,
      correlationId: uuid4()
    };
    await this.capability.sendRequestAndWaitForAck({ type: "parent" }, message);
  }
  async propagateNodeChangeUpstream(announcements) {
    if (!this.capability.hasParentConnection() || announcements.length === 0)
      return;
    const message = {
      kind: "node-announcement",
      announcements,
      correlationId: uuid4()
    };
    await this.capability.sendRequestAndWaitForAck({ type: "parent" }, message);
  }
  propagateFullStateUpstream() {
    const allNodes = [
      ...this.capability.getLocalNodeIds(),
      ...Array.from(this.nodeRoutes.keys())
    ];
    this.propagateNodeChangeUpstream(
      [...new Set(allNodes)].map((nodeId) => ({ nodeId, isAvailable: true }))
    ).catch(
      (err2) => console.error(
        "[Routing] Error propagating full node state upstream:",
        err2
      )
    );
    const allInterestedTopics = Array.from(
      /* @__PURE__ */ new Set([
        ...this.localNodeSubscriptions.keys(),
        ...this.remoteTopicHops.keys()
      ])
    );
    this.propagateSubscriptionChangeUpstream(
      allInterestedTopics.map((topic) => ({ topic, isSubscribed: true }))
    ).catch(
      (err2) => console.error(
        "[Routing] Error propagating full subscription state upstream:",
        err2
      )
    );
  }
  purgeEntriesForSource(source) {
    if (source.type === "local") return;
    const nodesToAnnounceUnavailable = [];
    this.nodeRoutes.forEach((hop, nodeId) => {
      const shouldPurge = source.type === "parent" && hop.type === "parent" || source.type === "child" && hop.type === "child" && hop.busId === source.busId;
      if (shouldPurge) {
        this.nodeRoutes.delete(nodeId);
        nodesToAnnounceUnavailable.push(nodeId);
      }
    });
    if (nodesToAnnounceUnavailable.length > 0) {
      this.propagateNodeChangeUpstream(
        nodesToAnnounceUnavailable.map((nodeId) => ({
          nodeId,
          isAvailable: false
        }))
      );
    }
    if (source.type === "child") {
      const topicsWithChangedInterest = [];
      this.remoteTopicHops.forEach((hops, topic) => {
        const hadInterestBefore = this.hasInterest(topic);
        if (hops.has(source.busId)) {
          hops.delete(source.busId);
          if (hops.size === 0) this.remoteTopicHops.delete(topic);
          if (hadInterestBefore && !this.hasInterest(topic)) {
            topicsWithChangedInterest.push(topic);
          }
        }
      });
      if (topicsWithChangedInterest.length > 0) {
        this.propagateSubscriptionChangeUpstream(
          topicsWithChangedInterest.map((topic) => ({
            topic,
            isSubscribed: false
          }))
        );
      }
    }
  }
  hasInterest(topic) {
    const hasLocal = (this.localNodeSubscriptions.get(topic)?.size ?? 0) > 0;
    const hasRemote = (this.remoteTopicHops.get(topic)?.size ?? 0) > 0;
    return hasLocal || hasRemote;
  }
};

// src/features/dispatch/dispatch.feature.ts
import "@eleplug/erpc";

// src/features/dispatch/dispatcher.ts
var Dispatcher = class {
  handlers;
  constructor(customHandlers) {
    this.handlers = customHandlers;
  }
  /**
   * The main public method to create `count` deep copies of a given value.
   *
   * @param value The value to clone.
   * @param count The number of copies to create.
   * @returns An array containing `count` cloned instances.
   */
  dispatch(value, count) {
    if (count <= 0) return [];
    return this._dispatch(value, count, /* @__PURE__ */ new WeakMap());
  }
  /**
   * The internal recursive dispatch implementation.
   *
   * @param value The current value to process.
   * @param count The number of copies to create.
   * @param seen A map to track objects that have already been cloned in this
   *             dispatch operation, to handle circular references. The map's
   *             value is an array of the already-created clones.
   * @returns An array of cloned values.
   */
  _dispatch(value, count, seen) {
    if (value === null || typeof value !== "object" || value instanceof Uint8Array) {
      return Array(count).fill(value);
    }
    if (seen.has(value)) {
      return seen.get(value);
    }
    for (const handler of this.handlers) {
      if (handler.canHandle(value)) {
        const context = {
          dispatch: (v, c) => this._dispatch(v, c, seen)
        };
        return handler.dispatch(value, count, context);
      }
    }
    if (Array.isArray(value)) {
      const clonedArrays = Array.from({ length: count }, () => []);
      seen.set(value, clonedArrays);
      for (const item of value) {
        const clonedItems = this._dispatch(item, count, seen);
        for (let i = 0; i < count; i++) {
          clonedArrays[i].push(clonedItems[i]);
        }
      }
      return clonedArrays;
    }
    const clonedObjects = Array.from({ length: count }, () => ({}));
    seen.set(value, clonedObjects);
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const clonedValues = this._dispatch(value[key], count, seen);
        for (let i = 0; i < count; i++) {
          clonedObjects[i][key] = clonedValues[i];
        }
      }
    }
    return clonedObjects;
  }
};

// src/features/dispatch/dispatch.feature.ts
var DispatchFeature = class {
  // A temporary store for handlers registered before the Dispatcher is initialized.
  handlersToRegister = [];
  // The real dispatcher instance, created during the `init` phase.
  dispatcherInstance;
  contribute() {
    return {
      dispatcher: {
        /** A proxy method that delegates to the real dispatcher once initialized. */
        dispatch: (value, count) => {
          if (!this.dispatcherInstance) {
            throw new Error(
              "DispatchFeature not initialized. Cannot call 'dispatch'."
            );
          }
          return this.dispatcherInstance.dispatch(value, count);
        },
        /** Collects handlers to be used when the real dispatcher is created. */
        registerHandler: (handler) => {
          this.handlersToRegister.push(handler);
        }
      }
    };
  }
  /**
   * Initializes the feature by creating the `Dispatcher` instance.
   * At this point, all other features have had a chance to register their
   * `DispatchHandler`s via the contributed `registerHandler` method.
   */
  init() {
    this.dispatcherInstance = new Dispatcher(this.handlersToRegister);
  }
  /** This feature is stateless and requires no cleanup on close. */
  close() {
  }
};

// src/features/protocol/protocol-coordinator.feature.ts
import { v4 as uuid5 } from "uuid";
import "@eleplug/erpc";
import { AsyncEventEmitter as AsyncEventEmitter2 } from "@eleplug/transport";
var PendingAckManager = class {
  pending = /* @__PURE__ */ new Map();
  create(correlationId, timeout = 5e3) {
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
        resolve: (response) => {
          clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (reason) => {
          clearTimeout(timeoutId);
          reject(reason);
        }
      });
    });
  }
  resolve(correlationId, response) {
    const pending = this.pending.get(correlationId);
    if (pending) {
      this.pending.delete(correlationId);
      if (response.errors && response.errors.length > 0) {
        const firstError = response.errors[0];
        const cause = `Upstream operation failed for ${firstError.nodeId || firstError.topic || "unknown entity"}`;
        pending.reject(new EbusError(cause));
      } else {
        pending.resolve(response);
      }
    }
  }
  closeAll(error) {
    for (const p of this.pending.values()) {
      p.reject(error);
    }
    this.pending.clear();
  }
};
var ProtocolCoordinatorFeature = class {
  capability;
  semanticEvents = new AsyncEventEmitter2();
  pendingAcks = new PendingAckManager();
  contribute() {
    return {
      semanticEvents: this.semanticEvents,
      sendRequestAndWaitForAck: this.sendRequestAndWaitForAck.bind(this),
      initiateHandshake: this.initiateHandshake.bind(this)
    };
  }
  init(capability) {
    this.capability = capability;
    capability.busEvents.on("message", ({ source, message }) => {
      this.dispatchMessage(source, message);
    });
  }
  dispatchMessage(source, message) {
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
  async handleHandshakeRequest(message, source) {
    const response = {
      kind: "handshake-response",
      correlationId: message.correlationId
    };
    if (source.type === "parent") {
      await this.capability.sendToParent(response).catch((err2) => {
        console.error(
          `[PCF] Failed to send handshake response to parent:`,
          err2
        );
      });
    } else if (source.type === "child") {
      await this.capability.sendToChild(source.busId, response).catch((err2) => {
        console.error(
          `[PCF] Failed to send handshake response to child ${source.busId}:`,
          err2
        );
      });
    }
  }
  async initiateHandshake(source) {
    if (source.type === "local") return;
    const handshakeMessage = {
      kind: "handshake",
      correlationId: uuid5()
    };
    await this.sendRequestAndWaitForAck(source, handshakeMessage);
  }
  async sendRequestAndWaitForAck(destination, request) {
    if (destination.type === "local") {
      throw new EbusError("Cannot send ACK request to 'local' source.");
    }
    const promise = this.pendingAcks.create(request.correlationId);
    const sendAction = destination.type === "parent" ? this.capability.sendToParent(request) : this.capability.sendToChild(destination.busId, request);
    sendAction.catch((err2) => {
      this.pendingAcks.resolve(request.correlationId, {
        // Construct a synthetic response-like object with the error.
        kind: `${request.kind}-response`,
        correlationId: request.correlationId,
        errors: [{ error: serializeError(err2) }]
      });
    });
    return promise;
  }
  close() {
    this.semanticEvents.removeAllListeners();
    this.pendingAcks.closeAll(
      new EbusError("Protocol Coordinator is closing.")
    );
  }
};

// src/features/stream/stream-dispatching.feature.ts
import "@eleplug/erpc";

// src/features/stream/fanout-dispatch.handler.ts
function createMulticaster(sourceStream, context) {
  const controllers = [];
  let reader = null;
  let state = "idle";
  let finalError = null;
  async function pullFromSource() {
    if (state !== "pulling") return;
    try {
      while (state === "pulling") {
        const { done, value: originalChunk } = await reader.read();
        if (done) {
          state = "closed";
          controllers.forEach((c) => c.close());
          controllers.length = 0;
          break;
        }
        if (controllers.length > 0) {
          const dispatchedChunks = context.dispatch(
            originalChunk,
            controllers.length
          );
          controllers.forEach((controller, i) => {
            try {
              controller.enqueue(dispatchedChunks[i]);
            } catch {
            }
          });
        }
      }
    } catch (err2) {
      state = "errored";
      finalError = err2;
      controllers.forEach((c) => c.error(err2));
      controllers.length = 0;
    } finally {
      reader?.releaseLock();
    }
  }
  function start(controller) {
    if (state === "closed") {
      controller.close();
      return;
    }
    if (state === "errored") {
      controller.error(finalError);
      return;
    }
    controllers.push(controller);
    if (state === "idle") {
      state = "pulling";
      reader = sourceStream.getReader();
      pullFromSource();
    }
  }
  function cancel(reason) {
    if (state === "closed" || state === "errored") return;
    state = "errored";
    finalError = reason || new Error("Stream was cancelled by a consumer.");
    sourceStream.cancel(finalError).catch(() => {
    });
    controllers.forEach((c) => c.error(finalError));
    controllers.length = 0;
  }
  return function createMulticastProxyStream() {
    return new ReadableStream({ start, cancel });
  };
}
var ReadableStreamDispatchHandler = {
  canHandle(value) {
    return value instanceof ReadableStream;
  },
  dispatch(originalStream, count, context) {
    if (count <= 0) return [];
    const createProxy = createMulticaster(originalStream, context);
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(createProxy());
    }
    return results;
  }
};

// src/features/stream/fanin-dispatch.handler.ts
var WritableStreamDispatchHandler = {
  canHandle(value) {
    return value instanceof WritableStream;
  },
  dispatch(originalStream, count) {
    if (count <= 0) return [];
    const writer = originalStream.getWriter();
    let activeContributors = count;
    let isTerminated = false;
    let completionPromiseController;
    const completionPromise = new Promise((resolve, reject) => {
      completionPromiseController = { resolve, reject };
    });
    const terminate = async (error) => {
      if (isTerminated) return;
      isTerminated = true;
      try {
        if (error) {
          await writer.abort(error);
          completionPromiseController.reject(error);
        } else {
          await writer.close();
          completionPromiseController.resolve();
        }
      } catch (e) {
        completionPromiseController.reject(e);
      }
    };
    const contributorStreams = [];
    for (let i = 0; i < count; i++) {
      const stream = new WritableStream({
        async write(chunk) {
          if (isTerminated) {
            throw new Error("Aggregation stream has been terminated.");
          }
          try {
            await writer.write(chunk);
          } catch (e) {
            await terminate(e);
            throw e;
          }
        },
        close() {
          if (!isTerminated) {
            activeContributors--;
            if (activeContributors === 0) {
              terminate();
            }
          }
          return completionPromise;
        },
        abort(reason) {
          if (!isTerminated) {
            terminate(reason);
          }
          return completionPromise;
        }
      });
      contributorStreams.push(stream);
    }
    return contributorStreams;
  }
};

// src/features/stream/stream-dispatching.feature.ts
var StreamDispatchFeature = class {
  /** This feature does not provide any new capabilities, so it returns an empty object. */
  contribute() {
    return {};
  }
  /**
   * During initialization, this method registers the stream-specific handlers
   * with the `DispatchFeature`.
   * @param capability The EBUS core capabilities, from which we only need
   *                   the `dispatcher.registerHandler` method.
   */
  init(capability) {
    capability.dispatcher.registerHandler(ReadableStreamDispatchHandler);
    capability.dispatcher.registerHandler(WritableStreamDispatchHandler);
  }
  /** This feature is stateless and requires no cleanup on close. */
  close() {
  }
};

// src/features/pin/pin-dispatch.feature.ts
import "@eleplug/erpc";

// src/features/pin/pin-dispatch.handler.ts
import { PIN_FREE_KEY } from "@eleplug/erpc";
var PinHandler = {
  /**
   * Checks if a value is an erpc `Pin` proxy.
   *
   * A reliable way to identify a pin proxy is to check for the existence
   * of its special `[PIN_FREE_KEY]` method, which is unique to pin proxies.
   *
   * @param value The value to check.
   * @returns `true` if the value is a valid `Pin` proxy.
   */
  canHandle(value) {
    return typeof value === "function" && value[PIN_FREE_KEY] !== void 0;
  },
  /**
   * Creates `count` "clones" (i.e., reference copies) of a `Pin` object.
   *
   * @param originalPin The original `Pin` proxy object.
   * @param count The number of copies to create.
   * @returns An array containing `count` references to the original `Pin` object.
   */
  dispatch(originalPin, count) {
    return Array(count).fill(originalPin);
  }
};

// src/features/pin/pin-dispatch.feature.ts
var PinDispatchFeature = class {
  /** This feature does not provide new capabilities, so it returns an empty object. */
  contribute() {
    return {};
  }
  /**
   * During initialization, this method registers the `PinHandler`
   * with the `DispatchFeature`.
   *
   * @param capability The EBUS core capabilities, from which we only need
   *                   the `dispatcher.registerHandler` method.
   */
  init(capability) {
    capability.dispatcher.registerHandler(PinHandler);
  }
  /** This feature is stateless and requires no cleanup on close. */
  close() {
  }
};

// src/index.ts
async function createEbusInstance(parentTransport) {
  const resourceManager = new ResourceManager3();
  const streamManager = new StreamManager3();
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
    new ApiFeature()
  ];
  const bus = await buildFeatures2(features);
  return {
    ...bus.capability,
    close: bus.close
  };
}
var initEBUS = {
  create: createEbusInstance
};
export {
  EbusError,
  Node,
  NodeNotFoundError,
  ProcedureNotReadyError,
  err,
  initEBUS,
  ok
};
