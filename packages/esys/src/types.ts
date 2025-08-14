import type { Bus } from "@eleplug/ebus";
import type { MaybePromise } from "@eleplug/transport";

// --- Bootloader & Lifecycle ---

/**
 * Defines the lifecycle events for the Bootloader.
 */
export enum LifecycleEvent {
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
  RUN = "run",
}

// --- Container & Resources ---

export interface ResourceGetResponse {
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
export interface Container {
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
export type ContainerFactory = (bus: Bus) => MaybePromise<Container>;

// --- Plugin & Registry ---

/**
 * The manifest definition for a plugin, containing essential metadata.
 */
export interface PluginManifest {
  name: string;
  version: string;
  pluginDependencies: Record<string, string>;
  main: string;
}

/**
 * The complete plugin entry as stored in the Registry.
 * It extends the manifest with state information required for system management.
 */
export interface PluginRegistryEntry extends PluginManifest {
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

// --- Plugin Lifecycle Control Options ---

export interface BaseOptions {
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

export interface EnsureOptions extends BaseOptions {
  uri: string;
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
