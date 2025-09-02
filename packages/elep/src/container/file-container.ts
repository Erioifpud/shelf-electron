import { type Bus } from "@eleplug/ebus";
import {
  type Container,
  type PluginManifest,
  type ResourceGetResponse,
} from "@eleplug/esys";
import { parseUri } from "@eleplug/esys";
import * as path from "node:path";
import micromatch from "micromatch";
import { FilePluginLoader, type IPluginLoader } from "./plugin-loader.js";
import { PluginRuntime } from "./plugin-runtime.js";
import { FileStorage, type IResourceStorage } from "./file-storage.js";
import { applyPrefixRewriteRules, applySpaFallback } from "./rewrite-utils.js";

export interface FileContainerOptions {
  bus: Bus;
  rootPath: string;
  devMode?: boolean;
}

/**
 * A container that loads plugins and resources from the local file system.
 *
 * It acts as the primary coordinator for its plugins, responsible for:
 * - Managing the lifecycle of each plugin's `PluginRuntime`.
 * - Actively rewriting paths for aliases (`rewrites`) and Single Page Application
 *   (SPA) routing fallbacks based on the flexible `spa` configuration.
 * - Delegating I/O operations to the appropriate backend (dev server or file storage).
 */
export class FileContainer implements Container {
  private readonly bus: Bus;
  private readonly rootPath: string;
  private readonly devMode: boolean;
  private readonly loader: IPluginLoader;
  private readonly storage: IResourceStorage;
  private readonly runtimes = new Map<string, PluginRuntime>();

  constructor(options: FileContainerOptions) {
    this.bus = options.bus;
    this.rootPath = options.rootPath;
    this.devMode = options.devMode ?? false;
    this.loader = new FilePluginLoader(this.rootPath);
    this.storage = new FileStorage(this.rootPath);
  }

  public readonly plugins = {
    // ... (no changes here, activate/deactivate/manifest are correct)
    activate: async (uri: string): Promise<void> => {
      const { containerName, pluginPathInContainer } = parseUri(uri);
      if (this.runtimes.has(pluginPathInContainer)) {
        return;
      }
      const runtime = new PluginRuntime({
        bus: this.bus,
        containerName,
        pluginPath: pluginPathInContainer,
        loader: this.loader,
        devMode: this.devMode,
      });
      this.runtimes.set(pluginPathInContainer, runtime);
      try {
        await runtime.activate();
      } catch (e) {
        this.runtimes.delete(pluginPathInContainer);
        throw e;
      }
    },
    deactivate: async (uri: string): Promise<void> => {
      const { pluginPathInContainer } = parseUri(uri);
      const runtime = this.runtimes.get(pluginPathInContainer);
      if (runtime) {
        await runtime.deactivate();
        this.runtimes.delete(pluginPathInContainer);
      }
    },
    manifest: (uri: string): Promise<PluginManifest> => {
      const { pluginPathInContainer } = parseUri(uri);
      return this.loader.loadManifest(pluginPathInContainer);
    },
  };

  public readonly resources = {
    /**
     * Retrieves a resource. This is the primary method for reading plugin assets.
     * Its path handling is the most complex, involving both aliasing and SPA fallbacks.
     * The process is: `subPath` -> `rewrites` -> `spa` -> `fetch`.
     */
    get: async (uri: string): Promise<ResourceGetResponse> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null) {
        throw new Error(
          `[FileContainer] Invalid resource URI: Must specify a resource path. URI: "${uri}"`
        );
      }

      const runtime = this.#findRuntime(pluginPathInContainer);
      const finalPath = await this.#resolveGetPath(runtime, subPath);

