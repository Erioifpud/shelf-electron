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
  Bootloader: () => Bootloader,
  LifecycleEvent: () => LifecycleEvent,
  MemoryContainer: () => MemoryContainer,
  Registry: () => Registry,
  System: () => System
});
module.exports = __toCommonJS(index_exports);

// src/bootloader.ts
var import_ebus = require("@eleplug/ebus");

// src/utils.ts
function parseUri(uri) {
  if (!uri.startsWith("plugin://")) {
    throw new Error(
      `Invalid plugin URI format: "${uri}". URI must start with "plugin://".`
    );
  }
  try {
    const url = new URL(uri);
    const containerName = url.hostname;
    const path = (url.pathname + url.search + url.hash).substring(1);
    if (!containerName || !path) {
      throw new Error(
        `Invalid plugin URI: "${uri}". URI must include a container name and a path.`
      );
    }
    return { containerName, path };
  } catch (e) {
    throw new Error(
      `Failed to parse plugin URI: "${uri}". Please ensure it follows the format "plugin://<container-name>/<path>".`
    );
  }
}

// src/managers/resource.manager.ts
var ResourceManager = class {
  // A function that dynamically provides the current map of mounted containers.
  // This pattern avoids circular dependency issues with ContainerManager.
  getContainers;
  /**
   * @param getContainers A function that returns the map of currently mounted containers.
   */
  constructor(getContainers) {
    this.getContainers = getContainers;
  }
  /**
   * Retrieves the appropriate container based on its name.
   * @param name The name of the container.
   * @returns The container instance.
   * @throws An `Error` if the container is not mounted.
   */
  #getContainer(name) {
    const container = this.getContainers().get(name);
    if (!container) {
      throw new Error(
        `Container with name '${name}' is not mounted or does not exist.`
      );
    }
    return container;
  }
  /**
   * Retrieves a resource's readable stream by its full URI.
   * @param uri The full URI of the resource, e.g., "plugin://my-container/path/to/resource.txt".
   * @returns A Promise that resolves to the resource's response object.
   */
  async get(uri) {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    return container.resources.get(path);
  }
  /**
   * Writes or overwrites a resource from a readable stream.
   * @param uri The full URI of the resource to write to.
   * @param stream A readable stream containing the new resource content.
   */
  async put(uri, stream) {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    await container.resources.put(path, stream);
  }
  /**
   * Lists the contents of a directory-like resource.
   * @param uri The full URI of the directory to list.
   * @returns A Promise that resolves to an array of resource names.
   */
  async list(uri) {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    return container.resources.list(path);
  }
};

// src/managers/container.manager.ts
var ContainerManager = class {
  /**
   * @param bus The central EBUS instance, which will be passed to container factories.
   */
  constructor(bus) {
    this.bus = bus;
    this.resources = new ResourceManager(() => this.containers);
  }
  resources;
  containers = /* @__PURE__ */ new Map();
  /**
   * Mounts a new container, making it available to the system.
   * @param name The unique name for the container.
   * @param factory A factory function that creates the container instance.
   * @throws Throws an error if a container with the same name is already mounted.
   */
  async mount(name, factory) {
    if (this.containers.has(name)) {
      throw new Error(`Container with name '${name}' is already mounted.`);
    }
    const container = await factory(this.bus);
    this.containers.set(name, container);
  }
  /**
   * Unmounts a container from the system, calling its `close` method to release resources.
   * @param name The name of the container to unmount.
   */
  async unmount(name) {
    const container = this.containers.get(name);
    if (!container) {
      console.warn(`Attempted to unmount non-existent container: '${name}'.`);
      return;
    }
    try {
      await container.close();
    } finally {
      this.containers.delete(name);
    }
  }
  /**
   * Retrieves a mounted container instance by its name.
   * @param name The name of the container.
   * @returns The `Container` instance, or `undefined` if not found.
   */
  get(name) {
    return this.containers.get(name);
  }
  /**
   * Gracefully closes all mounted containers.
   * This is typically called during system shutdown.
   */
  async closeAll() {
    const closePromises = Array.from(this.containers.values()).map(
      (c) => c.close()
    );
    await Promise.allSettled(closePromises);
    this.containers.clear();
  }
};

