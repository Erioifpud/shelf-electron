import * as semver from "semver";
import { DependencyGraph } from "./dependency-graph.js";
import type {
  PluginMeta,
  Provider,
  ProviderResult,
  ResolverOptions,
} from "./types.js";

// Internal type for tracking the state of the resolution process.
type ResolutionState = {
  graph: DependencyGraph;
  constraints: Map<string, string>; // Maps a plugin name to its required semver range.
};

// Internal type for version information from providers.
type VersionInfo = {
  version: string;
  provider: string;
};

/**
 * A backtracking dependency resolver.
 *
 * This class implements a constraint satisfaction algorithm to find a valid set
 * of plugin versions that satisfy all dependency constraints. It uses providers
 * to fetch available plugin versions and their dependencies.
 */
export class DependencyResolver {
  private providers: Map<string, Provider> = new Map();
  // Caches the results of provider queries to avoid redundant network/disk I/O.
  private providerCache: Map<string, Promise<ProviderResult | undefined>> =
    new Map();
  // Memoization cache for the backtracking solver to prune visited states.
  private resolutionMemo: Map<string, ResolutionState | null> = new Map();

  /**
   * Registers a dependency provider under a given name.
   * @param name The name of the provider.
   * @param providerFn The provider function.
   */
  public register(name: string, providerFn: Provider): void {
    this.providers.set(name, providerFn);
  }

  /**
   * Clears all internal caches (provider and resolution memoization).
   * This should be called if the underlying data from providers may have changed.
   */
  public clear(): void {
    this.providerCache.clear();
    this.resolutionMemo.clear();
  }

  /**
   * Finds a specific plugin version by querying all registered providers in order.
   * @param name The name of the plugin.
   * @param version The exact version of the plugin.
   * @returns The `PluginMeta` if found, otherwise `undefined`.
   */
  public async find(
    name: string,
    version: string
  ): Promise<PluginMeta | undefined> {
    for (const [providerName, providerFn] of this.providers.entries()) {
      const cacheKey = `${providerName}:${name}`;
      let queryPromise = this.providerCache.get(cacheKey);

      if (!queryPromise) {
        queryPromise = providerFn(name);
        this.providerCache.set(cacheKey, queryPromise);
      }

      const result = await queryPromise;

      if (result?.[version]) {
        return {
          name,
          version,
          provider: providerName,
          dependencies: result[version],
          lock: {},
        };
      }
    }
    return undefined;
  }

  /**
   * Retrieves metadata for a specific plugin from a specific provider.
   * @param name The name of the plugin.
   * @param version The exact version.
   * @param providerName The name of the provider to query.
   * @returns The `PluginMeta` if found, otherwise `undefined`.
   */
  public async get(
    name: string,
    version: string,
    providerName: string
  ): Promise<PluginMeta | undefined> {
    const providerFn = this.providers.get(providerName);
    if (!providerFn) return undefined;

    const cacheKey = `${providerName}:${name}`;
    let queryPromise = this.providerCache.get(cacheKey);
    if (!queryPromise) {
      queryPromise = providerFn(name);
      this.providerCache.set(cacheKey, queryPromise);
    }
    const result = await queryPromise;

    if (result?.[version]) {
      return {
        name,
        version,
        provider: providerName,
        dependencies: result[version],
        lock: {},
      };
    }
    return undefined;
  }

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
  public async resolve(
    requirements: Record<string, string>,
    options: ResolverOptions = {},
    lockedGraph?: DependencyGraph
  ): Promise<DependencyGraph> {
    this.resolutionMemo.clear();

    const initialState: ResolutionState = {
      graph: new DependencyGraph(),
      constraints: new Map(Object.entries(requirements)),
    };

    // Start the recursive backtracking solver.
    const finalState = await this.#solve(initialState, options, lockedGraph);

    if (!finalState) {
      throw new Error(
        "Failed to resolve dependencies: No compatible set of packages could be found."
      );
    }

    // Post-process the solved graph to populate the `lock` field for each plugin.
    const resolvedPlugins = Array.from(finalState.graph.getNodes());
    const resolvedMap = new Map<string, PluginMeta>(
      resolvedPlugins.map((p) => [p.name, p])
    );

    const finalGraph = new DependencyGraph();
    for (const plugin of resolvedPlugins) {
      const newLock: Record<string, string> = {};
      for (const depName in plugin.dependencies) {
        const resolvedDep = resolvedMap.get(depName);
        if (resolvedDep) {
          newLock[depName] = resolvedDep.version;
        }
      }
      finalGraph.add({ ...plugin, lock: newLock });
    }

    return finalGraph;
  }

