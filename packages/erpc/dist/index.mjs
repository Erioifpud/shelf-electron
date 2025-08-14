// src/runtime/factory.ts
async function buildFeatures(features) {
  const contributions = [];
  const capability = {};
  for (const feature of features) {
    const contribution = feature.contribute();
    contributions.push(contribution);
    Object.assign(capability, contribution);
  }
  for (const feature of features) {
    await Promise.resolve(feature.init(capability));
  }
  const close = async (error) => {
    const reversedFeatures = [...features].reverse();
    const reversedContributions = [...contributions].reverse();
    for (let i = 0; i < reversedFeatures.length; i++) {
      try {
        await reversedFeatures[i].close(reversedContributions[i], error);
      } catch (e) {
        console.error(`[erpc] Error closing feature [${i}]:`, e);
      }
    }
  };
  return { capability, close };
}

// src/features/pin/resource-manager.ts
import { v4 as uuid } from "uuid";

// src/types/pin.ts
var PIN_ID_KEY = Symbol("__erpc_pin_id__");
var PIN_FREE_KEY = Symbol("__erpc_pin_free__");
var PIN_REQUEST_KEY = Symbol("__erpc_pin_request__");

// src/features/pin/resource-manager.ts
var ResourceManager = class {
  resources = /* @__PURE__ */ new Map();
  /** A counter for how many features are currently using this manager instance. */
  useCount = 0;
  /**
   * Called by a feature to signal that it is using this resource manager.
   * Increments the use counter.
   */
  acquire() {
    this.useCount++;
  }
  /**
   * Called by a feature to signal that it has finished using this manager.
   * When the last user releases it, the manager is automatically destroyed.
   */
  release() {
    this.useCount--;
    if (this.useCount <= 0) {
      this.destroy();
    }
  }
  /**
   * Pins an object, making it available for remote invocation, and returns its unique ID.
   * If the object is already pinned, its reference count is incremented.
   * @param obj The object or function to pin.
   * @returns The unique resource ID for the pinned object.
   */
  pin(obj) {
    const existingId = obj[PIN_ID_KEY];
    if (existingId && this.resources.has(existingId)) {
      const entry = this.resources.get(existingId);
      entry.refCount++;
      return existingId;
    }
    const id = uuid();
    Object.defineProperty(obj, PIN_ID_KEY, { value: id, configurable: true });
    this.resources.set(id, { resource: obj, refCount: 1 });
    return id;
  }
  /**
   * Retrieves a pinned resource by its ID.
   * @param id The unique resource ID.
   * @returns The pinned resource, or `undefined` if not found.
   */
  get(id) {
    return this.resources.get(id)?.resource;
  }
  /**
   * Decrements the reference count of a specific pinned resource.
   * If the count drops to zero, the resource is removed from the manager.
   * This is typically called in response to a 'release' message from a remote peer.
   * @param id The ID of the resource to release.
   */
  releaseResource(id) {
    const entry = this.resources.get(id);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      const { resource } = entry;
      if (resource && PIN_ID_KEY in resource) {
        delete resource[PIN_ID_KEY];
      }
      this.resources.delete(id);
    }
  }
  /**
   * Destroys the manager, forcibly releasing all pinned resources.
   * This is called when the last feature using the manager calls `release()`.
   */
  destroy() {
    for (const { resource } of this.resources.values()) {
      if (resource && PIN_ID_KEY in resource) {
        delete resource[PIN_ID_KEY];
      }
    }
    this.resources.clear();
  }
};
function pin(obj) {
  if (PIN_FREE_KEY in obj) {
    return obj;
  }
  Object.defineProperty(obj, PIN_REQUEST_KEY, { value: true, configurable: true, enumerable: false });
  return obj;
}
async function free(pinnedProxy) {
  const freeMethod = pinnedProxy[PIN_FREE_KEY];
  if (typeof freeMethod !== "function") {
    return;
  }
  await freeMethod();
}

// src/utils/incoming-buffer.ts
import { circular_buffer } from "circular_buffer_js";
var BufferClosedError = class extends Error {
  constructor(message = "Operation on a closed buffer.") {
    super(message);
    this.name = "BufferClosedError";
  }
};
var IncomingBuffer = class {
  buf;
  pendingPop = [];
  pendingPush = [];
  pendingDrain = [];
  isFinished = false;
  closeError = null;
  constructor(capacity = 256) {
    this.buf = new circular_buffer(capacity);
  }
  /**
   * Pushes an item into the buffer. If the buffer is full, this method returns
   * a promise that resolves when space becomes available.
   * @param item The `JsonValue` to add to the buffer.
   * @returns A promise that resolves when the item has been buffered.
   */
  push(item) {
    if (this.isFinished || this.closeError) {
      return Promise.reject(this.closeError ?? new BufferClosedError("Buffer is closed."));
    }
    if (this.pendingPop.length > 0) {
      const waiter = this.pendingPop.shift();
      queueMicrotask(() => waiter.resolve(item));
      return Promise.resolve();
    }
    if (this.buf.isFull) {
      return new Promise((resolve, reject) => {
        this.pendingPush.push({ item, resolve, reject });
      });
    }
    this.buf.push(item);
    return Promise.resolve();
  }
  /**
   * Pops an item from the buffer. If the buffer is empty, this method returns
   * a promise that resolves when an item becomes available.
   * @returns A promise that resolves with the next item from the buffer.
   */
  pop() {
    if (this.closeError) {
      return Promise.reject(this.closeError);
    }
    if (!this.buf.isEmpty) {
      const value = this.buf.pop();
      if (this.pendingPush.length > 0) {
        const waiter = this.pendingPush.shift();
        this.buf.push(waiter.item);
        queueMicrotask(() => waiter.resolve());
      }
      if (this.isFinished && this.buf.isEmpty) {
        this.resolvePendingDrains();
      }
      return Promise.resolve(value);
    }
    if (this.isFinished) {
      return Promise.reject(new BufferClosedError("Buffer is closed and empty."));
    }
    return new Promise((resolve, reject) => {
      this.pendingPop.push({ resolve, reject });
    });
  }
  /**
   * Returns a promise that resolves when the buffer is fully drained.
   * The buffer is considered drained when it has been marked as `finished`
   * and all its contents have been `pop`ped.
   */
  onDrained() {
    if (this.isFinished && this.buf.isEmpty) {
      return Promise.resolve();
    }
    if (this.closeError) {
      return Promise.reject(this.closeError);
    }
    return new Promise((resolve, reject) => {
      this.pendingDrain.push({ resolve, reject });
    });
  }
  /**
   * Signals that no more items will be pushed to the buffer (graceful close).
   * Any pending `pop` calls will be rejected once the existing buffer is empty.
   */
  finish() {
    if (this.isFinished || this.closeError) return;
    this.isFinished = true;
    if (this.buf.isEmpty) {
      this.resolvePendingDrains();
    }
    const error = new BufferClosedError("Buffer was closed and empty.");
    while (this.pendingPop.length > 0) {
      const waiter = this.pendingPop.shift();
      queueMicrotask(() => waiter.reject(error));
    }
  }
  /**
   * Destroys the buffer due to an error (abrupt close).
   * All pending `push` and `pop` calls will be rejected with the provided error.
   * @param err The error that caused the destruction.
   */
  destroy(err) {
    if (this.closeError) return;
    this.isFinished = true;
    this.closeError = err instanceof Error ? err : new BufferClosedError(err ? String(err) : "Buffer was destroyed.");
    const rejectAll = (queue) => {
      while (queue.length > 0) {
        const waiter = queue.shift();
        queueMicrotask(() => waiter.reject(this.closeError));
      }
    };
    rejectAll(this.pendingPop);
    rejectAll(this.pendingPush);
    rejectAll(this.pendingDrain);
  }
  /**
   * Resolves all promises waiting for the buffer to be drained.
   */
  resolvePendingDrains() {
    while (this.pendingDrain.length > 0) {
      const waiter = this.pendingDrain.shift();
      queueMicrotask(() => waiter.resolve());
    }
  }
};

