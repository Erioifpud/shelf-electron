import type { Bus } from "@eleplug/ebus";
import type { Registry } from "./registry.js";
import { ContainerManager } from "./managers/container.manager.js";
import { PluginManager } from "./managers/plugin.manager.js";
import { Orchestrator } from "./managers/orchestrator.js";
import type { ResourceManager } from "./managers/resource.manager.js";
import { DependencyGraph } from "@eleplug/plexus";

/**
 * The System class is the top-level API facade for all core esys functionality.
 * It integrates all internal managers to provide a single, stable interface for
 * application hosts (like Elep) to interact with the plugin ecosystem.
 */
export class System {
  /**
   * Manages all mounted plugin sources (Containers).
   * Use this to mount/unmount containers.
   */
  public readonly containers: ContainerManager;

  /**
   * Manages the high-level lifecycle of plugins (install, enable, etc.).
   * This is the primary interface for changing the desired state of the system.
   */
  public readonly plugins: PluginManager;

  /**
   * The core execution engine that synchronizes the desired state (from the Registry)
   * with the actual running state of the system.
   * @internal
   */
  public readonly orchestrator: Orchestrator;

  /**
   * The central database for plugin metadata and state.
   * It is the single source of truth for what the system's state *should* be.
   */
  public readonly registry: Registry;

  /**
   * The underlying EBUS instance for all inter-plugin and inter-system communication.
   */
  public readonly bus: Bus;

  constructor(bus: Bus, registry: Registry, containers: ContainerManager) {
    this.bus = bus;
    this.registry = registry;
    this.containers = containers;

    this.plugins = new PluginManager();
    this.orchestrator = new Orchestrator();

    // Wire up the internal dependencies between the managers.
    this.#assembleManagers();
  }

  /**
   * Connects the internal managers to each other.
   * This establishes the dependency injection chain required for the system to operate.
   * @private
   */
  #assembleManagers(): void {
    this.plugins.init(this.registry, this.orchestrator, this.containers);
    this.orchestrator.init(this.registry, this.plugins, this.containers);
  }

  /**
   * Provides unified access to all plugin resources (e.g., HTML, CSS, assets).
   * This is a convenience alias for `system.containers.resources`.
   */
  public get resources(): ResourceManager {
    return this.containers.resources;
  }

  /**
   * Checks if the system state is "dirty," meaning there are pending changes
   * that require a reconciliation cycle to be applied.
   * @returns `true` if a reconciliation is needed.
   */
  public shouldReconcile(): boolean {
    return this.orchestrator.shouldReconcile();
  }

  /**
   * Executes a full reconciliation cycle. This is the primary method to apply
   * any pending changes made via `system.plugins.enable()` or `system.plugins.disable()`.
   */
  public async reconcile(): Promise<void> {
    await this.orchestrator.reconcile();
  }

  /**
   * Gracefully shuts down the entire system.
   * The shutdown sequence ensures that plugins are deactivated in the correct
   * topological order, all resources are released, and the final state is persisted.
   *
   * @workflow
   * 1.  Calculate deactivation plan by diffing the current state against an empty graph.
   * 2.  Execute the deactivation plan via the Orchestrator.
   * 3.  Close all mounted containers.
   * 4.  Close the EBUS connection.
   * 5.  Save the final state of the registry to persistent storage.
   */
  public async shutdown(): Promise<void> {
    console.log("[System] Shutdown initiated...");

    const currentGraph = this.plugins.enabled.graph;
    const emptyGraph = new DependencyGraph();
    // Diffing against an empty graph effectively creates a plan to remove everything.
    const diff = emptyGraph.diff(currentGraph);
    const shutdownPlan = diff.sort();

    if (shutdownPlan.length > 0) {
      console.log(
        `[System] Deactivating ${shutdownPlan.length} running plugins...`
      );
      await this.orchestrator.executePlan(shutdownPlan);
    }

    await this.containers.closeAll();
    await this.bus.close();
    await this.registry.save();

    console.log("[System] Shutdown complete.");
  }
}
