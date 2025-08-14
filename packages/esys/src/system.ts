import type { Bus } from "@eleplug/ebus";
import type { Registry } from "./registry.js";
import { ContainerManager } from "./managers/container.manager.js";
import { PluginManager } from "./managers/plugin.manager.js";
import { Orchestrator } from "./managers/orchestrator.js";
import type { ResourceManager } from "./managers/resource.manager.js";
import { DependencyGraph } from "@eleplug/plexus";

/**
 * The System class is the top-level API facade for all core esys functionality.
 * It integrates all internal managers to provide a single, stable interface for users.
 */
export class System {
  public readonly containers: ContainerManager;
  public readonly plugins: PluginManager;
  public readonly orchestrator: Orchestrator;
  public readonly registry: Registry;
  public readonly bus: Bus;

  constructor(
    bus: Bus,
    registry: Registry,
    containerManager: ContainerManager
  ) {
    // Assign core, pre-built dependencies.
    this.bus = bus;
    this.registry = registry;
    this.containers = containerManager;

    // Instantiate managers.
    this.plugins = new PluginManager();
    this.orchestrator = new Orchestrator();

    // Delegate the wiring of manager dependencies to a private method.
    this.#assembleManagers();
  }

  /**
   * Wires up the internal dependencies between the managers.
   * This is called once during system construction.
   */
  #assembleManagers(): void {
    this.plugins.init(this.registry, this.orchestrator, this.containers);
    this.orchestrator.init(this.registry, this.plugins, this.containers);
  }

  /**
   * Provides unified access to all container resources.
   * This is a convenience alias for `system.containers.resources`.
   */
  public get resources(): ResourceManager {
    return this.containers.resources;
  }

  /**
   * Checks if the system state is "dirty" and requires a reconciliation cycle.
   * Delegates to `Orchestrator.shouldReconcile()`.
   * @returns `true` if there are pending state changes.
   */
  public shouldReconcile(): boolean {
    return this.orchestrator.shouldReconcile();
  }

  /**
   * Executes a full reconciliation cycle to align the actual runtime state
   * with the desired state defined in the registry.
   * Delegates to `Orchestrator.reconcile()`.
   */
  public async reconcile(): Promise<void> {
    await this.orchestrator.reconcile();
  }

  /**
   * Gracefully shuts down the entire system.
   * This process deactivates all running plugins in the correct topological order,
   * closes all containers and the EBUS connection, and saves the registry state.
   */
  public async shutdown(): Promise<void> {
    console.log("System shutdown initiated...");

    const currentGraph = this.plugins.enabled.graph;
    const emptyGraph = new DependencyGraph();
    const diff = emptyGraph.diff(currentGraph); // Diff against an empty graph to get the deactivation plan.
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
}
