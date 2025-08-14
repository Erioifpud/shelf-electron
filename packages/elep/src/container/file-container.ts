import { type ApiFactory, type Bus, type Node } from "@eleplug/ebus";
import type {
  Container,
  PluginManifest,
  ResourceGetResponse,
} from "@eleplug/esys";
import type { Plugin, PluginActivationContext } from "@eleplug/anvil";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as mime from "mime-types";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { LRUCache } from "lru-cache";

/**
 * A container that loads plugins from the local file system. Each subdirectory
 * in the root path containing a `package.json` is treated as a plugin.
 */
export class FileContainer implements Container {
  private readonly rootPath: string;
  private readonly bus: Bus;
  private readonly activeNodes = new Map<string, Node>();
  private readonly mimeCache = new LRUCache<string, Record<string, string>>({
    max: 500,
    ttl: 1000 * 60 * 5,
  });

  /**
   * @param bus A reference to the system's EBUS instance.
   * @param rootPath The absolute path to the directory where plugins are stored.
   */
  constructor(bus: Bus, rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.bus = bus;

    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, { recursive: true });
    }
  }

  // --- `esys` Container Interface Implementation ---

  public plugins = {
    /**
     * Activates a plugin from the file system.
     * @param pluginPath The relative path of the plugin directory.
     */
    activate: async (
      containerName: string,
      pluginPath: string
    ): Promise<void> => {
      const manifest = await this.plugins.manifest(pluginPath);

      if (this.activeNodes.has(pluginPath)) {
        return; // Already active
      }

      const mainScriptPath = this.secureJoin(
        this.rootPath,
        pluginPath,
        manifest.main
      );
      const mainScriptUrl = pathToFileURL(mainScriptPath).href;

      // Use modern, async ESM import() instead of require()
      const pluginModule = await import(mainScriptUrl);
      const plugin: Plugin = pluginModule.default;
      if (typeof plugin?.activate !== "function") {
        throw new Error(
          `Plugin at '${pluginPath}' does not have a valid default export with an 'activate' function.`
        );
      }

      const node = await this.bus.join({ id: manifest.name });

      const apiFactory: ApiFactory<any> = async (t) => {
        const context: PluginActivationContext = {
          router: t.router,
          procedure: t.procedure,
          pluginUri: `plugin://${containerName}/${pluginPath}`,
          subscribe: node.subscribe.bind(node),
          emiter: node.emiter.bind(node),
          link: (pluginName: string) => {
            return node.connectTo(pluginName) as any;
          },
        };
        return plugin.activate(context);
      };

      await node.setApi(apiFactory);
      this.activeNodes.set(pluginPath, node);
    },

    /**
     * Deactivates a running plugin.
     * @param pluginPath The relative path of the plugin directory.
     */
    deactivate: async (pluginPath: string): Promise<void> => {
      const node = this.activeNodes.get(pluginPath);
      if (node) {
        try {
          const manifest = await this.plugins.manifest(pluginPath);
          const mainScriptPath = this.secureJoin(
            this.rootPath,
            pluginPath,
            manifest.main
          );
          const mainScriptUrl = pathToFileURL(mainScriptPath).href;

          // Re-importing might not be necessary if deactivate is stateless,
          // but this ensures we have the plugin logic.
          const pluginModule = await import(`${mainScriptUrl}?v=${Date.now()}`); // Bust cache
          const plugin: Plugin = pluginModule.default;

          await plugin.deactivate?.();
        } catch (err: any) {
          console.error(
            `[FileContainer] Error during plugin-specific deactivation for '${pluginPath}':`,
            err.message
          );
        } finally {
          await node.close();
          this.activeNodes.delete(pluginPath);
        }
      }
    },

    /**
     * Reads and parses the package.json to construct a PluginManifest.
     * @param pluginPath The relative path of the plugin directory.
     * @returns A promise that resolves to the plugin's manifest.
     */
    manifest: async (pluginPath: string): Promise<PluginManifest> => {
      const packageJsonPath = this.secureJoin(
        this.rootPath,
        pluginPath,
        "package.json"
      );
      try {
        const content = await fsp.readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);

        if (!pkg.name || !pkg.version || !pkg.main) {
          throw new Error(
            `'name', 'version', and 'main' fields are required in package.json.`
          );
        }

        return {
          name: pkg.name,
          version: pkg.version,
          main: pkg.main,
          pluginDependencies: pkg.pluginDependencies || {},
        };
      } catch (error: any) {
        if (error.code === "ENOENT") {
          throw new Error(
            `Plugin not found at path '${pluginPath}'. The package.json file is missing.`
          );
        }
        throw new Error(
          `Failed to read or parse package.json for plugin at '${pluginPath}': ${error.message}`
        );
      }
    },
  };

  public resources = {
    get: async (resourcePath: string): Promise<ResourceGetResponse> => {
      const absolutePath = this.secureJoin(this.rootPath, resourcePath);
      try {
        const stats = await fsp.stat(absolutePath);
        if (stats.isDirectory()) {
          throw new Error("Path is a directory, not a file.");
        }

        const mimeType = await this.getMimeType(absolutePath);
        const nodeStream = fs.createReadStream(absolutePath);
        const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

        return { body, mimeType };
      } catch (error: any) {
        if (error.code === "ENOENT") {
          throw new Error(`Resource not found: ${resourcePath}`);
        }
        throw new Error(
          `Failed to get resource '${resourcePath}': ${error.message}`
        );
      }
    },

    put: async (
      resourcePath: string,
      stream: ReadableStream
    ): Promise<void> => {
      const absolutePath = this.secureJoin(this.rootPath, resourcePath);
      try {
        await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
        const nodeWritable = fs.createWriteStream(absolutePath);
        const webWritableStream = Writable.toWeb(nodeWritable);

        await stream.pipeTo(webWritableStream);
      } catch (error: any) {
        throw new Error(
          `Failed to write resource to '${resourcePath}': ${error.message}`
        );
      }
    },

    list: async (dirPath: string): Promise<string[]> => {
      const absolutePath = this.secureJoin(this.rootPath, dirPath);
      try {
        const stats = await fsp.stat(absolutePath);
        if (!stats.isDirectory()) {
          throw new Error("Path is not a directory.");
        }
        return fsp.readdir(absolutePath);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          throw new Error(`Directory not found: ${dirPath}`);
        }
        throw new Error(
          `Failed to list directory '${dirPath}': ${error.message}`
        );
      }
    },
  };

  public async close(): Promise<void> {
    const deactivationPromises = Array.from(this.activeNodes.keys()).map(
      (pluginPath) => this.plugins.deactivate(pluginPath)
    );
    await Promise.allSettled(deactivationPromises);
  }

  private secureJoin(...segments: string[]): string {
    const resolvedPath = path.resolve(...segments);
    const relative = path.relative(this.rootPath, resolvedPath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Path traversal detected. Attempted to access a path outside of the container root: ${resolvedPath}`
      );
    }

    return resolvedPath;
  }

  private async getMimeType(absolutePath: string): Promise<string | undefined> {
    const dir = path.dirname(absolutePath);
    const filename = path.basename(absolutePath);

    let mimeMap = this.mimeCache.get(dir);
    if (!mimeMap) {
      const mimeJsonPath = path.join(dir, "mime.json");
      try {
        const content = await fsp.readFile(mimeJsonPath, "utf-8");
        mimeMap = JSON.parse(content);
        this.mimeCache.set(dir, mimeMap!);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          mimeMap = {};
          this.mimeCache.set(dir, mimeMap);
        } else {
          console.warn(
            `[FileContainer] Could not read or parse mime.json in ${dir}:`,
            err.message
          );
          mimeMap = {};
        }
      }
    }

    if (mimeMap?.[filename]) {
      return mimeMap[filename];
    }

    const fallbackMime = mime.lookup(filename);
    return fallbackMime || undefined;
  }
}
