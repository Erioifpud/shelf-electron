import { Bus } from '@eleplug/ebus';
import { MaybePromise } from '@eleplug/transport';
import { DiffEntry, DependencyGraph, Provider } from '@eleplug/plexus';
import { Plugin } from '@eleplug/anvil';

/**
 * Defines the lifecycle events for the Bootloader.
 */
declare enum LifecycleEvent {
    /**
     * Bootstrap phase: The earliest stage of system startup, used for loading
     * persistent state, such as the Registry.
     */
    BOOTSTRAP = "bootstrap",
    /**
     * Mount Containers phase: Used for mounting all user-defined plugin containers.
     */
    MOUNT_CONTAINERS = "mount_containers",
    /**
     * Attach Core phase: The System instance is created but not yet reconciled,
     * used for loading and configuring core plugins.
     */
    ATTACH_CORE = "attach_core",
    /**
     * Run phase: The system has completed its first reconciliation and is fully
     * operational, ready to execute application-level logic.
     */
    RUN = "run"
}
interface ResourceGetResponse {
    /**
     * A WHATWG ReadableStream of the resource's content.
     */
    body: ReadableStream;
    /**
     * (Optional) The MIME type of the resource, e.g., "application/javascript", "image/png".
     */
    mimeType?: string;
}
/**
 * An abstract interface that all plugin containers must implement.
 * It defines the contract for plugin lifecycle management and resource access.
 */
interface Container {
    /**
     * Operations related to plugin management.
     */
    plugins: {
        activate: (containerName: string, path: string) => Promise<void>;
        deactivate: (path: string) => Promise<void>;
        manifest: (path: string) => Promise<PluginManifest>;
    };
    /**
     * Operations related to resource management.
     */
    resources: {
        get: (path: string) => Promise<ResourceGetResponse>;
        put: (path: string, stream: ReadableStream) => Promise<void>;
        list: (path: string) => Promise<string[]>;
    };
    /**
     * Closes the container and releases all its resources.
     */
    close: () => Promise<void>;
}
/**
 * A factory function for creating a container during the `MOUNT_CONTAINERS` phase.
 * @param bus The EBUS instance, available for the container's internal use.
 */
type ContainerFactory = (bus: Bus) => MaybePromise<Container>;
/**
 * The manifest definition for a plugin, containing essential metadata.
 */
interface PluginManifest {
    name: string;
    version: string;
    pluginDependencies: Record<string, string>;
    main: string;
}
/**
 * The complete plugin entry as stored in the Registry.
 * It extends the manifest with state information required for system management.
 */
interface PluginRegistryEntry extends PluginManifest {
    /**
     * The canonical, unique identifier for a plugin instance.
     * Format: "plugin://<container-name>/<path-in-container>"
     */
    uri: string;
    /**
     * The desired state of the plugin, set by the user or system.
     */
    state: "enable" | "disable";
    /**
     * The actual runtime status of the plugin.
     */
    status: "running" | "stopped" | "error";
    /**
     * If the status is 'error', this field contains the error message.
     */
    error?: string;
}
interface BaseOptions {
    /**
     * If true, triggers a reconciliation cycle immediately after the operation.
     * @default true
     */
    reconcile?: boolean;
    /**
     * If true, performs a strict pre-flight dependency check.
     * For 'enable', it verifies all dependencies exist in the registry.
     * For 'disable', it fails if other enabled plugins depend on it.
     * @default true
     */
    strict?: boolean;
}
interface EnsureOptions extends BaseOptions {
    uri: string;
    enable?: boolean;
}
/**
 * Options for the `PluginManager.enable()` method.
 */
interface EnableOptions extends BaseOptions {
    name: string;
    range: string;
}
/**
 * Options for the `PluginManager.disable()` method.
 */
interface DisableOptions extends BaseOptions {
    name: string;
}

/**
 * The Registry is the database for plugin metadata and serves as the "single source of truth"
 * for the system's desired state. It supports both in-memory and file-based persistent storage.
 */
