# `@eleplug/plexus`

`plexus` is a powerful, provider-based, backtracking dependency resolver for TypeScript. It is a standalone engine designed to solve complex dependency constraints in modular ecosystems, such as plugin-based applications. It provides the tools to build, analyze, and safely transition between different dependency states.

[![npm version](https://img.shields.io/npm/v/@eleplug/plexus.svg)](https://www.npmjs.com/package/@eleplug/plexus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

Imagine you are building a system where users can install plugins, and these plugins can depend on each other. You quickly run into the same complex problems that package managers like `npm` or `yarn` solve:

*   **Version Satisfaction**: If Plugin A requires Plugin B `^1.0.0` and Plugin C requires Plugin B `^1.2.0`, which version of Plugin B should be installed?
*   **Transitive Dependencies**: Plugin A depends on B, which depends on C. What is the full set of plugins required to run Plugin A?
*   **Conflict Resolution**: What if no single version of a plugin can satisfy all requirements from other plugins?
*   **Cycles**: What happens if Plugin A depends on B, and Plugin B depends on A?
*   **Safe State Transitions**: If you update Plugin B, which other plugins need to be deactivated first and then reactivated to ensure the system remains stable?

`plexus` is a library that provides the core logic to solve these problems in a generic, provider-agnostic way.

## Core Features

*   **Backtracking Dependency Resolver**: Implements a robust constraint satisfaction algorithm to find a single, valid set of plugin versions that meets all specified `semver` requirements.
*   **Provider-Based Architecture**: `plexus` doesn't know where your plugins come from. You provide `Provider` functions that tell the resolver how to fetch metadata for a given plugin (e.g., from a filesystem, a database, or a remote API).
*   **Comprehensive Graph Analysis**: The `DependencyGraph` class provides powerful tools to:
    *   Perform a **topological sort** to determine the correct activation/deactivation order.
    *   Detect **dependency cycles**.
    *   Find **missing dependencies**.
    *   Identify version **disputes** (multiple versions of the same plugin).
*   **Stateful Reconciliation (Diffing)**: Compare two dependency graphs (e.g., "current state" vs. "desired state") to generate a safe, minimal, and topologically sorted execution plan for activating and deactivating plugins.

## Core Concepts

| Concept                   | Description                                                                                             | Analogy                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **`Provider`**            | A function you write that tells `plexus` where to find plugin versions and their dependencies.        | A list of stores where you can buy parts.      |
| **`DependencyResolver`**  | The engine that takes your requirements and uses `Provider`s to find a valid solution.                  | The engineer who reads the blueprint and finds the right parts from the stores. |
| **`Requirements`**        | An object representing the "desired state" of your system (e.g., "I want plugin A at version `^1.0.0`"). | The top-level blueprint for what you want to build. |
| **`DependencyGraph`**     | The "locked" result of a successful resolution. A complete, valid map of all required plugins.        | The final, detailed parts list and assembly instructions. |
| **`DiffResult`**          | The result of comparing two `DependencyGraph`s, which provides a safe execution plan.                   | The upgrade/downgrade instructions for your build. |

## How to Use

Using `plexus` typically involves a three-step process: defining providers, setting requirements, and resolving the graph.

### 1. Define Your Providers

A provider is a function that takes a plugin name and returns all its available versions and their respective dependencies.

```typescript
import { type Provider } from '@eleplug/plexus';

// Example: A simple in-memory provider.
const myPluginRegistry = {
  'plugin-a': {
    '1.0.0': { 'plugin-b': '^1.0.0' },
    '1.1.0': { 'plugin-b': '^1.1.0' },
  },
  'plugin-b': {
    '1.0.0': {},
    '1.1.0': {},
    '1.1.5': {},
  },
  'plugin-c': {
    '2.0.0': { 'plugin-b': '1.1.5' }, // A very specific dependency
  }
};

const memoryProvider: Provider = async (pluginName: string) => {
  return myPluginRegistry[pluginName];
};
```

### 2. Set Up the Resolver and Requirements

Instantiate the resolver, register your provider(s), and define your top-level requirements.

```typescript
import { DependencyResolver, Requirements } from '@eleplug/plexus';

// Create and configure the resolver
const resolver = new DependencyResolver();
resolver.register('memory', memoryProvider); // Register the provider with a name

// Define the desired state of your system
const requirements = new Requirements();
requirements.add('plugin-a', '^1.0.0');
requirements.add('plugin-c', '^2.0.0');
```

### 3. Resolve the Dependency Graph

Trigger the resolution process. This will use the backtracking algorithm to find a solution.

```typescript
try {
  // The resolver uses the requirements and the provider to find a valid graph.
  await requirements.resolve(resolver);

  const finalGraph = requirements.getGraph();

  console.log('Resolution successful!');
  
  // You now have a complete and valid graph.
  // You can analyze it or sort it for activation.
  const activationOrder = finalGraph.sort();

  console.log('Safe activation order:');
  activationOrder.forEach(plugin => {
    console.log(`- ${plugin.name}@${plugin.version}`);
  });
  
  // Output:
  // Safe activation order:
  // - plugin-b@1.1.5
  // - plugin-c@2.0.0
  // - plugin-a@1.1.0

} catch (error) {
  console.error('Failed to resolve dependencies:', error);
}
```

### 4. Diffing and Generating an Execution Plan

`plexus` shines when managing state transitions. You can calculate the difference between the current state and a new desired state to get a safe execution plan.

```typescript
import { DiffResult } from '@eleplug/plexus';

// Assume `currentRequirements` holds the graph of currently running plugins.
const currentRequirements = requirements.clone();

// Now, let's change the requirements.
const newRequirements = requirements.clone();
newRequirements.remove('plugin-c'); // User wants to uninstall plugin-c.

// Resolve the new state.
await newRequirements.resolve(resolver);

// Compare the new graph with the old one.
const diff: DiffResult = newRequirements.getGraph().diff(currentRequirements.getGraph());

// Get a safe, topologically sorted plan to apply the changes.
const plan = diff.sort();

console.log('Execution plan:');
plan.forEach(step => {
  console.log(`- ${step.type}: ${step.meta.name}@${step.meta.version}`);
});

// Output:
// Execution plan:
// - removed: plugin-c@2.0.0
```
This plan tells you exactly what to deactivate (and in what order) before activating anything new, ensuring system stability.

## Architectural Role

`plexus` is a foundational engine for building modular systems. It provides the low-level, but critical, logic for dependency management that enables higher-level frameworks like `@eleplug/esys` to orchestrate a plugin ecosystem safely and reliably. It is designed to be a general-purpose tool, usable in any project that requires complex dependency resolution.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).