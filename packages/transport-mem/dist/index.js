"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MemoryConnector: () => MemoryConnector,
  MemoryTransport: () => MemoryTransport
});
module.exports = __toCommonJS(index_exports);

// src/transport.ts
var import_uuid = require("uuid");
var import_transport = require("@eleplug/transport");
var MemoryControlChannel = class {
  constructor(remote) {
    this.remote = remote;
  }
  events = new import_transport.AsyncEventEmitter();
  isClosed = false;
  messageQueue = [];
  hasListener = false;
  send(message) {
    if (this.isClosed) {
      return Promise.reject(new Error("Control channel is closed."));
    }
    queueMicrotask(() => this.remote._receiveControlMessage(message));
    return Promise.resolve();
  }
  /**
   * Called by the remote transport to deliver a message. If a listener is
   * present, the message is emitted; otherwise, it's queued.
   * @internal
   */
  _receiveMessage(message) {
    if (this.isClosed) return;
    if (this.hasListener) {
      this.events.emitAsync("message", message).catch((err) => {
        this._destroy(err instanceof Error ? err : new Error(String(err)));
      });
    } else {
      this.messageQueue.push(message);
    }
  }
  /**
   * Sets the message handler, enforcing replacement semantics and flushing
   * the message queue.
   * @internal
   */
  _setListener(handler, once) {
    this.events.removeAllListeners("message");
    const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
    eventHandler("message", handler);
    this.hasListener = true;
    if (this.messageQueue.length > 0) {
      const queue = this.messageQueue;
      this.messageQueue = [];
      queue.forEach((msg) => this._receiveMessage(msg));
    }
  }
  onMessage(handler) {
    this._setListener(handler, false);
  }
  onceMessage(handler) {
    this._setListener(handler, true);
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    this._destroy();
    return Promise.resolve();
  }
  /**
   * Central, idempotent cleanup logic for the channel.
   * @internal
   */
  _destroy(reason) {
    if (this.isClosed) return;
    this.isClosed = true;
    this.messageQueue = [];
    queueMicrotask(() => this.events.emitAsync("close", reason));
  }
};
var MemoryStreamChannel = class {
  constructor(id, remote) {
    this.id = id;
    this.remote = remote;
    this.isReadyPromise = new Promise((resolve) => {
      this.resolveIsReady = resolve;
    });
  }
  events = new import_transport.AsyncEventEmitter();
  isClosed = false;
  /** A promise that resolves when the remote peer calls `onData`. */
  isReadyPromise;
  resolveIsReady;
  hasListener = false;
  /** Links this channel to its remote counterpart's transport. @internal */
  _setRemote(remote) {
    this.remote = remote;
  }
  /**
   * Sends a stream message, applying back-pressure by waiting until the
   * remote peer signals readiness (by calling `onData`).
   */
  async send(message) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Stream channel ${this.id} is closed.`));
    }
    if (!this.remote) {
      return Promise.reject(new Error(`Stream channel ${this.id} is not linked.`));
    }
    await this.remote._getStreamChannelReadyPromise(this.id);
    if (this.isClosed) {
      throw new Error(`Stream channel ${this.id} closed while waiting for ready signal.`);
    }
    queueMicrotask(() => this.remote._receiveStreamMessage(this.id, message));
  }
  /** Called by the remote transport to deliver data. @internal */
  _receiveData(message) {
    if (this.isClosed) return;
    this.events.emitAsync("data", message).catch((err) => this._destroy(err));
  }
  /** Sets the data handler and manages the back-pressure signal. @internal */
  _setListener(handler, once) {
    this.events.removeAllListeners("data");
    const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
    eventHandler("data", handler);
    if (!this.hasListener) {
      this.hasListener = true;
      this.resolveIsReady();
    }
  }
  onData(handler) {
    this._setListener(handler, false);
  }
  onceData(handler) {
    this._setListener(handler, true);
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    this._destroy();
    return Promise.resolve();
  }
  /** Central, idempotent cleanup logic for the stream channel. @internal */
  _destroy(reason) {
    if (this.isClosed) return;
    this.isClosed = true;
    if (!this.hasListener) {
      this.resolveIsReady();
    }
    if (this.remote) {
      this.remote._closeStreamChannel(this.id, reason);
    }
    queueMicrotask(() => this.events.emitAsync("close", reason));
  }
};
var MemoryTransport = class {
  events = new import_transport.AsyncEventEmitter();
  remoteTransport;
  _isClosed = false;
  controlChannel = null;
  controlChannelPromise = null;
  streamChannels = /* @__PURE__ */ new Map();
  /** Links this transport to its peer. @internal */
  _link(remote) {
    this.remoteTransport = remote;
  }
  /** Receives an incoming control message from the linked peer. @internal */
  _receiveControlMessage(message) {
    if (this._isClosed) return;
    if (!this.controlChannel) {
      this.controlChannel = new MemoryControlChannel(this.remoteTransport);
      this.events.emit("_internalControlChannel", this.controlChannel);
    }
    this.controlChannel._receiveMessage(message);
  }
  /** Receives an incoming stream message from the linked peer. @internal */
  _receiveStreamMessage(channelId, message) {
    if (this._isClosed) return;
    const channel = this._getOrCreateStreamChannel(channelId);
    channel._receiveData(message);
  }
  /**
   * Used by a remote channel to await this side's readiness signal.
   * @internal
   */
  _getStreamChannelReadyPromise(channelId) {
    return this._getOrCreateStreamChannel(channelId)["isReadyPromise"];
  }
  /** Lazily creates an incoming stream channel upon first message. @internal */
  _getOrCreateStreamChannel(channelId) {
    let channel = this.streamChannels.get(channelId);
    if (!channel) {
      channel = new MemoryStreamChannel(channelId);
      this.streamChannels.set(channelId, channel);
      this.events.emit("incomingStreamChannel", channel);
    }
    return channel;
  }
  /** Closes a stream channel when signaled by the remote peer. @internal */
  _closeStreamChannel(channelId, reason) {
    const channel = this.streamChannels.get(channelId);
    if (channel && !channel.isClosed) {
      channel._destroy(reason);
    }
    this.streamChannels.delete(channelId);
  }
  /** Central, idempotent cleanup logic for the transport. @internal */
  _destroy(reason) {
    if (this._isClosed) return;
    this._isClosed = true;
    const channelsToClose = /* @__PURE__ */ new Set([
      this.controlChannel,
      ...this.streamChannels.values()
    ]);
    channelsToClose.forEach((ch) => ch?._destroy(reason));
    this.streamChannels.clear();
    this.controlChannel = null;
    this.controlChannelPromise = null;
    this.events.emit("close", reason);
    this.events.removeAllListeners();
  }
  getControlChannel() {
    if (this._isClosed)
      return Promise.reject(new Error("Transport is closed."));
    if (this.controlChannel) return Promise.resolve(this.controlChannel);
    if (this.controlChannelPromise) return this.controlChannelPromise;
    this.controlChannelPromise = new Promise((resolve) => {
      this.events.once("_internalControlChannel", resolve);
      if (!this.controlChannel) {
        const newChannel = new MemoryControlChannel(this.remoteTransport);
        this.controlChannel = newChannel;
        resolve(newChannel);
      }
    });
    return this.controlChannelPromise;
  }
  openOutgoingStreamChannel() {
    if (this._isClosed)
      return Promise.reject(new Error("Transport is closed."));
    const channelId = (0, import_uuid.v4)();
    const channel = new MemoryStreamChannel(channelId, this.remoteTransport);
    this.streamChannels.set(channelId, channel);
    this.remoteTransport._getOrCreateStreamChannel(channelId)._setRemote(this);
    return Promise.resolve(channel);
  }
  onIncomingStreamChannel(handler) {
    this.events.on("incomingStreamChannel", handler);
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  abort(reason) {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remoteTransport._isClosed) {
        this.remoteTransport._destroy(reason);
      }
      this._destroy(reason);
    });
    return Promise.resolve();
  }
  close() {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remoteTransport._isClosed) {
        this.remoteTransport._destroy();
      }
      this._destroy();
    });
    return Promise.resolve();
  }
};
var MemoryConnector = class {
  client;
  server;
  constructor() {
    const clientTransport = new MemoryTransport();
    const serverTransport = new MemoryTransport();
    clientTransport._link(serverTransport);
    serverTransport._link(clientTransport);
    this.client = clientTransport;
    this.server = serverTransport;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MemoryConnector,
  MemoryTransport
});
