import type {
  Api,
  Client,
  Transferable,
  TransferableArray,
} from "@eleplug/erpc";
import type { BusContext, Node as EbusNode, p2p } from "@eleplug/ebus";

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
   * A builder for creating erpc procedures.
   * This is a convenient alias for `erpc.procedure`.
   */
  readonly procedure: typeof p2p;

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
   * @example "plugin://my-container.my-plugin"
   */
  readonly pluginUri: string;

  /**
   * Resolves a resource path relative to the plugin's root, applying any
   * container-level path rewrites (e.g., from `elep.prod.ts`).
   *
   * **This is the recommended, context-aware way for a plugin to create a valid
   * URI for one of its internal resources.** It allows the plugin's code to be
   * decoupled from the build process.
   *
   * @param relativePath The path to the resource relative to the plugin's root.
   * @returns A full, normalized, and potentially rewritten plugin resource URI.
   *
   * @example
   * // In elep.prod.ts: rewrites: { "/": "/dist/" }
   * // Inside the plugin:
   * const mainScriptUri = context.resolve('index.js');
   * // Result: "plugin://my-container.my-plugin/dist/index.js"
   */
  readonly resolve: (relativePath: string) => string;

  /**
   * Securely connects to another plugin's API based on the dependency name
   * declared in its manifest. **This is the only recommended way for plugins
   * to communicate directly with each other.**
   *
   * This method is type-safe and leverages the `PluginApiMap` interface. After
   * extending `PluginApiMap` in your project via declaration merging,
   * TypeScript can infer the specific type of the client returned by this method,
   * providing full autocompletion and compile-time safety.
   *
   * @param pluginName The name of the plugin as declared in the `dependencies`.
   * @returns A promise that resolves to a type-safe erpc client for the target plugin's API.
   *          If no type information is available in `PluginApiMap`, it returns `Client<any>`.
   */
  link<
    K extends PluginApiMapKeys<TPluginApiMap>,
    TPluginApiMap extends PluginApiMap = PluginApiMap,
  >(
    pluginName: K
  ): Promise<
    K extends keyof TPluginApiMap
      ? TPluginApiMap[K] extends Api<any, any, any>
        ? Client<TPluginApiMap[K]>
        : never
      : Client<any>
  >;
}

/**
 * The interface that all plugins must implement.
 * @template TApi The type of the erpc API exposed by the plugin.
 */
export interface Plugin<
  TApi extends Api<BusContext, TransferableArray, Transferable> = any,
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
 * This interface is meant to be extended via declaration merging in a project's
 * global `.d.ts` file to provide type-safe `context.link()` calls.
 *
 * @example
 * // In my-app/src/types/anvil.d.ts
 *
 * // Import the utility type from the anvil package.
 * import type { PluginApi } from '@eleplug/anvil';
 *
 * // Import the plugin's main module type. Using `typeof import(...)`
 * // is the standard way to get a module's type without creating a
 * // runtime dependency.
 * type DatabasePluginModule = typeof import('@my-org/database-plugin');
 * type UiThemePluginModule = typeof import('@my-org/ui-theme-plugin');
 *
 * // Use declaration merging to extend the global map.
 * declare module '@eleplug/anvil' {
 *   interface PluginApiMap {
 *     // The key is the plugin's name from its package.json.
 *     // The value uses the `PluginApi` utility to extract the API type.
 *     'database-plugin': PluginApi<DatabasePluginModule>;
 *     'ui-theme-plugin': PluginApi<UiThemePluginModule>;
 *   }
 * }
 */
export interface PluginApiMap {
  // This interface is intentionally left empty.
  // It is extended by users via `declare module '@eleplug/anvil'`.
}

/**
 * A type utility to extract all declared plugin names from the `PluginApiMap`.
 * @internal
 */
export type PluginApiMapKeys<TPluginApiMap extends PluginApiMap> =
  | Extract<keyof TPluginApiMap, string>
  | string;

/**
 * A type utility to infer the exposed API type from a plugin's module definition.
 * It correctly handles plugins that use either `export default` or named exports
 * (e.g., `export const plugin = ...`), making it robust for different coding styles.
 *
 * @example `PluginApi<typeof import('./my-plugin')>`
 */
export type PluginApi<TPluginModule> = TPluginModule extends {
  default?: infer P;
}
  ? P extends Plugin<infer TApi>
    ? TApi
    : never
  : TPluginModule extends Plugin<infer TApi>
    ? TApi
    : never;
