import { type Feature } from "@eleplug/erpc";
import { Dispatcher } from "./dispatcher.js";
import type { DispatchHandler } from "./dispatch.handler.js";

/**
 * The capabilities contributed by the `DispatchFeature`.
 * It provides a centralized, extensible service for creating deep copies of messages.
 */
export interface DispatchContribution {
  dispatcher: {
    /**
     * Creates `count` deep or semantically-equivalent copies of a value.
     * This is essential for ensuring message isolation in broadcast scenarios.
     *
     * @param value The value to dispatch (clone).
     * @param count The number of copies to create.
     * @returns An array containing `count` new instances.
     */
    dispatch: <T>(value: T, count: number) => T[];

    /**
     * Registers a custom handler for a specific data type.
     * This allows features like streaming or pinning to define their own
     * "cloning" behavior.
     *
     * @param handler The `DispatchHandler` plugin to register.
     */
    registerHandler: (handler: DispatchHandler<any>) => void;
  };
}

/**
 * A feature that provides a powerful, extensible dispatching (cloning) system.
 *
 * This feature allows EBUS to safely broadcast messages containing complex data
 * types (like Streams) by creating multiple, isolated copies for each downstream
 * path. It works by allowing other features to register `DispatchHandler` plugins.
 *
 * It employs a two-phase initialization strategy to manage dependencies:
 * 1. `contribute`: Provides a proxy-like interface. `registerHandler` calls
 *    collect handlers into a temporary array.
 * 2. `init`: Instantiates the real `Dispatcher` with all collected handlers.
 */
export class DispatchFeature implements Feature<DispatchContribution> {
  // A temporary store for handlers registered before the Dispatcher is initialized.
  private handlersToRegister: DispatchHandler<any>[] = [];
  // The real dispatcher instance, created during the `init` phase.
  private dispatcherInstance!: Dispatcher;

  public contribute(): DispatchContribution {
    return {
      dispatcher: {
        /** A proxy method that delegates to the real dispatcher once initialized. */
        dispatch: (value, count) => {
          if (!this.dispatcherInstance) {
            throw new Error(
              "DispatchFeature not initialized. Cannot call 'dispatch'."
            );
          }
          return this.dispatcherInstance.dispatch(value, count);
        },

        /** Collects handlers to be used when the real dispatcher is created. */
        registerHandler: (handler) => {
          // This can be safely called by other features during their `init` phase,
          // as it only pushes to an array.
          this.handlersToRegister.push(handler);
        },
      },
    };
  }

  /**
   * Initializes the feature by creating the `Dispatcher` instance.
   * At this point, all other features have had a chance to register their
   * `DispatchHandler`s via the contributed `registerHandler` method.
   */
  public init(): void {
    this.dispatcherInstance = new Dispatcher(this.handlersToRegister);
  }

  /** This feature is stateless and requires no cleanup on close. */
  public close(): void {
    // No-op
  }
}
