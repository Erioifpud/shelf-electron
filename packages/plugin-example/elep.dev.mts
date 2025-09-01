/**
 * @fileoverview Elep Development Environment Configuration
 *
 * This file is loaded by the `FileContainer` ONLY when running in development mode
 * (i.e., when the `elep-boot` process is started with the --dev flag).
 *
 * Its primary purpose is to integrate external development tools, such as the
 * Vite Dev Server, to enable features like Hot Module Replacement (HMR).
 */

// A type-safe helper for defining the configuration.
import { defineDevConfig } from '@eleplug/elep/config';
// The adapter that integrates Vite with Elep's development mode.
import { viteDevPlugin } from '@eleplug/elep-vite-adapter';
// Import the Vite config for the renderer to pass it to the adapter.
import rendererConfig from './vite.config.renderer.mjs';

export default defineDevConfig({
  /**
   * The 'dev' property must be an object conforming to the `DevPlugin` interface.
   * `viteDevPlugin` is a factory that creates such an object, configured to run
   * a Vite development server.
   */
  dev: viteDevPlugin(rendererConfig),

  /**
   * Development-specific path rewrites.
   * These rewrites are merged with and take precedence over those in `elep.prod.ts`.
   *
   * This example maps the abstract path "/@renderer/" to the physical source
   * directory "/renderer/". This allows `context.resolve('@renderer/index.html')`
   * in `main.ts` to correctly resolve to the Vite Dev Server URL during development.
   */
  rewrites: {
    "/@renderer/": "/renderer/"
  }
});