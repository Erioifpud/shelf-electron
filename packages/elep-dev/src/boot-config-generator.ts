import type { AppConfig } from "@eleplug/elep-boot/config";
import type { DiscoveredPlugin } from "./types.js";

/**
 * Generates the dynamic `AppConfig` object required to bootstrap the application
 * in a development environment. This configuration is passed in-memory to the
 * `elep-boot` process.
 */
export class BootConfigGenerator {
  /**
   * Creates an instance of BootConfigGenerator.
   */
  constructor() {}

  /**
   * Constructs the `AppConfig` object based on the current plugin and its dependencies.
   *
   * This configuration instructs `elep-boot` on:
   * 1. Which containers to mount (one for the current plugin, one for dependencies).
   * 2. Which plugins to enable at startup.
   *
   * @param currentPlugin - The metadata for the plugin currently being developed.
   * @param dependencyPlugins - An array of dependency plugins found in the `elep_plugins` directory.
   * @param dependencyContainerPath - The relative path from the project root to the `elep_plugins` directory.
   * @returns An `AppConfig` object ready to be serialized and passed to `elep-boot`.
   */
  public generate(
    currentPlugin: DiscoveredPlugin,
    dependencyPlugins: DiscoveredPlugin[],
    dependencyContainerPath: string
  ): AppConfig {
    // We define separate containers for the currently developed plugin and its dependencies.
    // This provides a clean separation of concerns and mirrors a potential production setup.
    const containers: AppConfig["containers"] = {
      // The "dev-current" container points to the current working directory, allowing
      // file-based development tools (like Vite) to monitor source files.
      "dev-current": {
        path: ".",
      },
    };

    // The "dev-deps" container is only added if there are dependencies.
    // It points to the 'elep_plugins' staging directory.
    if (dependencyPlugins.length > 0) {
      containers["dev-deps"] = {
        path: dependencyContainerPath,
      };
    }

    // We generate "short-form" URIs to instruct esys which plugins to enable.
    // The format is: "container-name/path-within-container".

    // For the current plugin, the path within its container is empty, representing the root.
    const currentPluginUri = `dev-current/`;

    // For dependency plugins, the path is their directory name within the 'elep_plugins' container.
    const dependencyPluginUris = dependencyPlugins.map(
      (p) => `dev-deps/${p.pathInStaging}`
    );

    const config: AppConfig = {
      // Use an in-memory registry for a clean slate on every dev server start.
      registry: undefined,
      containers: containers,
      // The list of all plugins to be enabled on boot.
      plugins: [currentPluginUri, ...dependencyPluginUris],
    };

    return config;
  }
}