declare class Registry {
    private db;
    private plugins;
    private constructor();
    /**
     * Initializes the 'plugins' collection within the LokiJS database.
     * Sets up unique constraints and indices for efficient querying.
     */
    private initPlugins;
    /**
     * Creates an in-memory-only Registry.
     * Data is not persisted and will be lost when the process exits.
     * Ideal for testing or temporary sessions.
     * @returns A Promise that resolves with a new Registry instance.
     */
    static createMemory(): Promise<Registry>;
    /**
     * Creates a Registry that persists data to a file.
     * Enables autoload and autosave for data integrity.
     * @param filePath The path to the database file.
     * @returns A Promise that resolves with the loaded Registry instance.
     */
    static createPersistent(filePath: string): Promise<Registry>;
    /**
     * Finds multiple plugin entries matching a LokiJS query.
     * @param query A LokiJS query object.
     * @returns An array of matching plugin registry entries.
     */
    find(query: LokiQuery<PluginRegistryEntry & LokiObj>): PluginRegistryEntry[];
    /**
     * Finds a single plugin entry matching a LokiJS query.
     * @param query A LokiJS query object.
     * @returns The first matching entry, or `null` if not found.
     */
    findOne(query: LokiQuery<PluginRegistryEntry & LokiObj>): PluginRegistryEntry | null;
    /**
     * Updates a plugin's desired state ('enable' or 'disable').
     * @param uri The unique URI of the plugin.
     * @param state The new desired state.
     */
    updateState(uri: string, state: "enable" | "disable"): void;
    /**
     * Updates a plugin's actual runtime status ('running', 'stopped', or 'error').
     * @param uri The unique URI of the plugin.
     * @param status The new runtime status.
     * @param error An optional error message if the status is 'error'.
     */
    updateStatus(uri: string, status: "running" | "stopped" | "error", error?: string): void;
    /**
     * Registers a new plugin or updates an existing one (upsert).
     * If an entry with the same URI exists, its metadata is updated, but its state is preserved.
     * If it's a new entry, it's inserted with a default state of 'disable' and 'stopped'.
     * @param entry The plugin data to register.
     */
    register(entry: Omit<PluginRegistryEntry, "state" | "status" | "error">): void;
    /**
     * Permanently removes a plugin entry from the registry.
     * @param uri The unique URI of the plugin to remove.
     */
    unregister(uri: string): void;
    /**
     * Manually triggers a save of the database to its persistent storage.
     * This is useful before a planned shutdown.
     */
    save(): Promise<void>;
}

/**
 * The ResourceManager provides a unified facade for accessing resources from all
 * mounted containers. It does not store resources itself but instead routes
 * requests to the appropriate container based on the resource URI.
 */
declare class ResourceManager {
    #private;
    private readonly getContainers;
    /**
     * @param getContainers A function that returns the map of currently mounted containers.
     */
    constructor(getContainers: () => Map<string, Container>);
    /**
     * Retrieves a resource's readable stream by its full URI.
     * @param uri The full URI of the resource, e.g., "plugin://my-container/path/to/resource.txt".
     * @returns A Promise that resolves to the resource's response object.
     */
    get(uri: string): Promise<ResourceGetResponse>;
    /**
     * Writes or overwrites a resource from a readable stream.
     * @param uri The full URI of the resource to write to.
     * @param stream A readable stream containing the new resource content.
     */
    put(uri: string, stream: ReadableStream): Promise<void>;
    /**
     * Lists the contents of a directory-like resource.
     * @param uri The full URI of the directory to list.
     * @returns A Promise that resolves to an array of resource names.
     */
    list(uri: string): Promise<string[]>;
}

/**
 * The ContainerManager is responsible for the lifecycle of all Container instances,
 * including mounting, unmounting, and providing access. It acts as a central
 * registry for all plugin sources.
 */
declare class ContainerManager {
    private readonly bus;
    readonly resources: ResourceManager;
    private readonly containers;
    /**
     * @param bus The central EBUS instance, which will be passed to container factories.
     */
    constructor(bus: Bus);
    /**
     * Mounts a new container, making it available to the system.
     * @param name The unique name for the container.
     * @param factory A factory function that creates the container instance.
     * @throws Throws an error if a container with the same name is already mounted.
     */
    mount(name: string, factory: ContainerFactory): Promise<void>;
    /**
     * Unmounts a container from the system, calling its `close` method to release resources.
     * @param name The name of the container to unmount.
     */
    unmount(name: string): Promise<void>;
    /**
     * Retrieves a mounted container instance by its name.
     * @param name The name of the container.
     * @returns The `Container` instance, or `undefined` if not found.
     */
    get(name: string): Container | undefined;
    /**
     * Gracefully closes all mounted containers.
     * This is typically called during system shutdown.
     */
    closeAll(): Promise<void>;
}

