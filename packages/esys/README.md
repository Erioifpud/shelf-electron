# `@eleplug/esys`

`esys` (Eleplug System) is a powerful, asynchronous, and dependency-aware runtime for building modular, extensible applications. It provides the core orchestration engine for managing a complex ecosystem of plugins, handling their lifecycle, dependencies, and state with precision and reliability.

[![npm version](https://img.shields.io/npm/v/@eleplug/esys.svg)](https://www.npmjs.com/package/@eleplug/esys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

Building a truly modular application with a rich plugin ecosystem is complex. Developers face significant challenges:

*   **Dependency Management**: How do you ensure that a plugin's dependencies are met before it starts? How do you handle version conflicts or dependency cycles?
*   **Lifecycle Orchestration**: What is the correct order to activate and deactivate plugins to avoid race conditions and ensure a stable state?
*   **State Management**: How do you track the desired state (e.g., "plugin A should be enabled") versus the actual runtime state (e.g., "plugin A is currently running")?
*   **Isolation and Decoupling**: How do you load plugins from different sources (filesystem, memory, network) and have them communicate without being tightly coupled?

`esys` is a comprehensive solution to these problems. It provides a structured framework that automates these processes, allowing developers to focus on building features within their plugins.

## Core Features

*   **Dependency-Aware Lifecycle**: Leverages `@eleplug/plexus` to perform robust dependency resolution. It automatically calculates the correct, safe order to activate and deactivate plugins based on their declared dependencies.
*   **State Reconciliation Engine**: Implements a "desired state" model. You declare which plugins *should* be enabled, and the `Orchestrator` automatically computes and executes the minimal set of actions (activations/deactivations) to bring the runtime into alignment.
*   **Pluggable Plugin Sources (`Container`s)**: Plugins are loaded from `Container`s. `esys` provides a `MemoryContainer` for code-based plugins and integrates with `elep`'s `FileContainer` for loading from disk.
*   **Persistent State (`Registry`)**: Tracks the metadata and desired state of all known plugins. The `Registry` can be in-memory for testing or persisted to a file for production use.
*   **Event-Driven Boot Process**: The system starts up through a clear, phased lifecycle managed by the `Bootloader`, allowing for clean integration and configuration at specific startup stages.
*   **Integrated Communication Bus**: Built on top of `@eleplug/ebus`, providing a seamless and type-safe communication layer for inter-plugin and system-plugin interaction.

## Core Concepts

| Concept          | Description                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **`Bootloader`** | The entry point for starting an `esys` instance. It orchestrates the startup through a series of lifecycle events. |
| **`System`**     | The main, high-level object representing the running system. It's the primary API for managing plugins. |
| **`Registry`**   | The database of plugin metadata and their desired states (e.g., `enable` or `disable`). |
| **`Container`**  | A source for plugins. It's an abstract interface for loading plugin code and resources.                 |
| **`Orchestrator`** | The "brain" of the system. It compares the `Registry`'s desired state with the actual running state and executes a plan to reconcile them. |
| **`Reconciliation`** | The process of activating and deactivating plugins to match the desired state. |

## How to Use: The Boot Process

Starting an `esys` application involves configuring a `Bootloader` and listening for its lifecycle events.

### 1. Create a Bootloader

The `Bootloader` is the first object you create. It manages the entire startup sequence.

```typescript
import { Bootloader } from '@eleplug/esys';

const bootloader = new Bootloader({}); // An optional context object can be passed.
```

### 2. Hook into the Lifecycle

The boot process is divided into distinct phases. You hook into these phases to load your configuration and resources.

```typescript
import { LifecycleEvent, Registry, MemoryContainer } from '@eleplug/esys';
import { FileContainer } from '@eleplug/elep'; // Example file container
import { MyCorePlugin, MyCorePluginManifest } from './plugins/core.ts';

// Phase 1: BOOTSTRAP - Load or create the plugin registry.
bootloader.on(LifecycleEvent.BOOTSTRAP, async (_ctx, registryLoader) => {
  // Use a persistent registry for production or a memory one for tests.
  const registry = await Registry.createPersistent('./my-app-registry.json');
  registryLoader.load(registry);
});

// Phase 2: MOUNT_CONTAINERS - Register all your plugin sources.
bootloader.on(LifecycleEvent.MOUNT_CONTAINERS, async (_ctx, containerManager) => {
  // Mount a container for plugins defined in code.
  await containerManager.mount('kernel', (bus) => new MemoryContainer('kernel', bus));
  
  // Mount a container that loads plugins from the filesystem.
  await containerManager.mount('user-plugins', (bus) => new FileContainer({ bus, rootPath: './plugins' }));
});

// Phase 3: ATTACH_CORE - The system is created but not yet running.
// This is the ideal place to ensure core plugins are installed and enabled.
bootloader.on(LifecycleEvent.ATTACH_CORE, async (_ctx, system) => {
  const kernel = system.containers.get('kernel') as MemoryContainer;
  kernel.addPlugin('core-api', {
    manifest: MyCorePluginManifest,
    plugin: MyCorePlugin
  });

  // Ensure the core API plugin is always installed and enabled.
  await system.plugins.ensure({
    uri: 'plugin://kernel.core-api',
    enable: true,
  });
});

// Phase 4: RUN - The system has performed its first reconciliation and is fully operational.
bootloader.on(LifecycleEvent.RUN, (_ctx, system) => {
  console.log('System is now running!');
  // Start your application logic here.
});
```

### 3. Start the System

Finally, call `start()` on the bootloader to begin the process. This returns a promise that resolves with the fully initialized `System` instance.

```typescript
async function main() {
  try {
    const system = await bootloader.start();
    
    // Now you can interact with the live system.
    await system.plugins.enable({ name: 'my-feature-plugin', range: '^1.0.0', reconcile: true });
    
    // The system will remain running. To shut down:
    // await system.shutdown();
  } catch (error) {
    console.error("Failed to start the system:", error);
  }
}

main();
```

## Managing Plugins with the `System` Object

Once started, the `system` object is your main interface for managing the plugin ecosystem.

```typescript
// Get the started system instance from the bootloader.
const system = await bootloader.start();

// Enable a plugin by name and version range.
// esys will resolve the best version and activate it and its dependencies.
await system.plugins.enable({ name: 'dashboard-plugin', range: '*', reconcile: true });

// Disable a plugin. esys will deactivate it and, if configured,
// any plugins that depend on it.
await system.plugins.disable({ name: 'dashboard-plugin', reconcile: true });

// Install a new plugin from a container. This only registers it.
await system.plugins.install('plugin://user-plugins.new-downloaded-plugin');
// You still need to enable it and reconcile.
await system.plugins.enable({ name: 'new-downloaded-plugin', range: '*', reconcile: true });

// Manually trigger a reconciliation if you've made changes
// with `reconcile: false`.
if (system.shouldReconcile()) {
  await system.reconcile();
}
```

## Architectural Overview

`esys` is composed of several key managers that work together:

*   **Bootloader**: Orchestrates the startup sequence.
*   **Registry**: The "database" or single source of truth for the desired state.
*   **Container Manager**: Manages all `Container` instances, which are the sources of plugin code and manifests.
*   **Plugin Manager**: Provides the high-level API for `install`, `enable`, `disable`, etc. It modifies the desired state in the `Registry` and marks the system as "dirty".
*   **Orchestrator**: The engine that detects when the system is "dirty". It uses the `DependencyResolver` (`@eleplug/plexus`) to calculate the difference between the desired state and the current state, generating a safe, topologically sorted execution plan. It then executes this plan by calling `activate` or `deactivate` on the appropriate `Container`.

This robust, layered architecture ensures that plugin state transitions are predictable, reliable, and safe.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).