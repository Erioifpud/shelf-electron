"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DependencyGraph: () => DependencyGraph,
  DependencyResolver: () => DependencyResolver,
  DiffResult: () => DiffResult,
  Requirements: () => Requirements
});
module.exports = __toCommonJS(index_exports);

// src/diff-result.ts
var DiffResult = class {
  #added;
  #removed;
  #modified;
  // [old, new]
  #newGraph;
  #oldGraph;
  // A cached set for quick lookup of plugins that were modified.
  #modifiedOldIds;
  constructor(added, removed, modified, newGraph, oldGraph) {
    this.#added = added;
    this.#removed = removed;
    this.#modified = modified;
    this.#newGraph = newGraph;
    this.#oldGraph = oldGraph;
    this.#modifiedOldIds = new Set(
      modified.map(([oldMeta]) => `${oldMeta.name}@${oldMeta.version}`)
    );
  }
  /**
   * Returns an array of plugins that exist in the new graph but not in the old one.
   */
  added() {
    return this.#added;
  }
  /**
   * Returns an array of plugins that exist in the old graph but not in the new one.
   */
  removed() {
    return this.#removed;
  }
  /**
   * Returns an array of plugins that exist in both graphs but have been modified.
   * The returned metadata is from the *new* graph.
   */
  modified() {
    return this.#modified.map(([, newMeta]) => newMeta);
  }
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
  sort() {
    const deactivationPlan = [];
    const activationPlan = [];
    const deactivationTargetIds = /* @__PURE__ */ new Set([
      ...this.#removed.map((p) => `${p.name}@${p.version}`),
      ...this.#modifiedOldIds
    ]);
    if (deactivationTargetIds.size > 0) {
      const fullDeactivationOrder = this.#oldGraph.sort().reverse();
      for (const meta of fullDeactivationOrder) {
        const id = `${meta.name}@${meta.version}`;
        if (deactivationTargetIds.has(id)) {
          const type = this.#modifiedOldIds.has(id) ? "replaced" : "removed";
          deactivationPlan.push({ type, meta });
        }
      }
    }
    const addedMetas = this.added();
    const modifiedNewMetas = this.modified();
    const activationTargetIds = new Set(
      [...addedMetas, ...modifiedNewMetas].map((p) => `${p.name}@${p.version}`)
    );
    if (activationTargetIds.size > 0) {
      const fullActivationOrder = this.#newGraph.sort();
      const addedIds = new Set(addedMetas.map((p) => `${p.name}@${p.version}`));
      for (const meta of fullActivationOrder) {
        const id = `${meta.name}@${meta.version}`;
        if (activationTargetIds.has(id)) {
          const type = addedIds.has(id) ? "added" : "modified";
          activationPlan.push({ type, meta });
        }
      }
    }
    return [...deactivationPlan, ...activationPlan];
  }
};