// src/features/stream/stream-manager.ts
var StreamManager = class {
  buffers = /* @__PURE__ */ new Map();
  pendingHandshakes = /* @__PURE__ */ new Map();
  useCount = 0;
  /** Increments the manager's use counter. */
  acquire() {
    this.useCount++;
  }
  /** Decrements the use counter. When it reaches zero, all resources are destroyed. */
  release(error) {
    this.useCount--;
    if (this.useCount <= 0) {
      this.destroy(error ?? new Error("StreamManager destroyed as last user has released it."));
    }
  }
  /** Destroys all buffers and rejects all pending handshakes. */
  destroy(error) {
    for (const pending of this.pendingHandshakes.values()) {
      pending.reject(error);
    }
    this.pendingHandshakes.clear();
    for (const buffer of this.buffers.values()) {
      buffer.destroy(error);
    }
    this.buffers.clear();
  }
  /**
   * The entry point for handling a new incoming stream channel from the transport.
   * It inspects the first message to determine if the stream is standard or tunneled.
   * @param channel The new incoming stream channel.
   * @param context The dependencies required for processing.
   */
  routeIncomingStreamChannel(channel, context) {
    let isHandled = false;
    const onFirstMessage = (raw_message) => {
      if (isHandled) return;
      isHandled = true;
      const message = raw_message;
      if (message.type === "stream-tunnel") {
        context.routeTunneledStream(channel, message).catch((err) => {
          console.error(`[StreamManager] Tunneled stream routing failed for channel ${channel.id}:`, err);
          channel.close().catch(() => {
          });
        });
      } else {
        this.processNewStream(channel, message, context);
      }
    };
    const onEarlyClose = (reason) => {
      if (isHandled) return;
      isHandled = true;
      if (reason) {
        console.debug(`[StreamManager] Channel ${channel.id} closed before first message:`, reason.message);
      }
    };
    channel.onceData(onFirstMessage);
    channel.onClose(onEarlyClose);
  }
  /**
   * Processes a new stream that is confirmed to be a standard (non-tunneled) stream.
   * @param channel The stream channel.
   * @param firstMessage The already-read first message from the channel.
   * @param context The processing dependencies.
   */
  processNewStream(channel, firstMessage, context) {
    const { id: channelId } = channel;
    this.handleIncomingMessage(channelId, firstMessage, context).catch((err) => {
      console.error(`[StreamManager] Error handling first message for channel ${channelId}:`, err);
      this.closeIncoming(channelId, err);
    });
    channel.onData(async (raw_message) => {
      try {
        await this.handleIncomingMessage(channelId, raw_message, context);
      } catch (err) {
        console.error(`[StreamManager] Error handling subsequent message for channel ${channelId}:`, err);
        this.closeIncoming(channelId, err);
      }
    });
    channel.onClose((reason) => this.closeIncoming(channelId, reason));
  }
  /**
   * Closes a specific incoming stream and cleans up its associated buffer.
   * @param channelId The ID of the channel to close.
   * @param error The optional reason for closure.
   */
  closeIncoming(channelId, error) {
    const buffer = this.buffers.get(channelId);
    if (buffer) {
      buffer.destroy(error);
      this.buffers.delete(channelId);
    }
  }
  getOrCreateHandshake(handshakeId) {
    let handshake = this.pendingHandshakes.get(handshakeId);
    if (!handshake) {
      const buffer = new IncomingBuffer();
      const promise = new Promise((resolve, reject) => {
        handshake = { buffer, resolve, reject };
        this.pendingHandshakes.set(handshakeId, handshake);
      });
      promise.catch(() => {
      });
    }
    return handshake;
  }
  /**
   * Handles a single incoming message for a specific stream channel.
   * @param channelId The ID of the channel.
   * @param message The stream message to process.
   * @param context The processing dependencies.
   */
  async handleIncomingMessage(channelId, message, context) {
    let buffer = this.buffers.get(channelId);
    if (!buffer && message.type === "stream-data" && message.handshakeId) {
      const handshake = this.getOrCreateHandshake(message.handshakeId);
      buffer = handshake.buffer;
      this.buffers.set(channelId, buffer);
      handshake.resolve(channelId);
    }
    if (!buffer) {
      if (message.type === "stream-data") {
        buffer = new IncomingBuffer();
        this.buffers.set(channelId, buffer);
      } else {
        console.warn(`[StreamManager] No buffer for channel ${channelId} and message is not 'stream-data'. Ignoring.`, message);
        return;
      }
    }
    switch (message.type) {
      case "stream-data":
        const deserializedChunk = context.serializer.deserialize(message.chunk);
        await buffer.push(deserializedChunk);
        break;
      case "stream-end":
        buffer.finish();
        try {
          await buffer.onDrained();
          await context.sendRawMessage({ type: "stream-ack", channelId });
        } catch (err) {
          if (!(err instanceof BufferClosedError)) {
            console.error(`[StreamManager] Error during drain/ack for channel ${channelId}:`, err);
          }
        }
        break;
      case "stream-abort":
        const reason = new Error(`Stream [${channelId}] aborted by remote: ${JSON.stringify(message.reason)}`);
        this.closeIncoming(channelId, reason);
        break;
      case "stream-tunnel":
        console.warn(`[StreamManager] StreamTunnelMessage should not reach handleIncomingMessage for channel ${channelId}.`);
        break;
    }
  }
  /**
   * Creates a pull-based `ReadableStream` that waits for data from a remote source,
   * linked via a `handshakeId`.
   * @param handshakeId The unique ID to link this reader with an incoming stream.
   * @returns A WHATWG `ReadableStream`.
   */
  createPullReader(handshakeId) {
    const handshake = this.getOrCreateHandshake(handshakeId);
    const { buffer } = handshake;
    const handshakePromise = new Promise((resolve, reject) => {
      handshake.resolve = resolve;
      handshake.reject = reject;
    });
    handshakePromise.then(
      () => this.pendingHandshakes.delete(handshakeId),
      (err) => {
        this.pendingHandshakes.delete(handshakeId);
        buffer.destroy(err);
      }
    ).catch(() => {
    });
    return new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await buffer.pop();
          controller.enqueue(chunk);
        } catch (err) {
          if (err instanceof BufferClosedError) {
            controller.close();
          } else {
            controller.error(err);
          }
        }
      },
      cancel: (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        handshakePromise.then((channelId) => this.closeIncoming(channelId, error)).catch(() => {
        });
        buffer.destroy(error);
        this.pendingHandshakes.get(handshakeId)?.reject(error);
        this.pendingHandshakes.delete(handshakeId);
      }
    });
  }
};

// src/types/errors.ts
var IllegalTypeError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "IllegalTypeError";
    this.cause = cause;
  }
};
var IllegalParameterError = class extends IllegalTypeError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "IllegalParameterError";
  }
};
var IllegalResultError = class extends IllegalTypeError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "IllegalResultError";
  }
};
var ProcedureError = class extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "ProcedureError";
    this.cause = cause;
  }
};

