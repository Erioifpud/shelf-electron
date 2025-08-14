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
  MemoryConnector: () => MemoryConnector
});
module.exports = __toCommonJS(index_exports);

// src/link.ts
var import_transport = require("@eleplug/transport");
var MemoryLink = class {
  events = new import_transport.AsyncEventEmitter();
  _isClosed = false;
  remote;
  /** Links this instance to its remote peer. */
  _link(remote) {
    this.remote = remote;
  }
  /** Receives a message from the linked peer. */
  _receiveMessage(message) {
    if (this._isClosed) return;
    this.events.emitAsync("message", message).catch((err) => {
      this._destroy(err instanceof Error ? err : new Error(String(err)));
    });
  }
  /** Central, idempotent cleanup logic for the link. */
  _destroy(reason) {
    if (this._isClosed) return;
    this._isClosed = true;
    this.events.emit("close", reason);
    this.events.removeAllListeners();
  }
  onMessage(handler) {
    if (this._isClosed) return;
    const existing = this.events.listeners("message")[0];
    if (existing) this.events.off("message", existing);
    this.events.on("message", handler);
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  sendMessage(message) {
    if (this._isClosed) {
      return Promise.reject(new Error("Link is closed."));
    }
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._receiveMessage(message);
      }
    });
    return Promise.resolve();
  }
  abort(reason) {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._destroy(reason);
      }
      this._destroy(reason);
    });
    return Promise.resolve();
  }
  close() {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._destroy();
      }
      this._destroy();
    });
    return Promise.resolve();
  }
};
var MemoryConnector = class {
  /** The `Link` instance representing the client side of the connection. */
  client;
  /** The `Link` instance representing the server side of the connection. */
  server;
  constructor() {
    const clientLink = new MemoryLink();
    const serverLink = new MemoryLink();
    clientLink._link(serverLink);
    serverLink._link(clientLink);
    this.client = clientLink;
    this.server = serverLink;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MemoryConnector
});
