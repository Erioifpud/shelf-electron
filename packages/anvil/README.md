# `@eleplug/anvil`

`anvil` provides the official plugin definition contract for the `esys` and `elep` ecosystems. It is a specification package, not a runtime. Its purpose is to define a standard interface for what a plugin is, its lifecycle, and the secure, type-safe context it operates in.

[![npm version](https://img.shields.io/npm/v/@eleplug/anvil.svg)](https://www.npmjs.com/package/@eleplug/anvil)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

When building a modular system, you need a clear and stable contract between the host system and the plugins it loads. This contract should answer several key questions:

*   How does a plugin start and stop (`activate`/`deactivate`)?
*   What capabilities does the host system provide to the plugin (e.g., communication, API creation)?
*   How can plugins communicate with each other in a way that is both secure and type-safe?

`anvil` provides a definitive answer to these questions by defining the `Plugin` interface and the `PluginActivationContext`. Its most powerful feature is enabling **decoupled, end-to-end type-safe communication between plugins**.

## Core Concepts

*   **The `Plugin` Interface**: The fundamental contract that all plugins must implement. It defines an `activate` function, which is the plugin's entry point, and an optional `deactivate` function for cleanup.

*   **The `PluginActivationContext`**: When a plugin is activated, it receives a `context` object. This is its sandboxed "world view" and the sole entry point for interacting with the host system and other plugins. It provides:
    *   `erpc` builders (`router`, `procedure`) for defining its own API.
    *   `ebus` methods (`subscribe`, `emiter`) for participating in Pub/Sub messaging.
    *   A unique `pluginUri` for self-identification.
    *   The powerful `link()` method for type-safe communication with other plugins.

*   **Type-Safe Inter-Plugin Communication**: The `context.link('other-plugin')` method returns a fully-typed `erpc` client for another plugin's API. This is achieved through TypeScript's declaration merging via a `PluginApiMap` interface, allowing your entire plugin ecosystem to be type-checked at compile time.

## How to Use

Creating a plugin and enabling communication involves three main steps.

### 1. Define a Plugin

Use the `definePlugin` helper to get full type-safety for your plugin definition. The `activate` function must return an `erpc` API.

```typescript
// in plugins/database/index.ts
import { definePlugin } from '@eleplug/anvil';

// A simple in-memory database.
const db = new Map<string, any>();

export default definePlugin({
  // The activate function defines the plugin's public API.
  activate({ router, procedure }) {
    return router({
      get: procedure.ask((_ctx, key: string) => db.get(key)),
      set: procedure.tell((_ctx, key: string, value: any) => {
        db.set(key, value);
      }),
    });
  },
});
```

### 2. Enable Type-Safe Linking with `PluginApiMap`

To make the `context.link()` method aware of your plugins' APIs, you need to "teach" TypeScript about them. This is done by creating a type definition file (`.d.ts`) in your project and using declaration merging to extend the `PluginApiMap` interface.

```typescript
// in my-project/src/types/anvil.d.ts

// Import the utility type from anvil.
import type { PluginApi } from '@eleplug/anvil';

// Use `declare module` to augment the original interface.
declare module '@eleplug/anvil' {
  // This interface maps your plugin names (as used in dependencies)
  // to their API types.
  interface PluginApiMap {
    // The key is the plugin's name (from its manifest/package.json).
    // The value infers the API type from the plugin's module.
    'database-plugin': PluginApi<typeof import('plugins/database')>;
    'user-service-plugin': PluginApi<typeof import('plugins/user-service')>;
  }
}
```

### 3. Link to Other Plugins

Now, another plugin can securely and type-safely link to the `database-plugin`.

```typescript
// in plugins/user-service/index.ts
import { definePlugin } from '@eleplug/anvil';

export default definePlugin({
  async activate({ router, procedure, link }) {
    // 1. Link to the database plugin.
    // The returned `dbClient` is a fully-typed erpc client!
    const dbClient = await link('database-plugin');

    // 2. Use the client to interact with the other plugin.
    await dbClient.set.tell('user:1', { name: 'Alice' });

    // 3. Define this plugin's own API.
    return router({
      getUser: procedure.ask(async (_ctx, userId: string) => {
        // TypeScript knows `dbClient.get.ask` returns a Promise<any>.
        const user = await dbClient.get.ask(`user:${userId}`);
        if (!user) {
          throw new Error('User not found');
        }
        return user;
      }),
    });
  },
});
```
With this setup, if the `database-plugin` changes its `get` procedure's signature, TypeScript will immediately flag an error in the `user-service-plugin`'s code, preventing runtime failures.

## Key Exports

| Export                    | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `definePlugin()`          | A helper function to create a plugin with full type inference.              |
| `Plugin<TApi>`            | The core interface that all plugins must implement.                         |
| `PluginActivationContext` | The context object passed to a plugin's `activate` function.                |
| `PluginApiMap`            | The interface you extend via declaration merging for type-safe linking.     |

## Architectural Role

`anvil` is the specification that enables a loosely coupled, yet highly cohesive, plugin architecture. It provides the stable contract that allows the `esys` runtime to manage plugins and for plugins to interact with each other in a standardized, secure, and developer-friendly way.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).