import type { DevPlugin } from "./dev-plugin-types.js";

/**
 * Defines the structure of the production configuration file (elep.prod.ts).
 * This configuration contains metadata that is relevant for the plugin's runtime
 * behavior in a production environment.
 */
export interface ElepConfig {
  /**
   * A map of MIME type overrides for resources within the plugin.
   *
   * The keys are `micromatch` glob patterns relative to the plugin's root directory.
   * The values are the corresponding MIME type strings. The first pattern that
   * matches a resource path will be used, providing a deterministic override mechanism.
   *
   * @example
   * {
   *   "assets/logo.svg": "image/svg+xml",
   *   "dist/**\/*.js": "text/javascript"
   * }
   */
  mimes?: Record<string, string>;

  /**
   * A map of path rewrites for production mode.
   *
   * This provides a powerful mechanism to abstract away build directories (like 'dist')
   * when generating resource URIs or handling incoming requests. The key is the
   * original path prefix to match, and the value is the new path prefix to replace
   * it with. The first matching rewrite wins.
   *
   * @example
   * // A request for "plugin://.../dist/renderer/index.html"
   * // will be rewritten to "plugin://.../renderer/index.html".
   * // A call to `context.resolve('renderer/index.html')` might be rewritten
   * // to point to "dist/renderer/index.html" if configured inversely.
   * {
   *   "/dist/renderer/": "/renderer/"
   * }
   */
  rewrites?: Record<string, string>;
}

/**
 * Defines the structure for the development configuration file (elep.dev.ts).
 * This configuration is loaded only when the container is running in development mode
 * and is used to integrate with external development tools.
 */
export interface DevConfig {
  /**
   * The development mode adapter for this plugin.
   * This should be an object that conforms to the `DevPlugin` interface, allowing
   * integration with tools like Vite or Webpack Dev Server for features such as
   * Hot Module Replacement (HMR).
   */
  dev: DevPlugin;

  /**
   * A map of path rewrites for development mode.
   *
   * This provides a powerful mechanism to abstract away build directories (like 'dist')
   * during development. The key is the original path prefix to match, and the value
   * is the new path prefix to replace it with. The first matching rewrite wins.
   *
   * In development mode, these rewrites will be merged with and take precedence
   * over any rewrites defined in `elep.prod.ts`.
   *
   * @example
   * {
   *   "/dist/": "/"
   * }
   */
  rewrites?: Record<string, string>;
}

/**
 * A type-safe helper function for defining a production configuration (`elep.prod.ts`).
 *
 * This function is an identity function that provides TypeScript autocompletion and
 * type-checking for the configuration object without altering the runtime value.
 *
 * @param config The Elep production configuration object.
 * @returns The same configuration object, but strongly typed.
 *
 * @example
 * // my-plugin/elep.prod.ts
 * import { defineProdConfig } from '@eleplug/elep';
 *
 * export default defineProdConfig({
 *   mimes: {
 *     '**\/*.ui.js': 'text/javascript',
 *   },
 *   rewrites: {
 *     '/dist/': '/'
 *   }
 * });
 */
export function defineProdConfig(config: ElepConfig): ElepConfig {
  return config;
}

/**
 * A type-safe helper function for defining a development configuration (`elep.dev.ts`).
 *
 * This function is an identity function that provides TypeScript autocompletion and
 * type-checking, ensuring the `dev` property conforms to the `DevPlugin` interface.
 *
 * @param config The Elep development configuration object.
 * @returns The same configuration object, but strongly typed.
 *
 * @example
 * // my-plugin/elep.dev.ts
 * import { defineDevConfig } from '@eleplug/elep/dev';
 * import { viteDevPlugin } from 'elep-vite-adapter';
 *
 * export default defineDevConfig({
 *   dev: viteDevPlugin(),
 *   rewrites: {
 *     "/dist/": "/"
 *   }
 * });
 */
export function defineDevConfig(config: DevConfig): DevConfig {
  return config;
}
