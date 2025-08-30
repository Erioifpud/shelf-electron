/**
 * @fileoverview
 * This is the public API entry point for the `@eleplug/anvil` package.
 *
 * Anvil provides the core contract and type definitions that all plugins
 * must adhere to. It defines the `Plugin` interface, the `PluginActivationContext`,
 * and utilities for working with the plugin URI scheme.
 *
 * @packageDocumentation
 */

import type { Api, Transferable, TransferableArray } from "@eleplug/erpc";
import type { BusContext } from "@eleplug/ebus";
import type { Plugin } from "./types";

// Re-export core types for convenience
export type {
  Plugin,
  PluginActivationContext,
  PluginApiMap,
  PluginApi,
} from "./types";

/**
 * Creates the canonical root URI for a plugin based on its container and path.
 * This function handles the necessary encoding and formatting for the host-based URI scheme.
 *
 * @design
 * The URI format `plugin://<host>/<path>` is used, where the `host` is a dot-separated
 * string composed of the container name and the encoded plugin path. This DNS-like
 * structure (`container.path.to.plugin`) provides a globally unique, hierarchical,
 * and human-readable identifier for every plugin instance in the system.
 *
 * @param containerName - The name of the container hosting the plugin.
 * @param pluginPath - The path of the plugin relative to the container's root (e.g., "path/to/plugin").
 * @returns A full, normalized plugin root URI. e.g., "plugin://my-container.path.to-plugin"
 */
export function createPluginUri(
  containerName: string,
  pluginPath: string
): string {
  const encodedContainer = encodeURIComponent(containerName);

  // Normalize path separators, filter out empty segments (from '//' or trailing '/'),
  // and percent-encode each part before joining with a dot.
  const encodedPathParts = pluginPath
    .split(/[\\/]/g)
    .filter((p) => p)
    .map((p) => encodeURIComponent(p))
    .join(".");

  const host = encodedPathParts
    ? `${encodedContainer}.${encodedPathParts}`
    : encodedContainer;

  return `plugin://${host}`;
}

/**
 * Resolves a resource URI within a plugin's scope.
 *
 * @deprecated **Best Practice:** When inside a plugin's `activate` function,
 * **always** prefer using the context-aware `context.resolve(relativePath)` method.
 * The `context.resolve` method correctly applies any container-level path rewrites
 * (e.g., from `elep.prod.ts`), making your plugin's code independent of the build process.
 * This static function should only be used in rare scenarios where no plugin
 * activation context is available.
 *
 * @example
 * ```ts
 * // Using the (recommended) context-aware resolver:
 * function activate(context: PluginActivationContext) {
 *   // This is robust against build configuration changes.
 *   const iconUri = context.resolve('assets/icon.svg');
 * }
 *
 * // Using the (deprecated) static resolver:
 * const iconUri = resolvePluginUri(
 *   "plugin://my-container.my-plugin",
 *   "assets/icon.svg"
 * );
 * // Returns: "plugin://my-container.my-plugin/assets/icon.svg"
 * ```
 *
 * @param basePluginUri - The root URI of the plugin (e.g., "plugin://my-container.my-plugin").
 * @param relativePath - The path to the resource relative to the plugin's root (e.g., "assets/icon.svg").
 * @returns A full, normalized plugin resource URI.
 */
export function resolvePluginUri(
  basePluginUri: string,
  relativePath: string
): string {
  // Using the URL constructor is the most robust way to resolve relative paths.
  // We ensure the base URI ends with a slash to be correctly interpreted as a base directory.
  const base = basePluginUri.endsWith("/")
    ? basePluginUri
    : `${basePluginUri}/`;
  const resolvedUrl = new URL(relativePath, base);

  return resolvedUrl.href;
}

/**
 * A type-safe helper function for defining a plugin.
 *
 * This function is an identity function, meaning it returns the plugin object
 * unchanged at runtime. Its sole purpose is to provide TypeScript with the
 * necessary type hints for autocompletion and static analysis, ensuring your
 * plugin correctly implements the `Plugin` interface.
 *
 * @param plugin - The plugin implementation object.
 * @returns The same plugin object, but strongly typed.
 *
 * @example
 * ```ts
 * import { definePlugin } from '@eleplug/anvil';
 *
 * export default definePlugin({
 *   activate(context) {
 *     // ... activation logic ...
 *     return context.router({
 *       // ... your plugin's API ...
 *     });
 *   },
 *   deactivate() {
 *     // ... cleanup logic ...
 *   }
 * });
 * ```
 */
export function definePlugin<TApi extends Api<BusContext, TransferableArray, Transferable>>(
  plugin: Plugin<TApi>
): Plugin<TApi> {
  return plugin;
}