// src/managers/plugin.manager.ts
var import_plexus = require("@eleplug/plexus");
var semver = __toESM(require("semver"));
var PluginManager = class {
  registry;
  orchestrator;
  containerManager;
  /**
   * Represents the dependency graph of all currently enabled and running plugins.
   * This graph is updated by the Orchestrator after each successful reconciliation.
   */
  enabled = {
    graph: new import_plexus.DependencyGraph(),
    /**
     * A plexus Provider that sources its data from currently running plugins.
     * Useful for resolving dependencies among already active plugins.
     */
    get provider() {
      const graph = this.graph;
      return async (pluginName) => {
        const plugins = graph.get(pluginName);
        if (plugins.length === 0) return void 0;
        const result = {};
        for (const p of plugins) {
          result[p.version] = p.dependencies;
        }
        return result;
      };
    }
  };
  /**
   * Represents all plugins registered in the system, regardless of their state.
   */
  all = {
    registry: () => this.registry,
    /**
     * A plexus Provider that sources its data from the entire Registry.
     * This is the primary data source for dependency resolution pre-flight checks.
     */
    get provider() {
      const reg = this.registry();
      return async (pluginName) => {
        const entries = reg.find({ name: pluginName });
        if (entries.length === 0) return void 0;
        const result = {};
        entries.forEach((e) => {
          result[e.version] = e.pluginDependencies;
        });
        return result;
      };
    }
  };
  get graph() {
    return this.enabled.graph;
  }
  /**
   * Initializes the PluginManager with its dependencies.
   */
  init(registry, orchestrator, containerManager) {
    this.registry = registry;
    this.orchestrator = orchestrator;
    this.containerManager = containerManager;
  }
  /**
   * Ensures a plugin is installed and, optionally, enabled. This is an idempotent operation.
   * If the plugin is not installed, it will be installed. If it is not enabled, it will be enabled.
   * By default, this triggers a reconciliation to apply the changes.
   *
   * @param options The options for the ensure operation.
   * @throws Throws if the installation or enabling process fails.
   */
  async ensure(options) {
    const { uri, enable = true, strict = true, reconcile = true } = options;
    let entry = this.registry.findOne({ uri });
    if (!entry) {
      console.log(
        `[PluginManager.ensure] Plugin with URI '${uri}' not found. Installing...`
      );
      await this.install(uri);
      entry = this.registry.findOne({ uri });
      if (!entry) {
        throw new Error(
          `[PluginManager.ensure] Consistency Error: Plugin '${uri}' not found in registry immediately after installation.`
        );
      }
    }
    if (enable && entry.state !== "enable") {
      console.log(
        `[PluginManager.ensure] Plugin '${entry.name}@${entry.version}' is not enabled. Enabling...`
      );
      await this.enable({
        name: entry.name,
        range: entry.version,
        reconcile,
        strict
      });
    } else if (enable) {
      console.log(
        `[PluginManager.ensure] Plugin '${entry.name}@${entry.version}' is already installed and enabled.`
      );
    }
  }
  /**
   * Installs a plugin from a container by fetching its manifest and adding it to the registry.
   * The plugin is installed in a 'disable' state by default.
   *
   * @param uri The full URI of the plugin, e.g., "plugin://my-container/my-plugin".
   * @throws Throws if the plugin is already registered or if the container is not found.
   */
  async install(uri) {
    if (this.registry.findOne({ uri })) {
      throw new Error(
        `Install failed: Plugin with URI '${uri}' is already registered.`
      );
    }
    const { containerName, path } = parseUri(uri);
    const container = this.containerManager.get(containerName);
    if (!container) {
      throw new Error(
        `Install failed: Container '${containerName}' not found.`
      );
    }
    try {
      const manifest = await container.plugins.manifest(path);
      this.registry.register({
        uri,
        name: manifest.name,
        version: manifest.version,
        pluginDependencies: manifest.pluginDependencies,
        main: manifest.main
      });
    } catch (error) {
      throw new Error(
        `Failed to install plugin from '${uri}': ${error.message}`
      );
    }
  }
  /**
   * Uninstalls a plugin from the system by removing its entry from the registry.
   *
   * @param uri The full URI of the plugin to uninstall.
   * @throws Throws an error if the plugin is currently enabled.
   */
  async uninstall(uri) {
    const entry = this.registry.findOne({ uri });
    if (!entry) {
      console.warn(
        `Uninstall skipped: Plugin with URI '${uri}' is not registered.`
      );
      return;
    }
    if (entry.state === "enable") {
      throw new Error(
        `Cannot uninstall plugin '${entry.name}'. It is currently enabled. Please disable it first.`
      );
    }
    this.registry.unregister(uri);
  }
  /**
   * Enables the highest satisfying version of a plugin within a given semantic version range.
   * This marks the plugin's desired state as 'enable' and dirties the orchestrator.
   *
   * @param options The options for the enable operation.
   */
  async enable(options) {
    const { name, range, reconcile = true, strict = true } = options;
    const entries = this.registry.find({ name });
    const satisfyingVersions = entries.filter(
      (e) => semver.satisfies(e.version, range, { includePrerelease: true })
    );
    if (satisfyingVersions.length === 0) {
      throw new Error(
        `Enable failed: No version found for '${name}' that satisfies range '${range}'.`
      );
    }
    const targetEntry = satisfyingVersions.sort(
      (a, b) => semver.rcompare(a.version, b.version)
    )[0];
    if (strict) {
      for (const depName in targetEntry.pluginDependencies) {
        const depRange = targetEntry.pluginDependencies[depName];
        const available = this.registry.find({ name: depName });
        const canSatisfy = available.some(
          (dep) => semver.satisfies(dep.version, depRange, { includePrerelease: true })
        );
        if (!canSatisfy) {
          throw new Error(
            `Enable pre-flight check failed: Cannot satisfy dependency '${depName}@${depRange}' for plugin '${name}'.`
          );
        }
      }
    }
    this.registry.updateState(targetEntry.uri, "enable");
    this.orchestrator.markDirty();
    if (reconcile) {
      await this.orchestrator.reconcile();
    }
  }
  /**
   * Disables an enabled plugin.
   * In strict mode (default), this will fail if other enabled plugins depend on it.
   * In non-strict mode, it will cascade-disable all its dependents.
   *
   * @param options The options for the disable operation.
   */
  async disable(options) {
    const { name, reconcile = true, strict = true } = options;
    const enabledEntries = this.registry.find({ name, state: "enable" });
    if (enabledEntries.length === 0) {
      return;
    }
    for (const entryToDisable of enabledEntries) {
      if (strict) {
        const dependents = this.graph.dependents(
          entryToDisable.name,
          entryToDisable.version
        );
        const activeDependents = [];
        for (const depMeta of dependents.getNodes()) {
          if (depMeta.name === entryToDisable.name && depMeta.version === entryToDisable.version) {
            continue;
          }
          const depEntry = this.registry.findOne({
            name: depMeta.name,
            version: depMeta.version
          });
          if (depEntry?.state === "enable") {
            activeDependents.push(depMeta.name);
          }
        }
        if (activeDependents.length > 0) {
          throw new Error(
            `Cannot disable '${name}'. It is required by enabled plugins: ${[...new Set(activeDependents)].join(", ")}`
          );
        }
      } else {
        const dependents = this.graph.dependents(
          entryToDisable.name,
          entryToDisable.version
        );
        for (const depMeta of dependents.getNodes()) {
          const depEntry = this.registry.findOne({
            name: depMeta.name,
            version: depMeta.version
          });
          if (depEntry) {
            this.registry.updateState(depEntry.uri, "disable");
          }
        }
      }
      this.registry.updateState(entryToDisable.uri, "disable");
    }
    this.orchestrator.markDirty();
    if (reconcile) {
      await this.orchestrator.reconcile();
    }
  }
};