// src/features/error/error.handler.ts
var errorHandler = {
  name: "error_placeholder",
  /**
   * Checks if a value is an `Error` instance but not a more specific
   * `IllegalTypeError` (which is handled by `illegalTypeErrorHandler`).
   */
  canHandle(value) {
    return value instanceof Error && !(value instanceof IllegalTypeError);
  },
  /**
   * Serializes an `Error` object into a JSON-compatible placeholder.
   */
  serialize(value, _context) {
    return {
      _erpc_type: "error_placeholder",
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  },
  /**
   * Deserializes a placeholder back into a standard `Error` instance.
   */
  deserialize(placeholder, _context) {
    const error = new Error(placeholder.message);
    error.name = placeholder.name;
    error.stack = placeholder.stack;
    return error;
  }
};

// src/features/error/illegal-type-error.handler.ts
var illegalTypeErrorHandler = {
  name: "illegal_type_error",
  /**
   * Checks if a value is an instance of `IllegalTypeError`.
   */
  canHandle(value) {
    return value instanceof IllegalTypeError;
  },
  /**
   * Serializes an `IllegalTypeError` object into a JSON-compatible placeholder.
   */
  serialize(value, _context) {
    return {
      _erpc_type: "illegal_type_error",
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  },
  /**
   * Deserializes a placeholder back into an `IllegalTypeError` instance.
   *
   * @remarks This currently reconstructs all errors as the base `IllegalTypeError`.
   * A more advanced implementation could use `placeholder.name` to reconstruct
   * the specific subclass (e.g., `IllegalParameterError`).
   */
  deserialize(placeholder, _context) {
    const error = new IllegalTypeError(placeholder.message);
    error.name = placeholder.name;
    error.stack = placeholder.stack;
    return error;
  }
};

// src/features/error/error.feature.ts
var ErrorHandlingFeature = class {
  contribute() {
    return {};
  }
  /**
   * Initializes the feature by registering its type handlers with the
   * serialization service.
   */
  init(capability) {
    capability.serializer.registerHandler(errorHandler);
    capability.serializer.registerHandler(illegalTypeErrorHandler);
  }
  close() {
  }
};

// src/features/pin/pin.handler.ts
var remoteProxyRegistry = new FinalizationRegistry(
  (heldValue) => {
    const { resourceId, sendRawMessage } = heldValue;
    sendRawMessage({ type: "release", resourceId }).catch((err) => {
      console.error(
        `[erpc gc] Failed to send release message for GC'd resource ${resourceId}:`,
        err
      );
    });
  }
);
function createPinProxy(resourceId, capability) {
  const { trackAsk, sendRawMessage } = capability;
  let isFreed = false;
  const proxy = new Proxy(() => {
  }, {
    get: (_target, prop) => {
      if (prop === PIN_ID_KEY) return resourceId;
      if (prop === "then") return void 0;
      if (prop === PIN_FREE_KEY) {
        return async () => {
          if (isFreed) return;
          isFreed = true;
          remoteProxyRegistry.unregister(proxy);
          await sendRawMessage({ type: "release", resourceId });
        };
      }
      if (typeof prop === "symbol") return void 0;
      if (isFreed) {
        const errorMessage = `[erpc] Cannot access property '${String(prop)}' on a freed pin proxy (id: ${resourceId}).`;
        return () => Promise.reject(new Error(errorMessage));
      }
      return (...args) => {
        const payload = [resourceId, ...args];
        return trackAsk(String(prop), payload, void 0, "pin");
      };
    },
    apply: (_target, _thisArg, args) => {
      if (isFreed) {
        return Promise.reject(new Error(`[erpc] Cannot call a freed pin proxy as a function (id: ${resourceId}).`));
      }
      const payload = [resourceId, ...args];
      return trackAsk("apply", payload, void 0, "pin");
    }
  });
  remoteProxyRegistry.register(
    proxy,
    { resourceId, sendRawMessage },
    // The context for the cleanup callback.
    proxy
    // The unregister token.
  );
  return proxy;
}
function createPinHandler(resourceManager, capability) {
  return {
    name: "pin",
    canHandle(value) {
      return typeof value === "object" && value !== null && value[PIN_REQUEST_KEY];
    },
    serialize(value) {
      const resourceId = resourceManager.pin(value);
      return { _erpc_type: "pin", resourceId };
    },
    deserialize(placeholder) {
      return createPinProxy(placeholder.resourceId, capability);
    }
  };
}

// src/features/pin/pin.feature.ts
var PinFeature = class {
  resourceManager;
  capability;
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
    this.resourceManager.acquire();
  }
  contribute() {
    return { resourceManager: this.resourceManager };
  }
  init(capability) {
    this.capability = capability;
    const pinHandler = createPinHandler(this.resourceManager, capability);
    capability.serializer.registerHandler(pinHandler);
    capability.semanticEmitter.on("release", (message) => {
      this.resourceManager.releaseResource(message.resourceId);
    });
    capability.semanticEmitter.on("pinCall", (message) => {
      this.handlePinCall(message);
    });
  }
  /**
   * Handles an RPC call targeting a locally pinned resource.
   * @param message The incoming RPC request message.
   */
  async handlePinCall(message) {
    const { callId, path: propertyName, input: serializedInput } = message;
    try {
      const { serializer, sendRawMessage } = this.capability;
      const args = serializedInput.map((arg) => serializer.deserialize(arg));
      const [resourceId, ...callArgs] = args;
      const resource = this.resourceManager.get(resourceId);
      if (!resource) {
        throw new Error(`Pinned resource with ID '${resourceId}' not found.`);
      }
      let result;
      if (propertyName === "apply") {
        if (typeof resource !== "function") {
          throw new Error(`Pinned resource with ID '${resourceId}' is not a function.`);
        }
        result = await Promise.resolve(resource(...callArgs));
      } else {
        const target = resource[propertyName];
        if (typeof target === "function") {
          result = await Promise.resolve(target.apply(resource, callArgs));
        } else {
          if (callArgs.length > 1) {
            throw new Error(`Property '${propertyName}' on resource '${resourceId}' is not a function.`);
          }
          if (callArgs.length === 1) {
            resource[propertyName] = callArgs[0];
            result = void 0;
          } else {
            result = target;
          }
        }
      }
      const serializedOutput = serializer.serialize(result);
      await sendRawMessage({ type: "rpc-response", callId, success: true, output: serializedOutput });
    } catch (err) {
      const { serializer, sendRawMessage } = this.capability;
      const serializedError = serializer.serialize(err);
      await sendRawMessage({ type: "rpc-response", callId, success: false, output: serializedError });
    }
  }
  close(contribution, _error) {
    contribution.resourceManager.release();
  }
};

// src/features/tunnel/tunnel-manager.ts
import { v4 as uuid2 } from "uuid";

// src/features/tunnel/proxy-transport.ts
import {
  AsyncEventEmitter
} from "@eleplug/transport";
var ProxyControlChannel = class {
  constructor(sendToHost) {
    this.sendToHost = sendToHost;
  }
  isClosed = false;
  emitter = new AsyncEventEmitter();
  send(message) {
    if (this.isClosed) {
      return Promise.reject(new Error("ProxyControlChannel is closed."));
    }
    return this.sendToHost(message);
  }
  // Enforces a single-listener policy by removing previous listeners.
  _setListener(handler, once) {
    this.emitter.removeAllListeners("message");
    const typedHandler = handler;
    if (once) {
      this.emitter.once("message", typedHandler);
    } else {
      this.emitter.on("message", typedHandler);
    }
  }
  onMessage(handler) {
    this._setListener(handler, false);
  }
  onceMessage(handler) {
    this._setListener(handler, true);
  }
  onClose(handler) {
    this.emitter.on("close", handler);
  }
  async close() {
    this._emitClose();
  }
  /** Delivers an incoming message from the host. Called by `ProxyTransport`. */
  _emitMessage(message) {
    if (this.isClosed) return;
    this.emitter.emit("message", message);
  }
  /** Triggers the closure of this channel. Called by `ProxyTransport`. */
  _emitClose(reason) {
    if (this.isClosed) return;
    this.isClosed = true;
    this.emitter.emit("close", reason);
    this.emitter.removeAllListeners();
  }
};
var ProxyTransport = class {
  constructor(tunnelId, sendControlMessageToHost, openStreamChannelOnHost) {
    this.tunnelId = tunnelId;
    this.sendControlMessageToHost = sendControlMessageToHost;
    this.openStreamChannelOnHost = openStreamChannelOnHost;
    this.controlChannel = new ProxyControlChannel(this.sendControlMessageToHost);
  }
  emitter = new AsyncEventEmitter();
  controlChannel;
  getControlChannel() {
    return Promise.resolve(this.controlChannel);
  }
  openOutgoingStreamChannel() {
    return this.openStreamChannelOnHost();
  }
  onIncomingStreamChannel(handler) {
    this.emitter.on("incomingStream", handler);
  }
  onClose(handler) {
    this.emitter.on("close", handler);
  }
  async close() {
    this._handleClose();
  }
  async abort(reason) {
    this._handleClose(reason);
  }
  /** Called by `TunnelManager` when a message for this tunnel arrives. */
  _handleIncomingMessage(message) {
    this.controlChannel._emitMessage(message);
  }
  /** Called by `TunnelManager` when a stream for this tunnel arrives. */
  _handleIncomingStream(channel) {
    this.emitter.emit("incomingStream", channel);
  }
  /** Called by `TunnelManager` to shut down this proxy transport. */
  _handleClose(reason) {
    this.controlChannel._emitClose(reason);
    this.emitter.emit("close", reason);
    this.emitter.removeAllListeners();
  }
};

// src/features/tunnel/tunnel-manager.ts
var TunnelManager = class {
  bridges = /* @__PURE__ */ new Map();
  proxies = /* @__PURE__ */ new Map();
  hostSend;
  hostOpenStream;
  constructor(capability) {
    this.hostSend = capability.sendRawMessage;
    this.hostOpenStream = capability.openOutgoingStreamChannel;
  }
  /**
   * "Bridges" a local transport, making it accessible to the remote peer.
   * @param localTransport The local `Transport` instance to bridge.
   * @returns The unique `tunnelId` for this new bridge.
   */
  bridgeLocalTransport(localTransport) {
    const tunnelId = uuid2();
    const entry = { transport: localTransport, controlChannel: null, pendingMessages: [] };
    this.bridges.set(tunnelId, entry);
    localTransport.onClose(() => this.cleanupBridge(tunnelId));
    localTransport.getControlChannel().then((channel) => {
      if (!this.bridges.has(tunnelId)) {
        channel.close().catch(() => {
        });
        return;
      }
      entry.controlChannel = channel;
      channel.onClose(() => this.cleanupBridge(tunnelId));
      channel.onMessage((payload) => {
        this.hostSend({ type: "tunnel", tunnelId, payload }).catch((err) => {
          console.error(`[TunnelManager] Failed to forward message from tunnel ${tunnelId}:`, err);
          this.cleanupBridge(tunnelId, err);
        });
      });
      while (entry.pendingMessages.length > 0) {
        channel.send(entry.pendingMessages.shift()).catch((err) => {
          console.error(`[TunnelManager] Error sending queued message to bridged transport ${tunnelId}:`, err);
        });
      }
    }).catch((err) => {
      console.error(`[TunnelManager] Failed to setup control channel for tunnel ${tunnelId}:`, err);
      this.cleanupBridge(tunnelId, err);
    });
    localTransport.onIncomingStreamChannel((localIncomingChannel) => {
      if (this.bridges.has(tunnelId)) {
        this.forwardIncomingStreamFromBridge(tunnelId, localIncomingChannel);
      }
    });
    return tunnelId;
  }
  /**
   * Creates or retrieves a proxy for a remote transport.
   * @param tunnelId The ID of the remote transport.
   * @returns A `ProxyTransport` instance.
   */
  getProxyForRemote(tunnelId) {
    let proxy = this.proxies.get(tunnelId);
    if (!proxy) {
      proxy = new ProxyTransport(
        tunnelId,
        (payload) => this.hostSend({ type: "tunnel", tunnelId, payload }),
        async () => {
          const hostOutgoingChannel = await this.hostOpenStream();
          await hostOutgoingChannel.send({ type: "stream-tunnel", tunnelId, streamId: uuid2(), targetEndpoint: "initiator" });
          return hostOutgoingChannel;
        }
      );
      this.proxies.set(tunnelId, proxy);
    }
    return proxy;
  }
  /**
   * Routes an incoming stream from the host to the correct bridge or proxy.
   * @param hostIncomingChannel The incoming stream channel from the host transport.
   * @param message The handshake message containing routing information.
   */
  async routeIncomingStream(hostIncomingChannel, message) {
    const { tunnelId, targetEndpoint } = message;
    if (targetEndpoint === "initiator") {
      const bridgeEntry = this.bridges.get(tunnelId);
      if (bridgeEntry) {
        const localOutgoingChannel = await bridgeEntry.transport.openOutgoingStreamChannel();
        this.pumpStream(hostIncomingChannel, localOutgoingChannel);
        return;
      }
    }
    if (targetEndpoint === "receiver") {
      const proxy = this.proxies.get(tunnelId);
      if (proxy) {
        proxy._handleIncomingStream(hostIncomingChannel);
        return;
      }
    }
    console.warn(`[TunnelManager] Received stream for unknown tunnel ${tunnelId} or mismatched target ${targetEndpoint}`);
    hostIncomingChannel.close().catch(() => {
    });
  }
  /**
   * Routes an incoming control message from the host to the correct bridge or proxy.
   * @param tunnelId The ID of the target tunnel.
   * @param payload The control message to route.
   */
  routeIncomingMessage(tunnelId, payload) {
    const bridgeEntry = this.bridges.get(tunnelId);
    if (bridgeEntry) {
      if (bridgeEntry.controlChannel) {
        bridgeEntry.controlChannel.send(payload).catch((err) => {
          console.error(`[TunnelManager] Error sending message to bridged transport ${tunnelId}:`, err);
        });
      } else {
        bridgeEntry.pendingMessages.push(payload);
      }
      return;
    }
    const proxy = this.proxies.get(tunnelId);
    if (proxy) {
      proxy._handleIncomingMessage(payload);
      return;
    }
    console.warn(`[TunnelManager] Received message for unknown tunnelId: ${tunnelId}`);
  }
  /** Destroys all bridges and proxies, typically on host connection closure. */
  destroyAll(error) {
    for (const tunnelId of this.bridges.keys()) {
      this.cleanupBridge(tunnelId, error);
    }
    for (const proxy of this.proxies.values()) {
      proxy._handleClose(error);
    }
    this.proxies.clear();
  }
  cleanupBridge(tunnelId, reason) {
    const entry = this.bridges.get(tunnelId);
    if (entry) {
      this.bridges.delete(tunnelId);
      entry.transport.close().catch(() => {
      });
    }
  }
  forwardIncomingStreamFromBridge(tunnelId, localIncomingChannel) {
    const destinationProvider = (async () => {
      const hostOutgoingChannel = await this.hostOpenStream();
      await hostOutgoingChannel.send({ type: "stream-tunnel", tunnelId, streamId: uuid2(), targetEndpoint: "receiver" });
      return hostOutgoingChannel;
    })();
    this.pumpStream(localIncomingChannel, destinationProvider);
  }
  /**
   * Pumps data and close events bidirectionally between two stream channels.
   * @param source The source channel.
   * @param destination The destination channel (or a promise for it).
   */
  async pumpStream(source, destination) {
    try {
      const dest = await destination;
      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        source.close().catch(() => {
        });
        dest.close().catch(() => {
        });
      };
      source.onData(async (message) => {
        if (isCleanedUp) return;
        try {
          await dest.send(message);
        } catch {
          cleanup();
        }
      });
      source.onClose(cleanup);
      dest.onClose(cleanup);
    } catch {
      source.close().catch(() => {
      });
    }
  }
};

