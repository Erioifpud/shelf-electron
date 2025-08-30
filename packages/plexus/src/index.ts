/**
 * =================================================================
 * plexus - Dependency Resolution Engine
 * =================================================================
 *
 * This file is the public API entry point for the `plexus` library.
 * Plexus provides a powerful, provider-based, backtracking dependency resolver
 * for managing complex plugin ecosystems.
 *
 * It allows you to:
 *  - Define dependency requirements.
 *  - Resolve a complete and valid dependency graph.
 *  - Analyze the graph for issues (missing, cycles, disputes).
 *  - Compare two graphs to generate a safe execution plan (diff).
 *
 * @packageDocumentation
 */

// --- Core Classes ---
export { DependencyGraph } from "./dependency-graph.js";
export { DependencyResolver } from "./dependency-resolver.js";
export { Requirements } from "./requirements.js";
export { DiffResult } from "./diff-result.js";

// --- Public Types ---
export type {
  PluginMeta,
  PluginIdentifier,
  MissingInfo,
  Cycle,
  DiffEntry,
  Provider,
  ProviderResult,
  ResolverOptions,
} from "./types.js";
