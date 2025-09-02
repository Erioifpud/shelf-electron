/**
 * @fileoverview Elep Development Environment Configuration
 *
 * This file is loaded by the `FileContainer` ONLY when running in development mode.
 * Its primary purpose is to integrate external development tools, such as the
 * Vite Dev Server, to enable features like Hot Module Replacement (HMR).
 */

import { defineDevConfig } from '@eleplug/elep/config';
import { viteDevPlugin } from '@eleplug/elep-vite-adapter';
import rendererConfig from './vite.config.renderer.mjs';

export default defineDevConfig({
  /**
   * The adapter that integrates a development server with Elep.
   * Here, we also configure Vite itself to understand it's serving a SPA,
   * which is crucial for handling client-side routing correctly.
   */
  dev: viteDevPlugin({
    ...rendererConfig,
    appType: 'spa',
  }),

  /**
   * A simple map of path prefixes to rewrite. This maps the abstract path
   * used in the source code (`/@renderer/`) to the physical source directory
   * (`/renderer/`) that the Vite server understands.
   */
  rewrites: {
    "/@renderer/": "/renderer/"
  }
});