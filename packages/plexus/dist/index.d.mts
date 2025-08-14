/**
 * Uniquely identifies a specific version of a plugin.
 */
type PluginIdentifier = {
    name: string;
    version: string;
};
/**
 * The core metadata for a plugin within the dependency graph.
 * It includes its identity, its declared dependencies, and the specific
 * versions it was resolved to (the lock).
 */
type PluginMeta = PluginIdentifier & {
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
type MissingInfo = {
    /** The name of the missing plugin. */
    name: string;
    /** An array of all the semantic version ranges that were requested for this missing plugin. */
    ranges: string[];
};
/**
 * Represents a dependency cycle, which is an ordered list of plugins where
 * each plugin depends on the next, and the last depends on the first.
 */
type Cycle = PluginMeta[];
/**
 * Describes a single change between two dependency graphs, forming one step
 * in a reconciliation plan.
 */
type DiffEntry = {
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
type ProviderResult = Record<string, Record<string, string>>;
/**
 * The function signature for a dependency provider. A provider is a function
 * that, given a plugin name, returns a promise for all its available versions
 * and their respective dependencies.
 */
type Provider = (pluginName: string) => Promise<ProviderResult | undefined>;
/**
 * Options for configuring the behavior of the `DependencyResolver`.
 */
type ResolverOptions = {
    /**
     * Whether to include pre-release versions (e.g., '1.0.0-beta.1') when
     * satisfying version ranges.
     * @default false
     */
    includePrereleases?: boolean;
};

/**
 * Represents the result of comparing two dependency graphs.
 * This class not only holds the lists of added, removed, and modified plugins
 * but also provides a crucial `sort` method to generate a safe, deterministic
 * execution plan for applying these changes.
 */
declare class DiffResult {
    #private;
    constructor(added: PluginMeta[], removed: PluginMeta[], modified: [PluginMeta, PluginMeta][], newGraph: DependencyGraph, oldGraph: DependencyGraph);
    /**
     * Returns an array of plugins that exist in the new graph but not in the old one.
     */
    added(): PluginMeta[];
    /**
     * Returns an array of plugins that exist in the old graph but not in the new one.
     */
    removed(): PluginMeta[];
    /**
     * Returns an array of plugins that exist in both graphs but have been modified.
     * The returned metadata is from the *new* graph.
     */
    modified(): PluginMeta[];
    /**
     * Generates a deterministic, topologically sorted execution plan to transition
     * from the old graph state to the new graph state.
     *
     * The process is as follows:
     * 1.  **Deactivation Plan:** It identifies all plugins that need to be deactivated
     *     (`removed` + `modified`). It then sorts the *old* graph in reverse topological
     *     order to find a safe deactivation sequence (dependents are deactivated before
     *     their dependencies).
     * 2.  **Activation Plan:** It identifies all plugins that need to be activated
     *     (`added` + `modified`). It then sorts the *new* graph in forward topological
     *     order to find a safe activation sequence (dependencies are activated before
     *     their dependents).
     * 3.  **Combine:** The final plan is the deactivation plan followed by the activation plan.
     *
     * @returns An array of `DiffEntry` objects representing the ordered execution plan.
     */
    sort(): DiffEntry[];
}

/**
 * Represents a directed graph of plugin dependencies.
 * Each node in the graph is a `PluginMeta` object, uniquely identified by its
 * name and version. This class provides methods for manipulating the graph and
 * analyzing its properties, such as cycles, missing dependencies, and topological order.
 */
declare class DependencyGraph {
    #private;
    private nodes;
    private invertedAdj;
    /**
     * Gets the total number of plugins (nodes) in the graph.
     */
    getNodesCount(): number;
    /**
     * Returns an iterator for all `PluginMeta` nodes in the graph.
     */
    getNodes(): IterableIterator<PluginMeta>;
    /**
     * Adds a plugin to the graph or updates it if it already exists.
     * @param pluginMeta The metadata of the plugin to add.
     */
    add(pluginMeta: PluginMeta): void;
    /**
     * Removes a specific version of a plugin from the graph.
     * @param name The name of the plugin to remove.
     * @param version The exact version of the plugin to remove.
     */
    remove(name: string, version: string): void;
    /**
     * Retrieves all versions of a plugin by name.
     * @param name The name of the plugin.
     */
    get(name: string): PluginMeta[];
    /**
     * Retrieves a specific version of a plugin.
     * @param name The name of the plugin.
     * @param version The exact version of the plugin.
     */
    get(name: string, version: string): PluginMeta | undefined;
    /**
     * Creates a deep clone of the entire dependency graph.
     * @returns A new `DependencyGraph` instance with identical structure and data.
     */
    clone(): DependencyGraph;
    /**
     * Adds all nodes from another graph into this one, updating existing nodes if necessary.
     * @param graph The graph whose nodes are to be added.
     */
    addAll(graph: DependencyGraph): void;
    /**
     * Removes all nodes found in another graph from this one, based on deep equality.
     * @param graph The graph whose nodes are to be removed.
     */
    removeAll(graph: DependencyGraph): void;
    /**
     * Computes the subgraph of all direct and transitive dependencies for a given plugin.
     * @param name The name of the starting plugin.
     * @param version The version of the starting plugin.
     * @returns A new `DependencyGraph` containing the dependency subgraph.
     */
    depends(name: string, version: string): DependencyGraph;
    /**
     * Computes the subgraph of all direct and transitive dependents for a given plugin.
     * @param name The name of the starting plugin.
     * @param version The version of the starting plugin.
     * @returns A new `DependencyGraph` containing the dependent subgraph.
     */
    dependents(name: string, version: string): DependencyGraph;
    /**
     * Performs a topological sort of the dependency graph.
     * This is essential for determining a safe activation/deactivation order for plugins.
     * The result is a list where each plugin appears before any plugin that depends on it.
     * @returns An array of `PluginMeta` objects in topological order.
     * @throws An error if a cycle is detected in the graph, as a topological sort is not possible.
     */
    sort(): PluginMeta[];
    /**
     * Identifies all dependencies that are required by plugins in the graph
     * but are not present as nodes in the graph.
     * @returns An array of `MissingInfo` objects.
     */
    missing(): MissingInfo[];
    /**
     * Finds all plugins in the graph that do not have a provider specified.
     * These are typically user-provided or root requirements.
     * @returns An array of `PluginMeta` objects considered dangling.
     */
    dangling(): PluginMeta[];
    /**
     * Detects all dependency cycles within the graph using a depth-first search.
     * @returns An array of `Cycle` objects, where each cycle is an array of `PluginMeta`.
     */
    cycles(): Cycle[];
    /**
     * Finds all instances where multiple, distinct versions of the same plugin exist
     * in the graph.
     * @returns An array of arrays, where each inner array contains the conflicting `PluginMeta`s.
     */
    disputes(): PluginMeta[][];
    /**
     * Checks if the graph is in a "complete" and valid state, meaning it has no
     * missing dependencies, dangling nodes, cycles, or version disputes.
     * @returns `true` if the graph is complete, `false` otherwise.
     */
    isCompleted(): boolean;
    /**
     * Compares this graph (the "new" graph) with another graph (the "old" graph)
     * and returns an object detailing the differences.
     * @param oldGraph The `DependencyGraph` instance to compare against.
     * @returns A `DiffResult` object containing added, removed, and modified plugins.
     */
    diff(oldGraph: DependencyGraph): DiffResult;
}

/**
 * A backtracking dependency resolver.
 *
 * This class implements a constraint satisfaction algorithm to find a valid set
 * of plugin versions that satisfy all dependency constraints. It uses providers
 * to fetch available plugin versions and their dependencies.
 */
declare class DependencyResolver {
    #private;
    private providers;
    private providerCache;
    private resolutionMemo;
    /**
     * Registers a dependency provider under a given name.
     * @param name The name of the provider.
     * @param providerFn The provider function.
     */
    register(name: string, providerFn: Provider): void;
    /**
     * Clears all internal caches (provider and resolution memoization).
     * This should be called if the underlying data from providers may have changed.
     */
    clear(): void;
    /**
     * Finds a specific plugin version by querying all registered providers in order.
     * @param name The name of the plugin.
     * @param version The exact version of the plugin.
     * @returns The `PluginMeta` if found, otherwise `undefined`.
     */
    find(name: string, version: string): Promise<PluginMeta | undefined>;
    /**
     * Retrieves metadata for a specific plugin from a specific provider.
     * @param name The name of the plugin.
     * @param version The exact version.
     * @param providerName The name of the provider to query.
     * @returns The `PluginMeta` if found, otherwise `undefined`.
     */
    get(name: string, version: string, providerName: string): Promise<PluginMeta | undefined>;
    /**
     * Resolves a set of top-level requirements into a complete, valid dependency graph.
     *
     * @param requirements A record of top-level plugin names and their required semver ranges.
     * @param options Configuration options for the resolution process.
     * @param lockedGraph An optional existing dependency graph. If provided, the resolver
     *                    will attempt to use the versions in this graph first, promoting
     *                    stability for incremental resolutions.
     * @returns A Promise that resolves to a new, complete `DependencyGraph`.
     * @throws An error if no solution can be found.
     */
    resolve(requirements: Record<string, string>, options?: ResolverOptions, lockedGraph?: DependencyGraph): Promise<DependencyGraph>;
}

/**
 * Manages the top-level dependency requirements and the resulting locked graph.
 *
 * This class serves as the primary user-facing entry point for defining a
 * desired state and triggering a resolution against that state. It encapsulates
 * the logic for incremental resolutions by passing its current locked graph
 * to the resolver as a set of preferred versions.
 */
declare class Requirements {
    private userRequirements;
    private lockedGraph;
    /**
     * Adds or updates a top-level dependency requirement.
     * @param name The name of the package/plugin.
     * @param range The semantic version range required (e.g., "^1.0.0").
     */
    add(name: string, range: string): void;
    /**
     * Removes a top-level dependency requirement.
     * @param name The name of the package/plugin to remove.
     */
    remove(name: string): void;
    /**
     * Gets a copy of the current top-level user requirements.
     * @returns A record of package names to their required version ranges.
     */
    get(): Record<string, string>;
    /**
     * Gets the current locked dependency graph resulting from the last successful resolution.
     * @returns The `DependencyGraph` instance.
     */
    getGraph(): DependencyGraph;
    /**
     * Creates a deep copy of this Requirements instance, including its user requirements
     * and the locked dependency graph.
     * @returns A new `Requirements` instance with identical state.
     */
    clone(): Requirements;
    /**
     * Resolves the current user requirements against the registered providers
     * and updates the internal locked graph with the result.
     *
     * @param resolver The `DependencyResolver` instance to use for the resolution.
     * @param options Options to configure the resolution process.
     */
    resolve(resolver: DependencyResolver, options?: ResolverOptions): Promise<void>;
}

export { type Cycle, DependencyGraph, DependencyResolver, type DiffEntry, DiffResult, type MissingInfo, type PluginIdentifier, type PluginMeta, type Provider, type ProviderResult, Requirements, type ResolverOptions };
