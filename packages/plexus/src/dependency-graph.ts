import type { Cycle, MissingInfo, PluginMeta } from "./types.js";
import { DiffResult } from "./diff-result.js";

/**
 * Represents a directed graph of plugin dependencies.
 * Each node in the graph is a `PluginMeta` object, uniquely identified by its
 * name and version. This class provides methods for manipulating the graph and
 * analyzing its properties, such as cycles, missing dependencies, and topological order.
 */
export class DependencyGraph {
  private nodes: Map<string, PluginMeta> = new Map();
  // An inverted adjacency list for efficient lookup of dependents.
  // Maps a plugin ID to a set of IDs of plugins that depend on it.
  private invertedAdj: Map<string, Set<string>> = new Map();

  /**
   * Generates a unique string identifier for a plugin.
   * @param name The plugin's name.
   * @param version The plugin's version.
   * @returns A unique ID string.
   */
  #getUniqueId(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /**
   * Performs a deep equality check on two PluginMeta objects.
   */
  static #metaAreEqual(meta1: PluginMeta, meta2: PluginMeta): boolean {
    return (
      meta1.provider === meta2.provider &&
      meta1.name === meta2.name &&
      meta1.version === meta2.version &&
      JSON.stringify(meta1.dependencies) === JSON.stringify(meta1.dependencies)
    );
  }

  /**
   * Gets the total number of plugins (nodes) in the graph.
   */
  public getNodesCount(): number {
    return this.nodes.size;
  }

  /**
   * Returns an iterator for all `PluginMeta` nodes in the graph.
   */
  public getNodes(): IterableIterator<PluginMeta> {
    return this.nodes.values();
  }

  /**
   * Adds a plugin to the graph or updates it if it already exists.
   * @param pluginMeta The metadata of the plugin to add.
   */
  public add(pluginMeta: PluginMeta): void {
    const id = this.#getUniqueId(pluginMeta.name, pluginMeta.version);
    const existing = this.nodes.get(id);
    if (existing) {
      this.#removeDependenciesFromInvertedAdj(id, existing.lock);
    }
    this.nodes.set(id, pluginMeta);
    this.#addDependenciesToInvertedAdj(id, pluginMeta.lock);
  }

  #addDependenciesToInvertedAdj(
    id: string,
    lock: Record<string, string>
  ): void {
    for (const depName in lock) {
      const depVersion = lock[depName];
      const depId = this.#getUniqueId(depName, depVersion);
      if (!this.invertedAdj.has(depId)) {
        this.invertedAdj.set(depId, new Set());
      }
      this.invertedAdj.get(depId)!.add(id);
    }
  }

  #removeDependenciesFromInvertedAdj(
    id: string,
    lock: Record<string, string>
  ): void {
    for (const depName in lock) {
      const depVersion = lock[depName];
      const depId = this.#getUniqueId(depName, depVersion);
      const dependents = this.invertedAdj.get(depId);
      if (dependents) {
        dependents.delete(id);
        if (dependents.size === 0) {
          this.invertedAdj.delete(depId);
        }
      }
    }
  }

  /**
   * Removes a specific version of a plugin from the graph.
   * @param name The name of the plugin to remove.
   * @param version The exact version of the plugin to remove.
   */
  public remove(name: string, version: string): void {
    const id = this.#getUniqueId(name, version);
    const pluginToRemove = this.nodes.get(id);
    if (pluginToRemove) {
      this.#removeDependenciesFromInvertedAdj(id, pluginToRemove.lock);
      this.invertedAdj.delete(id);
      this.nodes.delete(id);
    }
  }

  /**
   * Retrieves all versions of a plugin by name.
   * @param name The name of the plugin.
   */
  public get(name: string): PluginMeta[];
  /**
   * Retrieves a specific version of a plugin.
   * @param name The name of the plugin.
   * @param version The exact version of the plugin.
   */
  public get(name: string, version: string): PluginMeta | undefined;
  public get(
    name: string,
    version?: string
  ): PluginMeta[] | PluginMeta | undefined {
    if (version !== undefined) {
      return this.nodes.get(this.#getUniqueId(name, version));
    }
    const result: PluginMeta[] = [];
    for (const plugin of this.nodes.values()) {
      if (plugin.name === name) {
        result.push(plugin);
      }
    }
    return result;
  }

  /**
   * Creates a deep clone of the entire dependency graph.
   * @returns A new `DependencyGraph` instance with identical structure and data.
   */
  public clone(): DependencyGraph {
    const newGraph = new DependencyGraph();
    for (const [id, meta] of this.nodes.entries()) {
      newGraph.nodes.set(id, structuredClone(meta));
    }
    for (const [id, dependents] of this.invertedAdj.entries()) {
      newGraph.invertedAdj.set(id, new Set(dependents));
    }
    return newGraph;
  }

  /**
   * Adds all nodes from another graph into this one, updating existing nodes if necessary.
   * @param graph The graph whose nodes are to be added.
   */
  public addAll(graph: DependencyGraph): void {
    for (const meta of graph.nodes.values()) {
      this.add(structuredClone(meta));
    }
  }

  /**
   * Removes all nodes found in another graph from this one, based on deep equality.
   * @param graph The graph whose nodes are to be removed.
   */
  public removeAll(graph: DependencyGraph): void {
    for (const metaToRemove of graph.nodes.values()) {
      const target = this.get(metaToRemove.name, metaToRemove.version);
      if (target && DependencyGraph.#metaAreEqual(target, metaToRemove)) {
        this.remove(metaToRemove.name, metaToRemove.version);
      }
    }
  }

  #traverse(
    startNodeId: string,
    getNeighbors: (id: string) => Iterable<string>
  ): DependencyGraph {
    const subGraph = new DependencyGraph();
    const queue = [startNodeId];
    const visited = new Set<string>(queue);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = this.nodes.get(currentId);
      if (node) {
        subGraph.add(structuredClone(node));
        for (const neighborId of getNeighbors(currentId)) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }
    return subGraph;
  }

  /**
   * Computes the subgraph of all direct and transitive dependencies for a given plugin.
   * @param name The name of the starting plugin.
   * @param version The version of the starting plugin.
   * @returns A new `DependencyGraph` containing the dependency subgraph.
   */
  public depends(name: string, version: string): DependencyGraph {
    const startId = this.#getUniqueId(name, version);
    if (!this.nodes.has(startId)) return new DependencyGraph();

    return this.#traverse(startId, (id) => {
      const node = this.nodes.get(id);
      if (!node) return [];
      return Object.entries(node.lock).map(([depName, depVersion]) =>
        this.#getUniqueId(depName, depVersion)
      );
    });
  }

  /**
   * Computes the subgraph of all direct and transitive dependents for a given plugin.
   * @param name The name of the starting plugin.
   * @param version The version of the starting plugin.
   * @returns A new `DependencyGraph` containing the dependent subgraph.
   */
  public dependents(name: string, version: string): DependencyGraph {
    const startId = this.#getUniqueId(name, version);
    if (!this.nodes.has(startId)) return new DependencyGraph();

    return this.#traverse(startId, (id) => this.invertedAdj.get(id) || []);
  }

  /**
   * Performs a topological sort of the dependency graph.
   * This is essential for determining a safe activation/deactivation order for plugins.
   * The result is a list where each plugin appears before any plugin that depends on it.
   * @returns An array of `PluginMeta` objects in topological order.
   * @throws An error if a cycle is detected in the graph, as a topological sort is not possible.
   */
  public sort(): PluginMeta[] {
    const sorted: PluginMeta[] = [];
    const outDegree = new Map<string, number>();

    // Step 1: Calculate the out-degree (number of dependencies) for each node.
    for (const id of this.nodes.keys()) {
      const meta = this.nodes.get(id)!;
      outDegree.set(id, Object.keys(meta.lock).length);
    }

    // Step 2: Initialize a queue with all nodes that have an out-degree of 0 (no dependencies).
    const queue: string[] = [];
    for (const [id, degree] of outDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Step 3: Process the queue (Kahn's algorithm).
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(this.nodes.get(id)!);

      // For each dependent of the current node, decrement its out-degree.
      const dependents = this.invertedAdj.get(id) || new Set();
      for (const dependentId of dependents) {
        const currentDegree = outDegree.get(dependentId);
        if (currentDegree !== undefined) {
          const newDegree = currentDegree - 1;
          outDegree.set(dependentId, newDegree);
          // If a dependent's out-degree becomes 0, it's ready to be processed.
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
    }

    // Step 4: If the sorted list doesn't contain all nodes, a cycle exists.
    if (sorted.length !== this.nodes.size) {
      throw new Error(
        "Cycle detected in dependency graph. Cannot perform topological sort."
      );
    }

    return sorted;
  }

  /**
   * Identifies all dependencies that are required by plugins in the graph
   * but are not present as nodes in the graph.
   * @returns An array of `MissingInfo` objects.
   */
  public missing(): MissingInfo[] {
    const missingMap = new Map<string, Set<string>>();

    for (const meta of this.nodes.values()) {
      for (const depName in meta.dependencies) {
        const range = meta.dependencies[depName];
        const lockedVersion = meta.lock[depName];

        // A dependency is missing if it's not locked or if the locked version isn't in the graph.
        const isMissing =
          !lockedVersion ||
          !this.nodes.has(this.#getUniqueId(depName, lockedVersion));

        if (isMissing) {
          if (!missingMap.has(depName)) {
            missingMap.set(depName, new Set());
          }
          missingMap.get(depName)!.add(range);
        }
      }
    }

    const result: MissingInfo[] = [];
    for (const [name, rangesSet] of missingMap.entries()) {
      result.push({ name, ranges: Array.from(rangesSet) });
    }
    return result;
  }

  /**
   * Finds all plugins in the graph that do not have a provider specified.
   * These are typically user-provided or root requirements.
   * @returns An array of `PluginMeta` objects considered dangling.
   */
  public dangling(): PluginMeta[] {
    const result: PluginMeta[] = [];
    for (const meta of this.nodes.values()) {
      if (meta.provider === undefined) {
        result.push(meta);
      }
    }
    return result;
  }

  /**
   * Detects all dependency cycles within the graph using a depth-first search.
   * @returns An array of `Cycle` objects, where each cycle is an array of `PluginMeta`.
   */
  public cycles(): Cycle[] {
    const cycles: Cycle[] = [];
    const path: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        this.#detectCycleUtil(id, path, visited, recursionStack, cycles);
      }
    }

    // Deduplicate cycles that are rotations of each other.
    const uniqueCycles = new Map<string, Cycle>();
    for (const cycle of cycles) {
      const sortedCycle = [...cycle].sort((a, b) =>
        (a.name + a.version).localeCompare(b.name + b.version)
      );
      const cycleId = sortedCycle
        .map((p) => `${p.name}@${p.version}`)
        .join("->");
      if (!uniqueCycles.has(cycleId)) {
        uniqueCycles.set(cycleId, cycle);
      }
    }

    return Array.from(uniqueCycles.values());
  }

  #detectCycleUtil(
    id: string,
    path: string[],
    visited: Set<string>,
    recursionStack: Set<string>,
    cycles: Cycle[]
  ): void {
    visited.add(id);
    recursionStack.add(id);
    path.push(id);

    const node = this.nodes.get(id);
    if (node) {
      // Visit all dependencies of the current node.
      for (const depName in node.lock) {
        const depVersion = node.lock[depName];
        const depId = this.#getUniqueId(depName, depVersion);

        if (this.nodes.has(depId)) {
          // If a dependency is already in the recursion stack, we've found a cycle.
          if (recursionStack.has(depId)) {
            const cycleStartIndex = path.indexOf(depId);
            const cyclePathIds = path.slice(cycleStartIndex);
            cycles.push(cyclePathIds.map((cid) => this.nodes.get(cid)!));
          } else if (!visited.has(depId)) {
            this.#detectCycleUtil(depId, path, visited, recursionStack, cycles);
          }
        }
      }
    }

    // Backtrack: remove the current node from the recursion stack and path.
    recursionStack.delete(id);
    path.pop();
  }

  /**
   * Finds all instances where multiple, distinct versions of the same plugin exist
   * in the graph.
   * @returns An array of arrays, where each inner array contains the conflicting `PluginMeta`s.
   */
  public disputes(): PluginMeta[][] {
    const nameMap = new Map<string, PluginMeta[]>();
    for (const meta of this.nodes.values()) {
      if (!nameMap.has(meta.name)) {
        nameMap.set(meta.name, []);
      }
      nameMap.get(meta.name)!.push(meta);
    }

    const disputes: PluginMeta[][] = [];
    for (const metas of nameMap.values()) {
      if (metas.length > 1) {
        disputes.push(metas);
      }
    }
    return disputes;
  }

  /**
   * Checks if the graph is in a "complete" and valid state, meaning it has no
   * missing dependencies, dangling nodes, cycles, or version disputes.
   * @returns `true` if the graph is complete, `false` otherwise.
   */
  public isCompleted(): boolean {
    return (
      this.missing().length === 0 &&
      this.dangling().length === 0 &&
      this.cycles().length === 0 &&
      this.disputes().length === 0
    );
  }

  /**
   * Compares this graph (the "new" graph) with another graph (the "old" graph)
   * and returns an object detailing the differences.
   * @param oldGraph The `DependencyGraph` instance to compare against.
   * @returns A `DiffResult` object containing added, removed, and modified plugins.
   */
  public diff(oldGraph: DependencyGraph): DiffResult {
    const added: PluginMeta[] = [];
    const removed: PluginMeta[] = [];
    const modified: [PluginMeta, PluginMeta][] = []; // [old, new]

    const allIds = new Set([...this.nodes.keys(), ...oldGraph.nodes.keys()]);

    for (const id of allIds) {
      const currentPlugin = this.nodes.get(id);
      const oldPlugin = oldGraph.nodes.get(id);

      if (currentPlugin && !oldPlugin) {
        added.push(currentPlugin);
      } else if (!currentPlugin && oldPlugin) {
        removed.push(oldPlugin);
      } else if (currentPlugin && oldPlugin) {
        if (this.#isModified(currentPlugin, oldPlugin)) {
          modified.push([oldPlugin, currentPlugin]);
        }
      }
    }

    return new DiffResult(added, removed, modified, this, oldGraph);
  }

  /**
   * Checks if a plugin is modified between two graph states.
   * This logic is crucial for generating correct diffs.
   */
  #isModified(current: PluginMeta, old: PluginMeta): boolean {
    // Check for changes in provider or declared dependencies.
    if (current.provider !== old.provider) {
      return true;
    }
    if (
      JSON.stringify(current.dependencies) !== JSON.stringify(old.dependencies)
    ) {
      return true;
    }

    // Iterate through the OLD lock file. If any entry in the old lock
    // has changed its value in the new lock, it's a modification.
    // A new entry in the new lock does not count as a modification.
    for (const depName in old.lock) {
      const oldLockedVersion = old.lock[depName];
      const currentLockedVersion = current.lock[depName];
      // A modification occurs if the dependency existed before but now has a different version,
      // or if it was removed entirely from the lock (which is less common).
      if (oldLockedVersion !== currentLockedVersion) {
        return true;
      }
    }

    // If we've gotten this far, it's not a modification.
    return false;
  }
}
