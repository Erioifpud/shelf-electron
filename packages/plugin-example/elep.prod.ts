/**
 * @fileoverview Elep Production Environment Configuration
 *
 * This file is loaded by the `FileContainer` in production mode. It provides
 * essential metadata that allows the runtime to correctly resolve resource paths
 * after the project has been built.
 */

import { defineProdConfig } from '@eleplug/elep/config';

export default defineProdConfig({
  /**
   * Configures the Single Page Application (SPA) routing fallback strategy for production.
   * This ensures that deep links to client-side routes (e.g., your-plugin/users/123)
   * correctly serve the main application shell, allowing the client-side router to take over.
   *
   * Elep offers three flexible SPA configuration modes:
   */

  // --- MODE 1: Smart Detection (boolean) ---
  // Setting `spa: true` enables a smart-detection mode. Elep will automatically
  // rewrite any deep-link URL that doesn't point to a specific file asset to its
  // parent HTML entry point.
  // This is a flexible default, suitable for various application structures.
  // Example: A request for `.../dist/renderer/index.html/users` is rewritten to
  // serve the `.../dist/renderer/index.html` file.
  spa: true,

  // --- MODE 2: Single Entry Point (string) ---
  // This is the most common and recommended setup for standard SPAs.
  // All non-static file requests are unconditionally rewritten to this single path.
  // The path should be the *virtual* path, which will then be processed by `rewrites`.
  //
  // spa: "/@renderer/index.html",

  // --- MODE 3: Multi-App Mode (string[]) ---
  // For advanced plugins containing several distinct applications.
  // Elep will fall back to the most specific matching entry point from the list.
  // The paths should be the *virtual* paths.
  //
  // spa: [
  //   "/@renderer/admin.html",
  //   "/@renderer/app.html"
  // ],

  /**
   * Production-specific path rewrites. This is a critical piece of configuration
   * that decouples your source code's logical paths from the final build structure.
   * Here, we map the abstract path `/@renderer/` to the actual build output
   * directory `/dist/renderer/`.
   */
  rewrites: {
    "/@renderer/": "/dist/renderer/",
  },

  /**
   * (Optional) MIME type overrides.
   * Useful for files with uncommon extensions or when the default MIME type
   * detection is incorrect. Uses micromatch glob patterns.
   *
   * @example
   * mimes: {
   *   "**\/*.my-custom-ext": "application/octet-stream"
   * }
   */
});