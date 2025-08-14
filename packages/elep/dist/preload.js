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

// src/preload.ts
var preload_exports = {};
__export(preload_exports, {
  createAdapter: () => createAdapter
});
module.exports = __toCommonJS(preload_exports);

// src/transport/ipc-adapter.ts
function createAdapter(channel, ipcRenderer) {
  return {
    send: (data) => {
      ipcRenderer.send(channel, data);
    },
    on: (callback) => {
      ipcRenderer.on(channel, callback);
    },
    off: (callback) => {
      ipcRenderer.off(channel, callback);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAdapter
});