// src/features/tunnel/tunnel.handler.ts
function createTunnelHandler(tunnelManager) {
  return {
    name: "transport_tunnel",
    /**
     * Identifies an object as a `Transport` via duck typing.
     */
    canHandle(value) {
      if (typeof value !== "object" || value === null) return false;
      const candidate = value;
      return typeof candidate.getControlChannel === "function" && typeof candidate.openOutgoingStreamChannel === "function" && typeof candidate.onIncomingStreamChannel === "function" && typeof candidate.onClose === "function" && typeof candidate.close === "function" && typeof candidate.abort === "function";
    },
    /**
     * Serializes a local `Transport` by bridging it through the `TunnelManager`.
     */
    serialize(transportToBridge) {
      const tunnelId = tunnelManager.bridgeLocalTransport(transportToBridge);
      return {
        _erpc_type: "transport_tunnel",
        tunnelId
      };
    },
    /**
     * Deserializes a placeholder into a local `ProxyTransport`.
     */
    deserialize(placeholder) {
      return tunnelManager.getProxyForRemote(placeholder.tunnelId);
    }
  };
}

// src/features/tunnel/tunnel.feature.ts
var TunnelFeature = class {
  tunnelManager;
  contribute() {
    return {
      tunnelManager: null,
      // The real instance is created in `init`.
      routeIncomingStream: async (channel, message) => {
        if (!this.tunnelManager) {
          throw new Error("TunnelManager not initialized when routeIncomingStream was called.");
        }
        return this.tunnelManager.routeIncomingStream(channel, message);
      }
    };
  }
  init(capability) {
    this.tunnelManager = new TunnelManager(capability);
    capability.tunnelManager = this.tunnelManager;
    const handler = createTunnelHandler(this.tunnelManager);
    capability.serializer.registerHandler(handler);
    capability.rawEmitter.on("message", (message) => {
      if (message.type === "tunnel") {
        this.tunnelManager.routeIncomingMessage(message.tunnelId, message.payload);
      }
    });
    capability.rawEmitter.on("close", (reason) => {
      this.tunnelManager.destroyAll(reason ?? new Error("Host transport closed."));
    });
  }
  close(_contribution, error) {
    if (this.tunnelManager) {
      this.tunnelManager.destroyAll(error ?? new Error("erpc node is closing."));
    }
  }
};

