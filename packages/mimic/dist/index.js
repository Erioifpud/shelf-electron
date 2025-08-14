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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_superjson = __toESM(require("superjson"));
var import_base64_js = require("base64-js");
import_superjson.default.registerCustom(
  {
    isApplicable: (v) => v instanceof Uint8Array,
    serialize: (v) => (0, import_base64_js.fromByteArray)(v),
    deserialize: (v) => (0, import_base64_js.toByteArray)(v)
  },
  "uint8array"
);
var index_default = {
  /** See `superjson.stringify` */
  stringify: import_superjson.default.stringify,
  /** See `superjson.parse` */
  parse: import_superjson.default.parse,
  /** See `superjson.serialize` */
  serialize: import_superjson.default.serialize,
  /** See `superjson.deserialize` */
  deserialize: import_superjson.default.deserialize
};
