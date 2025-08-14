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
 * with the actual running state of plugins in the Containers.
 */
export class Orchestrator {
  private readonly resolver = new DependencyResolver();
  private isReconciling = false;
  private isDirty = false;

  private registry!: Registry;
  private pluginManager!: PluginManager;
  private containerManager!: ContainerManager;

  /**
   * Initializes the Orchestrator with its dependencies.
   */
  public init(
    registry: Registry,
    pluginManager: PluginManager,
    containerManager: ContainerManager
  ): void {
    this.registry = registry;
    this.pluginManager = pluginManager;
    this.containerManager = containerManager;

    // Register the primary provider for resolving dependencies from the registry.
    this.resolver.register("system-registry", pluginManager.all.provider);
  }

  /**
   * Checks if the system state has changed and a reconciliation is needed.
   */
  public shouldReconcile(): boolean {
    return this.isDirty;
  }

  /**
   * Marks the system state as changed, indicating a reconciliation is required.
   * @internal
   */
  public markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Executes a full reconciliation cycle.
   * This is the core process for synchronizing desired and actual states.
   */
  public async reconcile(): Promise<void> {
    if (this.isReconciling) {
      console.warn("Reconciliation is already in progress. Skipping.");
      return;
    }

    this.isReconciling = true;
    this.isDirty = false;

    try {
      const targetReqs = new Requirements();
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
            disputes: newGraph.disputes(),
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
  public async executePlan(plan: DiffEntry[]): Promise<void> {
    for (const entry of plan) {
      try {
        await this.#executePlanEntry(entry);
      } catch (error: any) {
        this.#handleExecutionError(entry, error);
        throw error; // Halt the execution plan on failure.
      }
    }
  }

  /**
   * Executes a single entry from the reconciliation plan.
   * @param entry The diff entry to execute.
   */
  async #executePlanEntry(entry: DiffEntry): Promise<void> {
    const { type, meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version,
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
  #handleExecutionError(entry: DiffEntry, error: Error): void {
    const { meta } = entry;
    const registryEntry = this.registry.findOne({
      name: meta.name,
      version: meta.version,
    });

    if (registryEntry) {
      this.registry.updateStatus(registryEntry.uri, "error", error.message);
    }

    console.error(
      `Failed to execute step '${entry.type}' for plugin '${meta.name}':`,
      error
    );
  }
}
