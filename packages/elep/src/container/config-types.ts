import type { DevPlugin } from "./dev-plugin-types.js";

/**
 * Defines the structure of the production configuration file (elep.prod.ts).
 */
export interface ElepConfig {
  /**
   * A map of simple path prefix rewrites for production mode.
   *
   * @example
   * rewrites: {
   *   "/@renderer/": "/dist/renderer/"
   * }
   */
  rewrites?: Record<string, string>;

  /**
   * A map of MIME type overrides for resources within the plugin.
   * Uses `micromatch` glob patterns.
   */
  mimes?: Record<string, string>;

  /**
   * Configures the Single Page Application (SPA) routing fallback strategy.
   * This is crucial for ensuring client-side routes are handled correctly.
   *
   * It can be configured in one of three ways:
   *
   * 1.  `true` (Smart Detection Mode):
   *     - For any request that doesn't look like a static file, the system will
   *       rewrite the path to the first preceding file segment that ends with a
   *       common web page extension (e.g., .html, .htm, .xhtml).
   *     - Example: A request for `.../app/index.html/users/1` falls back to `.../app/index.html`.
   *     - Best for plugins with multiple nested SPAs or MPAs.
   *
   * 2.  `string` (Single Entry Point Mode):
   *     - Example: `spa: "/@renderer/index.html"`
   *     - All non-static file requests are unconditionally rewritten to this single path.
   *     - This is the standard and recommended configuration for most SPAs.
   *
   * 3.  `string[]` (Multi-App Mode):
   *     - Example: `spa: ["/@renderer/admin.html", "/@renderer/app.html"]`
   *     - For non-static file requests, the system finds the most specific matching
   *       entry point from the list. A request for `.../admin.html/settings` will
   *       fall back to `.../admin.html`.
   *     - Useful for advanced plugins that bundle multiple distinct applications.
   *
   * @default undefined (SPA mode disabled)
   */
  spa?: boolean | string | string[];
}

/**
 * Defines the structure for the development configuration file (elep.dev.ts).
 */
export interface DevConfig {
  /**
   * The development mode adapter for this plugin (e.g., Vite Dev Server).
   */
  dev: DevPlugin;

  /**
   * A map of simple path prefix rewrites for development mode.
   * These rewrites are merged with and take precedence over those in `elep.prod.ts`.
   */
  rewrites?: Record<string, string>;

  /**
   * Configures the SPA routing fallback strategy for the development environment.
   * The behavior mirrors the `ElepConfig.spa` options.
   */
  spa?: boolean | string | string[];
}

/**
 * A type-safe helper function for defining a production configuration (`elep.prod.ts`).
 */
export function defineProdConfig(config: ElepConfig): ElepConfig {
  return config;
}

/**
 * A type-safe helper function for defining a development configuration (`elep.dev.ts`).
 */
export function defineDevConfig(config: DevConfig): DevConfig {
  return config;
}
