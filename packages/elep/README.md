# `@eleplug/elep` - The Extensible Electron Platform

`elep` is a comprehensive, open-source framework for building modular, secure, and type-safe desktop applications with Electron. It combines a powerful plugin orchestration system (`esys`), a type-safe message bus (`ebus`), and a robust RPC layer (`erpc`) into a single, cohesive platform.

[![npm version](https://img.shields.io/npm/v/@eleplug/elep.svg)](https://www.npmjs.com/package/@eleplug/elep)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

Building large-scale Electron applications often leads to monolithic codebases that are difficult to maintain, extend, and test. While Electron provides the foundation, it doesn't prescribe an architecture for managing features, dependencies, and communication between different parts of your application.

`elep` provides this architecture. It is designed for applications that need:

*   A **true plugin system**, where features can be added, removed, and updated independently.
*   **Safe dependency management** to prevent version conflicts and ensure plugins load in the correct order.
*   **Secure and structured communication** between the main process, renderer processes, and different plugins.
*   **End-to-end type safety** across all these communication boundaries.

## Core Features

*   **Robust Plugin Architecture**: Built on `@eleplug/esys`, it provides a full lifecycle and orchestration engine for plugins.
*   **Safe Dependency Management**: Leverages `@eleplug/plexus` to resolve plugin dependencies, perform topological sorting for safe activation/deactivation, and detect cycles or conflicts.
*   **End-to-End Type-Safe Communication**: Uses `@eleplug/ebus` and `@eleplug/erpc` to provide a type-safe message bus for both Pub/Sub and direct P2P communication between plugins and between the main and renderer processes.
*   **Secure Electron Bridge**: Provides a secure, curated API (`ECore`, `EWindow`) for plugins to interact with core Electron functionality. Dangerous APIs are sandboxed, and operations like creating windows are done through a secure, `pin`-able proxy.
*   **Filesystem and Resource Handling**: Includes a `FileContainer` for loading plugins from the local filesystem and a custom `plugin://` protocol handler to securely serve plugin resources (like HTML, CSS, and images) to renderer processes.
*   **"Batteries-Included" Experience**: `elep` is the top-level package that re-exports all the necessary tools from the underlying `esys`, `ebus`, `erpc`, `plexus`, and `anvil` packages, providing a single, consistent API surface.

## Architectural Overview

`elep` establishes a clear structure where the `esys` System runs in the main process. Plugins running in the main process can open dedicated, namespaced communication channels to their own renderer UIs, enabling secure and isolated communication.

```
+-----------------------------------------------------+
|                   Electron Main Process             |
|-----------------------------------------------------|
|  +-----------------------------------------------+  |
|  |                  esys System                  |  |
|  |     (Orchestrator, Registry, ebus, etc.)      |  |
|  +-----------------------------------------------+  |
|                                                     |
|  +------------------+  +------------------------+   |
|  | ECore (Pinned)   |  |  Plugin 'main-ui'      |   |
|  +------------------+  |   - Creates EWindow    |   |
|                        |   - Opens 'ebus-core'  |   |
|                        |     transport on it    |   |
|                        |   - Runs an erpc server|   |
|                        +------------------------+   |
+-----------------------------------------------------+
        ^                |  IPC Communication via    |
        |                |  IpcLink/IpcRendererLink  |
        |                | ('ebus-core' namespace)   |
        v                v                           v
+------------------------+----------------------------+
|                Electron Renderer Process            |  (main-ui's Window)
|-----------------------------------------------------|
|  +-----------------+      +----------------------+  |
|  | Preload Script  |----->| UI (React, Vue, etc.)|  |
|  |(exposes adapter)|      | - Creates erpc client|  |
|  +-----------------+      | - Connects to plugin |  |
|                           +----------------------+  |
+-----------------------------------------------------+
```

## Getting Started

Let's build a simple Elep application with a main plugin that creates a window and communicates with it.

### 1. Main Process Setup (`main.ts`)

This is your application's entry point. Here, you'll configure and start the `esys` `Bootloader`.

```typescript
// in src/main.ts
import { app } from 'electron';
import * as path from 'node:path';
import { Bootloader, Registry, ECore, pin, MemoryContainer, FileContainer } from '@eleplug/elep';
import { LifecycleEvent, definePlugin } from '@eleplug/elep';

async function main() {
  const pluginDir = path.resolve(__dirname, '..', 'plugins');
  const registryDbPath = path.resolve(pluginDir, 'registry.json');
  
  const bootloader = new Bootloader({});
  
  // Phase 1: Load the registry where plugin states are stored.
  bootloader.on(LifecycleEvent.BOOTSTRAP, async (_ctx, registryLoader) => {
    const registry = await Registry.createPersistent(registryDbPath);
    registryLoader.load(registry);
  });

  // Phase 2: Mount containers (plugin sources).
  bootloader.on(LifecycleEvent.MOUNT_CONTAINERS, async (_ctx, containerManager) => {
    await containerManager.mount('user-plugins', (bus) => new FileContainer(bus, pluginDir));
    await containerManager.mount('kernel', (bus) => new MemoryContainer(bus));
  });

  // Phase 3: Attach the core API plugin.
  bootloader.on(LifecycleEvent.ATTACH_CORE, async (_ctx, system) => {
    const kernel = system.containers.get('kernel') as MemoryContainer;
    const ecoreApiPlugin = definePlugin({
      activate({ procedure }) {
        return { core: procedure.ask(() => pin(new ECore(system))) };
      },
    });

    kernel.addPlugin('ecore-api', {
      manifest: { name: 'ecore-api', version: '1.0.0', pluginDependencies: {}, main: '' },
      plugin: ecoreApiPlugin,
    });
    
    // Ensure the core API and our main UI plugin are enabled.
    await system.plugins.ensure({ uri: 'plugin://kernel/ecore-api', enable: true });
    await system.plugins.ensure({ uri: 'plugin://user-plugins/main-ui', enable: true, reconcile: false });
  });
  
  // Start the system after Electron is ready.
  await app.whenReady();
  const system = await bootloader.start();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      system.shutdown().then(() => app.quit());
    }
  });
}

main().catch(console.error);
```

### 2. Create a Plugin (`main-ui`)

A plugin is a directory with a `package.json` and an entry script.

**`plugins/main-ui/package.json`**
```json
{
  "name": "main-ui",
  "version": "1.0.0",
  "main": "index.js",
  "pluginDependencies": {
    "ecore-api": "*"
  }
}
```

**`plugins/main-ui/index.ts`**
```typescript
import { definePlugin, type EWindow, initERPC, createServer } from '@eleplug/elep';
import { resolvePluginUri } from '@eleplug/anvil';

// Define the service router for the main-process.
const { router, procedure } = initERPC.create();
const mainPluginApi = router({
    ping: procedure.ask(async () => 'pong'),
});

// Define the API type of this plugin's main-process service.
export type MainPluginApi = typeof mainPluginApi;

export default definePlugin({
  async activate({ link, pluginUri }) {
    console.log('Main UI Plugin Activated!');

    // 1. Link to the core API to get access to Electron functions.
    const coreApi = await link('ecore-api');
    const ecore = await coreApi.core.ask();

    // 2. Create a new window.
    const eWindow: EWindow = await ecore.createWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: resolvePluginUri(pluginUri, './preload.js'),
      },
    });

    // 3. Open a dedicated transport to the new window and start an erpc server on it.
    // This allows the renderer process to call back into this specific plugin.
    const rendererTransport = await eWindow.openTransport('ebus-core');
    await createServer(rendererTransport, mainPluginApi);

    // 4. Load the UI into the window.
    const uiPath = resolvePluginUri(pluginUri, './index.html');
    await eWindow.loadURL(uiPath);
    
    return {};
  }
});
```

### 3. The Preload Script (`preload.ts`)

This script runs in a sandboxed renderer context and securely exposes the communication bridge to your renderer code.

**`plugins/main-ui/preload.ts`**
```typescript
import { createAdapter } from '@eleplug/elep/preload';
import { contextBridge, ipcRenderer } from 'electron';

// Use contextBridge to securely expose a namespaced IPC adapter to the renderer.
// This is the recommended security practice in Electron.
contextBridge.exposeInMainWorld(
  'ebusCoreAdapter', 
  createAdapter('ebus-core', ipcRenderer)
);
```

### 4. Renderer Code (`renderer.ts`)

This is your UI code. It uses the adapter exposed by the preload script to establish a transport link back to the main process plugin.

**`plugins/main-ui/renderer.ts`**
```typescript
import { IpcRendererLink, createDuplexTransport, createClient, type Api, type AskProcedure } from '@eleplug/elep/render';
import type { MainPluginApi } from './index';

async function rendererMain() {
  // 1. Get the adapter exposed securely by the preload script.
  const adapter = window.ebusCoreAdapter;
  if (!adapter) {
    throw new Error('Ebus core adapter not found on window object!');
  }

  // 2. Create a Muxen Link and Transport.
  const link = new IpcRendererLink(adapter);
  const transport = createDuplexTransport(link);

  // 3. Create a type-safe erpc client to talk to the server in the main-ui plugin.
  const client = await createClient<MainPluginApi>(transport);
  const response = await client.procedure.ping.ask();

  console.log(`Renderer connected and received response: ${response}`); // > "pong"
}

rendererMain().catch(console.error);
```

## Security Model

`elep` is designed with security as a primary concern for running third-party or untrusted plugin code.

*   **Sandboxing and Context Isolation**: `elep` enforces `contextIsolation: true` and `sandbox: true` for all windows created through `ECore`, following modern Electron security best practices.
*   **Secure API Proxies**: Plugins do not get direct access to powerful Electron modules like `BrowserWindow` or `app`. Instead, they interact with `ECore` and `EWindow`, which are secure, `pin`-able wrappers that expose only a curated set of safe functionalities.
*   **`contextBridge`**: The recommended communication pattern uses `contextBridge` to securely expose namespaced IPC channels from the preload script to the renderer, preventing the renderer from accessing the full `ipcRenderer` object.
*   **`plugin://` Protocol**: This custom protocol allows plugins to load their own resources (HTML, JS, CSS, images) without needing direct filesystem access from the renderer process, preventing path traversal attacks.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).