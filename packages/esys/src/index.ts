
/**
 * =================================================================
 * esys - Main Entry File
 * =================================================================
 *
 * This file serves as the public API entry point for the `esys` library.
 * It re-exports all core classes, types, and enums that constitute the public interface.
 * Consumers of the library should always import from this file rather than
 * from internal modules directly.
 *
 * @packageDocumentation
 */

// --- Core Bootloader & System Classes ---

/**
 * The system bootloader. Use this class to configure and start a new esys instance.
 */
export { Bootloader } from "./bootloader.js";

/**
 * The core esys system instance. After startup, interact with this object
 * to manage plugins, containers, and resources.
 */
export { System } from "./system.js";

/**
 * The plugin metadata database. Manages the registration and state of all plugins.
 */
export { Registry } from "./registry.js";

// --- Built-in Container Implementations ---

/**
 * An in-memory Container implementation. Ideal for testing, prototyping,
 * or managing core plugins that exist as code.
 */
export { MemoryContainer } from "./memory-container.js";

// --- Core Types, Interfaces & Enums ---

export type {
  ResourceGetResponse,
  // Core Interfaces
  Container,
  // Factory Functions & Provider Types
  ContainerFactory,
  // Plugin Metadata & State
  PluginManifest,
  PluginRegistryEntry,
  // Plugin Lifecycle Control Options
  EnableOptions,
  DisableOptions,
  EnsureOptions,
} from "./types.js";

/**
 * Enum defining the distinct phases of the system startup lifecycle.
 */
export { LifecycleEvent } from "./types.js";