/**
 * The Orchestrator is the system's "execution engine".
 * It is responsible for synchronizing the desired state (enabled plugins in the Registry)
 * with the actual running state of plugins in the Containers.
 */
declare class Orchestrator {
    #private;
    private readonly resolver;
    private isReconciling;
    private isDirty;
    private registry;
    private pluginManager;
    private containerManager;
    /**
     * Initializes the Orchestrator with its dependencies.
     */
    init(registry: Registry, pluginManager: PluginManager, containerManager: ContainerManager): void;
    /**
     * Checks if the system state has changed and a reconciliation is needed.
     */
    shouldReconcile(): boolean;
    /**
     * Marks the system state as changed, indicating a reconciliation is required.
     * @internal
     */
    markDirty(): void;
    /**
     * Executes a full reconciliation cycle.
     * This is the core process for synchronizing desired and actual states.
     */
    reconcile(): Promise<void>;
    /**
     * Executes a topologically sorted plan to activate or deactivate plugins.
     * @param plan An array of diff entries sorted for correct execution order.
     */
    executePlan(plan: DiffEntry[]): Promise<void>;
}

/**
 * The PluginManager is central to plugin lifecycle control.
 * It handles requests to install, uninstall, enable, and disable plugins,
 * and manages the runtime dependency graph.
 */
declare class PluginManager {
    private registry;
    private orchestrator;
    private containerManager;
    /**
     * Represents the dependency graph of all currently enabled and running plugins.
     * This graph is updated by the Orchestrator after each successful reconciliation.
     */
    readonly enabled: {
        graph: DependencyGraph;
        /**
         * A plexus Provider that sources its data from currently running plugins.
         * Useful for resolving dependencies among already active plugins.
         */
        readonly provider: Provider;
    };
    /**
     * Represents all plugins registered in the system, regardless of their state.
     */
    readonly all: {
        registry: () => Registry;
        /**
         * A plexus Provider that sources its data from the entire Registry.
         * This is the primary data source for dependency resolution pre-flight checks.
         */
        readonly provider: Provider;
    };
    private get graph();
    /**
     * Initializes the PluginManager with its dependencies.
     */
    init(registry: Registry, orchestrator: Orchestrator, containerManager: ContainerManager): void;
    /**
     * Ensures a plugin is installed and, optionally, enabled. This is an idempotent operation.
     * If the plugin is not installed, it will be installed. If it is not enabled, it will be enabled.
     * By default, this triggers a reconciliation to apply the changes.
     *
     * @param options The options for the ensure operation.
     * @throws Throws if the installation or enabling process fails.
     */
    ensure(options: EnsureOptions): Promise<void>;
    /**
     * Installs a plugin from a container by fetching its manifest and adding it to the registry.
     * The plugin is installed in a 'disable' state by default.
     *
     * @param uri The full URI of the plugin, e.g., "plugin://my-container/my-plugin".
     * @throws Throws if the plugin is already registered or if the container is not found.
     */
    install(uri: string): Promise<void>;
    /**
     * Uninstalls a plugin from the system by removing its entry from the registry.
     *
     * @param uri The full URI of the plugin to uninstall.
     * @throws Throws an error if the plugin is currently enabled.
     */
    uninstall(uri: string): Promise<void>;
    /**
     * Enables the highest satisfying version of a plugin within a given semantic version range.
     * This marks the plugin's desired state as 'enable' and dirties the orchestrator.
     *
     * @param options The options for the enable operation.
     */
    enable(options: EnableOptions): Promise<void>;
    /**
     * Disables an enabled plugin.
     * In strict mode (default), this will fail if other enabled plugins depend on it.
     * In non-strict mode, it will cascade-disable all its dependents.
     *
     * @param options The options for the disable operation.
     */
    disable(options: DisableOptions): Promise<void>;
}

/**
 * The System class is the top-level API facade for all core esys functionality.
 * It integrates all internal managers to provide a single, stable interface for users.
 */
declare class System {
    #private;
    readonly containers: ContainerManager;
    readonly plugins: PluginManager;
    readonly orchestrator: Orchestrator;
    readonly registry: Registry;
    readonly bus: Bus;
    constructor(bus: Bus, registry: Registry, containerManager: ContainerManager);
    /**
     * Provides unified access to all container resources.
     * This is a convenience alias for `system.containers.resources`.
     */
    get resources(): ResourceManager;
    /**
     * Checks if the system state is "dirty" and requires a reconciliation cycle.
     * Delegates to `Orchestrator.shouldReconcile()`.
     * @returns `true` if there are pending state changes.
     */
    shouldReconcile(): boolean;
    /**
     * Executes a full reconciliation cycle to align the actual runtime state
     * with the desired state defined in the registry.
     * Delegates to `Orchestrator.reconcile()`.
     */
    reconcile(): Promise<void>;
    /**
     * Gracefully shuts down the entire system.
     * This process deactivates all running plugins in the correct topological order,
     * closes all containers and the EBUS connection, and saves the registry state.
     */
    shutdown(): Promise<void>;
}

