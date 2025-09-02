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
   * The rewrite engine supports a powerful glob-based capture syntax that allows
   * for flexible and precise path transformations. It supports two styles of capture groups:
   *
   * 1. **Named Capture Groups:** `<name:glob>`
   *    - Defines a capture group named 'name'. `glob` can be any valid glob pattern
   *      (e.g., `*`, `**`, `*.js`).
   *    - In the target string, use `<name>` to insert the captured value.
   *
   * 2. **Anonymous Capture Groups:** `<glob>`
   *    - A simpler syntax for when you don't need a name.
   *    - In the target string, use 1-based indexed placeholders like `<1>`, `<2>`
   *      to insert captured values in the order they appear.
   *
   * This example maps the abstract path prefix "/@renderer/" to the physical source
   * directory "/renderer/". A call to `context.resolve('@renderer/index.html')` will
   * match the rule, capture "index.html" into the `rest` group, and rewrite the path
   * to "renderer/index.html", which is then correctly handled by the Vite Dev Server.
   *
   * @example
   * {
   *   // --- Named Groups ---
   *   // Captures everything after /src/ and places it in /dist/
   *   "/src/<path:**>": "/dist/<path>",
   *
   *   // --- Anonymous Groups ---
   *   // A concise way to reorder path segments.
   *   // /assets/js/main.js -> /static/js/main.js
   *   "/assets/<*>/<*.js>": "/static/<1>/<2>",
   *
   *   // --- Mixed (use with care) ---
   *   // Captures version and endpoint separately.
   *   // /api/v2/users -> /internal/users?v=2
   *   "/api/v<[0-9]+>/<endpoint:**>": "/internal/<endpoint>?v=<1>"
   * }
   */
  rewrites: {
    "/@renderer/<**>": "/renderer/<1>",
  }
});