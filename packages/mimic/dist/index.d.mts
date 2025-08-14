import * as superjson from 'superjson';

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
declare const _default: {
    /** See `superjson.stringify` */
    stringify: (object: any) => string;
    /** See `superjson.parse` */
    parse: <T = unknown>(string: string) => T;
    /** See `superjson.serialize` */
    serialize: (object: any) => superjson.SuperJSONResult;
    /** See `superjson.deserialize` */
    deserialize: <T = unknown>(payload: superjson.SuperJSONResult) => T;
};

export { _default as default };
