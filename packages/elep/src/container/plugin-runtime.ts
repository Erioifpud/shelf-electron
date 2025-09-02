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
import { applyRewriteRules, mergeRewriteRules } from "./rewrite-utils.js";

/**
 * Encapsulates the complete runtime state and lifecycle for a single activated plugin.
 * It manages the plugin's EBUS Node, its loaded module, and the logic for
 * invoking activation/deactivation, including dev mode hooks and configuration loading.
 */
export class PluginRuntime {
  private node: Node | null = null;
  private pluginModule: Plugin | null = null;
  private manifest!: PluginManifest;
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

  public async getProdConfig(): Promise<ElepConfig | null> {
    if (this.prodConfig === undefined) {
      this.prodConfig = await this.options.loader.loadProdConfig(
        this.options.pluginPath
      );
    }
    return this.prodConfig;
  }

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

    const finalRewrites = mergeRewriteRules(
      devConfig?.rewrites,
      prodConfig?.rewrites
    );

    const context: PluginActivationContext = {
      procedure: p2p,
      pluginUri,
      subscribe: node.subscribe.bind(node),
      emiter: node.emiter.bind(node),
      link: (pluginName: string) => node.connectTo(pluginName) as any,
      // The `resolve` method now uses the powerful `applyRewriteRules` utility.
      resolve: (relativePath: string): string => {
        // Apply the merged rewrite rules to the path provided by the plugin.
        const rewrittenPath = applyRewriteRules(relativePath, finalRewrites);
        // Resolve the potentially modified path against the plugin's base URI.
        return staticResolvePluginUri(pluginUri, rewrittenPath);
      },
    };
    try {
      await node.setApi(this.pluginModule!.activate(context));
    } catch (error) {
      await this.deactivate();
      throw error;
    }
  }

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
      this.node = null;
      this.pluginModule = null;
      this.activeDevPlugin = null;
      this.prodConfig = undefined;
      this.devConfig = undefined;
    }
  }
}
