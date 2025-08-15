import { DependencyGraph, type Provider } from "@eleplug/plexus";
import type { Registry } from "../registry.js";
import type { Orchestrator } from "./orchestrator.js";
import type { ContainerManager } from "./container.manager.js";
import type { EnableOptions, DisableOptions, EnsureOptions } from "../types.js";
import { parseUri } from "../utils.js";
import * as semver from "semver";

/**
 * The PluginManager is central to plugin lifecycle control.
 * It handles requests to install, uninstall, enable, and disable plugins,
 * and manages the runtime dependency graph.
 */
export class PluginManager {
  private registry!: Registry;
  private orchestrator!: Orchestrator;
  private containerManager!: ContainerManager;

  /**
   * Represents the dependency graph of all currently enabled and running plugins.
   * This graph is updated by the Orchestrator after each successful reconciliation.
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
   * Initializes the PluginManager with its dependencies.
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
   * Ensures a plugin is installed and, optionally, enabled. This is an idempotent operation.
   * If the plugin is not installed, it will be installed. If it is not enabled, it will be enabled.
   *
   * @param options The options for the ensure operation.
   * @throws Throws if the installation or enabling process fails.
   */
  public async ensure(options: EnsureOptions): Promise<void> {
    const { uri, enable, strict, reconcile } = options;

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
        strict,
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
  public async install(uri: string): Promise<void> {
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
        main: manifest.main,
      });
    } catch (error: any) {
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
  public async uninstall(uri: string): Promise<void> {
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
  public async enable(options: EnableOptions): Promise<void> {
    const { name, range, reconcile = true, strict = true } = options;

    const entries = this.registry.find({ name });
    const satisfyingVersions = entries.filter((e) =>
      semver.satisfies(e.version, range, { includePrerelease: true })
    );

    if (satisfyingVersions.length === 0) {
      throw new Error(
        `Enable failed: No version found for '${name}' that satisfies range '${range}'.`
      );
    }

    const targetEntry = satisfyingVersions.sort((a, b) =>
      semver.rcompare(a.version, b.version)
    )[0];

    if (strict) {
      for (const depName in targetEntry.pluginDependencies) {
        const depRange = targetEntry.pluginDependencies[depName];
        const available = this.registry.find({ name: depName });
        const canSatisfy = available.some((dep) =>
          semver.satisfies(dep.version, depRange, { includePrerelease: true })
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
  public async disable(options: DisableOptions): Promise<void> {
    const { name, reconcile = true, strict = true } = options;
    const enabledEntries = this.registry.find({ name, state: "enable" });

    if (enabledEntries.length === 0) {
      return; // Plugin is not enabled, no action needed.
    }

    for (const entryToDisable of enabledEntries) {
      if (strict) {
        const dependents = this.graph.dependents(
          entryToDisable.name,
          entryToDisable.version
        );
        const activeDependents = [];
        for (const depMeta of dependents.getNodes()) {
          if (
            depMeta.name === entryToDisable.name &&
            depMeta.version === entryToDisable.version
          ) {
            continue;
          }
          const depEntry = this.registry.findOne({
            name: depMeta.name,
            version: depMeta.version,
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
            version: depMeta.version,
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
}