// src/features/stream/stream.handler.ts
import { v4 as uuid3 } from "uuid";
function isReadableStream(obj) {
  return obj instanceof ReadableStream;
}
function isWritableStream(obj) {
  return obj instanceof WritableStream;
}
function createStreamHandler(capability) {
  return {
    name: ["stream_readable", "stream_writable"],
    canHandle(value) {
      return isReadableStream(value) || isWritableStream(value);
    },
    serialize(stream) {
      const handshakeId = uuid3();
      if (isReadableStream(stream)) {
        const pushWriter = capability.createPushWriter(handshakeId);
        stream.pipeTo(pushWriter).catch((err) => {
          console.error(`[erpc stream handler] Error piping local ReadableStream to PushWriter (handshakeId: ${handshakeId}):`, err);
        });
        return {
          _erpc_type: "stream_readable",
          handshakeId
        };
      }
      if (isWritableStream(stream)) {
        const pullReader = capability.openPullReader(handshakeId);
        pullReader.pipeTo(stream).catch((err) => {
          console.error(`[erpc stream handler] Error piping PullReader to local WritableStream (handshakeId: ${handshakeId}):`, err);
        });
        return {
          _erpc_type: "stream_writable",
          handshakeId
        };
      }
      throw new Error("Invalid object passed to stream handler.");
    },
    deserialize(placeholder) {
      switch (placeholder._erpc_type) {
        // The remote peer sent a readable stream, so we create a reader to receive data.
        case "stream_readable":
          return capability.openPullReader(placeholder.handshakeId);
        // The remote peer sent a writable stream, so we create a writer to send data.
        case "stream_writable":
          return capability.createPushWriter(placeholder.handshakeId);
      }
    }
  };
}

// src/features/stream/stream.feature.ts
var AckManager = class {
  pendingAcks = /* @__PURE__ */ new Map();
  waitForAck(channelId) {
    return new Promise((resolve, reject) => {
      this.pendingAcks.set(channelId, { resolve, reject });
    });
  }
  handleAck(channelId) {
    this.pendingAcks.get(channelId)?.resolve();
    this.pendingAcks.delete(channelId);
  }
  clearAll(error) {
    for (const promise of this.pendingAcks.values()) {
      promise.reject(error);
    }
    this.pendingAcks.clear();
  }
};
var StreamFeature = class {
  streamManager;
  capability;
  ackManager = new AckManager();
  constructor(streamManager) {
    this.streamManager = streamManager;
    this.streamManager.acquire();
  }
  contribute() {
    return {
      streamManager: this.streamManager,
      createPushWriter: this.createPushWriter.bind(this),
      openPullReader: (handshakeId) => this.streamManager.createPullReader(handshakeId)
    };
  }
  init(capability) {
    this.capability = capability;
    capability.rawEmitter.on("incomingStreamChannel", (channel) => {
      const streamProcessingContext = {
        serializer: capability.serializer,
        sendRawMessage: capability.sendRawMessage,
        routeTunneledStream: (chan, msg) => capability.routeIncomingStream(chan, msg)
      };
      this.streamManager.routeIncomingStreamChannel(channel, streamProcessingContext);
    });
    capability.semanticEmitter.on("streamAck", (message) => {
      this.ackManager.handleAck(message.channelId);
    });
    const handlerCapability = { ...capability, ...this.contribute() };
    const streamHandler = createStreamHandler(handlerCapability);
    capability.serializer.registerHandler(streamHandler);
  }
  /**
   * Creates a push-based `WritableStream`. Data written to this stream will be
   * sent to the remote peer over a dedicated stream channel.
   * @param handshakeId A unique ID to link this writer with a remote reader.
   * @returns A WHATWG `WritableStream`.
   */
  createPushWriter(handshakeId) {
    if (!this.capability) {
      throw new Error("StreamFeature is not initialized.");
    }
    let channel = null;
    return new WritableStream({
      write: async (chunk) => {
        const serializedChunk = this.capability.serializer.serialize(chunk);
        if (!channel) {
          channel = await this.capability.openOutgoingStreamChannel();
          await channel.send({ type: "stream-data", chunk: serializedChunk, handshakeId });
        } else {
          await channel.send({ type: "stream-data", chunk: serializedChunk });
        }
      },
      close: async () => {
        if (channel) {
          try {
            await channel.send({ type: "stream-end" });
            await this.ackManager.waitForAck(channel.id);
          } catch (err) {
            console.error(`[StreamFeature] Graceful close failed for channel ${channel?.id}:`, err);
          } finally {
            await channel.close().catch(() => {
            });
          }
        }
      },
      abort: async (reason) => {
        if (channel) {
          try {
            await channel.send({ type: "stream-abort", reason });
          } catch (err) {
          } finally {
            await channel.close().catch(() => {
            });
          }
        }
      }
    });
  }
  close(_contribution, error) {
    this.ackManager.clearAll(error ?? new Error("Operation aborted due to StreamFeature shutdown."));
    this.streamManager.release(error);
  }
};

// src/types/protocol.ts
function isPlaceholder(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "_erpc_type" in value && typeof value._erpc_type === "string";
}

// src/features/serialization/serializer.ts
var Serializer = class {
  handlers;
  handlerMap;
  context;
  constructor(handlers) {
    this.handlers = handlers;
    this.handlerMap = /* @__PURE__ */ new Map();
    this.handlers.forEach((h) => {
      if (Array.isArray(h.name)) {
        h.name.forEach((name) => this.handlerMap.set(name, h));
      } else {
        this.handlerMap.set(h.name, h);
      }
    });
    this.context = {
      serialize: this.serialize.bind(this),
      deserialize: this.deserialize.bind(this)
    };
  }
  /**
   * Serializes a value into a `JsonValue`.
   * @param value The value to serialize.
   * @returns The serialized `JsonValue`.
   */
  serialize(value) {
    return this._serialize(value, /* @__PURE__ */ new WeakMap());
  }
  _serialize(value, seen) {
    if (value === void 0 || value === null) {
      return null;
    }
    for (const handler of this.handlers) {
      if (handler.canHandle(value)) {
        return handler.serialize(value, this.context);
      }
    }
    const type = typeof value;
    if (type !== "object") {
      return value;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    if (seen.has(value)) {
      throw new Error(`Circular reference detected during serialization.`);
    }
    seen.set(value, true);
    let result;
    if (Array.isArray(value)) {
      result = value.map((item) => this._serialize(item, seen));
    } else {
      const obj = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          obj[key] = this._serialize(value[key], seen);
        }
      }
      result = obj;
    }
    seen.delete(value);
    return result;
  }
  /**
   * Deserializes a `JsonValue` back to its original type.
   * @param value The `JsonValue` to deserialize.
   * @returns The deserialized value.
   */
  deserialize(value) {
    if (isPlaceholder(value)) {
      const handler = this.handlerMap.get(value._erpc_type);
      if (handler) {
        return handler.deserialize(value, this.context);
      }
      console.warn(`[erpc serializer] No deserialization handler found for type: ${value._erpc_type}`);
      return value;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.deserialize(item));
    }
    if (value !== null && typeof value === "object") {
      const obj = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          obj[key] = this.deserialize(value[key]);
        }
      }
      return obj;
    }
    return value;
  }
};

