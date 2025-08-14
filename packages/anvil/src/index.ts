import type { Api, Transferable, TransferableArray } from "@eleplug/erpc";
import type { Plugin } from "./types";

// Re-export core types so users can import them from the main entry point.
export type {
  Plugin,
  PluginActivationContext,
  PluginApiMap,
  PluginApi,
} from "./types";

/**
 * Resolves and combines a plugin URI.
 *
 * @param baseUri The root URI of the current plugin (provided by `context.pluginDir`).
 * @param relativePath The path relative to the plugin's root.
 * @returns A full, normalized `plugin://` URI.
 */
export function resolvePluginUri(
  baseUri: string,
  relativePath: string
): string {
  // Use the URL API for robust path resolution, ensuring the base is always treated as a directory.
  const base = new URL(baseUri.endsWith("/") ? baseUri : `${baseUri}/`);
  const resolved = new URL(relativePath, base);
  return resolved.href;
}

/**
 * A helper function for defining a plugin.
 * Its primary purpose is to provide full TypeScript type inference and checking
 * for a plugin definition, ensuring the `activate` function's return value
 * matches the `TApi` generic.
 *
 * @param plugin The plugin definition object.
 * @returns The plugin definition object itself.
 */
export function definePlugin<TApi extends Api<TransferableArray, Transferable>>(
  plugin: Plugin<TApi>
): Plugin<TApi> {
  return plugin;
}
