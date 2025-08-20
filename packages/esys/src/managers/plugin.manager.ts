import { DependencyGraph, type Provider } from "@eleplug/plexus";
import type { Registry } from "../registry.js";
import type { Orchestrator } from "./orchestrator.js";
import type { ContainerManager } from "./container.manager.js";
import type {
  EnableOptions,
  DisableOptions,
  EnsureOptions,
  PluginRegistryEntry,
} from "../types.js";
import { parseUri } from "../utils.js";
import * as semver from "semver";

/**
 * Manages the high-level plugin lifecycle (install, uninstall, enable, disable)
 * and serves as the interface between the user, the registry, and the container layer.
 * All operations targeting a specific plugin instance are identified by the plugin's
 * canonical URI.
 */
export class PluginManager {
  private registry!: Registry;
  private orchestrator!: Orchestrator;
  private containerManager!: ContainerManager;

  /**
   * Represents the dependency graph of all currently enabled and running plugins.
   * This graph is the "actual state" of the system, managed by the Orchestrator.
   */
  public readonly enabled = {
    graph: new DependencyGraph(),
    /**
     * A plexus Provider that sources its data from currently running plugins.
     * Useful for resolving dependencies among already active plugins.
     */
    get provider(): Provider {
      const graph = this.graph;
      return async (pluginName: string) => {
        const plugins = graph.get(pluginName);
        if (plugins.length === 0) return undefined;
        const result: Record<string, Record<string, string>> = {};
        for (const p of plugins) {
          result[p.version] = p.dependencies;
        }
        return result;
      };
    },
  };

  /**
   * Represents all plugins registered in the system, regardless of their state.
   */
  public readonly all = {
    registry: () => this.registry,
    /**
     * A plexus Provider that sources its data from the entire Registry.
     * This is the primary data source for dependency resolution pre-flight checks.
     */
    get provider(): Provider {
      const reg = this.registry();
      return async (pluginName: string) => {
        const entries = reg.find({ name: pluginName });
        if (entries.length === 0) return undefined;
        const result: Record<string, Record<string, string>> = {};
        entries.forEach((e) => {
          result[e.version] = e.pluginDependencies;
        });
        return result;
      };
    },
  };

  private get graph() {
    return this.enabled.graph;
  }

  /**
   * Initializes the PluginManager with its core dependencies.
   * @internal
   */
  public init(
    registry: Registry,
    orchestrator: Orchestrator,
    containerManager: ContainerManager
  ): void {
    this.registry = registry;
    this.orchestrator = orchestrator;
    this.containerManager = containerManager;
  }

  /**
   * Ensures a plugin is installed and optionally enabled. This is an idempotent
   * "desired state" operation.
   *
   * @param options The options for the ensure operation, requiring a full plugin URI.
   */
  public async ensure(options: EnsureOptions): Promise<void> {
    const { uri, enable = false, strict = false, reconcile = false } = options;

    const { subPath } = parseUri(uri);
    if (subPath !== null) {
      throw new Error(
        `[PluginManager.ensure] URI must be a plugin root URI. Provided: ${uri}`
      );
    }

    let entry = this.registry.findOne({ uri });
    if (!entry) {
      await this.install(uri);
      entry = this.registry.findOne({ uri });
      if (!entry) {
        throw new Error(
          `[PluginManager.ensure] Consistency Error: Plugin '${uri}' not found after installation.`
        );
      }
    }

    if (enable && entry.state !== "enable") {
      await this.enable({
        name: entry.name,
        range: entry.version,
        reconcile: false, // Defer reconciliation to the end of the operation.
        strict,
      });
    }

    if (reconcile && this.orchestrator.shouldReconcile()) {
      await this.orchestrator.reconcile();
    }
  }

  /**
   * Installs a plugin from its container by reading its manifest and adding it to the registry.
   * This makes the plugin known to the system but does not activate it.
   *
   * @param uri The full root URI of the plugin (e.g., "plugin://my-container/my-plugin").
   */
  public async install(uri: string): Promise<void> {
    if (this.registry.findOne({ uri })) {
      throw new Error(
        `[PluginManager.install] Plugin with URI '${uri}' is already registered.`
      );
    }

    const { pluginUri, subPath, containerName } = parseUri(uri);
    if (subPath !== null) {
      throw new Error(
        `[PluginManager.install] URI '${uri}' must be a plugin root URI.`
      );
    }

    const container = this.containerManager.get(containerName);
    if (!container) {
      throw new Error(
        `[PluginManager.install] Container '${containerName}' not found.`
      );
    }

    try {
      const manifest = await container.plugins.manifest(pluginUri);
      this.registry.register({
        uri: pluginUri,
        name: manifest.name,
        version: manifest.version,
        pluginDependencies: manifest.pluginDependencies,
        main: manifest.main,
        pluginGroups: manifest.pluginGroups,
      });
    } catch (error: any) {
      throw new Error(
        `[PluginManager.install] Failed to install plugin from '${uri}': ${error.message}`
      );
    }
  }

