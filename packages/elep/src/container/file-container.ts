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
     * Retrieves a resource, implementing the core routing logic:
     * 1. In dev mode, attempts to serve from the dev plugin (e.g., Vite), applying path rewrites.
     * 2. On failure or in production, falls back to the physical file storage.
     * 3. Applies any production MIME type overrides before returning.
     */
    get: async (uri: string): Promise<ResourceGetResponse> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null) {
        throw new Error(
          `[FileContainer] Invalid resource URI: Must specify a resource path. URI: "${uri}"`
        );
      }

      const runtime = this.#findRuntime(pluginPathInContainer);

      if (this.devMode && runtime.activeDevPlugin?.get) {
        try {
          return await this.#tryDevServerResource(runtime, subPath);
        } catch (devError: any) {
          console.debug(
            `[FileContainer] Dev server hook for '${uri}' fell back to filesystem. Error: ${devError.message}`
          );
        }
      }

      return this.#getStoredResource(runtime, subPath);
    },

    put: async (uri: string, stream: ReadableStream): Promise<void> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null)
        throw new Error("Resource URI must have a sub-path.");
      const runtime = this.#findRuntime(pluginPathInContainer);
      const absolutePath = path.resolve(
        this.rootPath,
        pluginPathInContainer,
        subPath
      );

      if (this.devMode && runtime.activeDevPlugin?.put) {
        const pathForDevServer = await this.#applyRewrites(runtime, subPath);
        try {
          return await runtime.activeDevPlugin.put(pathForDevServer, stream);
        } catch (e) {
          /* Fallback to storage */
        }
      }
      return this.storage.put(absolutePath, stream);
    },

    list: async (uri: string): Promise<string[]> => {
      const { pluginPathInContainer, subPath } = parseUri(uri);
      if (subPath === null)
        throw new Error("Resource URI must have a sub-path.");
      const runtime = this.#findRuntime(pluginPathInContainer);
      const absolutePath = path.resolve(
        this.rootPath,
        pluginPathInContainer,
        subPath
      );

      if (this.devMode && runtime.activeDevPlugin?.list) {
        const pathForDevServer = await this.#applyRewrites(runtime, subPath);
        try {
          return await runtime.activeDevPlugin.list(pathForDevServer);
        } catch (e) {
          /* Fallback to storage */
        }
      }
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

    let rewrittenPath = resourcePathInPlugin;
    const normalizedPath = `/${rewrittenPath.replace(/\\/g, "/")}`;

    for (const [from, to] of Object.entries(mergedRewrites)) {
      if (normalizedPath.startsWith(from)) {
        const newPath = to + normalizedPath.slice(from.length);
        rewrittenPath = newPath.startsWith("/") ? newPath.slice(1) : newPath;
        break;
      }
    }
    return rewrittenPath;
  }

  async #tryDevServerResource(
    runtime: PluginRuntime,
    resourcePathInPlugin: string
  ): Promise<ResourceGetResponse> {
    const pathForDevServer = await this.#applyRewrites(
      runtime,
      resourcePathInPlugin
    );
    return runtime.activeDevPlugin!.get!(pathForDevServer);
  }

  async #getStoredResource(
    runtime: PluginRuntime,
    resourcePathInPlugin: string
  ): Promise<ResourceGetResponse> {
    const absolutePath = path.resolve(
      this.rootPath,
      runtime.options.pluginPath,
      resourcePathInPlugin
    );
    const response = await this.storage.get(absolutePath);
    return this.#applyMimeOverrides(response, runtime, resourcePathInPlugin);
  }

  async #applyMimeOverrides(
    response: ResourceGetResponse,
    runtime: PluginRuntime,
    resourcePathInPlugin: string
  ): Promise<ResourceGetResponse> {
    const prodConfig = await runtime.getProdConfig();
    if (prodConfig?.mimes) {
      for (const [pattern, mimeType] of Object.entries(prodConfig.mimes)) {
        if (micromatch.isMatch(resourcePathInPlugin, pattern)) {
          // CORRECTED: Ensure mimeType is a string before assignment.
          if (typeof mimeType === "string") {
            response.mimeType = mimeType;
            break; // First match wins.
          }
        }
      }
    }
    return response;
  }
}
