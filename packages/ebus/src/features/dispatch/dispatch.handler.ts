/**
 * Provides context to a `DispatchHandler` during a dispatch operation.
 * Its primary role is to enable recursive dispatching for nested objects and arrays.
 */
export interface DispatchContext {
  /**
   * Recursively calls the main dispatch function.
   * A handler should use this to process nested properties of an object it is handling.
   *
   * @param value The value to be dispatched (cloned).
   * @param count The number of copies to create.
   * @returns An array containing `count` new instances of the value.
   */
  dispatch: <T>(value: T, count: number) => T[];
}

/**
 * Defines the interface for a dispatch handler, a plugin that specifies how to
 * "clone" a particular data type for broadcasting.
 *
 * For simple objects, this is deep cloning. For complex types like streams or
 * pinned objects, it involves creating multiple proxy objects that correctly
 * interact with the single original source (fan-out/fan-in).
 *
 * @template TValue The type of value this handler can process.
 */
export interface DispatchHandler<TValue extends object = object> {
  /**
   * Checks if a given value should be processed by this handler.
   * This is called for each value during the dispatch process.
   *
   * @param value The value to check.
   * @returns `true` if this handler can process the value, otherwise `false`.
   */
  canHandle(value: unknown): value is TValue;

  /**
   * Creates `count` semantically equivalent copies of a value.
   *
   * @param value The original value to be dispatched.
   * @param count The number of copies to create.
   * @param context Provides the ability to recursively dispatch nested values.
   * @returns An array containing `count` new instances.
   */
  dispatch(value: TValue, count: number, context: DispatchContext): TValue[];
}
