import {
  DependencyResolver,
  Requirements,
  type DiffEntry,
} from "@eleplug/plexus";
import type { Registry } from "../registry.js";
import type { PluginManager } from "./plugin.manager.js";
import type { ContainerManager } from "./container.manager.js";
import { parseUri } from "../utils.js";

/**
 * The Orchestrator is the system's "execution engine".
 * It is responsible for synchronizing the desired state (enabled plugins in the Registry)
 * with the actual running state of plugins in the Containers. It operates on a
 * declarative model: it calculates the difference between the current and target
 * states and executes a safe plan to bridge the gap.
 */
export class Orchestrator {
  private readonly resolver = new DependencyResolver();
  private isReconciling = false;
  private isDirty = false;

  private registry!: Registry;
  private pluginManager!: PluginManager;
  private containerManager!: ContainerManager;

  /**
   * Initializes the Orchestrator with its core dependencies.
   * This method is called by the System constructor.
   * @internal
   */
  public init(
    registry: Registry,
    pluginManager: PluginManager,
    containerManager: ContainerManager
  ): void {
    this.registry = registry;
    this.pluginManager = pluginManager;
    this.containerManager = containerManager;

    // Register the system's plugin registry as a provider for the dependency resolver.
    this.resolver.register("system-registry", pluginManager.all.provider);
  }

  /**
   * Checks if there are pending state changes that require a reconciliation.
   * @returns `true` if `markDirty()` has been called since the last reconcile.
   */
  public shouldReconcile(): boolean {
    return this.isDirty;
  }

  /**
   * Marks the system state as dirty, signaling that a reconciliation is needed.
   * This is typically called by the PluginManager after an enable/disable operation.
   */
  public markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Executes a full reconciliation cycle to align the actual runtime state
   * with the desired state defined in the registry.
   *
   * @workflow
   * 1.  **Build Target Graph**: Constructs a target dependency graph based on all
   *     plugins marked as 'enable' in the Registry.
   * 2.  **Calculate Diff**: Compares the new target graph with the currently active
   *     plugin graph to produce a `DiffResult` (added, removed, modified).
   * 3.  **Generate Plan**: Topologically sorts the `DiffResult` to create a safe,
   *     deterministic execution plan. Deactivations are ordered before activations.
   * 4.  **Execute Plan**: Executes the plan, activating and deactivating plugins
   *     in the correct order.
   * 5.  **Update State**: On success, updates the active plugin graph to the new target graph.
   */
  public async reconcile(): Promise<void> {
    if (this.isReconciling) {
      console.warn(
        "[Orchestrator] Reconciliation is already in progress. Skipping."
      );
      return;
    }
    if (!this.shouldReconcile()) {
      return;
    }

    this.isReconciling = true;
    this.isDirty = false;

    try {
      const targetReqs = new Requirements();
      const enabledPluginsInRegistry = this.registry.find({ state: "enable" });
      enabledPluginsInRegistry.forEach((p) => {
        targetReqs.add(p.name, p.version);
      });

      const oldGraph = this.pluginManager.enabled.graph;
      const newGraph = await this.resolver.resolve(
        targetReqs.get(),
        { includePrereleases: true },
        oldGraph // Pass the old graph to prefer stable versions.
      );

      if (!newGraph.isCompleted()) {
        // Here you could add more detailed diagnostics from the graph, e.g.,
        // `newGraph.missing()`, `newGraph.cycles()`.
        throw new Error(
          `Reconciliation failed: The set of enabled plugins and their dependencies is not solvable. Check for missing plugins or version conflicts.`
        );
      }

      const diff = newGraph.diff(oldGraph);
      const plan = diff.sort();

      if (plan.length > 0) {
        console.log(
          `[Orchestrator] Executing reconciliation plan with ${plan.length} steps.`
        );
        await this.executePlan(plan);
        // On success, the new graph becomes the current state.
        this.pluginManager.enabled.graph = newGraph;
      }
    } catch (error) {
      // If reconciliation fails, mark as dirty to allow a retry after the issue is fixed.
      this.isDirty = true;
      console.error(
        "[Orchestrator] An error occurred during reconciliation:",
        error
      );
      throw error;
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Executes a pre-computed reconciliation plan.
   * @param plan An array of `DiffEntry` objects in a safe execution order.
   * @internal
   */
  public async executePlan(plan: DiffEntry[]): Promise<void> {
    for (const entry of plan) {
      try {
        await this.#executePlanEntry(entry);
      } catch (error: any) {
        this.#handleExecutionError(entry, error);
        // Re-throw to halt the reconciliation process on the first failure.
        throw error;
      }
    }
  }

  async #executePlanEntry(entry: DiffEntry): Promise<void> {
    const { type, meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version,
    });

    if (!registryEntry) {
      throw new Error(
        `[Orchestrator] Consistency Error: Plugin '${meta.name}@${meta.version}' is in the execution plan but could not be found in the registry.`
      );
    }

    const fullPluginUri = registryEntry.uri;
    const { containerName } = parseUri(fullPluginUri);
    const container = this.containerManager.get(containerName);

    if (!container) {
      throw new Error(
        `[Orchestrator] Container '${containerName}' required by plugin '${fullPluginUri}' is not mounted.`
      );
    }

    // Execute deactivation or activation based on the plan entry type.
    if (type === "removed" || type === "replaced") {
      await container.plugins.deactivate(fullPluginUri);
      this.registry.updateStatus(fullPluginUri, "stopped");
    } else if (type === "added" || type === "modified") {
      await container.plugins.activate(fullPluginUri);
      this.registry.updateStatus(registryEntry.uri, "running");
    }
  }

  #handleExecutionError(entry: DiffEntry, error: Error): void {
    const { meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version,
    });
    // Mark the plugin's status as 'error' in the registry for visibility.
    if (registryEntry) {
      this.registry.updateStatus(registryEntry.uri, "error", error.message);
    }
    console.error(
      `[Orchestrator] Failed to execute plan step '${entry.type}' for plugin '${meta.name}@${meta.version}':`,
      error
    );
  }
}