// src/features/serialization/serialization.feature.ts
var SerializationFeature = class {
  // A temporary store for handlers registered before the serializer is initialized.
  handlersToRegister = [];
  // The real serializer instance, created during the `init` phase.
  serializerInstance;
  contribute() {
    return {
      serializer: {
        /**
         * A proxy method that delegates to the real serializer once initialized.
         */
        serialize: (value) => {
          if (!this.serializerInstance) {
            throw new Error("SerializationFeature not initialized. Cannot call 'serialize'.");
          }
          return this.serializerInstance.serialize(value);
        },
        deserialize: (value) => {
          if (!this.serializerInstance) {
            throw new Error("SerializationFeature not initialized. Cannot call 'deserialize'.");
          }
          return this.serializerInstance.deserialize(value);
        },
        /**
         * This method can be safely called by other features during their `init` phase.
         * It collects handlers to be used when the real serializer is created.
         */
        registerHandler: (handler) => {
          this.handlersToRegister.push(handler);
        }
      }
    };
  }
  /**
   * Initializes the feature by creating the `Serializer` instance.
   * At this point, all other features have had a chance to register their
   * `TypeHandler`s via the contributed `registerHandler` method.
   */
  init(_capability) {
    this.serializerInstance = new Serializer(this.handlersToRegister);
  }
  close(_contribution, _error) {
  }
};

// src/features/protocol/protocol.handler.feature.ts
import { AsyncEventEmitter as AsyncEventEmitter2 } from "@eleplug/transport";
var ProtocolHandlerFeature = class {
  semanticEmitter = new AsyncEventEmitter2();
  contribute() {
    return {
      semanticEmitter: this.semanticEmitter
    };
  }
  init(capability) {
    capability.rawEmitter.on("message", (message) => {
      this.processMessage(message);
    });
  }
  /**
   * Parses a raw `JsonValue`, validates it as a `ControlMessage`, and emits
   * a corresponding semantic event based on its `type` and `kind`.
   * @param message The raw, un-parsed `JsonValue` from the transport.
   */
  processMessage(message) {
    if (typeof message !== "object" || message === null || !("type" in message) || typeof message.type !== "string") {
      console.error(`[erpc protocol] Received malformed message without a 'type' property:`, message);
      return;
    }
    try {
      const typedMessage = message;
      switch (typedMessage.type) {
        case "rpc-request":
          if (typedMessage.kind === "pin") {
            this.semanticEmitter.emit("pinCall", typedMessage);
          } else {
            this.semanticEmitter.emit("ask", typedMessage);
          }
          break;
        case "rpc-response":
          this.semanticEmitter.emit("response", typedMessage);
          break;
        case "notify":
          this.semanticEmitter.emit("tell", typedMessage);
          break;
        case "release":
          this.semanticEmitter.emit("release", typedMessage);
          break;
        case "stream-ack":
          this.semanticEmitter.emit("streamAck", typedMessage);
          break;
        case "tunnel":
          this.semanticEmitter.emit("tunnel", typedMessage);
          break;
      }
    } catch (error) {
      console.error(`[erpc protocol] Error processing message:`, error, message);
    }
  }
  close(contribution) {
    contribution.semanticEmitter.removeAllListeners();
  }
};

// src/features/call/call-manager.feature.ts
import { v4 as uuid4 } from "uuid";

// src/api/client.ts
function createProxy(handler, path = [], meta) {
  const proxy = new Proxy(() => {
  }, {
    get: (_target, prop) => {
      if (prop === "then") return void 0;
      if (typeof prop === "symbol") return void 0;
      return createProxy(handler, [...path, prop], meta);
    },
    apply: (_target, _thisArg, args) => {
      return handler(path, args, meta);
    }
  });
  return proxy;
}
function buildClient(callProcedure) {
  const handler = (path, args, meta) => {
    const action = path.at(-1);
    const procedurePathSegments = path.slice(0, -1);
    const procedurePathString = procedurePathSegments.join(".");
    switch (action) {
      // Standard procedure calls.
      case "ask":
        return callProcedure(procedurePathString, action, args, meta);
      case "tell":
        return callProcedure(procedurePathString, action, args, meta);
      // Metadata attachment.
      case "meta":
        const newMetas = args;
        const existingMeta = Array.isArray(meta) ? meta : [];
        const newMetaArray = [...existingMeta, ...newMetas];
        return createProxy(handler, procedurePathSegments, newMetaArray);
      // Dynamic invocation.
      case "invoke":
        const [subPath, invokeAction, ...procedureArgs] = args;
        if (typeof subPath !== "string" || !["ask", "tell"].includes(invokeAction)) {
          return Promise.reject(new Error(
            `Invalid .invoke() usage on path '${procedurePathString}'. Expected: .invoke('procedure.path', 'ask' | 'tell', ...args)`
          ));
        }
        const fullPath = procedurePathString ? `${procedurePathString}.${subPath}` : subPath;
        return callProcedure(fullPath, invokeAction, procedureArgs, meta);
      // Invalid termination of a call chain.
      default:
        const fullInvalidPath = path.join(".");
        return Promise.reject(new Error(
          `Invalid RPC call on path '${fullInvalidPath}'. A procedure path must be terminated with .ask(...), .tell(...), or manipulated with .meta(...) / .invoke(...).`
        ));
    }
  };
  return createProxy(handler, [], void 0);
}

// src/features/call/call-manager.feature.ts
var CallManagerFeature = class {
  pending = /* @__PURE__ */ new Map();
  isDestroyed = false;
  capability;
  contribute() {
    const client = buildClient(this.callProcedure.bind(this));
    return {
      procedure: client,
      trackAsk: this.trackAsk.bind(this),
      sendTell: this.sendTell.bind(this)
    };
  }
  init(capability) {
    this.capability = capability;
    capability.semanticEmitter.on("response", (message) => {
      this.handleResponse(message);
    });
    capability.rawEmitter.on("close", (error) => {
      this.handleClose(error);
    });
  }
  /**
   * The callback provided to `buildClient`, routing proxy calls to the appropriate sender method.
   */
  callProcedure(path, action, args, meta) {
    if (this.isDestroyed) {
      return Promise.reject(new ProcedureError("Connection is closed, cannot make new calls."));
    }
    return action === "tell" ? this.sendTell(path, args, meta) : this.trackAsk(path, args, meta);
  }
  trackAsk(path, args, meta, kind = "erpc") {
    if (this.isDestroyed) {
      return Promise.reject(new ProcedureError("Client is closed; cannot make new RPC calls."));
    }
    const callId = uuid4();
    const { serializer, sendRawMessage } = this.capability;
    const request = {
      type: "rpc-request",
      kind,
      callId,
      path,
      input: args.map((arg) => serializer.serialize(arg)),
      meta
    };
    const promise = new Promise((resolve, reject) => {
      this.pending.set(callId, { resolve, reject });
    });
    sendRawMessage(request).catch((err) => {
      const pendingPromise = this.pending.get(callId);
      if (pendingPromise) {
        pendingPromise.reject(new ProcedureError("Failed to send RPC request.", err));
        this.pending.delete(callId);
      }
    });
    return promise;
  }
  sendTell(path, args, meta) {
    const { serializer, sendRawMessage } = this.capability;
    const message = {
      type: "notify",
      path,
      input: args.map((arg) => serializer.serialize(arg)),
      meta
    };
    return sendRawMessage(message);
  }
  /**
   * Handles an incoming `RpcResponseMessage`.
   */
  handleResponse(message) {
    const promise = this.pending.get(message.callId);
    if (promise) {
      this.pending.delete(message.callId);
      const deserializedOutput = this.capability.serializer.deserialize(message.output);
      if (message.success) {
        promise.resolve(deserializedOutput);
      } else {
        const remoteError = deserializedOutput instanceof Error ? deserializedOutput : new Error(String(deserializedOutput));
        promise.reject(new ProcedureError(remoteError.message, remoteError));
      }
    }
  }
  /**
   * Cleans up all pending calls when the connection is terminated.
   */
  handleClose(error) {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    const destructionError = new ProcedureError("Connection closed, pending call aborted.", error);
    for (const promise of this.pending.values()) {
      promise.reject(destructionError);
    }
    this.pending.clear();
  }
  close(_contribution, error) {
    this.handleClose(error);
  }
};

