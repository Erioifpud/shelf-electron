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
   * The rewrite engine supports a powerful glob-based capture syntax: `<name:glob>`.
   * This allows for flexible and precise matching and substitution.
   *
   * - `<name:pattern>`: Defines a capture group named 'name'.
   * - The `pattern` can be any valid glob expression (e.g., `*`, `**`, `*.js`, `{a,b}`).
   * - In the target string, use `<name>` to insert the captured value.
   *
   * This example maps the abstract path prefix "/@renderer/" to the physical source
   * directory "/renderer/".
   * - A call to `context.resolve('@renderer/index.html')`
   * - will match `"/@renderer/<rest:**>"`, capturing 'index.html' into the `rest` group.
   * - It will then be rewritten to `"/renderer/<rest>"`, resulting in "renderer/index.html".
   * This rewritten path is then correctly handled by the Vite Dev Server.
   *
   * @example
   * {
   *   // Captures everything after /src/ and places it in /dist/
   *   "/src/<path:**>": "/dist/<path>",
   *
   *   // Captures a filename and extension separately
   *   "/pages/<name:*>/<file:*.{js|css}>": "/assets/<name>/<file>"
   * }
   */
  rewrites: {
    "/@renderer/<rest:**>": "/renderer/<rest>"
  }
});