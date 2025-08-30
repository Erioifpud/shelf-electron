import type { Pin } from "@eleplug/erpc";
import { PIN_FREE_KEY } from "@eleplug/erpc";
import type { DispatchHandler } from "../dispatch/dispatch.handler.js";

/**
 * A specialized `DispatchHandler` for "cloning" erpc `Pin<T>` objects.
 *
 * "Cloning" a `Pin` object means passing its reference, as a `Pin` is itself
 * a remote reference (a proxy) to a resource. All "cloned" instances should
 * point to the exact same remote resource. This handler ensures that when a
 * pinned object is broadcast, all subscribers receive a working proxy to the
 * original object, rather than an invalid deep copy.
 */
export const PinHandler: DispatchHandler<Pin<any>> = {
  /**
   * Checks if a value is an erpc `Pin` proxy.
   *
   * A reliable way to identify a pin proxy is to check for the existence
   * of its special `[PIN_FREE_KEY]` method, which is unique to pin proxies.
   *
   * @param value The value to check.
   * @returns `true` if the value is a valid `Pin` proxy.
   */
  canHandle(value: unknown): value is Pin<any> {
    // Checking for a function type first is a quick optimization.
    return (
      typeof value === "function" && (value as any)[PIN_FREE_KEY] !== undefined
    );
  },

  /**
   * Creates `count` "clones" (i.e., reference copies) of a `Pin` object.
   *
   * @param originalPin The original `Pin` proxy object.
   * @param count The number of copies to create.
   * @returns An array containing `count` references to the original `Pin` object.
   */
  dispatch(originalPin: Pin<any>, count: number): Pin<any>[] {
    // For a reference type like a proxy, the correct "clone" is simply
    // another reference to the original.
    return Array(count).fill(originalPin);
  },
};