// src/utils/trie.ts
var TrieNode = class {
  /**
   * Child nodes, keyed by the path segment. A Map is used for clean key handling.
   */
  children = /* @__PURE__ */ new Map();
  /**
   * The value stored at this node. A non-null value indicates that this node
   * represents the end of a valid, registered path.
   */
  value = null;
};
var Trie = class _Trie {
  static DELIMITER = ".";
  root = new TrieNode();
  /**
   * Inserts a value into the Trie associated with a given path.
   * @param path The path string, e.g., "posts.comments.create". An empty string
   * targets the root.
   * @param value The value to store at the end of the path.
   */
  insert(path, value) {
    let node = this.root;
    if (path === "") {
      node.value = value;
      return;
    }
    const segments = path.split(_Trie.DELIMITER);
    for (const segment of segments) {
      if (!node.children.has(segment)) {
        node.children.set(segment, new TrieNode());
      }
      node = node.children.get(segment);
    }
    node.value = value;
  }
  /**
   * Finds the value associated with the longest possible prefix of the given path.
   *
   * This is crucial for dynamic routing. For example, if the Trie contains a
   * dynamic procedure at "posts.dynamic" and the input path is
   * "posts.dynamic.123.author", this method will return the procedure
   * and the remaining relative path `['123', 'author']`.
   *
   * @param path The full path to search for a matching prefix.
   * @returns An object with the found value and the relative path, or `undefined` if no prefix matches.
   */
  findLongestPrefix(path) {
    let node = this.root;
    const segments = path === "" ? [] : path.split(_Trie.DELIMITER);
    let lastFound = void 0;
    if (this.root.value !== null) {
      lastFound = { value: this.root.value, index: 0 };
    }
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const childNode = node.children.get(segment);
      if (childNode) {
        node = childNode;
        if (node.value !== null) {
          lastFound = { value: node.value, index: i + 1 };
        }
      } else {
        break;
      }
    }
    if (lastFound) {
      return {
        value: lastFound.value,
        // The relative path is the part of the input path that comes after the matched prefix.
        relativePath: segments.slice(lastFound.index)
      };
    }
    return void 0;
  }
};

// src/types/common.ts
function mark() {
  return {};
}

// src/api/procedure.ts
var __procedure_brand = Symbol("__procedure_brand");
function createAskProcedure(handler, middlewares = []) {
  return {
    [__procedure_brand]: void 0,
    context: mark(),
    input: mark(),
    output: mark(),
    middlewares,
    type: "ask",
    _handler: handler
  };
}
function createTellProcedure(handler, middlewares = []) {
  return {
    [__procedure_brand]: void 0,
    context: mark(),
    input: mark(),
    output: mark(),
    middlewares,
    type: "tell",
    _handler: handler
  };
}
function createDynamicProcedure(handler, middlewares = []) {
  return {
    [__procedure_brand]: void 0,
    context: mark(),
    input: mark(),
    output: mark(),
    middlewares,
    type: "dynamic",
    _handler: handler
  };
}

// src/api/router.ts
async function executeMiddlewareChain(options) {
  const { middlewares, env, path, type, input, finalHandler } = options;
  const dispatch = async (index, currentOpts) => {
    if (index >= middlewares.length) {
      const finalEnv = { ...env, ctx: currentOpts.ctx, meta: currentOpts.meta };
      return finalHandler(finalEnv, currentOpts.input);
    }
    const middleware2 = middlewares[index];
    const next = (nextPartialOpts) => {
      const newOpts = { ...currentOpts, ...nextPartialOpts };
      return dispatch(index + 1, newOpts);
    };
    const middlewareEnv = { ...env, ...currentOpts };
    return middleware2.handler({ ...middlewareEnv, path, type, next });
  };
  return dispatch(0, { ctx: env.ctx, meta: env.meta, input });
}
function isProcedure(api) {
  return __procedure_brand in api;
}
function createProcedureHandlers(api) {
  const staticProcedureMap = /* @__PURE__ */ new Map();
  const dynamicProcedureTrie = new Trie();
  const buildProcedureMaps = (currentApi, prefix = "") => {
    if (isProcedure(currentApi)) {
      if (currentApi.type === "dynamic") {
        dynamicProcedureTrie.insert(prefix, currentApi);
      } else {
        staticProcedureMap.set(prefix, currentApi);
      }
    } else {
      for (const key in currentApi) {
        if (Object.prototype.hasOwnProperty.call(currentApi, key)) {
          const prop = currentApi[key];
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          buildProcedureMaps(prop, newPrefix);
        }
      }
    }
  };
  buildProcedureMaps(api);
  const findProcedure = (path) => {
    const staticProc = staticProcedureMap.get(path);
    if (staticProc) return { procedure: staticProc };
    const dynamicMatch = dynamicProcedureTrie.findLongestPrefix(path);
    if (dynamicMatch) return { procedure: dynamicMatch.value, relativePath: dynamicMatch.relativePath };
    return void 0;
  };
  const execute = async (env, path, input, type) => {
    const found = findProcedure(path);
    if (!found) {
      const error = new Error(`Procedure '${path}' not found.`);
      if (type === "ask") return { success: false, error };
      console.error(`[erpc executor] Fire-and-forget procedure '${path}' not found. Request ignored.`);
      return;
    }
    const { procedure, relativePath } = found;
    try {
      const result = await executeMiddlewareChain({
        middlewares: procedure.middlewares,
        env,
        path,
        type,
        input,
        finalHandler: (finalEnv, finalInput) => {
          switch (procedure.type) {
            case "dynamic":
              return procedure._handler(finalEnv, relativePath, finalInput, type);
            case "ask":
              return procedure._handler(finalEnv, ...finalInput);
            case "tell":
              return procedure._handler(finalEnv, ...finalInput);
          }
        }
      });
      if (type === "ask") {
        return { success: true, data: result };
      }
      return;
    } catch (error) {
      if (type === "ask") {
        return { success: false, error };
      } else {
        console.error(`[erpc server] Error in fire-and-forget procedure '${path}':`, error);
        return;
      }
    }
  };
  return {
    handleAsk: (env, path, input) => execute(env, path, input, "ask"),
    handleTell: async (env, path, input) => {
      await execute(env, path, input, "tell");
    }
  };
}

