/**
 * @fileoverview
 * Defines shared TypeScript types and interfaces used across the elep-dev tool.
 * This centralizes core data structures for consistency and maintainability.
 */

/**
 * Represents the essential fields read from a plugin's `package.json` file.
 * This interface focuses only on the metadata required by the elep-dev tool.
 */
export interface PluginManifest {
  name: string;
  version: string;
  pluginDependencies?: Record<string, string>;
  pluginGroups?: string[];
  main?: string;
}

/**
 * Represents a plugin that has been discovered by scanning the `elep_plugins/` directory.
 * It combines the plugin's manifest with its location within the staging area.
 */
export interface DiscoveredPlugin {
  /** The official name of the plugin, as defined in its manifest. */
  name: string;
  /** The version of the plugin, as defined in its manifest. */
  version: string;
  /** The path of the plugin's directory relative to the `elep_plugins/` root. */
  pathInStaging: string;
  /** The full, parsed manifest object (`package.json`) of the plugin. */
  manifest: PluginManifest;
}