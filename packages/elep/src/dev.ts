/**
 * =================================================================
 * elep - Development Tools Entry Point
 * =================================================================
 *
 * This file serves as the public API entry point for development-time utilities
 * and types, such as interfaces for creating development plugins (e.g., Vite adapters).
 *
 * Developers building tools that integrate with Elep's development mode should
 * import from this entry point (`@eleplug/elep/dev`).
 *
 * @packageDocumentation
 */

// Re-export the core interfaces for building a development plugin.
export type {
  DevPlugin,
  DevPluginContext,
} from "./container/dev-plugin-types.js";

// Re-export `ResourceGetResponse` as it's a required return type for the `get` hook,
// making it convenient for dev plugin authors.
export type { ResourceGetResponse } from "@eleplug/esys";
