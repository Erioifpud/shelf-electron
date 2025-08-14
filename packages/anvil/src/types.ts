import type {
  Api,
  Client,
  ErpcInstance,
  Transferable,
  TransferableArray,
} from "@eleplug/erpc";
import type { BusContext, Node as EbusNode } from "@eleplug/ebus";

// =================================================================
// SECTION 1: Core Plugin Interfaces
// =================================================================

/**
 * The context object received by a plugin upon activation.
 * This is the sole entry point for a plugin to interact with the system,
 * providing a carefully designed and ergonomic API.
 */
export interface PluginActivationContext {
  /**
   * A factory for creating erpc routers.
   * This is a convenient alias for `erpc.router`.
   */
  readonly router: ErpcInstance<
    BusContext,
    TransferableArray,
    Transferable
  >["router"];

  /**
   * A builder for creating erpc procedures.
   * This is a convenient alias for `erpc.procedure`.
   */
  readonly procedure: ErpcInstance<
    BusContext,
    TransferableArray,
    Transferable
  >["procedure"];

  /**
   * Subscribes to a topic to receive broadcast messages.
   * This is a convenient alias for the plugin's EBUS Node `subscribe` method.
   */
  readonly subscribe: EbusNode["subscribe"];

  /**
   * Creates a publisher to broadcast messages to a topic.
   * This is a convenient alias for the plugin's EBUS Node `emiter` method.
   */
  readonly emiter: EbusNode["emiter"];

  /**
   * The root URI of the current plugin.
   * e.g., "plugin://my-container/my-plugin"
   */
  readonly pluginUri: string;

  /**
   * Securely connects to another plugin's API based on the dependency name
   * declared in `manifest.json`.
   *
   * This method is type-safe and leverages the `PluginApiMap` interface. After
   * extending `PluginApiMap` in your project via declaration merging,
   * TypeScript can infer the specific type of the client returned by `link('plugin-name')`.
   *
   * @param pluginName The name of the plugin as declared in the `dependencies`.
   * @returns A type-safe erpc client for the target plugin's API. Returns `Client<any>`
   *          if no type information is available in `PluginApiMap`.
   */
  link<K extends PluginApiMapKeys<M>, M extends PluginApiMap = PluginApiMap>(
    pluginName: K
  ): Promise<
    K extends keyof M
      ? M[K] extends Api<any, any>
        ? Client<M[K]>
        : never
      : Client<any>
  >;
}

/**
 * The interface that all plugins must implement.
 * @template TApi The type of the erpc API exposed by the plugin.
 */
export interface Plugin<
  TApi extends Api<TransferableArray, Transferable> = any,
> {
  /**
   * The activation function for the plugin.
   * This function is called when the plugin is started and must return an erpc API Router.
   * @param context The plugin's activation context, providing all capabilities for
   *                interacting with the system.
   */
  activate(context: PluginActivationContext): TApi | Promise<TApi>;

  /**
   * (Optional) The deactivation function for the plugin.
   * This function is called before the plugin is stopped or the system shuts down.
   * It should be used to clean up resources, such as database connections or timers.
   */
  deactivate?: () => void | Promise<void>;
}

// =================================================================
// SECTION 2: Type Inference System for Inter-Plugin Communication
// =================================================================

/**
 * An interface for mapping plugin names to their API types.
 * It is extended via declaration merging in a project's `d.ts` file
 * to provide type-safe `context.link()` calls.
 *
 * @example
 * ```typescript
 * // my-app/src/types/anvil.d.ts
 * import type { PluginApi } from '@eleplug/anvil';
 *
 * declare module '@eleplug/anvil' {
 *   interface PluginApiMap {
 *     'database-plugin': PluginApi<typeof import('@plugins/database')>;
 *     'ui-theme-plugin': PluginApi<typeof import('@plugins/ui-theme')>;
 *   }
 * }
 * ```
 */
export interface PluginApiMap {
  // Extended by users via `declare module '@eleplug/anvil/types'`.
}

/**
 * A type utility to extract all declared plugin names from the `PluginApiMap`.
 * @internal
 */
export type PluginApiMapKeys<M extends PluginApiMap> =
  | Extract<keyof M, string>
  | string;

/**
 * A type utility to infer the exposed API type from a plugin's definition.
 * It correctly handles both direct exports and default exports.
 * @example `PluginApi<typeof import('./my-plugin')>`
 */
export type PluginApi<T extends { default?: Plugin } | Plugin> = T extends {
  default?: infer P;
}
  ? P extends Plugin<infer TApi>
    ? TApi
    : never
  : T extends Plugin<infer TApi>
    ? TApi
    : never;
