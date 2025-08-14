/**
 * =================================================================
 * elep - Main Package Entry Point
 * =================================================================
 *
 * This file serves as the public API for the `elep` package. It re-exports
 * the essential classes, types, and functions from its core implementation and
 * from its underlying dependencies (`esys`, `ebus`, `erpc`, etc.).
 *
 * Developers building applications or plugins with Elep should import from this
 * file.
 *
 * @packageDocumentation
 */

// --- Core Elep Classes & Types (Main Application Logic) ---
export { ECore } from './core/ecore.js';
export { EWindow } from './core/ewindow.js';
export type { EWindowOptions } from './core/ewindow-options.js';
export { FileContainer } from './container/file-container.js';
export { IpcLink } from './transport/ipc-link.js';
export { IpcRendererLink } from './transport/ipc-renderer-link.js';
export type { Convert, IpcShape } from './types.js';

// --- From @eleplug/anvil (Plugin Definition Contract) ---
export { definePlugin } from '@eleplug/anvil';
export type { Plugin, PluginActivationContext, PluginApi, PluginApiMap } from '@eleplug/anvil';

// --- From @eleplug/esys (System Orchestration & Plugin Management) ---
export { Bootloader, Registry, System, MemoryContainer } from '@eleplug/esys';
export type { Container, ContainerFactory, PluginManifest, PluginRegistryEntry } from '@eleplug/esys';

// --- From @eleplug/ebus (Event Bus & Communication Patterns) ---
export { initEBUS, ok, err } from '@eleplug/ebus';
export type {
  Bus,
  Node,
  PublisherClient,
  NodeId,
  Topic,
  NodeOptions,
  Result,
  Ok,
  Err,
  ApiFactory as EbusApiFactory, // Aliased to avoid naming conflicts
  BusContext,
  TopicContext,
} from '@eleplug/ebus';

// --- From @eleplug/erpc (Core RPC Framework) ---
export { initERPC, middleware, pin, free, buildClient } from '@eleplug/erpc';
export type {
  Api,
  Client,
  Pin,
  Pinable,
  Transport,
  Transferable,
  TransferableArray,
  JsonValue,
  ErpcInstance,
  ProcedureBuilder,
  Env,
} from '@eleplug/erpc';

// --- From @eleplug/plexus (Dependency Resolution Engine) ---
export { DependencyGraph, DependencyResolver, Requirements, DiffResult } from '@eleplug/plexus';
export type {
    PluginMeta as PlexusPluginMeta, // Aliased to avoid conflict with PluginManifest
    DiffEntry,
    Provider as PlexusProvider, // Aliased for clarity
} from '@eleplug/plexus';

// --- From @eleplug/muxen (Transport Multiplexing) ---
export { createDuplexTransport } from '@eleplug/muxen';
export type { Link } from '@eleplug/muxen';