// src/managers/orchestrator.ts
var import_plexus2 = require("@eleplug/plexus");
var Orchestrator = class {
  resolver = new import_plexus2.DependencyResolver();
  isReconciling = false;
  isDirty = false;
  registry;
  pluginManager;
  containerManager;
  /**
   * Initializes the Orchestrator with its dependencies.
   */
  init(registry, pluginManager, containerManager) {
    this.registry = registry;
    this.pluginManager = pluginManager;
    this.containerManager = containerManager;
    this.resolver.register("system-registry", pluginManager.all.provider);
  }
  /**
   * Checks if the system state has changed and a reconciliation is needed.
   */
  shouldReconcile() {
    return this.isDirty;
  }
  /**
   * Marks the system state as changed, indicating a reconciliation is required.
   * @internal
   */
  markDirty() {
    this.isDirty = true;
  }
  /**
   * Executes a full reconciliation cycle.
   * This is the core process for synchronizing desired and actual states.
   */
  async reconcile() {
    if (this.isReconciling) {
      console.warn("Reconciliation is already in progress. Skipping.");
      return;
    }
    this.isReconciling = true;
    this.isDirty = false;
    try {
      const targetReqs = new import_plexus2.Requirements();
      this.registry.find({ state: "enable" }).forEach((p) => {
        targetReqs.add(p.name, p.version);
      });
      const newGraph = await this.resolver.resolve(
        targetReqs.get(),
        { includePrereleases: true },
        this.pluginManager.enabled.graph
      );
      if (!newGraph.isCompleted()) {
        const issues = JSON.stringify(
          {
            missing: newGraph.missing(),
            cycles: newGraph.cycles(),
            disputes: newGraph.disputes()
          },
          null,
          2
        );
        const errorMessage = `Reconciliation failed: Unsolvable dependency set. Issues: ${issues}`;
        throw new Error(errorMessage);
      }
      const diff = newGraph.diff(this.pluginManager.enabled.graph);
      const plan = diff.sort();
      if (plan.length > 0) {
        await this.executePlan(plan);
        this.pluginManager.enabled.graph = newGraph;
      }
    } catch (error) {
      this.isDirty = true;
      console.error("An error occurred during reconciliation:", error);
      throw error;
    } finally {
      this.isReconciling = false;
    }
  }
  /**
   * Executes a topologically sorted plan to activate or deactivate plugins.
   * @param plan An array of diff entries sorted for correct execution order.
   */
  async executePlan(plan) {
    for (const entry of plan) {
      try {
        await this.#executePlanEntry(entry);
      } catch (error) {
        this.#handleExecutionError(entry, error);
        throw error;
      }
    }
  }
  /**
   * Executes a single entry from the reconciliation plan.
   * @param entry The diff entry to execute.
   */
  async #executePlanEntry(entry) {
    const { type, meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version
    });
    if (!registryEntry) {
      throw new Error(
        `Consistency Error: Plugin '${meta.name}@${meta.version}' found in plan but not in registry.`
      );
    }
    const { containerName, path } = parseUri(registryEntry.uri);
    const container = this.containerManager.get(containerName);
    if (!container) {
      throw new Error(
        `Container '${containerName}' not found for plugin '${meta.name}'.`
      );
    }
    if (type === "removed" || type === "replaced") {
      await container.plugins.deactivate(path);
      this.registry.updateStatus(registryEntry.uri, "stopped");
    } else if (type === "added" || type === "modified") {
      await container.plugins.activate(containerName, path);
      this.registry.updateStatus(registryEntry.uri, "running");
    }
  }
  /**
   * Centralized handler for errors occurring during plan execution.
   * It logs the error and updates the plugin's status in the registry.
   * @param entry The plan entry that failed.
   * @param error The error that was thrown.
   */
  #handleExecutionError(entry, error) {
    const { meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version
    });
    if (registryEntry) {
      this.registry.updateStatus(registryEntry.uri, "error", error.message);
    }
    console.error(
      `Failed to execute step '${entry.type}' for plugin '${meta.name}':`,
      error
    );
  }
};