// src/dependency-graph.ts
var DependencyGraph = class _DependencyGraph {
  nodes = /* @__PURE__ */ new Map();
  // An inverted adjacency list for efficient lookup of dependents.
  // Maps a plugin ID to a set of IDs of plugins that depend on it.
  invertedAdj = /* @__PURE__ */ new Map();
  /**
   * Generates a unique string identifier for a plugin.
   * @param name The plugin's name.
   * @param version The plugin's version.
   * @returns A unique ID string.
   */
  #getUniqueId(name, version) {
    return `${name}@${version}`;
  }
  /**
   * Performs a deep equality check on two PluginMeta objects.
   */
  static #metaAreEqual(meta1, meta2) {
    return meta1.provider === meta2.provider && meta1.name === meta2.name && meta1.version === meta2.version && JSON.stringify(meta1.dependencies) === JSON.stringify(meta1.dependencies);
  }
  /**
   * Gets the total number of plugins (nodes) in the graph.
   */
  getNodesCount() {
    return this.nodes.size;
  }
  /**
   * Returns an iterator for all `PluginMeta` nodes in the graph.
   */
  getNodes() {
    return this.nodes.values();
  }
  /**
   * Adds a plugin to the graph or updates it if it already exists.
   * @param pluginMeta The metadata of the plugin to add.
   */
  add(pluginMeta) {
    const id = this.#getUniqueId(pluginMeta.name, pluginMeta.version);
    const existing = this.nodes.get(id);
    if (existing) {
      this.#removeDependenciesFromInvertedAdj(id, existing.lock);
    }
    this.nodes.set(id, pluginMeta);
    this.#addDependenciesToInvertedAdj(id, pluginMeta.lock);
  }
  #addDependenciesToInvertedAdj(id, lock) {
    for (const depName in lock) {
      const depVersion = lock[depName];
      const depId = this.#getUniqueId(depName, depVersion);
      if (!this.invertedAdj.has(depId)) {
        this.invertedAdj.set(depId, /* @__PURE__ */ new Set());
      }
      this.invertedAdj.get(depId).add(id);
    }
  }
  #removeDependenciesFromInvertedAdj(id, lock) {
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
  remove(name, version) {
    const id = this.#getUniqueId(name, version);
    const pluginToRemove = this.nodes.get(id);
    if (pluginToRemove) {
      this.#removeDependenciesFromInvertedAdj(id, pluginToRemove.lock);
      this.invertedAdj.delete(id);
      this.nodes.delete(id);
    }
  }
  get(name, version) {
    if (version !== void 0) {
      return this.nodes.get(this.#getUniqueId(name, version));
    }
    const result = [];
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
  clone() {
    const newGraph = new _DependencyGraph();
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
  addAll(graph) {
    for (const meta of graph.nodes.values()) {
      this.add(structuredClone(meta));
    }
  }
  /**
   * Removes all nodes found in another graph from this one, based on deep equality.
   * @param graph The graph whose nodes are to be removed.
   */
  removeAll(graph) {
    for (const metaToRemove of graph.nodes.values()) {
      const target = this.get(metaToRemove.name, metaToRemove.version);
      if (target && _DependencyGraph.#metaAreEqual(target, metaToRemove)) {
        this.remove(metaToRemove.name, metaToRemove.version);
      }
    }
  }
  #traverse(startNodeId, getNeighbors) {
    const subGraph = new _DependencyGraph();
    const queue = [startNodeId];
    const visited = new Set(queue);
    while (queue.length > 0) {
      const currentId = queue.shift();
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
  depends(name, version) {
    const startId = this.#getUniqueId(name, version);
    if (!this.nodes.has(startId)) return new _DependencyGraph();
    return this.#traverse(startId, (id) => {
      const node = this.nodes.get(id);
      if (!node) return [];
      return Object.entries(node.lock).map(
        ([depName, depVersion]) => this.#getUniqueId(depName, depVersion)
      );
    });
  }
  /**
   * Computes the subgraph of all direct and transitive dependents for a given plugin.
   * @param name The name of the starting plugin.
   * @param version The version of the starting plugin.
   * @returns A new `DependencyGraph` containing the dependent subgraph.
   */
  dependents(name, version) {
    const startId = this.#getUniqueId(name, version);
    if (!this.nodes.has(startId)) return new _DependencyGraph();
    return this.#traverse(startId, (id) => this.invertedAdj.get(id) || []);
  }
  /**
   * Performs a topological sort of the dependency graph.
   * This is essential for determining a safe activation/deactivation order for plugins.
   * The result is a list where each plugin appears before any plugin that depends on it.
   * @returns An array of `PluginMeta` objects in topological order.
   * @throws An error if a cycle is detected in the graph, as a topological sort is not possible.
   */
  sort() {
    const sorted = [];
    const outDegree = /* @__PURE__ */ new Map();
    for (const id of this.nodes.keys()) {
      const meta = this.nodes.get(id);
      outDegree.set(id, Object.keys(meta.lock).length);
    }
    const queue = [];
    for (const [id, degree] of outDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }
    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(this.nodes.get(id));
      const dependents = this.invertedAdj.get(id) || /* @__PURE__ */ new Set();
      for (const dependentId of dependents) {
        const currentDegree = outDegree.get(dependentId);
        if (currentDegree !== void 0) {
          const newDegree = currentDegree - 1;
          outDegree.set(dependentId, newDegree);
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
    }
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
  missing() {
    const missingMap = /* @__PURE__ */ new Map();
    for (const meta of this.nodes.values()) {
      for (const depName in meta.dependencies) {
        const range = meta.dependencies[depName];
        const lockedVersion = meta.lock[depName];
        const isMissing = !lockedVersion || !this.nodes.has(this.#getUniqueId(depName, lockedVersion));
        if (isMissing) {
          if (!missingMap.has(depName)) {
            missingMap.set(depName, /* @__PURE__ */ new Set());
          }
          missingMap.get(depName).add(range);
        }
      }
    }
    const result = [];
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
  dangling() {
    const result = [];
    for (const meta of this.nodes.values()) {
      if (meta.provider === void 0) {
        result.push(meta);
      }
    }
    return result;
  }
  /**
   * Detects all dependency cycles within the graph using a depth-first search.
   * @returns An array of `Cycle` objects, where each cycle is an array of `PluginMeta`.
   */
  cycles() {
    const cycles = [];
    const path = [];
    const visited = /* @__PURE__ */ new Set();
    const recursionStack = /* @__PURE__ */ new Set();
    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        this.#detectCycleUtil(id, path, visited, recursionStack, cycles);
      }
    }
    const uniqueCycles = /* @__PURE__ */ new Map();
    for (const cycle of cycles) {
      const sortedCycle = [...cycle].sort(
        (a, b) => (a.name + a.version).localeCompare(b.name + b.version)
      );
      const cycleId = sortedCycle.map((p) => `${p.name}@${p.version}`).join("->");
      if (!uniqueCycles.has(cycleId)) {
        uniqueCycles.set(cycleId, cycle);
      }
    }
    return Array.from(uniqueCycles.values());
  }
  #detectCycleUtil(id, path, visited, recursionStack, cycles) {
    visited.add(id);
    recursionStack.add(id);
    path.push(id);
    const node = this.nodes.get(id);
    if (node) {
      for (const depName in node.lock) {
        const depVersion = node.lock[depName];
        const depId = this.#getUniqueId(depName, depVersion);
        if (this.nodes.has(depId)) {
          if (recursionStack.has(depId)) {
            const cycleStartIndex = path.indexOf(depId);
            const cyclePathIds = path.slice(cycleStartIndex);
            cycles.push(cyclePathIds.map((cid) => this.nodes.get(cid)));
          } else if (!visited.has(depId)) {
            this.#detectCycleUtil(depId, path, visited, recursionStack, cycles);
          }
        }
      }
    }
    recursionStack.delete(id);
    path.pop();
  }
  /**
   * Finds all instances where multiple, distinct versions of the same plugin exist
   * in the graph.
   * @returns An array of arrays, where each inner array contains the conflicting `PluginMeta`s.
   */
  disputes() {
    const nameMap = /* @__PURE__ */ new Map();
    for (const meta of this.nodes.values()) {
      if (!nameMap.has(meta.name)) {
        nameMap.set(meta.name, []);
      }
      nameMap.get(meta.name).push(meta);
    }
    const disputes = [];
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
  isCompleted() {
    return this.missing().length === 0 && this.dangling().length === 0 && this.cycles().length === 0 && this.disputes().length === 0;
  }
  /**
   * Compares this graph (the "new" graph) with another graph (the "old" graph)
   * and returns an object detailing the differences.
   * @param oldGraph The `DependencyGraph` instance to compare against.
   * @returns A `DiffResult` object containing added, removed, and modified plugins.
   */
  diff(oldGraph) {
    const added = [];
    const removed = [];
    const modified = [];
    const allIds = /* @__PURE__ */ new Set([...this.nodes.keys(), ...oldGraph.nodes.keys()]);
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
  #isModified(current, old) {
    if (current.provider !== old.provider) {
      return true;
    }
    if (JSON.stringify(current.dependencies) !== JSON.stringify(old.dependencies)) {
      return true;
    }
    for (const depName in old.lock) {
      const oldLockedVersion = old.lock[depName];
      const currentLockedVersion = current.lock[depName];
      if (oldLockedVersion !== currentLockedVersion) {
        return true;
      }
    }
    return false;
  }
};

// src/dependency-resolver.ts
var semver = __toESM(require("semver"));
var DependencyResolver = class {
  providers = /* @__PURE__ */ new Map();
  // Caches the results of provider queries to avoid redundant network/disk I/O.
  providerCache = /* @__PURE__ */ new Map();
  // Memoization cache for the backtracking solver to prune visited states.
  resolutionMemo = /* @__PURE__ */ new Map();
  /**
   * Registers a dependency provider under a given name.
   * @param name The name of the provider.
   * @param providerFn The provider function.
   */
  register(name, providerFn) {
    this.providers.set(name, providerFn);
  }
  /**
   * Clears all internal caches (provider and resolution memoization).
   * This should be called if the underlying data from providers may have changed.
   */
  clear() {
    this.providerCache.clear();
    this.resolutionMemo.clear();
  }
  /**
   * Finds a specific plugin version by querying all registered providers in order.
   * @param name The name of the plugin.
   * @param version The exact version of the plugin.
   * @returns The `PluginMeta` if found, otherwise `undefined`.
   */
  async find(name, version) {
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
          lock: {}
        };
      }
    }
    return void 0;
  }
  /**
   * Retrieves metadata for a specific plugin from a specific provider.
   * @param name The name of the plugin.
   * @param version The exact version.
   * @param providerName The name of the provider to query.
   * @returns The `PluginMeta` if found, otherwise `undefined`.
   */
  async get(name, version, providerName) {
    const providerFn = this.providers.get(providerName);
    if (!providerFn) return void 0;
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
        lock: {}
      };
    }
    return void 0;
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
  async resolve(requirements, options = {}, lockedGraph) {
    this.resolutionMemo.clear();
    const initialState = {
      graph: new DependencyGraph(),
      constraints: new Map(Object.entries(requirements))
    };
    const finalState = await this.#solve(initialState, options, lockedGraph);
    if (!finalState) {
      throw new Error(
        "Failed to resolve dependencies: No compatible set of packages could be found."
      );
    }
    const resolvedPlugins = Array.from(finalState.graph.getNodes());
    const resolvedMap = new Map(
      resolvedPlugins.map((p) => [p.name, p])
    );
    const finalGraph = new DependencyGraph();
    for (const plugin of resolvedPlugins) {
      const newLock = {};
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
  async #solve(state, options, lockedGraph) {
    const memoKey = this.#getMemoKey(state);
    if (this.resolutionMemo.has(memoKey)) {
      return this.resolutionMemo.get(memoKey);
    }
    const nextDep = await this.#selectNextDependency(state, options);
    if (!nextDep) {
      return state;
    }
    const { name, range } = nextDep;
    const availableVersions = await this.#getAvailableVersions(
      name,
      range,
      options,
      lockedGraph
    );
    if (availableVersions.length === 0) {
      this.resolutionMemo.set(memoKey, null);
      return null;
    }
    for (const { version, provider } of availableVersions) {
      const meta = await this.get(name, version, provider);
      if (!meta) continue;
      const nextConstraints = new Map(state.constraints);
      let isConflict = false;
      for (const [depName, depRange] of Object.entries(meta.dependencies)) {
        const resolvedDep = state.graph.get(depName);
        if (resolvedDep.length > 0 && !semver.satisfies(resolvedDep[0].version, depRange)) {
          isConflict = true;
          break;
        }
        const existingRange = nextConstraints.get(depName);
        const intersection = this.#intersectRanges(existingRange, depRange);
        if (!intersection) {
          isConflict = true;
          break;
        }
        nextConstraints.set(depName, intersection);
      }
      if (isConflict) continue;
      const nextGraph = state.graph.clone();
      nextGraph.add({ ...meta, lock: {} });
      const result = await this.#solve(
        { graph: nextGraph, constraints: nextConstraints },
        options,
        lockedGraph
      );
      if (result) {
        this.resolutionMemo.set(memoKey, result);
        return result;
      }
    }
    this.resolutionMemo.set(memoKey, null);
    return null;
  }
  /**
   * Selects the next dependency to resolve using the Minimum Remaining Values (MRV) heuristic.
   * This optimization prioritizes the most constrained dependency, which helps prune the
   * search tree more quickly.
   */
  async #selectNextDependency(state, options) {
    let mrvSelection = null;
    let minValues = Infinity;
    const unresolvedDependencies = Array.from(
      state.constraints.entries()
    ).filter(([name]) => state.graph.get(name).length === 0);
    if (unresolvedDependencies.length === 0) {
      return null;
    }
    const counts = await Promise.all(
      unresolvedDependencies.map(
        ([name, range]) => this.#getAvailableVersions(name, range, options).then((v) => v.length)
      )
    );
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
  async #getAvailableVersions(name, range, options, lockedGraph) {
    const versionMap = /* @__PURE__ */ new Map();
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
          if (!versionMap.has(version)) {
            versionMap.set(version, providerName);
          }
        }
      }
    }
    const satisfyingVersions = Array.from(versionMap.keys()).filter(
      (v) => semver.satisfies(v, range, {
        includePrerelease: options.includePrereleases
      })
    );
    const lockedNode = lockedGraph?.get(name)[0];
    let preferredVersion = void 0;
    if (lockedNode && satisfyingVersions.includes(lockedNode.version)) {
      preferredVersion = lockedNode.version;
    }
    const sortedRest = satisfyingVersions.filter((v) => v !== preferredVersion).sort(semver.rcompare);
    const sortedVersionStrings = preferredVersion ? [preferredVersion, ...sortedRest] : sortedRest;
    return sortedVersionStrings.map((v) => ({
      version: v,
      provider: versionMap.get(v)
    }));
  }
  #intersectRanges(range1, range2) {
    if (!range1) return range2 ?? null;
    if (!range2) return range1;
    return `${range1} ${range2}`;
  }
  #getMemoKey(state) {
    const graphKey = Array.from(state.graph.getNodes()).map((p) => `${p.name}@${p.version}`).sort().join(",");
    const constraintsKey = Array.from(state.constraints.entries()).map(([name, range]) => `${name}:${range}`).sort().join(",");
    return `${graphKey}|${constraintsKey}`;
  }
};