      try {
        return await this.#fetchResource(runtime, finalPath, subPath);
      } catch (error) {
        console.error(
          `[FileContainer] Failed to fetch final resource at path: '${finalPath}' (from original URI: '${uri}')`
        );
        throw error;
      }
    },

    /**
     * Writes or updates a resource.
     * Path handling for this method correctly applies path aliasing (`rewrites`) but
     * intentionally skips any SPA fallback logic, as `put` targets a specific resource.
     */
    put: async (uri: string, stream: ReadableStream): Promise<void> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null)
        throw new Error(
          "Resource URI must have a sub-path for 'put' operation."
        );

      const runtime = this.#findRuntime(pluginPathInContainer);
      const rewrittenSubPath = await this.#applyRewrites(runtime, subPath);

      if (this.devMode && runtime.activeDevPlugin?.put) {
        try {
          return await runtime.activeDevPlugin.put(rewrittenSubPath, stream);
        } catch (e) {
          console.debug(
            `[FileContainer] Dev server 'put' for '${rewrittenSubPath}' fell back to filesystem.`
          );
        }
      }

      const absolutePath = path.resolve(
        this.rootPath,
        pluginPathInContainer,
        rewrittenSubPath
      );
      return this.storage.put(absolutePath, stream);
    },

    /**
     * Lists the contents of a directory.
     * Path handling for this method correctly applies path aliasing (`rewrites`) but
     * intentionally skips any SPA fallback logic, as `list` targets a specific directory.
     */
    list: async (uri: string): Promise<string[]> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null)
        throw new Error(
          "Resource URI must have a sub-path for 'list' operation."
        );

      const runtime = this.#findRuntime(pluginPathInContainer);
      const rewrittenSubPath = await this.#applyRewrites(runtime, subPath);

      if (this.devMode && runtime.activeDevPlugin?.list) {
        try {
          return await runtime.activeDevPlugin.list(rewrittenSubPath);
        } catch (e) {
          console.debug(
            `[FileContainer] Dev server 'list' for '${rewrittenSubPath}' fell back to filesystem.`
          );
        }
      }

      const absolutePath = path.resolve(
        this.rootPath,
        pluginPathInContainer,
        rewrittenSubPath
      );
      return this.storage.list(absolutePath);
    },
  };

  public async close(): Promise<void> {
    const deactivationPromises = Array.from(this.runtimes.values()).map(
      (runtime) => runtime.deactivate()
    );
    await Promise.allSettled(deactivationPromises);
    this.runtimes.clear();
  }

  #findRuntime(pluginPathInContainer: string): PluginRuntime {
    const runtime = this.runtimes.get(pluginPathInContainer);
    if (!runtime) {
      throw new Error(
        `[FileContainer] Cannot access resource. Plugin at path '${pluginPathInContainer}' is not active.`
      );
    }
    return runtime;
  }

  /**
   * Encapsulates the full path resolution logic for a GET request.
   */
  async #resolveGetPath(
    runtime: PluginRuntime,
    subPath: string
  ): Promise<string> {
    let finalPath = await this.#applyRewrites(runtime, subPath);

    const prodConfig = await runtime.getProdConfig();
    const spaConfig = prodConfig?.spa;

    if (spaConfig) {
      finalPath = applySpaFallback(finalPath, spaConfig);
    }
    return finalPath;
  }

  async #fetchResource(
    runtime: PluginRuntime,
    finalPath: string,
    originalSubPath: string
  ): Promise<ResourceGetResponse> {
    if (this.devMode && runtime.activeDevPlugin?.get) {
      try {
        return await runtime.activeDevPlugin.get(finalPath);
      } catch (devError: any) {
        console.debug(
          `[FileContainer] Dev server hook for path '${finalPath}' fell back to filesystem. Error: ${devError.message}`
        );
      }
    }
    return this.#getStoredResource(runtime, finalPath, originalSubPath);
  }

  async #applyRewrites(
    runtime: PluginRuntime,
    resourcePathInPlugin: string
  ): Promise<string> {
    const prodConfig = await runtime.getProdConfig();
    const devConfig = this.devMode ? await runtime.getDevConfig() : null;

    const mergedRewrites = { ...prodConfig?.rewrites, ...devConfig?.rewrites };

    if (Object.keys(mergedRewrites).length === 0) {
      return resourcePathInPlugin;
    }
    return applyPrefixRewriteRules(resourcePathInPlugin, mergedRewrites);
  }

  async #getStoredResource(
    runtime: PluginRuntime,
    rewrittenPath: string,
    originalSubPath: string
  ): Promise<ResourceGetResponse> {
    const absolutePath = path.resolve(
      this.rootPath,
      runtime.options.pluginPath,
      rewrittenPath
    );
    const response = await this.storage.get(absolutePath);

    return this.#applyMimeOverrides(response, runtime, originalSubPath);
  }

  async #applyMimeOverrides(
    response: ResourceGetResponse,
    runtime: PluginRuntime,
    originalSubPath: string
  ): Promise<ResourceGetResponse> {
    const prodConfig = await runtime.getProdConfig();
    if (prodConfig?.mimes) {
      for (const [pattern, mimeType] of Object.entries(prodConfig.mimes)) {
        if (micromatch.isMatch(originalSubPath, pattern)) {
          if (typeof mimeType === "string") {
            response.mimeType = mimeType;
            break;
          }
        }
      }
    }
    return response;
  }
}
