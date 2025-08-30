import type { PluginManifest } from "@eleplug/esys";
import type { Plugin } from "@eleplug/anvil";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { ConfigLoader } from "./config-loader.js";
import type { ElepConfig, DevConfig } from "./config-types.js";

/**
 * Defines the abstract interface for a plugin loader.
 * This contract allows different loading strategies (e.g., from file system,
 * database, or network) to be used by a Container.
 */
export interface IPluginLoader {
  /**
   * Loads and parses the manifest for a plugin.
   * @param pluginPath The path of the plugin within its container.
   * @returns A Promise that resolves to the `PluginManifest`.
   * @throws An error if the manifest is missing, malformed, or invalid.
   */
  loadManifest(pluginPath: string): Promise<PluginManifest>;

  /**
   * Dynamically loads the main module of a plugin.
   * @param pluginPath The path of the plugin within its container.
   * @param manifest The previously loaded manifest for the plugin.
   * @returns A Promise that resolves to the plugin's `Plugin` instance.
   * @throws An error if the module cannot be loaded or doesn't export a valid plugin.
   */
  loadModule(pluginPath: string, manifest: PluginManifest): Promise<Plugin>;

  /**
   * Loads and parses the plugin's production configuration (`elep.prod.ts`).
   * @param pluginPath The path of the plugin within its container.
   * @returns A Promise that resolves to the `ElepConfig` object, or `null` if the file doesn't exist.
   */
  loadProdConfig(pluginPath: string): Promise<ElepConfig | null>;

  /**
   * Loads and parses the plugin's development configuration (`elep.dev.ts`).
   * @param pluginPath The path of the plugin within its container.
   * @returns A Promise that resolves to the `DevConfig` object, or `null` if the file doesn't exist.
   */
  loadDevConfig(pluginPath: string): Promise<DevConfig | null>;
}

/**
 * An `IPluginLoader` implementation that loads plugins from the local file system.
 * It expects each plugin to be a directory containing a `package.json` manifest
 * and a CommonJS or ESM entry point.
 */
export class FilePluginLoader implements IPluginLoader {
  private readonly configLoader: ConfigLoader;

  /**
   * The absolute root path of the container, made public to be accessible
   * by consumers like `PluginRuntime` for resolving full plugin paths.
   */
  public readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.configLoader = new ConfigLoader(this.rootPath);
  }

  public async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const packageJsonPath = path.resolve(
      this.rootPath,
      pluginPath,
      "package.json"
    );

    if (!packageJsonPath.startsWith(this.rootPath)) {
      throw new Error(`Path traversal detected for manifest: ${pluginPath}`);
    }

    try {
      const content = await fsp.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);

      if (
        typeof pkg.name !== "string" ||
        typeof pkg.version !== "string" ||
        typeof pkg.main !== "string"
      ) {
        throw new Error(
          `Manifest is invalid: 'name', 'version', and 'main' fields are required and must be strings.`
        );
      }

      return {
        name: pkg.name,
        version: pkg.version,
        main: pkg.main,
        pluginDependencies: pkg.pluginDependencies || {},
        pluginGroups: Array.isArray(pkg.pluginGroups) ? pkg.pluginGroups : [],
      };
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(
          `Plugin manifest not found at path '${pluginPath}'. The package.json file is missing.`
        );
      }
      throw new Error(
        `Failed to read or parse manifest for plugin at '${pluginPath}': ${error.message}`
      );
    }
  }

  public async loadModule(
    pluginPath: string,
    manifest: PluginManifest
  ): Promise<Plugin> {
    const mainScriptPath = path.resolve(
      this.rootPath,
      pluginPath,
      manifest.main
    );

    if (!mainScriptPath.startsWith(this.rootPath)) {
      throw new Error(`Path traversal detected for module: ${pluginPath}`);
    }

    try {
      // Bust the require cache for hot-reloading support during development.
      if (require.cache[mainScriptPath]) {
        delete require.cache[mainScriptPath];
      }

      const pluginModule = require(mainScriptPath);

      const plugin: Plugin | undefined = pluginModule.default ?? pluginModule;

      if (typeof plugin?.activate !== "function") {
        throw new Error(
          `The module does not have a valid default export with an 'activate' function.`
        );
      }
      return plugin;
    } catch (error: any) {
      throw new Error(
        `Failed to load plugin module from '${manifest.main}': ${error.message}`
      );
    }
  }

  public async loadProdConfig(pluginPath: string): Promise<ElepConfig | null> {
    return this.configLoader.loadProdConfig(pluginPath);
  }

  public async loadDevConfig(pluginPath: string): Promise<DevConfig | null> {
    return this.configLoader.loadDevConfig(pluginPath);
  }
}
