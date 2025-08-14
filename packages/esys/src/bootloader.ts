import { initEBUS } from "@eleplug/ebus";
import { System } from "./system.js";
import { RegistryLoader } from "./registry-loader.js";
import { ContainerManager } from "./managers/container.manager.js";
import { LifecycleEvent } from "./types.js";
import { AsyncEventEmitter } from "@eleplug/transport";

// Defines the type map for lifecycle events, associating each event with its callback signature.
type LifecycleEventMap<TContext extends object> = {
  [LifecycleEvent.BOOTSTRAP]: (
    context: TContext,
    registryLoader: RegistryLoader
  ) => void | Promise<void>;
  [LifecycleEvent.MOUNT_CONTAINERS]: (
    context: TContext,
    containerManager: ContainerManager
  ) => void | Promise<void>;
  [LifecycleEvent.ATTACH_CORE]: (
    context: TContext,
    system: System
  ) => void | Promise<void>;
  [LifecycleEvent.RUN]: (
    context: TContext,
    system: System
  ) => void | Promise<void>;
};

/**
 * The Bootloader is the entry point for starting an esys system.
 * It orchestrates the entire system initialization through a phased, event-driven lifecycle.
 * @template TContext A user-defined context object that is passed through the entire startup process.
 */
export class Bootloader<TContext extends object> {
  private readonly context: TContext;
  private readonly emitter = new AsyncEventEmitter<
    LifecycleEventMap<TContext>
  >();

  constructor(context: TContext) {
    this.context = context;
  }

  /**
   * Registers a listener for a specific lifecycle event.
   * @param event The lifecycle event to listen for.
   * @param callback The function to execute when the event is emitted.
   */
  public on<E extends LifecycleEvent>(
    event: E,
    callback: LifecycleEventMap<TContext>[E]
  ): this {
    this.emitter.on(event, callback);
    return this;
  }

  /**
   * Starts the entire system.
   * This will trigger all lifecycle events in sequential order and return a
   * fully initialized and reconciled System instance.
   * @returns A Promise that resolves with the System instance.
   */
  public async start(): Promise<System> {
    try {
      // Phase 0: Core service instantiation
      const bus = await initEBUS.create();
      const registryLoader = new RegistryLoader();
      const containerManager = new ContainerManager(bus);

      // Phase 1: BOOTSTRAP - Load persistent state.
      await this.emitter.emitSerial(
        LifecycleEvent.BOOTSTRAP,
        this.context,
        registryLoader
      );
      const registry = await registryLoader.getRegistry();

      // Phase 2: MOUNT_CONTAINERS - Register all plugin sources.
      await this.emitter.emitSerial(
        LifecycleEvent.MOUNT_CONTAINERS,
        this.context,
        containerManager
      );

      // Phase 3: System Instantiation - Create the main system object.
      const system = new System(bus, registry, containerManager);

      // Phase 4: ATTACH_CORE - A hook for configuring core system plugins.
      await this.emitter.emitSerial(
        LifecycleEvent.ATTACH_CORE,
        this.context,
        system
      );

      // Phase 5: Initial Reconciliation - Bring the runtime state in line with the desired state.
      system.orchestrator.markDirty();
      await system.reconcile();

      // Phase 6: RUN - The system is now fully operational.
      await this.emitter.emitSerial(LifecycleEvent.RUN, this.context, system);

      console.log("System launched successfully.");
      return system;
    } catch (error) {
      console.error("System launch failed:", error);
      // In a real application, more sophisticated cleanup would be added here.
      throw error;
    }
  }
}