  /**
   * Uninstalls a plugin from the system by removing its entry from the registry.
   * The plugin must be disabled before it can be uninstalled.
   *
   * @param uri The full root URI of the plugin to uninstall.
   */
  public async uninstall(uri: string): Promise<void> {
    const entry = this.registry.findOne({ uri });
    if (!entry) {
      console.warn(
        `[PluginManager.uninstall] Skipped: Plugin with URI '${uri}' is not registered.`
      );
      return;
    }

    if (entry.state === "enable") {
      throw new Error(
        `[PluginManager.uninstall] Cannot uninstall plugin '${entry.name}'. It must be disabled first.`
      );
    }

    this.registry.unregister(uri);
  }

  /**
   * Enables the highest satisfying version of a plugin that matches the given name and version range.
   * This updates the desired state in the registry and marks the system as dirty.
   */
  public async enable(options: EnableOptions): Promise<void> {
    const { name, range, reconcile = false, strict = false } = options;

    const entries = this.registry.find({ name });
    const satisfyingVersions = entries.filter((e) =>
      semver.satisfies(e.version, range, { includePrerelease: true })
    );

    if (satisfyingVersions.length === 0) {
      throw new Error(
        `[PluginManager.enable] No installed version of '${name}' satisfies the range '${range}'.`
      );
    }

    const targetEntry = satisfyingVersions.sort((a, b) =>
      semver.rcompare(a.version, b.version)
    )[0];

    if (strict) {
      for (const [depName, depRange] of Object.entries(
        targetEntry.pluginDependencies
      )) {
        const availableDeps = this.registry.find({ name: depName });
        if (
          !availableDeps.some((dep) =>
            semver.satisfies(dep.version, depRange, { includePrerelease: true })
          )
        ) {
          throw new Error(
            `[PluginManager.enable] Pre-flight check failed for '${name}': Dependency '${depName}@${depRange}' cannot be satisfied by any installed plugin.`
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
   * Disables all enabled versions of a plugin that match the given name.
   * Depending on strict mode, this may fail if other plugins depend on it, or
   * it may cascade and disable the dependents as well.
   */
  public async disable(options: DisableOptions): Promise<void> {
    const { name, reconcile = false, strict = true } = options;

    const enabledEntries = this.registry.find({ name, state: "enable" });
    if (enabledEntries.length === 0) return;

    for (const entryToDisable of enabledEntries) {
      const activeDependents = this.#findActiveDependents(entryToDisable);

      if (strict && activeDependents.length > 0) {
        const dependentNames = [
          ...new Set(activeDependents.map((p) => p.name)),
        ].join(", ");
        throw new Error(
          `[PluginManager.disable] Cannot disable '${name}' in strict mode. It is required by other enabled plugins: ${dependentNames}`
        );
      }

      if (!strict) {
        // Cascade disable all dependents.
        [entryToDisable, ...activeDependents].forEach((entry) =>
          this.registry.updateState(entry.uri, "disable")
        );
      } else {
        // In strict mode, we've already confirmed no active dependents.
        this.registry.updateState(entryToDisable.uri, "disable");
      }
    }

    this.orchestrator.markDirty();

    if (reconcile) {
      await this.orchestrator.reconcile();
    }
  }

  /**
   * Finds all currently enabled plugins that depend on the given plugin entry.
   * @param entry - The plugin entry to check for dependents.
   * @returns An array of registry entries for the active dependents.
   */
  #findActiveDependents(entry: PluginRegistryEntry): PluginRegistryEntry[] {
    const dependents = this.graph.dependents(entry.name, entry.version);
    const activeDependents: PluginRegistryEntry[] = [];

    for (const depMeta of dependents.getNodes()) {
      if (depMeta.name === entry.name && depMeta.version === entry.version) {
        continue; // Skip self-dependency
      }

      const depEntry = this.registry.findOne({
        name: depMeta.name,
        version: depMeta.version,
      });
      if (depEntry?.state === "enable") {
        activeDependents.push(depEntry);
      }
    }
    return activeDependents;
  }
}
