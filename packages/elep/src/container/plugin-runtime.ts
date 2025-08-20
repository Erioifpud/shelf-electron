import { p2p, type Bus, type Node } from "@eleplug/ebus";
import type { PluginManifest } from "@eleplug/esys";
import {
  type Plugin,
  type PluginActivationContext,
  createPluginUri,
  resolvePluginUri as staticResolvePluginUri,
} from "@eleplug/anvil";
import type { IPluginLoader } from "./plugin-loader.js";
import type { DevPlugin } from "./dev-plugin-types.js";
import * as path from "node:path";
import type { FilePluginLoader } from "./plugin-loader.js";
import type { DevConfig, ElepConfig } from "./config-types.js";

/**
 * Encapsulates the complete runtime state and lifecycle for a single activated plugin.
 * It manages the plugin's EBUS Node, its loaded module, and the logic for
 * invoking activation/deactivation, including dev mode hooks and configuration loading.
 */
export class PluginRuntime {
  private node: Node | null = null;
  private pluginModule: Plugin | null = null;
  private manifest!: PluginManifest;
  // Caching properties for loaded configurations to avoid redundant file I/O.
  private prodConfig: ElepConfig | null | undefined = undefined;
  private devConfig: DevConfig | null | undefined = undefined;

  public activeDevPlugin: DevPlugin | null = null;
  public readonly options: {
    bus: Bus;
    containerName: string;
    pluginPath: string;
    loader: IPluginLoader;
    devMode: boolean;
  };

  public get isActive(): boolean {
    return this.node !== null;
  }

  constructor(options: {
    bus: Bus;
    containerName: string;
    pluginPath: string;
    loader: IPluginLoader;
    devMode: boolean;
  }) {
    this.options = options;
  }

  /**
   * Lazily loads and caches the production configuration (`elep.prod.ts`) for this plugin.
   * @returns A Promise resolving to the loaded config, or null if it doesn't exist.
   */
  public async getProdConfig(): Promise<ElepConfig | null> {
    if (this.prodConfig === undefined) {
      this.prodConfig = await this.options.loader.loadProdConfig(
        this.options.pluginPath
      );
    }
    return this.prodConfig;
  }

  /**
   * Lazily loads and caches the development configuration (`elep.dev.ts`) for this plugin.
   * @returns A Promise resolving to the loaded config, or null if it doesn't exist.
   */
  public async getDevConfig(): Promise<DevConfig | null> {
    if (this.devConfig === undefined) {
      this.devConfig = await this.options.loader.loadDevConfig(
        this.options.pluginPath
      );
    }
    return this.devConfig;
  }

  /**
   * Activates the plugin. This process is idempotent.
   */
  public async activate(): Promise<void> {
    if (this.isActive) {
      console.warn(
        `[PluginRuntime] Plugin at '${this.options.pluginPath}' in container '${this.options.containerName}' is already active. Skipping.`
      );
      return;
    }

    // --- 1. Load Manifest and Configurations ---
    this.manifest = await this.options.loader.loadManifest(
      this.options.pluginPath
    );
    const prodConfig = await this.getProdConfig();
    const devConfig = this.options.devMode ? await this.getDevConfig() : null;

    // --- 2. Start Development Server (if in dev mode) ---
    if (this.options.devMode && devConfig?.dev) {
      this.activeDevPlugin = devConfig.dev;
      // This cast is safe because FilePluginLoader is the only one used by FileContainer.
      const loader = this.options.loader as FilePluginLoader;
      const pluginAbsolutePath = path.resolve(
        loader.rootPath,
        this.options.pluginPath
      );
      const pluginUri = createPluginUri(
        this.options.containerName,
        this.options.pluginPath
      );

      console.log(
        `[PluginRuntime] Starting dev plugin for '${this.manifest.name}'...`
      );
      await this.activeDevPlugin.start({ pluginUri, pluginAbsolutePath });
    }

    // --- 3. Load Plugin Module ---
    this.pluginModule = await this.options.loader.loadModule(
      this.options.pluginPath,
      this.manifest
    );

    // --- 4. Join EBUS Network ---
    const node = await this.options.bus.join({
      id: this.manifest.name,
      groups: this.manifest.pluginGroups || [],
    });
    this.node = node;

    // --- 5. Activate Plugin Module with Full Context ---
    const pluginUri = createPluginUri(
      this.options.containerName,
      this.options.pluginPath
    );
    const mergedRewrites: Record<string, string> = {
      ...prodConfig?.rewrites,
      ...devConfig?.rewrites,
    };

    const context: PluginActivationContext = {
      procedure: p2p,
      pluginUri,
      subscribe: node.subscribe.bind(node),
      emiter: node.emiter.bind(node),
      link: (pluginName: string) => node.connectTo(pluginName) as any,
      resolve: (relativePath: string): string => {
        let rewrittenPath = relativePath;
        const normalizedPath = `/${rewrittenPath.replace(/\\/g, "/")}`;

        for (const [from, to] of Object.entries(mergedRewrites)) {
          if (normalizedPath.startsWith(from)) {
            const newPath = to + normalizedPath.slice(from.length);
            rewrittenPath = newPath.startsWith("/")
              ? newPath.slice(1)
              : newPath;
            break;
          }
        }
        return staticResolvePluginUri(pluginUri, rewrittenPath);
      },
    };
    try {
      await node.setApi(this.pluginModule!.activate(context));
    } catch (error) {
      await this.deactivate(); // Ensure full cleanup on activation failure.
      throw error;
    }
  }

  /**
   * Deactivates the plugin. This process is idempotent.
   */
  public async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }
    try {
      await this.pluginModule?.deactivate?.();
      if (this.activeDevPlugin) {
        console.log(
          `[PluginRuntime] Stopping dev plugin for '${this.manifest.name}'...`
        );
        await this.activeDevPlugin.stop();
      }
    } catch (err: any) {
      console.error(
        `[PluginRuntime] Error during deactivation for '${this.options.pluginPath}':`,
        err.message
      );
    } finally {
      await this.node?.close();
      // Reset state completely.
      this.node = null;
      this.pluginModule = null;
      this.activeDevPlugin = null;
      this.prodConfig = undefined;
      this.devConfig = undefined;
    }
  }
}
