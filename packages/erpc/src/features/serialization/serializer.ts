import type { JsonValue } from 'packages/transport/dist/index.mjs';
import type { TypeHandler, SerializerContext } from './type.handler.js';
import { isPlaceholder } from '../../types/protocol.js';

/**
 * The core engine for erpc's serialization system.
 *
 * It iterates through a collection of `TypeHandler`s to transform complex
 * JavaScript objects into JSON-compatible values (`JsonValue`) and back.
 * It also handles cyclical references and standard JSON data types.
 * @internal
 */
export class Serializer {
  private readonly handlers: ReadonlyArray<TypeHandler<any, any>>;
  private readonly handlerMap: Map<string, TypeHandler<any, any>>;
  private readonly context: SerializerContext;

  constructor(handlers: TypeHandler<any, any>[]) {
    this.handlers = handlers;
    this.handlerMap = new Map();

    // Pre-populate the handler map for quick lookups during deserialization.
    this.handlers.forEach(h => {
      if (Array.isArray(h.name)) {
        h.name.forEach(name => this.handlerMap.set(name, h));
      } else {
        this.handlerMap.set(h.name, h);
      }
    });

    // Provide handlers with a context for recursive calls.
    this.context = {
      serialize: this.serialize.bind(this),
      deserialize: this.deserialize.bind(this),
    };
  }

  /**
   * Serializes a value into a `JsonValue`.
   * @param value The value to serialize.
   * @returns The serialized `JsonValue`.
   */
  public serialize(value: any): JsonValue {
    return this._serialize(value, new WeakMap());
  }

  private _serialize(value: any, seen: WeakMap<object, boolean>): JsonValue {
    if (value === undefined || value === null) {
      return null;
    }

    // 1. Check if a specific TypeHandler can process this value.
    for (const handler of this.handlers) {
      if (handler.canHandle(value)) {
        return handler.serialize(value, this.context);
      }
    }

    // 2. Handle primitives that are directly JSON-serializable.
    const type = typeof value;
    if (type !== 'object') {
      return value as JsonValue;
    }

    // 3. Natively support Uint8Array, as it's a special `JsonPrimitive` in our transport.
    if (value instanceof Uint8Array) {
      return value;
    }

    // 4. Handle circular references to prevent infinite loops.
    if (seen.has(value)) {
      throw new Error(`Circular reference detected during serialization.`);
    }
    seen.set(value, true);

    // 5. Recursively process arrays and plain objects.
    let result: JsonValue;
    if (Array.isArray(value)) {
      result = value.map(item => this._serialize(item, seen));
    } else {
      const obj: { [key: string]: JsonValue } = {};
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
  public deserialize(value: JsonValue): any {
    // 1. If it's a placeholder, use the corresponding TypeHandler.
    if (isPlaceholder(value)) {
      const handler = this.handlerMap.get(value._erpc_type);
      if (handler) {
        return handler.deserialize(value as any, this.context);
      }
      console.warn(`[erpc serializer] No deserialization handler found for type: ${value._erpc_type}`);
      return value;
    }

    // 2. Natively support Uint8Array.
    if (value instanceof Uint8Array) {
      return value;
    }

    // 3. Recursively process arrays.
    if (Array.isArray(value)) {
      return value.map(item => this.deserialize(item));
    }

    // 4. Recursively process plain objects.
    if (value !== null && typeof value === 'object') {
      const obj: { [key: string]: any } = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          obj[key] = this.deserialize((value as any)[key]);
        }
      }
      return obj;
    }

    // 5. Return primitives as-is.
    return value;
  }
}