import type { Bus } from "@eleplug/ebus";
import type { MaybePromise } from "@eleplug/transport";

// --- Bootloader & Lifecycle ---

/**
 * Defines the lifecycle events for the Bootloader, representing the distinct
 * phases of the system startup sequence.
 */
export enum LifecycleEvent {
  /**
   * Bootstrap phase: The earliest stage, used for loading persistent state
   * like the Registry from disk.
   */
  BOOTSTRAP = "bootstrap",
  /**
   * Mount Containers phase: All user-defined plugin sources (containers) are
   * registered with the system.
   */
  MOUNT_CONTAINERS = "mount_containers",
  /**
   * Attach Core phase: The main System instance is created but not yet reconciled.
   * This is the ideal stage for loading and configuring core system plugins.
   */
  ATTACH_CORE = "attach_core",
  /**
   * Run phase: The system has completed its first reconciliation and is fully
   * operational, ready for application-level logic.
   */
  RUN = "run",
}

// --- Container & Resources ---

/**
 * Represents the response for a resource request, containing the content
 * stream and its MIME type.
 */
export interface ResourceGetResponse {
  /**
   * A WHATWG ReadableStream of the resource's content.
   */
  body: ReadableStream;
  /**
   * The MIME type of the resource (e.g., "application/javascript", "image/png").
   */
  mimeType?: string;
}

/**
 * Defines the abstract interface for a plugin container.
 *
 * A container is a source of plugins and their resources. This interface standardizes
 * how the system interacts with different container implementations (e.g., file-based,
 * in-memory, or network-based). All operations are identified by a canonical URI.
 */
export interface Container {
  /**
   * Provides operations for managing the lifecycle of plugins within this container.
   */
  plugins: {
    /**
     * Activates a plugin identified by its canonical root URI.
     * @param uri The full plugin URI, e.g., "plugin://my-container/my-plugin".
     */
    activate: (uri: string) => Promise<void>;
    /**
     * Deactivates a plugin identified by its canonical root URI.
     * @param uri The full plugin URI.
     */
    deactivate: (uri: string) => Promise<void>;
    /**
     * Retrieves the manifest for a plugin identified by its canonical root URI.
     * @param uri The full plugin URI.
     */
    manifest: (uri: string) => Promise<PluginManifest>;
  };

  /**
   * Provides operations for accessing resources within this container's plugins.
   */
  resources: {
    /**
     * Retrieves a resource identified by its full canonical URI.
     * @param uri The resource URI, e.g., "plugin://my-container/my-plugin/:/asset.txt".
     */
    get: (uri: string) => Promise<ResourceGetResponse>;
    /**
     * Writes or overwrites a resource from a readable stream.
     * @param uri The full resource URI to write to.
     * @param stream A ReadableStream containing the new content.
     */
    put: (uri: string, stream: ReadableStream) => Promise<void>;
    /**
     * Lists the contents of a directory-like resource.
     * @param uri The full resource URI of the directory.
     */
    list: (uri: string) => Promise<string[]>;
  };

  /**
   * Closes the container and releases all associated resources, deactivating
   * any running plugins within it.
   */
  close: () => Promise<void>;
}

/**
 * A factory function for creating a container during the `MOUNT_CONTAINERS` phase.
 * The container is self-contained and does not need to know its own assigned name.
 *
 * @param bus The EBUS instance, available for the container's internal use.
 */
export type ContainerFactory = (bus: Bus) => MaybePromise<Container>;

// --- Plugin & Registry ---

/**
 * The manifest definition for a plugin (typically from package.json),
 * containing essential, static metadata.
 */
export interface PluginManifest {
  name: string;
  version: string;
  pluginDependencies: Record<string, string>;
  main: string;
  /**
   * An array of EBUS groups this plugin belongs to, declaratively defining
   * its network permissions. Defaults to an empty array if not provided.
   */
  pluginGroups?: string[];
}

/**
 * The complete plugin entry as stored in the Registry. It extends the manifest
 * with dynamic state information managed by the system.
 */
export interface PluginRegistryEntry extends PluginManifest {
  /**
   * The canonical, unique identifier for this specific plugin instance.
   * Format: "plugin://<container-name>/<path-in-container>"
   */
  uri: string;
  /**
   * The desired state of the plugin, set by user action.
   * 'enable': The system should attempt to run this plugin and its dependencies.
   * 'disable': The system should not run this plugin.
   */
  state: "enable" | "disable";
  /**
   * The actual runtime status of the plugin.
   */
  status: "running" | "stopped" | "error";
  /**
   * If the status is 'error', this field contains the relevant error message.
   */
  error?: string;
  /**
   * The EBUS groups assigned to this plugin at runtime. This value is sourced
   * from the `pluginGroups` field in the manifest and controls all network access.
   */
  groups: string[];
}

// --- Plugin Lifecycle Control Options ---

/**
 * Base options for plugin lifecycle management methods.
 */
export interface BaseOptions {
  /**
   * If true, triggers a reconciliation cycle immediately after the operation.
   * Set to false to batch multiple changes before reconciling.
   * @default false
   */
  reconcile?: boolean;
  /**
   * If true, performs a strict pre-flight check before changing the state.
   * @default false
   */
  strict?: boolean;
}

/**
 * Options for the `PluginManager.ensure()` method.
 */
export interface EnsureOptions extends BaseOptions {
  /**
   * The canonical root URI of the plugin to ensure.
   */
  uri: string;
  /**
   * If true, ensures the plugin is in an 'enable' state.
   * @default false
   */
  enable?: boolean;
}

/**
 * Options for the `PluginManager.enable()` method.
 */
export interface EnableOptions extends BaseOptions {
  name: string;
  range: string;
}

/**
 * Options for the `PluginManager.disable()` method.
 */
export interface DisableOptions extends BaseOptions {
  name: string;
}
