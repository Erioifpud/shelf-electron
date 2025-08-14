// src/index.ts
import superjson from "superjson";
import { fromByteArray, toByteArray } from "base64-js";
superjson.registerCustom(
  {
    isApplicable: (v) => v instanceof Uint8Array,
    serialize: (v) => fromByteArray(v),
    deserialize: (v) => toByteArray(v)
  },
  "uint8array"
);
var index_default = {
  /** See `superjson.stringify` */
  stringify: superjson.stringify,
  /** See `superjson.parse` */
  parse: superjson.parse,
  /** See `superjson.serialize` */
  serialize: superjson.serialize,
  /** See `superjson.deserialize` */
  deserialize: superjson.deserialize
};
export {
  index_default as default
};
