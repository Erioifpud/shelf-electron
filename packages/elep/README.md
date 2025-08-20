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
*   **Integrated Dev Experience**: The `@eleplug/elep-dev` toolkit provides commands to launch your plugin in a hot-reloading development environment, manage dependencies, and auto-generate type definitions.
*   **"Batteries-Included" Experience**: `elep` is the top-level package that re-exports all the necessary tools from the underlying `esys`, `ebus`, `erpc`, `plexus`, and `anvil` packages, providing a single, consistent API surface.

## Architectural Overview

`elep` establishes a secure client-server model between the main process and each renderer window. A central `GlobalIpcRouter` in the main process manages all communication, ensuring plugins and their UIs are completely isolated from one another.

```
+------------------------------------------------------------------+
|                        Electron Main Process                       |
|------------------------------------------------------------------|
|  +---------------------------+   +-----------------------------+ |
|  |       esys System         |   |      GlobalIpcRouter        | |
|  | (Orchestrator, ebus, etc.)|   | (Singleton, manages all IPC)| |
|  +---------------------------+   +-----------------------------+ |
|                                                                    |
|  +---------------------+    +----------------------------------+   |
|  |   ECore (Pinned)    |    |   Plugin 'main-ui'               |   |
|  | (Kernel API Proxy)  |    |    - Calls core.createWindow()   |   |
|  +---------------------+    |    - `accept()`s connections     |   |
|                             |    - Runs an erpc server         |   |
|                             +----------------------------------+   |
+------------------------------------------------------------------+
        ^                |           IPC Handshake & Data           |
        |                |      (via elep-handshake channel)        |
        |                v                                         v
+------------------------+-------------------------------------------+
|                   Electron Renderer Process                      |
|--------------------------------------------------------------------|
|  +-----------------+      +------------------------------------+   |
|  | Preload Script  |----->|      UI (React, Vue, etc.)         |   |
|  |(exposes adapter)|      |   - Calls getService()             |   |
|  +-----------------+      |   - Creates type-safe erpc client  |   |
|                           +------------------------------------+   |
+--------------------------------------------------------------------+
```

## Getting Started: Development Workflow

The `@eleplug/elep-dev` package is the recommended way to develop plugins. It provides a CLI that scaffolds a development environment for you.

### 1. Project Setup

First, install the development toolkit:
```bash
npm install -D @eleplug/elep-dev
```
Then, add a `dev` script to your plugin's `package.json`:
```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "elep-dev dev"
  }
}
```

### 2. Main Plugin Code (`index.ts`)

This is your plugin's entry point in the main process. It defines the plugin's logic and the API it will expose to its renderer UI.

```typescript
// in src/index.ts
import "@eleplug/elep-boot/kernel";
import { definePlugin, openWindow, type MainPluginApi } from '@eleplug/elep';

// Define the API this plugin's main process will expose to its renderer.
const serviceApi = {
    ping: p2p.ask(async () => 'pong'),
};
export type MyServiceApi = typeof serviceApi;

export default definePlugin({
  async activate({ link, pluginUri, resolve }) {
    console.log('Main UI Plugin Activated!');

    // 1. Link to the kernel to get access to core Electron functions.
    const kernel = await link('__kernel');
    const core = await kernel.core.ask();

    // 2. Open a new window, passing the service API to expose.
    const eWindow = await openWindow(core, {
      width: 800,
      height: 600,
    }, serviceApi);

    // 3. Load the UI into the window using the secure plugin:// protocol.
    // The context.resolve() method handles any path rewrites from elep.prod.ts.
    const uiPath = resolve('index.html');
    await eWindow.loadURL(uiPath);
    
    // This plugin doesn't need to expose a P2P API to other plugins.
    return {};
  }
});
```

### 3. Renderer Code (`renderer.ts`)

This is your UI code. It runs in the sandboxed renderer process and connects back to the service you defined in the main process.

```typescript
// in src/renderer.ts
import { getService } from '@eleplug/elep/renderer';
import type { MyServiceApi } from './index';

async function rendererMain() {
  // `getService()` handles the IPC handshake and returns a type-safe client.
  const service = await getService<MyServiceApi>();
  
  const response = await service.ping.ask(); // Fully type-safe!

  const content = `Renderer connected and received response: ${response}`;
  document.body.innerHTML = `<h1>${content}</h1>`;
  console.log(content); // > "Renderer connected and received response: pong"
}

rendererMain().catch(console.error);
```

### 4. Running in Development Mode

Now, simply run the `dev` script:
```bash
npm run dev
```
`elep-dev` will automatically find and launch your plugin using `@eleplug/elep-boot`, providing a live development environment. If your plugin has dependencies (e.g., in an `elep_plugins` directory), they will be loaded as well.

## Production Bootstrap

When you're ready to ship, your application's main entry point will use `elep-boot` directly to start the system with a production configuration.

```typescript
// in your production app's main.ts
import { bootstrap } from '@eleplug/elep-boot';

// This is a simplified example. `elep-boot` is configured via a
// `config.json` file or CLI arguments.
bootstrap({
  // Use a persistent registry in production
  registry: './app-data/registry.json', 
  // Define where your plugin containers are located
  containers: {
    'core-plugins': { path: './resources/core' },
    'user-plugins': { path: './app-data/plugins' }
  },
  // Define which plugins to enable on startup
  plugins: [
    'core-plugins/kernel',
    'core-plugins/main-ui'
  ]
}, __dirname, false);
```

## Security Model

`elep` is designed with security as a primary concern for running third-party or untrusted plugin code.

*   **Sandboxing and Context Isolation**: `elep` enforces `contextIsolation: true` and `sandbox: true` for all windows, following modern Electron security best practices.
*   **Secure API Proxies**: Plugins do not get direct access to powerful Electron modules. Instead, they interact with `ECore` and `EWindow`, which are secure, `pin`-able wrappers that expose only a curated set of safe functionalities.
*   **Centralized IPC Router**: A single `GlobalIpcRouter` in the main process manages all IPC traffic, ensuring that renderer windows can only communicate through their designated, isolated channels.
*   **`plugin://` Protocol**: This custom protocol allows plugins to load their own resources (HTML, JS, CSS) without needing direct filesystem access from the renderer process, preventing path traversal attacks.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).