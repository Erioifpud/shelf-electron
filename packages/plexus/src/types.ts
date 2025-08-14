/**
 * Uniquely identifies a specific version of a plugin.
 */
export type PluginIdentifier = {
  name: string;
  version: string;
};

/**
 * The core metadata for a plugin within the dependency graph.
 * It includes its identity, its declared dependencies, and the specific
 * versions it was resolved to (the lock).
 */
export type PluginMeta = PluginIdentifier & {
  /** The name of the provider that supplied this plugin's metadata. */
  provider?: string;
  /**
   * The dependencies as declared by the plugin.
   * @example { "another-plugin": "^1.2.0" }
   */
  dependencies: Record<string, string>;
  /**
   * The resolved, exact versions of the dependencies for this plugin instance.
   * This is calculated by the resolver after a successful resolution.
   * @example { "another-plugin": "1.2.5" }
   */
  lock: Record<string, string>;
};

/**
 * Describes a dependency that was required by one or more plugins but could not be
 * found in any of the registered providers.
 */
export type MissingInfo = {
  /** The name of the missing plugin. */
  name: string;
  /** An array of all the semantic version ranges that were requested for this missing plugin. */
  ranges: string[];
};

/**
 * Represents a dependency cycle, which is an ordered list of plugins where
 * each plugin depends on the next, and the last depends on the first.
 */
export type Cycle = PluginMeta[];

/**
 * Describes a single change between two dependency graphs, forming one step
 * in a reconciliation plan.
 */
export type DiffEntry = {
  /** The type of change. 'replaced' is used for deactivation steps of modified plugins. */
  type: "added" | "removed" | "modified" | "replaced";
  /** The metadata of the plugin affected by this change. */
  meta: PluginMeta;
};

/**
 * The data structure returned by a Provider function.
 * It maps version strings to that version's dependency requirements.
 *
 * @example
 * ```json
 * {
 *   "1.0.0": { "dep-a": "^2.0.0" },
 *   "1.1.0": { "dep-a": "^2.1.0", "dep-b": "~3.0.0" }
 * }
 * ```
 */
export type ProviderResult = Record<string, Record<string, string>>;

/**
 * The function signature for a dependency provider. A provider is a function
 * that, given a plugin name, returns a promise for all its available versions
 * and their respective dependencies.
 */
export type Provider = (
  pluginName: string
) => Promise<ProviderResult | undefined>;

/**
 * Options for configuring the behavior of the `DependencyResolver`.
 */
export type ResolverOptions = {
  /**
   * Whether to include pre-release versions (e.g., '1.0.0-beta.1') when
   * satisfying version ranges.
   * @default false
   */
  includePrereleases?: boolean;
};
