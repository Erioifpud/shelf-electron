/**
 * @fileoverview
 * Implements the FileContainer, a core component of Elep that loads plugins
 * and their resources from the local file system.
 */

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
import { applyRewriteRules } from "./rewrite-utils.js";

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
 * - Routing resource requests based on the system's operating mode (dev vs. prod).
 * - Applying powerful, glob-based path rewrites to decouple source code from build artifacts.
 * - Delegating I/O operations to a secure storage backend.
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
    activate: async (uri: string): Promise<void> => {
      const { containerName, pluginPathInContainer } = parseUri(uri);
      if (this.runtimes.has(pluginPathInContainer)) {
        return;
      }
      const runtime = new PluginRuntime({
        bus: this.bus,
        containerName: containerName,
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
     * Retrieves a resource, implementing the core routing logic.
     * The logic flow is now simplified and guaranteed to be correct:
     * 1. The requested path is IMMEDIATELY rewritten.
     * 2. All subsequent operations use this REWRITTEN path.
     */
    get: async (uri: string): Promise<ResourceGetResponse> => {
      const { pluginPathInContainer, subPath: originalSubPath } = parseUri(uri);
      if (originalSubPath === null) {
        throw new Error(
          `[FileContainer] Invalid resource URI: Must specify a resource path. URI: "${uri}"`
        );
      }

      const runtime = this.#findRuntime(pluginPathInContainer);

      // --- Perform the rewrite ONCE at the very top. ---
      const rewrittenSubPath = await this.#applyRewrites(
        runtime,
        originalSubPath
      );

      if (this.devMode && runtime.activeDevPlugin?.get) {
        try {
          // Pass the ALREADY REWRITTEN path to the dev server adapter.
          return await runtime.activeDevPlugin.get(rewrittenSubPath);
        } catch (devError: any) {
          console.debug(
            `[FileContainer] Dev server hook for '${rewrittenSubPath}' (from '${originalSubPath}') fell back to filesystem. Error: ${devError.message}`
          );
        }
      }

      // Fallback to stored resource using the REWRITTEN path.
      const absolutePath = path.resolve(
        this.rootPath,
        runtime.options.pluginPath,
        rewrittenSubPath
      );
      const response = await this.storage.get(absolutePath);

      // Apply MIME overrides based on the ORIGINAL path, as this is what developers configure.
      return this.#applyMimeOverrides(response, runtime, originalSubPath);
    },

    put: async (uri: string, stream: ReadableStream): Promise<void> => {
      const { pluginPathInContainer, subPath: originalSubPath } = parseUri(uri);
      if (originalSubPath === null)
        throw new Error(
          "Resource URI must have a sub-path for 'put' operation."
        );

      const runtime = this.#findRuntime(pluginPathInContainer);
      const rewrittenSubPath = await this.#applyRewrites(
        runtime,
        originalSubPath
      );

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

    list: async (uri: string): Promise<string[]> => {
      const { pluginPathInContainer, subPath: originalSubPath } = parseUri(uri);
      if (originalSubPath === null)
        throw new Error(
          "Resource URI must have a sub-path for 'list' operation."
        );

      const runtime = this.#findRuntime(pluginPathInContainer);
      const rewrittenSubPath = await this.#applyRewrites(
        runtime,
        originalSubPath
      );

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

  // --- Private Helper Methods ---

  #findRuntime(pluginPathInContainer: string): PluginRuntime {
    const runtime = this.runtimes.get(pluginPathInContainer);
    if (!runtime) {
      throw new Error(
        `[FileContainer] Cannot access resource. Plugin at path '${pluginPathInContainer}' is not active.`
      );
    }
    return runtime;
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

    return applyRewriteRules(resourcePathInPlugin, mergedRewrites);
  }

  async #applyMimeOverrides(
    response: ResourceGetResponse,
    runtime: PluginRuntime,
    originalResourcePath: string
  ): Promise<ResourceGetResponse> {
    const prodConfig = await runtime.getProdConfig();
    if (prodConfig?.mimes) {
      for (const [pattern, mimeType] of Object.entries(prodConfig.mimes)) {
        if (micromatch.isMatch(originalResourcePath, pattern)) {
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
