import superjson from 'superjson';
import { fromByteArray, toByteArray } from 'base64-js';

// Register a custom serializer to handle Uint8Array.
// JSON does not have a native binary type, so we convert the byte array to a
// base64 string for transport, which is a standard and safe representation.
// This registration must happen before the `mimic` object is exported.
superjson.registerCustom<Uint8Array, string>(
  {
    isApplicable: (v): v is Uint8Array => v instanceof Uint8Array,
    serialize: (v) => fromByteArray(v),
    deserialize: (v) => toByteArray(v),
  },
  'uint8array'
);

/**
 * Provides a pre-configured, shared `superjson` instance for consistent data
 * serialization and deserialization across the entire eleplug ecosystem.
 *
 * @remarks
 * This module ensures that complex JavaScript types, which are not natively
 * supported by JSON (like `Date`, `Map`, `Set`, and `Uint8Array`), are
 * handled uniformly by all transport layers and application code.
 *
 * It is pre-configured with a custom serializer for `Uint8Array`.
 */
export default {
  /** See `superjson.stringify` */
  stringify: superjson.stringify,
  /** See `superjson.parse` */
  parse: superjson.parse,
  /** See `superjson.serialize` */
  serialize: superjson.serialize,
  /** See `superjson.deserialize` */
  deserialize: superjson.deserialize,
};