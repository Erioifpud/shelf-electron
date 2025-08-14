import { Api, TransferableArray, Transferable, ErpcInstance, Client } from '@eleplug/erpc';
import { BusContext, Node } from '@eleplug/ebus';

/**
 * The context object received by a plugin upon activation.
 * This is the sole entry point for a plugin to interact with the system,
 * providing a carefully designed and ergonomic API.
 */
interface PluginActivationContext {
    /**
     * A factory for creating erpc routers.
     * This is a convenient alias for `erpc.router`.
     */
    readonly router: ErpcInstance<BusContext, TransferableArray, Transferable>["router"];
    /**
     * A builder for creating erpc procedures.
     * This is a convenient alias for `erpc.procedure`.
     */
    readonly procedure: ErpcInstance<BusContext, TransferableArray, Transferable>["procedure"];
    /**
     * Subscribes to a topic to receive broadcast messages.
     * This is a convenient alias for the plugin's EBUS Node `subscribe` method.
     */
    readonly subscribe: Node["subscribe"];
    /**
     * Creates a publisher to broadcast messages to a topic.
     * This is a convenient alias for the plugin's EBUS Node `emiter` method.
     */
    readonly emiter: Node["emiter"];
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
    link<K extends PluginApiMapKeys<M>, M extends PluginApiMap = PluginApiMap>(pluginName: K): Promise<K extends keyof M ? M[K] extends Api<any, any> ? Client<M[K]> : never : Client<any>>;
}
/**
 * The interface that all plugins must implement.
 * @template TApi The type of the erpc API exposed by the plugin.
 */
interface Plugin<TApi extends Api<TransferableArray, Transferable> = any> {
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
interface PluginApiMap {
}
/**
 * A type utility to extract all declared plugin names from the `PluginApiMap`.
 * @internal
 */
type PluginApiMapKeys<M extends PluginApiMap> = Extract<keyof M, string> | string;
/**
 * A type utility to infer the exposed API type from a plugin's definition.
 * It correctly handles both direct exports and default exports.
 * @example `PluginApi<typeof import('./my-plugin')>`
 */
type PluginApi<T extends {
    default?: Plugin;
} | Plugin> = T extends {
    default?: infer P;
} ? P extends Plugin<infer TApi> ? TApi : never : T extends Plugin<infer TApi> ? TApi : never;

/**
 * Resolves and combines a plugin URI.
 *
 * @param baseUri The root URI of the current plugin (provided by `context.pluginDir`).
 * @param relativePath The path relative to the plugin's root.
 * @returns A full, normalized `plugin://` URI.
 */
declare function resolvePluginUri(baseUri: string, relativePath: string): string;
/**
 * A helper function for defining a plugin.
 * Its primary purpose is to provide full TypeScript type inference and checking
 * for a plugin definition, ensuring the `activate` function's return value
 * matches the `TApi` generic.
 *
 * @param plugin The plugin definition object.
 * @returns The plugin definition object itself.
 */
declare function definePlugin<TApi extends Api<TransferableArray, Transferable>>(plugin: Plugin<TApi>): Plugin<TApi>;

export { type Plugin, type PluginActivationContext, type PluginApi, type PluginApiMap, definePlugin, resolvePluginUri };