/**
 * The RegistryLoader provides a Registry instance to the Bootloader during the
 * BOOTSTRAP lifecycle phase. It acts as a placeholder, allowing the user to
 * load or create a Registry asynchronously and provide it to the system at the
 * appropriate time.
 * @internal
 */
declare class RegistryLoader {
    private _registry;
    /**
     * Loads a Registry instance.
     * This method must be called once during the BOOTSTRAP event callback.
     * @param registry The Registry instance to be used by the system.
     * @throws An error if a registry has already been loaded.
     */
    load(registry: Registry): void;
    /**
     * Retrieves the loaded Registry instance.
     * This is called internally by the Bootloader after the BOOTSTRAP phase.
     * @returns A Promise that resolves with the loaded Registry instance.
     * @throws An error if `load()` was not called.
     */
    getRegistry(): Promise<Registry>;
}

type LifecycleEventMap<TContext extends object> = {
    [LifecycleEvent.BOOTSTRAP]: (context: TContext, registryLoader: RegistryLoader) => void | Promise<void>;
    [LifecycleEvent.MOUNT_CONTAINERS]: (context: TContext, containerManager: ContainerManager) => void | Promise<void>;
    [LifecycleEvent.ATTACH_CORE]: (context: TContext, system: System) => void | Promise<void>;
    [LifecycleEvent.RUN]: (context: TContext, system: System) => void | Promise<void>;
};
/**
 * The Bootloader is the entry point for starting an esys system.
 * It orchestrates the entire system initialization through a phased, event-driven lifecycle.
 * @template TContext A user-defined context object that is passed through the entire startup process.
 */
declare class Bootloader<TContext extends object> {
    private readonly context;
    private readonly emitter;
    constructor(context: TContext);
    /**
     * Registers a listener for a specific lifecycle event.
     * @param event The lifecycle event to listen for.
     * @param callback The function to execute when the event is emitted.
     */
    on<E extends LifecycleEvent>(event: E, callback: LifecycleEventMap<TContext>[E]): this;
    /**
     * Starts the entire system.
     * This will trigger all lifecycle events in sequential order and return a
     * fully initialized and reconciled System instance.
     * @returns A Promise that resolves with the System instance.
     */
    start(): Promise<System>;
}

type StoredPlugin = {
    manifest: PluginManifest;
    plugin: Plugin<any>;
};
/**
 * An in-memory implementation of a Container.
 * It does not support persistence but allows for dynamic addition and removal of
 * plugin definitions, making it ideal for testing, prototyping, or managing
 * code-based plugins.
 */
declare class MemoryContainer implements Container {
    private readonly bus;
    private readonly storedPlugins;
    private readonly activeNodes;
    constructor(bus: Bus);
    /**
     * Adds a new plugin definition to the container.
     * @param path The unique path for the plugin within this container.
     * @param pluginData An object containing the manifest and the plugin implementation.
     * @throws Throws an error if a plugin already exists at the specified path.
     */
    addPlugin(path: string, pluginData: StoredPlugin): void;
    /**
     * Removes a plugin definition from the container.
     * @param path The path of the plugin to remove.
     * @throws Throws an error if the plugin is currently active.
     */
    removePlugin(path: string): void;
    plugins: {
        activate: (containerName: string, path: string) => Promise<void>;
        deactivate: (path: string) => Promise<void>;
        manifest: (path: string) => Promise<PluginManifest>;
    };
    resources: {
        get: (path: string) => Promise<ResourceGetResponse>;
        put: (path: string, stream: ReadableStream) => Promise<void>;
        list: (path: string) => Promise<string[]>;
    };
    close: () => Promise<void>;
}

export { Bootloader, type Container, type ContainerFactory, type DisableOptions, type EnableOptions, type EnsureOptions, LifecycleEvent, MemoryContainer, type PluginManifest, type PluginRegistryEntry, Registry, type ResourceGetResponse, System };
