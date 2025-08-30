import type { JsonValue } from "@eleplug/transport";
import type { Placeholder } from "../../types/protocol";

/**
 * Provides context to a `TypeHandler` during serialization and deserialization.
 *
 * This context object allows a handler to perform recursive serialization/deserialization,
 * ensuring that the entire process is consistent (e.g., for circular reference detection).
 */
export interface SerializerContext {
  /**
   * A function for recursive serialization.
   *
   * Handlers should use this method to serialize any nested properties that
   * they do not handle themselves.
   *
   * @param value The value to be recursively serialized.
   * @returns The serialized `JsonValue`.
   */
  serialize: (value: any) => JsonValue;

  /**
   * A function for recursive deserialization.
   *
   * Handlers can use this method to deserialize child properties within their payload.
   *
   * @param value The `JsonValue` to be recursively deserialized.
   * @returns The deserialized, original value.
   */
  deserialize: (value: JsonValue) => any;
}

/**
 * Defines the interface for a plugin that handles the serialization and
 * deserialization of a specific data type.
 *
 * @template TValue The local value type that this handler can process (e.g., `Error`, `ReadableStream`).
 * @template TPlaceholder The corresponding serialized placeholder type.
 */
export interface TypeHandler<
  TValue extends object = object,
  TPlaceholder extends Placeholder = Placeholder,
> {
  /**
   * The type name(s) for the placeholder, used for quick lookups during deserialization.
   *
   * This must match the `_erpc_type` property of `TPlaceholder`. It can be a
   * single string or an array of strings if one handler supports multiple related types.
   */
  name: TPlaceholder["_erpc_type"] | Array<TPlaceholder["_erpc_type"]>;

  /**
   * Checks if a given value should be handled by this handler.
   * @param value The value to check.
   * @returns `true` if this handler can process the value, otherwise `false`.
   */
  canHandle(value: unknown): value is TValue;

  /**
   * Serializes the local value into a JSON-safe placeholder object.
   * @param value The local value to serialize.
   * @param context The serializer context for recursive operations.
   * @returns A JSON-compatible placeholder object.
   */
  serialize(value: TValue, context: SerializerContext): TPlaceholder;

  /**
   * Deserializes the placeholder object back into its local value.
   * @param placeholder The placeholder object from the remote peer.
   * @param context The serializer context for recursive operations.
   * @returns The deserialized local value (e.g., a `Stream` or a remote proxy).
   */
  deserialize(placeholder: TPlaceholder, context: SerializerContext): TValue;
}
