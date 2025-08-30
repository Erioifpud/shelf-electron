/**
 * Represents a value that can be either synchronous (`T`) or asynchronous (`Promise<T>`).
 * This utility type is widely used for event handlers and other functions that may
 * or may not perform asynchronous operations.
 *
 * @template T The type of the value.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Represents a primitive value that is directly serializable to JSON.
 *
 * @remarks
 * This type definition includes special considerations:
 * - `Uint8Array` is included to natively support binary payloads. It is expected
 *   that a higher-level serialization layer (e.g., one with custom transformers)
 *   will handle its conversion, often to a Base64 string.
 * - `bigint` is explicitly excluded as it lacks a standard JSON representation and
 *   requires deliberate conversion (e.g., to a string) before serialization.
 */
export type JsonPrimitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | Uint8Array;

/**
 * Represents a JSON-serializable array, where each element is a valid `JsonValue`.
 */
export type JsonArray = JsonValue[];

/**
 * Represents a JSON-serializable object, mapping string keys to valid `JsonValue` types.
 */
export type JsonObject = {
  [key: string]: JsonValue;
};

/**
 * Represents any value that can be losslessly converted to a JSON string
 * and back again. This is the universal type for all data payloads exchanged
 * over the transport layer.
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;