  /**
   * The core recursive backtracking solver.
   * The algorithm follows a Select -> Explore -> Backtrack pattern.
   */
  async #solve(
    state: ResolutionState,
    options: ResolverOptions,
    lockedGraph?: DependencyGraph
  ): Promise<ResolutionState | null> {
    const memoKey = this.#getMemoKey(state);
    if (this.resolutionMemo.has(memoKey)) {
      return this.resolutionMemo.get(memoKey)!;
    }

    // 1. SELECT: Choose the next unresolved dependency to work on.
    const nextDep = await this.#selectNextDependency(state, options);
    if (!nextDep) {
      // Base case: No more unresolved dependencies, a solution has been found.
      return state;
    }

    // 2. EXPLORE: Get all possible versions for the selected dependency and try each one.
    const { name, range } = nextDep;
    const availableVersions = await this.#getAvailableVersions(
      name,
      range,
      options,
      lockedGraph
    );

    if (availableVersions.length === 0) {
      // No versions satisfy the constraint, this path is a dead end.
      this.resolutionMemo.set(memoKey, null);
      return null;
    }

    for (const { version, provider } of availableVersions) {
      const meta = await this.get(name, version, provider);
      if (!meta) continue;

      // Create a new state for the next recursive step.
      const nextConstraints = new Map(state.constraints);
      let isConflict = false;

      // Propagate constraints: Add the new plugin's dependencies to the constraint set.
      for (const [depName, depRange] of Object.entries(meta.dependencies)) {
        // Check for immediate conflicts with already resolved plugins in the graph.
        const resolvedDep = state.graph.get(depName);
        if (
          resolvedDep.length > 0 &&
          !semver.satisfies(resolvedDep[0].version, depRange)
        ) {
          isConflict = true;
          break;
        }

        // Intersect the new range with any existing constraints for this dependency.
        const existingRange = nextConstraints.get(depName);
        const intersection = this.#intersectRanges(existingRange, depRange);

        if (!intersection) {
          isConflict = true; // The ranges are incompatible.
          break;
        }
        nextConstraints.set(depName, intersection);
      }

      if (isConflict) continue; // This version leads to a conflict, try the next one.

      const nextGraph = state.graph.clone();
      nextGraph.add({ ...meta, lock: {} });

      // Recurse with the new state.
      const result = await this.#solve(
        { graph: nextGraph, constraints: nextConstraints },
        options,
        lockedGraph
      );

      if (result) {
        // A solution was found down this path, so propagate it up.
        this.resolutionMemo.set(memoKey, result);
        return result;
      }
    }

    // 3. BACKTRACK: If no version led to a solution, this state is unsolvable.
    this.resolutionMemo.set(memoKey, null);
    return null;
  }

  /**
   * Selects the next dependency to resolve using the Minimum Remaining Values (MRV) heuristic.
   * This optimization prioritizes the most constrained dependency, which helps prune the
   * search tree more quickly.
   */
  async #selectNextDependency(
    state: ResolutionState,
    options: ResolverOptions
  ): Promise<{ name: string; range: string } | null> {
    let mrvSelection: { name: string; range: string } | null = null;
    let minValues = Infinity;

    const unresolvedDependencies = Array.from(
      state.constraints.entries()
    ).filter(([name]) => state.graph.get(name).length === 0);

    if (unresolvedDependencies.length === 0) {
      return null;
    }

    // Asynchronously get the count of available versions for all unresolved dependencies.
    const counts = await Promise.all(
      unresolvedDependencies.map(([name, range]) =>
        this.#getAvailableVersions(name, range, options).then((v) => v.length)
      )
    );

    // Find the dependency with the minimum number of available versions.
    for (let i = 0; i < unresolvedDependencies.length; i++) {
      const count = counts[i];
      if (count < minValues) {
        minValues = count;
        const [name, range] = unresolvedDependencies[i];
        mrvSelection = { name, range };
      }
    }

    return mrvSelection;
  }

  /**
   * Gathers all available versions for a plugin from all providers, filters them
   * by the required range, and sorts them.
   * Crucially, if a `lockedGraph` is provided, it prioritizes the locked version.
   */
  async #getAvailableVersions(
    name: string,
    range: string,
    options: ResolverOptions,
    lockedGraph?: DependencyGraph
  ): Promise<VersionInfo[]> {
    const versionMap = new Map<string, string>(); // Maps version -> providerName

    // Query all providers and consolidate a unique list of versions.
    for (const [providerName, providerFn] of this.providers.entries()) {
      const cacheKey = `${providerName}:${name}`;
      let queryPromise = this.providerCache.get(cacheKey);
      if (!queryPromise) {
        queryPromise = providerFn(name);
        this.providerCache.set(cacheKey, queryPromise);
      }
      const result = await queryPromise;

      if (result) {
        for (const version of Object.keys(result)) {
          // The first provider to offer a version "wins".
          if (!versionMap.has(version)) {
            versionMap.set(version, providerName);
          }
        }
      }
    }

    // Filter all versions against the required semantic version range.
    const satisfyingVersions = Array.from(versionMap.keys()).filter((v) =>
      semver.satisfies(v, range, {
        includePrerelease: options.includePrereleases,
      })
    );

    // Check if a version from the locked graph is a preferred candidate.
    const lockedNode = lockedGraph?.get(name)[0];
    let preferredVersion: string | undefined = undefined;
    if (lockedNode && satisfyingVersions.includes(lockedNode.version)) {
      preferredVersion = lockedNode.version;
    }

    // Sort remaining versions in descending order.
    const sortedRest = satisfyingVersions
      .filter((v) => v !== preferredVersion)
      .sort(semver.rcompare);

    // Place the preferred version at the front of the list to be tried first.
    const sortedVersionStrings = preferredVersion
      ? [preferredVersion, ...sortedRest]
      : sortedRest;

    return sortedVersionStrings.map((v) => ({
      version: v,
      provider: versionMap.get(v)!,
    }));
  }

  #intersectRanges(range1?: string, range2?: string): string | null {
    if (!range1) return range2 ?? null;
    if (!range2) return range1;
    // A simple intersection by string concatenation is sufficient for semver.
    return `${range1} ${range2}`;
  }

  #getMemoKey(state: ResolutionState): string {
    const graphKey = Array.from(state.graph.getNodes())
      .map((p) => `${p.name}@${p.version}`)
      .sort()
      .join(",");

    const constraintsKey = Array.from(state.constraints.entries())
      .map(([name, range]) => `${name}:${range}`)
      .sort()
      .join(",");

    return `${graphKey}|${constraintsKey}`;
  }
}
