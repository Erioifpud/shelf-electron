import type { JsonValue, Transport } from "@eleplug/transport";
import type { Pin } from "./pin";

/**
 * A type that holds no runtime value but carries a generic type parameter.
 * It's used to attach compile-time type information to runtime objects
 * without any performance overhead.
 * @template _ The "phantom" type this object carries.
 */
export type PhantomData<_> = {};

/**
 * A utility type to extract the inner "phantom" type from a `PhantomData` object.
 * @template T The `PhantomData` object.
 */
export type InferPhantomData<T> = T extends PhantomData<infer R> ? R : never;

/**
 * A factory function to create a `PhantomData` object.
 * @returns An empty object typed as `PhantomData<T>`.
 * @internal
 */
export function mark<T>(): PhantomData<T> {
  return {};
}

/**
 * A union of all types that can be transferred between eRPC peers.
 *
 * This includes:
 * - JSON-compatible primitives and structures (`JsonValue`).
 * - WHATWG Streams for efficient data streaming.
 * - `Uint8Array` for binary data.
 * - Proxied objects/functions via `Pin<T>`.
 * - Nested `Transferable` objects and arrays.
 * - Proxied `Transport` objects for tunneling.
 * - `void` for procedures that don't return a value.
 */
export type Transferable =
  | JsonValue
  | ReadableStream<Transferable>
  | WritableStream<Transferable>
  | Uint8Array
  | Pin<any>
  | TransferableObject
  | TransferableArray
  | Transport
  | void;

/** An object where all property values are `Transferable`. */
export type TransferableObject = { [key: string]: Transferable };
/** An array where all elements are `Transferable`. */
export type TransferableArray = Transferable[];

/**
 * An abstract interface for a data validation schema.
 * erpc uses this to integrate with validation libraries like Zod, Yup, etc.
 * Any library that provides a `.parse()` method matching this signature is compatible.
 * @template T The type of the parsed data.
 */
export interface Schema<T = any> {
  /**
   * Parses and validates the input data, throwing an error on failure.
   * @param data The unknown data to validate.
   * @returns The parsed data, typed as `T`.
   */
  parse(data: unknown): T;
}

/**
 * A utility type that infers a tuple of types from a tuple of `Schema`s.
 * @template TSchemas A `readonly` tuple of `Schema` objects.
 */
export type InferSchemaTuple<TSchemas extends readonly Schema[]> = {
  [K in keyof TSchemas]: TSchemas[K] extends Schema<infer T> ? T : never;
} extends infer T
  ? T & unknown[]
  : never;

/**
 * A utility type representing a function that may return `void` or `Promise<void>`.
 */
export type MaybePromiseVoid = Promise<void> | void;