// src/system.ts
var import_plexus3 = require("@eleplug/plexus");
var System = class {
  containers;
  plugins;
  orchestrator;
  registry;
  bus;
  constructor(bus, registry, containerManager) {
    this.bus = bus;
    this.registry = registry;
    this.containers = containerManager;
    this.plugins = new PluginManager();
    this.orchestrator = new Orchestrator();
    this.#assembleManagers();
  }
  /**
   * Wires up the internal dependencies between the managers.
   * This is called once during system construction.
   */
  #assembleManagers() {
    this.plugins.init(this.registry, this.orchestrator, this.containers);
    this.orchestrator.init(this.registry, this.plugins, this.containers);
  }
  /**
   * Provides unified access to all container resources.
   * This is a convenience alias for `system.containers.resources`.
   */
  get resources() {
    return this.containers.resources;
  }
  /**
   * Checks if the system state is "dirty" and requires a reconciliation cycle.
   * Delegates to `Orchestrator.shouldReconcile()`.
   * @returns `true` if there are pending state changes.
   */
  shouldReconcile() {
    return this.orchestrator.shouldReconcile();
  }
  /**
   * Executes a full reconciliation cycle to align the actual runtime state
   * with the desired state defined in the registry.
   * Delegates to `Orchestrator.reconcile()`.
   */
  async reconcile() {
    await this.orchestrator.reconcile();
  }
  /**
   * Gracefully shuts down the entire system.
   * This process deactivates all running plugins in the correct topological order,
   * closes all containers and the EBUS connection, and saves the registry state.
   */
  async shutdown() {
    console.log("System shutdown initiated...");
    const currentGraph = this.plugins.enabled.graph;
    const emptyGraph = new import_plexus3.DependencyGraph();
    const diff = emptyGraph.diff(currentGraph);
    const shutdownPlan = diff.sort();
    if (shutdownPlan.length > 0) {
      console.log(`Deactivating ${shutdownPlan.length} running plugins...`);
      await this.orchestrator.executePlan(shutdownPlan);
    }
    await this.containers.closeAll();
    await this.bus.close();
    await this.registry.save();
    console.log("System has been shut down successfully.");
  }
};

