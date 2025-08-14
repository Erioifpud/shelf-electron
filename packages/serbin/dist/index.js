"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  byteify: () => byteify,
  default: () => index_default,
  from: () => from
});
module.exports = __toCommonJS(index_exports);
var TAG_NULL = 0;
var TAG_UNDEFINED = 1;
var TAG_FALSE = 2;
var TAG_TRUE = 3;
var TAG_NUMBER = 4;
var TAG_STRING = 5;
var TAG_BINARY = 6;
var TAG_ARRAY = 7;
var TAG_OBJECT = 8;
function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
var textEncoder = new TextEncoder();
function serialize(value) {
  if (value === null) return new Uint8Array([TAG_NULL]);
  if (value === void 0) return new Uint8Array([TAG_UNDEFINED]);
  if (value === false) return new Uint8Array([TAG_FALSE]);
  if (value === true) return new Uint8Array([TAG_TRUE]);
  const type = typeof value;
  if (type === "number") {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_NUMBER);
    view.setFloat64(1, value, false);
    return new Uint8Array(buffer);
  }
  if (type === "string") {
    const strBytes = textEncoder.encode(value);
    const buffer = new ArrayBuffer(5 + strBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_STRING);
    view.setUint32(1, strBytes.length, false);
    new Uint8Array(buffer).set(strBytes, 5);
    return new Uint8Array(buffer);
  }
  if (value instanceof Uint8Array) {
    const buffer = new ArrayBuffer(5 + value.length);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_BINARY);
    view.setUint32(1, value.length, false);
    new Uint8Array(buffer).set(value, 5);
    return new Uint8Array(buffer);
  }
  if (Array.isArray(value)) {
    const chunks = [];
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, TAG_ARRAY);
    headerView.setUint32(1, value.length, false);
    chunks.push(new Uint8Array(header));
    for (const item of value) {
      chunks.push(serialize(item));
    }
    return concatUint8Arrays(chunks);
  }
  if (type === "object") {
    const keys = Object.keys(value);
    const chunks = [];
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, TAG_OBJECT);
    headerView.setUint32(1, keys.length, false);
    chunks.push(new Uint8Array(header));
    for (const key of keys) {
      chunks.push(serialize(key));
      chunks.push(serialize(value[key]));
    }
    return concatUint8Arrays(chunks);
  }
  throw new Error(`Unsupported type for serialization: ${type}`);
}
var byteify = (value) => serialize(value);
var Deserializer = class {
  view;
  textDecoder = new TextDecoder();
  offset = 0;
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  read() {
    const tag = this.view.getUint8(this.offset++);
    switch (tag) {
      case TAG_NULL:
        return null;
      case TAG_UNDEFINED:
        return void 0;
      case TAG_FALSE:
        return false;
      case TAG_TRUE:
        return true;
      case TAG_NUMBER: {
        const value = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return value;
      }
      case TAG_STRING: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const strBytes = new Uint8Array(
          this.view.buffer,
          this.view.byteOffset + this.offset,
          length
        );
        this.offset += length;
        return this.textDecoder.decode(strBytes);
      }
      case TAG_BINARY: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const value = new Uint8Array(
          this.view.buffer,
          this.view.byteOffset + this.offset,
          length
        );
        this.offset += length;
        return value;
      }
      case TAG_ARRAY: {
        const count = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const arr = [];
        for (let i = 0; i < count; i++) {
          arr.push(this.read());
        }
        return arr;
      }
      case TAG_OBJECT: {
        const count = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const obj = {};
        for (let i = 0; i < count; i++) {
          const key = this.read();
          const value = this.read();
          obj[key] = value;
        }
        return obj;
      }
      default:
        throw new Error(`Unknown type tag encountered: 0x${tag.toString(16)}`);
    }
  }
};
var from = (bytes) => {
  if (!bytes || bytes.length === 0) {
    return void 0;
  }
  const deserializer = new Deserializer(bytes);
  return deserializer.read();
};
var index_default = {
  byteify,
  from
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  byteify,
  from
});
