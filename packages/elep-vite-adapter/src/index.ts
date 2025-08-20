import type {
  DevPlugin,
  DevPluginContext,
  ResourceGetResponse,
} from "@eleplug/elep/dev";
import { createServer, type ViteDevServer, type UserConfig } from "vite";
import chalk from "chalk";

/**
 * Creates a development plugin for Elep that integrates with the Vite dev server.
 *
 * This function acts as a bridge to a standard Vite development server. It is the
 * developer's responsibility to provide a `vite.config.ts` (or .js/.mjs) file
 * in their plugin's root directory to configure Vite's behavior (e.g., plugins, base path).
 *
 * @design
 * This adapter is "unopinionated". It does not override core Vite settings like
 * `base` or `server.fs.allow`. It simply starts the Vite server located in the
 * plugin's root and forwards resource requests to it. This approach gives the
 * developer full control over their Vite build process.
 *
 * @param viteConfig - Optional. A Vite `UserConfig` object for programmatic
 *                     overrides. These settings will be merged with the user's
 *                     `vite.config.ts`. It's generally recommended to configure
 *                     everything in `vite.config.ts` for clarity.
 * @returns An object conforming to the `DevPlugin` interface, ready to be used
 *          in an `elep.dev.ts` file.
 *
 * @example
 * // In your-plugin/elep.dev.ts
 * import { defineDevConfig } from '@eleplug/elep/dev';
 * import { viteDevPlugin } from '@eleplug/elep-vite-adapter';
 *
 * export default defineDevConfig({
 *   dev: viteDevPlugin(),
 * });
 *
 * // In your-plugin/vite.config.ts
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   // Recommended for Elep: ensure the base path is absolute
 *   base: '/',
 *   // ... other Vite options (e.g., plugins: [react()])
 * });
 */
export function viteDevPlugin(viteConfig: UserConfig | object = {}): DevPlugin {
  let server: ViteDevServer | null = null;
  let pluginUri: string | null = null;

  return {
    /**
     * Starts the Vite development server based on the plugin's configuration.
     * This is called by the Elep runtime when the host plugin is activated.
     */
    async start(context: DevPluginContext): Promise<void> {
      pluginUri = context.pluginUri;

      try {
        // Vite will automatically find and load vite.config.ts from this root.
        const inlineConfig: UserConfig = {
          ...viteConfig,
          root: context.pluginAbsolutePath,
          // Set server mode to 'development' explicitly.
          mode: "development",
        };

        server = await createServer(inlineConfig);
        await server.listen();

        const address = server.httpServer?.address();
        if (address && typeof address === "object") {
          console.log(
            chalk.green(
              `[elep-vite] Vite server for "${chalk.magenta(pluginUri)}" started at ${chalk.cyan(`http://localhost:${address.port}`)}`
            )
          );
        } else {
          console.log(
            chalk.green(
              `[elep-vite] Vite server for "${chalk.magenta(pluginUri)}" started.`
            )
          );
        }
      } catch (error: any) {
        console.error(
          chalk.red(
            `[elep-vite] Failed to start Vite dev server for "${pluginUri}":`
          ),
          error
        );
        throw error;
      }
    },

    /**
     * Stops the Vite development server.
     * This is called by the Elep runtime when the host plugin is deactivated.
     */
    async stop(): Promise<void> {
      if (server) {
        await server.close();
        server = null;
        console.log(
          chalk.yellow(
            `[elep-vite] Vite server for "${chalk.magenta(pluginUri)}" stopped.`
          )
        );
      }
    },

    /**
     * Intercepts a resource request and forwards it to the running Vite dev server.
     * This enables features like Hot Module Replacement (HMR) within the Elep environment.
     */
    async get(resourcePathInPlugin: string): Promise<ResourceGetResponse> {
      if (!server || !server.httpServer) {
        throw new Error(
          `[elep-vite] Cannot get resource. Vite server for "${pluginUri}" is not running.`
        );
      }

      const address = server.httpServer.address();
      if (typeof address !== "object" || address === null) {
        throw new Error(
          `[elep-vite] Cannot get resource. Vite server address for "${pluginUri}" is unavailable.`
        );
      }

      // Normalize the path for web requests.
      const webPath = resourcePathInPlugin
        .replace(/\\/g, "/")
        .replace(/^\//, "");
      const viteUrl = `http://localhost:${address.port}/${webPath}`;

      console.log(
        chalk.gray(
          `[elep-vite] Forwarding request for '${resourcePathInPlugin}' to: ${chalk.cyan(viteUrl)}`
        )
      );

      try {
        const response = await fetch(viteUrl);

        // If Vite returns an error (e.g., 404 Not Found, 500 Internal Server Error),
        // capture the response body to provide a more detailed error message.
        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Vite server returned status ${response.status} for "${webPath}".\nResponse: ${text.slice(0, 500)}`
          );
        }

        return {
          body: response.body as ReadableStream,
          mimeType: response.headers.get("Content-Type") || undefined,
        };
      } catch (error: any) {
        // This catch block handles both network errors (e.g., server not reachable)
        // and the custom error thrown for non-ok responses above.
        throw new Error(
          `[elep-vite] Failed to fetch from Vite server at "${viteUrl}": ${error.message}`
        );
      }
    },
  };
}