// src/requirements.ts
var Requirements = class _Requirements {
  userRequirements = {};
  lockedGraph = new DependencyGraph();
  /**
   * Adds or updates a top-level dependency requirement.
   * @param name The name of the package/plugin.
   * @param range The semantic version range required (e.g., "^1.0.0").
   */
  add(name, range) {
    this.userRequirements[name] = range;
  }
  /**
   * Removes a top-level dependency requirement.
   * @param name The name of the package/plugin to remove.
   */
  remove(name) {
    delete this.userRequirements[name];
  }
  /**
   * Gets a copy of the current top-level user requirements.
   * @returns A record of package names to their required version ranges.
   */
  get() {
    return { ...this.userRequirements };
  }
  /**
   * Gets the current locked dependency graph resulting from the last successful resolution.
   * @returns The `DependencyGraph` instance.
   */
  getGraph() {
    return this.lockedGraph;
  }
  /**
   * Creates a deep copy of this Requirements instance, including its user requirements
   * and the locked dependency graph.
   * @returns A new `Requirements` instance with identical state.
   */
  clone() {
    const copy = new _Requirements();
    copy.userRequirements = { ...this.userRequirements };
    copy.lockedGraph = this.lockedGraph.clone();
    return copy;
  }
  /**
   * Resolves the current user requirements against the registered providers
   * and updates the internal locked graph with the result.
   *
   * @param resolver The `DependencyResolver` instance to use for the resolution.
   * @param options Options to configure the resolution process.
   */
  async resolve(resolver, options = {}) {
    const newGraph = await resolver.resolve(
      this.userRequirements,
      options,
      this.lockedGraph
      // The current graph is passed to prefer locked versions.
    );
    this.lockedGraph = newGraph;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DependencyGraph,
  DependencyResolver,
  DiffResult,
  Requirements
});
