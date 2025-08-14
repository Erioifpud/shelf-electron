"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/render.ts
var render_exports = {};
__export(render_exports, {
  IpcRendererLink: () => IpcRendererLink
});
module.exports = __toCommonJS(render_exports);

// src/transport/ipc-renderer-link.ts
var import_mimic = __toESM(require("@eleplug/mimic"));
var import_transport = require("@eleplug/transport");
var IpcRendererLink = class {
  /**
   * @param ipc The `IpcShape` adapter, created by `createAdapter` from the
   *            preload script, which provides namespaced communication methods.
   */
  constructor(ipc) {
    this.ipc = ipc;
    this.messageListener = (_event, message) => {
      this.events.emit("message", import_mimic.default.parse(message));
    };
    this.ipc.on(this.messageListener);
  }
  events = new import_transport.AsyncEventEmitter();
  isClosed = false;
  // A reference to the listener function for proper removal.
  messageListener;
  onMessage(handler) {
    this.events.on("message", handler);
  }
  sendMessage(packet) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link is closed.`));
    }
    this.ipc.send(import_mimic.default.stringify(packet));
    return Promise.resolve();
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    return this.internalClose();
  }
  abort(reason) {
    return this.internalClose(reason);
  }
  internalClose(reason) {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;
    this.ipc.off(this.messageListener);
    this.events.emit("close", reason);
    this.events.removeAllListeners();
    return Promise.resolve();
  }
};

// src/render.ts
__reExport(render_exports, require("@eleplug/anvil"), module.exports);
__reExport(render_exports, require("@eleplug/ebus"), module.exports);
__reExport(render_exports, require("@eleplug/erpc"), module.exports);
__reExport(render_exports, require("@eleplug/esys"), module.exports);
__reExport(render_exports, require("@eleplug/muxen"), module.exports);
__reExport(render_exports, require("@eleplug/transport"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IpcRendererLink,
  ...require("@eleplug/anvil"),
  ...require("@eleplug/ebus"),
  ...require("@eleplug/erpc"),
  ...require("@eleplug/esys"),
  ...require("@eleplug/muxen"),
  ...require("@eleplug/transport")
});