// src/registry.ts
var import_lokijs = __toESM(require("lokijs"));
var Registry = class _Registry {
  db;
  plugins;
  // The constructor is private to enforce instance creation via static factory methods.
  constructor(db) {
    this.db = db;
  }
  /**
   * Initializes the 'plugins' collection within the LokiJS database.
   * Sets up unique constraints and indices for efficient querying.
   */
  initPlugins() {
    this.plugins = this.db.getCollection("plugins") || this.db.addCollection("plugins", {
      unique: ["uri"],
      // The URI is the primary key for each plugin instance.
      indices: ["name", "state"]
      // Index common query fields for performance.
    });
  }
  /**
   * Creates an in-memory-only Registry.
   * Data is not persisted and will be lost when the process exits.
   * Ideal for testing or temporary sessions.
   * @returns A Promise that resolves with a new Registry instance.
   */
  static async createMemory() {
    const db = new import_lokijs.default("esys-registry.db", { persistenceMethod: "memory" });
    const registry = new _Registry(db);
    registry.initPlugins();
    return registry;
  }
  /**
   * Creates a Registry that persists data to a file.
   * Enables autoload and autosave for data integrity.
   * @param filePath The path to the database file.
   * @returns A Promise that resolves with the loaded Registry instance.
   */
  static async createPersistent(filePath) {
    const db = new import_lokijs.default(filePath, {
      adapter: new import_lokijs.default.LokiFsAdapter(),
      autoload: true,
      autosave: true,
      autosaveInterval: 4e3,
      // Save every 4 seconds
      autoloadCallback: (err) => {
        if (err) {
          console.error("Failed to load persistent registry:", err);
        }
      }
    });
    const registry = new _Registry(db);
    registry.initPlugins();
    return registry;
  }
  /**
   * Finds multiple plugin entries matching a LokiJS query.
   * @param query A LokiJS query object.
   * @returns An array of matching plugin registry entries.
   */
  find(query) {
    return this.plugins.find(query);
  }
  /**
   * Finds a single plugin entry matching a LokiJS query.
   * @param query A LokiJS query object.
   * @returns The first matching entry, or `null` if not found.
   */
  findOne(query) {
    return this.plugins.findOne(query);
  }
  /**
   * Updates a plugin's desired state ('enable' or 'disable').
   * @param uri The unique URI of the plugin.
   * @param state The new desired state.
   */
  updateState(uri, state) {
    const entry = this.plugins.findOne({ uri });
    if (entry) {
      entry.state = state;
      this.plugins.update(entry);
    }
  }
  /**
   * Updates a plugin's actual runtime status ('running', 'stopped', or 'error').
   * @param uri The unique URI of the plugin.
   * @param status The new runtime status.
   * @param error An optional error message if the status is 'error'.
   */
  updateStatus(uri, status, error) {
    const entry = this.plugins.findOne({ uri });
    if (entry) {
      entry.status = status;
      entry.error = error;
      this.plugins.update(entry);
    }
  }
  /**
   * Registers a new plugin or updates an existing one (upsert).
   * If an entry with the same URI exists, its metadata is updated, but its state is preserved.
   * If it's a new entry, it's inserted with a default state of 'disable' and 'stopped'.
   * @param entry The plugin data to register.
   */
  register(entry) {
    const existing = this.plugins.findOne({ uri: entry.uri });
    if (existing) {
      existing.name = entry.name;
      existing.version = entry.version;
      existing.pluginDependencies = entry.pluginDependencies;
      existing.main = entry.main;
      this.plugins.update(existing);
    } else {
      this.plugins.insert({ ...entry, state: "disable", status: "stopped" });
    }
  }
  /**
   * Permanently removes a plugin entry from the registry.
   * @param uri The unique URI of the plugin to remove.
   */
  unregister(uri) {
    this.plugins.findAndRemove({ uri });
  }
  /**
   * Manually triggers a save of the database to its persistent storage.
   * This is useful before a planned shutdown.
   */
  async save() {
    if (this.db.persistenceMethod === "memory" || !this.db.persistenceAdapter)
      return;
    return new Promise((resolve, reject) => {
      this.db.saveDatabase((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// src/registry-loader.ts
var RegistryLoader = class {
  _registry = null;
  /**
   * Loads a Registry instance.
   * This method must be called once during the BOOTSTRAP event callback.
   * @param registry The Registry instance to be used by the system.
   * @throws An error if a registry has already been loaded.
   */
  load(registry) {
    if (this._registry) {
      throw new Error("Registry has already been loaded.");
    }
    this._registry = registry;
  }
  /**
   * Retrieves the loaded Registry instance.
   * This is called internally by the Bootloader after the BOOTSTRAP phase.
   * @returns A Promise that resolves with the loaded Registry instance.
   * @throws An error if `load()` was not called.
   */
  async getRegistry() {
    if (!this._registry) {
      throw new Error(
        "Registry has not been loaded. Please call the 'load(registry)' method on the RegistryLoader instance during the BOOTSTRAP lifecycle event."
      );
    }
    return Promise.resolve(this._registry);
  }
};

// src/types.ts
var LifecycleEvent = /* @__PURE__ */ ((LifecycleEvent2) => {
  LifecycleEvent2["BOOTSTRAP"] = "bootstrap";
  LifecycleEvent2["MOUNT_CONTAINERS"] = "mount_containers";
  LifecycleEvent2["ATTACH_CORE"] = "attach_core";
  LifecycleEvent2["RUN"] = "run";
  return LifecycleEvent2;
})(LifecycleEvent || {});

// src/bootloader.ts
var import_transport = require("@eleplug/transport");
var Bootloader = class {
  context;
  emitter = new import_transport.AsyncEventEmitter();
  constructor(context) {
    this.context = context;
  }
  /**
   * Registers a listener for a specific lifecycle event.
   * @param event The lifecycle event to listen for.
   * @param callback The function to execute when the event is emitted.
   */
  on(event, callback) {
    this.emitter.on(event, callback);
    return this;
  }
  /**
   * Starts the entire system.
   * This will trigger all lifecycle events in sequential order and return a
   * fully initialized and reconciled System instance.
   * @returns A Promise that resolves with the System instance.
   */
  async start() {
    try {
      const bus = await import_ebus.initEBUS.create();
      const registryLoader = new RegistryLoader();
      const containerManager = new ContainerManager(bus);
      await this.emitter.emitSerial(
        "bootstrap" /* BOOTSTRAP */,
        this.context,
        registryLoader
      );
      const registry = await registryLoader.getRegistry();
      await this.emitter.emitSerial(
        "mount_containers" /* MOUNT_CONTAINERS */,
        this.context,
        containerManager
      );
      const system = new System(bus, registry, containerManager);
      await this.emitter.emitSerial(
        "attach_core" /* ATTACH_CORE */,
        this.context,
        system
      );
      system.orchestrator.markDirty();
      await system.reconcile();
      await this.emitter.emitSerial("run" /* RUN */, this.context, system);
      console.log("System launched successfully.");
      return system;
    } catch (error) {
      console.error("System launch failed:", error);
      throw error;
    }
  }
};

// src/memory-container.ts
var import_ebus2 = require("@eleplug/ebus");
var MemoryContainer = class {
  constructor(bus) {
    this.bus = bus;
  }
  storedPlugins = /* @__PURE__ */ new Map();
  activeNodes = /* @__PURE__ */ new Map();
  // --- Public Management API ---
  /**
   * Adds a new plugin definition to the container.
   * @param path The unique path for the plugin within this container.
   * @param pluginData An object containing the manifest and the plugin implementation.
   * @throws Throws an error if a plugin already exists at the specified path.
   */
  addPlugin(path, pluginData) {
    if (this.storedPlugins.has(path)) {
      throw new Error(
        `Cannot add plugin. Path '${path}' already exists in container.`
      );
    }
    this.storedPlugins.set(path, pluginData);
  }
  /**
   * Removes a plugin definition from the container.
   * @param path The path of the plugin to remove.
   * @throws Throws an error if the plugin is currently active.
   */
  removePlugin(path) {
    if (this.activeNodes.has(path)) {
      throw new Error(
        `Cannot remove plugin at path '${path}'. It is currently active.`
      );
    }
    this.storedPlugins.delete(path);
  }
  // --- Container Interface Implementation ---
  plugins = {
    activate: async (containerName, path) => {
      const storedPlugin = this.storedPlugins.get(path);
      if (!storedPlugin) {
        throw new Error(`Plugin at path '${path}' not found in container.`);
      }
      const { manifest, plugin } = storedPlugin;
      if (this.activeNodes.has(path)) {
        return;
      }
      const node = await this.bus.join({
        id: manifest.name
      });
      await node.setApi(async (t) => {
        const pluginUri = `plugin://${containerName}/${path}`;
        const context = {
          router: t.router,
          procedure: t.procedure,
          pluginUri,
          subscribe: node.subscribe.bind(node),
          emiter: node.emiter.bind(node),
          link: (pluginName) => {
            return node.connectTo(pluginName);
          }
        };
        return plugin.activate(context);
      });
      this.activeNodes.set(path, node);
    },
    deactivate: async (path) => {
      const node = this.activeNodes.get(path);
      if (node) {
        const storedPlugin = this.storedPlugins.get(path);
        await storedPlugin?.plugin.deactivate?.();
        await node.close();
        this.activeNodes.delete(path);
      }
    },
    manifest: async (path) => {
      const storedPlugin = this.storedPlugins.get(path);
      if (!storedPlugin) {
        throw new Error(`Plugin at path '${path}' not found in container.`);
      }
      return storedPlugin.manifest;
    }
  };
  resources = {
    get: async (path) => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    },
    put: async (path, stream) => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    },
    list: async (path) => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    }
  };
  close = async () => {
    const deactivationPromises = Array.from(this.activeNodes.keys()).map(
      (path) => this.plugins.deactivate(path)
    );
    await Promise.allSettled(deactivationPromises);
    this.storedPlugins.clear();
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Bootloader,
  LifecycleEvent,
  MemoryContainer,
  Registry,
  System
});
