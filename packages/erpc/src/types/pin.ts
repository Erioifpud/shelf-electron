import type { JsonValue, Transport } from "@eleplug/transport";

// A unique, non-enumerable symbol to store the pin ID on a resource or proxy.
/** @internal */
export const PIN_ID_KEY = Symbol('__erpc_pin_id__');
// The property key for the manual release function on a remote proxy.
/** @internal */
export const PIN_FREE_KEY = Symbol('__erpc_pin_free__');
// A temporary symbol that marks a local object as needing to be pinned on serialization.
/** @internal */
export const PIN_REQUEST_KEY = Symbol('__erpc_pin_request__');
// The brand symbol to make the Pin<T> type unique.
/** @internal */
export declare const __pin_brand: unique symbol;


// =================================================================
// SECTION 1: Pinning Type System
// =================================================================

/** Transforms a function into an async version that returns a Promise. @internal */
type PromisifyFunction<F> =
  F extends (...args: infer TArgs) => infer TReturn
    ? (...args: TArgs) => Promise<Awaited<TReturn>>
    : F;

/**
 * Transforms a property into an overloaded function for remote access.
 * e.g., `name: string` becomes `name: { (): Promise<string>; (newValue: string): Promise<void> }`.
 * Calling `remote.name()` acts as a getter, `remote.name('new')` as a setter.
 * @internal
 */
type OverloadedProperty<TProp> = {
  (): Promise<Awaited<TProp>>; // Getter
  (newValue: TProp): Promise<void>; // Setter
}

/**
 * Recursively transforms an object type `T` into its remote proxy representation.
 * - Methods are promisified.
 * - Properties become overloaded async getter/setter functions.
 * @internal
 */
type PromisifyObject<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? PromisifyFunction<T[K]>
    : OverloadedProperty<T[K]>;
};

/**
 * Defines the special, non-enumerable properties attached to a remote pin proxy.
 * @internal
 */
type PinSpecialProperties<T extends object> = {
  /** The unique identifier for the pinned resource on the remote peer. @internal */
  readonly [PIN_ID_KEY]?: string;
  /** A function to manually release the remote resource. @internal */
  readonly [PIN_FREE_KEY]?: () => Promise<void>;
  /** A unique brand to identify the type and preserve the original type `T`. @internal */
  readonly [__pin_brand]: T;
};

/**
 * Constructs the final remote proxy type from a validated object type `T`.
 * @internal
 */
type _BuildPinProxy<T extends object> =
  T extends (...args: infer TArgs) => infer TReturn
    // Handle functions passed directly to pin().
    ? ((...args: TArgs) => Promise<Awaited<TReturn>>) & PinSpecialProperties<T>
    // Handle objects.
    : PromisifyObject<T> & PinSpecialProperties<T>;


/**
 * Represents a remote proxy for a local object or function of type `T`.
 *
 * This is a fully type-safe representation that transforms the original type `T`
 * into an asynchronous interface:
 * - Methods are "promisified" to return `Promise<..._>`.
 * - Properties are converted into async getter/setter functions.
 *
 * If `T` is not a "pin-able" type (see `Pinable<T>`), this type resolves to a
 * descriptive error message, providing immediate feedback in the IDE.
 */
export type Pin<T> =
  Pinable<T> extends T
    ? _BuildPinProxy<T & object>
    : Pinable<T>;

// =================================================================
// SECTION 2: Internal Pinning Validation System
// =================================================================

/** A marker for properties that are not transferable, used for validation. @internal */
export interface _InvalidProperty {
  readonly __invalid_property_brand: unique symbol
}

/** Recursively checks if a type is composed entirely of `Transferable` types. @internal */
type _IsTransferable<T> =
  T extends void ? true :
  T extends JsonValue ? true :
  T extends Uint8Array ? true :
  T extends Transport ? true :
  T extends { [__pin_brand]: any } ? true : // A Pin<T> is transferable.
  T extends ReadableStream<infer U> ? _IsTransferable<U> :
  T extends WritableStream<infer U> ? _IsTransferable<U> :
  T extends { [key: string]: infer V } ? _IsTransferable<V> :
  T extends (infer E)[] ? _IsTransferable<E> :
  false;

/** Checks if a function's arguments and return value are transferable. @internal */
type _IsPinableFunction<T> = T extends (...args: infer TArgs) => infer TReturn
  ? [
      _IsTransferable<Awaited<TReturn>>,
      _IsTransferable<TArgs>
    ] extends [true, true]
    ? true
    : false
  : false;

/** Recursively marks properties of an object that are not transferable. @internal */
type _MarkInvalidProperties<T> = _IsPinableFunction<T> extends true
  ? T
  : T extends Function
    ? _InvalidProperty
    : T extends object
      ? {
          [K in keyof T]: _IsTransferable<T[K]> extends true
            ? T[K]
            : _MarkInvalidProperties<T[K]>;
        }
      : _InvalidProperty;

/** Checks if a type, after marking, contains any invalid properties. @internal */
type _HasInvalidProperties<T> =
  { [K in keyof T]: T[K] extends _InvalidProperty ? true : never }[keyof T] extends never
    ? false
    : true;

/** A utility to make optional properties explicitly `T | undefined`. @internal */
type OptionalToUndefined<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> // Check if property is optional
    ? T[K] | undefined
    : T[K];
};

/** A branded type to represent a pin constraint violation with an error message. @internal */
export interface PinConstraintViolation<_ extends string> {
  readonly brand: unique symbol
};

/**
 * A type constraint that validates if a type `T` can be safely "pinned".
 *
 * A type is "pin-able" if it's an object or function where all its properties,
 * method arguments, and return values are themselves `Transferable`. This check
 * is performed recursively. If the constraint is violated, this type resolves
 * to a `PinConstraintViolation` with a descriptive error message.
 */
export type Pinable<T> =
  _HasInvalidProperties<_MarkInvalidProperties<OptionalToUndefined<T>>> extends true
    ? PinConstraintViolation<"Error: The provided type is not 'pin-able'. It may contain non-serializable values (like Date or RegExp) or functions with non-transferable arguments/return types.">
    : T;