// src/features/call/call-executor.feature.ts
var CallExecutorFeature = class {
  handlers;
  /**
   * @param api The user-defined API router. The handlers are pre-built here for efficient execution.
   */
  constructor(api) {
    this.handlers = createProcedureHandlers(api);
  }
  contribute() {
    return {};
  }
  init(capability) {
    const { semanticEmitter, serializer, sendRawMessage, isClosing } = capability;
    semanticEmitter.on("ask", async (message) => {
      const deserializedInput = message.input.map((i) => serializer.deserialize(i));
      const meta = message.meta ? serializer.deserialize(message.meta) : void 0;
      const env = { ctx: void 0, meta, isClosing };
      const result = await this.handlers.handleAsk(env, message.path, deserializedInput);
      if (result) {
        const serializedOutput = serializer.serialize(result.success ? result.data : result.error);
        await sendRawMessage({
          type: "rpc-response",
          callId: message.callId,
          success: result.success,
          output: serializedOutput
        });
      }
    });
    semanticEmitter.on("tell", (message) => {
      const deserializedInput = message.input.map((i) => serializer.deserialize(i));
      const meta = message.meta ? serializer.deserialize(message.meta) : void 0;
      const env = { ctx: void 0, meta, isClosing };
      this.handlers.handleTell(env, message.path, deserializedInput);
    });
  }
  close() {
  }
};

// src/features/transport/transport.adapter.feature.ts
import { AsyncEventEmitter as AsyncEventEmitter3 } from "@eleplug/transport";
var TransportAdapterFeature = class {
  transport;
  rawEmitter = new AsyncEventEmitter3();
  controlChannel;
  closing = false;
  constructor(transport) {
    this.transport = transport;
  }
  contribute() {
    return {
      rawEmitter: this.rawEmitter,
      sendRawMessage: this.sendRawMessage.bind(this),
      openOutgoingStreamChannel: this.openOutgoingStreamChannel.bind(this)
    };
  }
  async init(_capability) {
    this.controlChannel = await this.transport.getControlChannel();
    this.controlChannel.onMessage((message) => {
      this.rawEmitter.emit("message", message);
    });
    this.transport.onIncomingStreamChannel((channel) => {
      this.rawEmitter.emit("incomingStreamChannel", channel);
    });
    this.transport.onClose((reason) => {
      this.handleClose(reason);
    });
  }
  /**
   * Handles the transport closure event, ensuring it's processed only once.
   * This prevents race conditions if multiple close signals are received.
   * @param reason The optional error that caused the closure.
   */
  handleClose(reason) {
    if (this.closing) return;
    this.closing = true;
    this.rawEmitter.emit("close", reason);
  }
  async sendRawMessage(message) {
    if (this.closing) {
      throw new Error("Transport is closing; cannot send message.");
    }
    if (!this.controlChannel) {
      throw new Error("Transport not ready, control channel is not available.");
    }
    await this.controlChannel.send(message);
  }
  async openOutgoingStreamChannel() {
    if (this.closing) {
      throw new Error("Transport is closing; cannot open a new stream channel.");
    }
    return this.transport.openOutgoingStreamChannel();
  }
  close(_contribution, error) {
    this.handleClose(error);
    this.rawEmitter.removeAllListeners();
    this.transport.close().catch(() => {
    });
  }
};

// src/features/lifecycle/lifecycle.feature.ts
var LifecycleFeature = class {
  _isClosing = false;
  contribute() {
    return {
      isClosing: () => this._isClosing
    };
  }
  init(capability) {
    capability.rawEmitter.on("close", () => {
      this._isClosing = true;
    });
  }
  /**
   * When the erpc node's top-level `close()` method is called, this lifecycle
   * hook is triggered, marking the node as closing.
   */
  close(_contribution, _error) {
    this._isClosing = true;
  }
};

// src/api/middleware.ts
function middleware(handler) {
  return {
    def: mark(),
    handler
  };
}

// src/api/init.ts
var ErpcInstanceBuilder = class _ErpcInstanceBuilder {
  _middlewares;
  constructor(middlewares = []) {
    this._middlewares = middlewares;
  }
  use(middleware2) {
    return new _ErpcInstanceBuilder([
      ...this._middlewares,
      middleware2
    ]);
  }
  create() {
    const procedure = (middlewares) => {
      return {
        use(middleware2) {
          return procedure([...middlewares, middleware2]);
        },
        input(...schemas) {
          const validationMiddleware = middleware((opts) => {
            const { input, next } = opts;
            try {
              if (schemas.length !== input.length) {
                throw new Error(`Expected ${schemas.length} arguments, but received ${input.length}.`);
              }
              const parsedInput = schemas.map((schema, i) => schema.parse(input[i]));
              return next({ ...opts, input: parsedInput });
            } catch (error) {
              throw new IllegalParameterError(`Input validation failed: ${error.message}`, error);
            }
          });
          return this.use(validationMiddleware);
        },
        output(schema) {
          const validationMiddleware = middleware(async (opts) => {
            const result = await opts.next();
            try {
              return schema.parse(result);
            } catch (error) {
              throw new IllegalResultError(`Output validation failed: ${error.message}`, error);
            }
          });
          return this.use(validationMiddleware);
        },
        ask(handler) {
          return createAskProcedure(handler, middlewares);
        },
        tell(handler) {
          return createTellProcedure(handler, middlewares);
        },
        dynamic(handler) {
          return createDynamicProcedure(handler, middlewares);
        }
      };
    };
    const instance = {
      procedure: procedure(this._middlewares),
      // The router is a simple identity function for type-safe grouping.
      router: (route) => route
    };
    return instance;
  }
};
function createInit() {
  return {
    /**
     * Creates a new erpc instance with a default `void` context.
     * This is the starting point for defining any eRPC API.
     *
     * @template TInput The default input type for procedures, defaults to `TransferableArray`.
     * @template TOutput The default output type for procedures, defaults to `Transferable`.
     */
    create() {
      return new ErpcInstanceBuilder().create();
    }
  };
}
var initERPC = createInit();

// src/index.ts
async function createServer(transport, api) {
  const resourceManager = new ResourceManager();
  const streamManager = new StreamManager();
  const features = [
    new ErrorHandlingFeature(),
    new PinFeature(resourceManager),
    new TunnelFeature(),
    new StreamFeature(streamManager),
    new SerializationFeature(),
    new ProtocolHandlerFeature(),
    new CallManagerFeature(),
    new CallExecutorFeature(api),
    new TransportAdapterFeature(transport),
    new LifecycleFeature()
  ];
  const node = await buildFeatures(features);
  return {
    ...node.capability,
    close: node.close
  };
}
async function createClient(transport) {
  const resourceManager = new ResourceManager();
  const streamManager = new StreamManager();
  const features = [
    new ErrorHandlingFeature(),
    new PinFeature(resourceManager),
    new TunnelFeature(),
    new StreamFeature(streamManager),
    new SerializationFeature(),
    new ProtocolHandlerFeature(),
    new CallManagerFeature(),
    new TransportAdapterFeature(transport),
    new LifecycleFeature()
  ];
  const node = await buildFeatures(features);
  return {
    ...node.capability,
    procedure: node.capability.procedure,
    close: node.close
  };
}
async function createPeer(transport, api) {
  const server = await createServer(transport, api);
  return {
    ...server,
    procedure: server.procedure
  };
}
export {
  CallExecutorFeature,
  CallManagerFeature,
  ErrorHandlingFeature,
  IllegalParameterError,
  IllegalResultError,
  IllegalTypeError,
  LifecycleFeature,
  PIN_FREE_KEY,
  PIN_ID_KEY,
  PIN_REQUEST_KEY,
  PinFeature,
  ProcedureError,
  ProtocolHandlerFeature,
  ResourceManager,
  SerializationFeature,
  Serializer,
  StreamFeature,
  StreamManager,
  TransportAdapterFeature,
  TunnelFeature,
  buildClient,
  buildFeatures,
  createClient,
  createPeer,
  createPinHandler,
  createProcedureHandlers,
  createServer,
  createStreamHandler,
  errorHandler,
  free,
  illegalTypeErrorHandler,
  initERPC,
  isPlaceholder,
  middleware,
  pin
};
