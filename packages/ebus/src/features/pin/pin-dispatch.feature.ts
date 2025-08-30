import { type Feature } from "@eleplug/erpc";
import type { DispatchContribution } from "../dispatch/dispatch.feature.js";
import { PinHandler } from "./pin-dispatch.handler.js";

/** The dependencies required by the `PinDispatchFeature`. */
type PinDispatchRequires = DispatchContribution;

/**
 * A specialized plugin feature that registers `Pin<T>` handling capabilities
 * with the core `DispatchFeature`.
 *
 * This feature is stateless and contributes no new public API. Its sole purpose
 * is to "install" the logic for correctly dispatching `Pin<T>` objects, which
 * ensures they are passed by reference during EBUS broadcast operations.
 */
export class PinDispatchFeature implements Feature<{}, PinDispatchRequires> {
  /** This feature does not provide new capabilities, so it returns an empty object. */
  public contribute(): {} {
    return {};
  }

  /**
   * During initialization, this method registers the `PinHandler`
   * with the `DispatchFeature`.
   *
   * @param capability The EBUS core capabilities, from which we only need
   *                   the `dispatcher.registerHandler` method.
   */
  public init(capability: PinDispatchRequires): void {
    // Register the handler to correctly "clone" (pass by reference) Pin objects.
    capability.dispatcher.registerHandler(PinHandler);
  }

  /** This feature is stateless and requires no cleanup on close. */
  public close(): void {
    // No-op
  }
}
