/**
 * This file serves as the public entry point for the renderer-side components
 * of the `elep` library. It exports the necessary classes and types for plugins
 * or applications running in an Electron renderer process to establish
 * communication with the main process.
 */

import type { ECore } from './core/ecore.js';
import type { EWindow } from './core/ewindow.js';
import type { EWindowOptions } from './core/ewindow-options.js';

export { IpcRendererLink } from "./transport/ipc-renderer-link.js";
export type { Convert, IpcShape } from "./types.js";
export type {
  ECore,
  EWindow,
  EWindowOptions,
};

export * from '@eleplug/anvil';
export * from '@eleplug/ebus';
export * from '@eleplug/erpc';
export * from '@eleplug/esys';
export * from '@eleplug/muxen';
export * from '@eleplug/transport';