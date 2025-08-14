import type {
  Container,
  PluginManifest,
  ResourceGetResponse,
} from "./types.js";
import type { Plugin, PluginActivationContext } from "@eleplug/anvil";
import { type Bus, type Node } from "@eleplug/ebus";

// Represents the internal structure for a plugin stored in this container.
type StoredPlugin = {
  manifest: PluginManifest;
  plugin: Plugin<any>;
};

/**
 * An in-memory implementation of a Container.
 * It does not support persistence but allows for dynamic addition and removal of
 * plugin definitions, making it ideal for testing, prototyping, or managing
 * code-based plugins.
 */
export class MemoryContainer implements Container {
  private readonly storedPlugins = new Map<string, StoredPlugin>();
  private readonly activeNodes = new Map<string, Node>();

  constructor(private readonly bus: Bus) {}

  // --- Public Management API ---

  /**
   * Adds a new plugin definition to the container.
   * @param path The unique path for the plugin within this container.
   * @param pluginData An object containing the manifest and the plugin implementation.
   * @throws Throws an error if a plugin already exists at the specified path.
   */
  public addPlugin(path: string, pluginData: StoredPlugin): void {
    if (this.storedPlugins.has(path)) {
      throw new Error(
        `Cannot add plugin. Path '${path}' already exists in container.`
      );
    }
    this.storedPlugins.set(path, pluginData);
  }

  /**
   * Removes a plugin definition from the container.
   * @param path The path of the plugin to remove.
   * @throws Throws an error if the plugin is currently active.
   */
  public removePlugin(path: string): void {
    if (this.activeNodes.has(path)) {
      throw new Error(
        `Cannot remove plugin at path '${path}'. It is currently active.`
      );
    }
    this.storedPlugins.delete(path);
  }

  // --- Container Interface Implementation ---

  public plugins = {
    activate: async (containerName: string, path: string): Promise<void> => {
      const storedPlugin = this.storedPlugins.get(path);
      if (!storedPlugin) {
        throw new Error(`Plugin at path '${path}' not found in container.`);
      }

      const { manifest, plugin } = storedPlugin;
      if (this.activeNodes.has(path)) {
        return; // Already active
      }

      const node = await this.bus.join({
        id: manifest.name,
      });

      await node.setApi(async (t) => {
        const pluginUri = `plugin://${containerName}/${path}`;

        const context: PluginActivationContext = {
          router: t.router,
          procedure: t.procedure,
          pluginUri: pluginUri,
          subscribe: node.subscribe.bind(node),
          emiter: node.emiter.bind(node),
          link: (pluginName: string) => {
            return node.connectTo(pluginName) as any;
          },
        };
        return plugin.activate(context);
      });

      this.activeNodes.set(path, node);
    },

    deactivate: async (path: string): Promise<void> => {
      const node = this.activeNodes.get(path);
      if (node) {
        const storedPlugin = this.storedPlugins.get(path);
        await storedPlugin?.plugin.deactivate?.();
        await node.close();
        this.activeNodes.delete(path);
      }
    },

    manifest: async (path: string): Promise<PluginManifest> => {
      const storedPlugin = this.storedPlugins.get(path);
      if (!storedPlugin) {
        throw new Error(`Plugin at path '${path}' not found in container.`);
      }
      return storedPlugin.manifest;
    },
  };

  public resources = {
    get: async (path: string): Promise<ResourceGetResponse> => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    },
    put: async (path: string, stream: ReadableStream): Promise<void> => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    },
    list: async (path: string): Promise<string[]> => {
      throw new Error(
        `Resource management is not supported by MemoryContainer.`
      );
    },
  };

  public close = async (): Promise<void> => {
    const deactivationPromises = Array.from(this.activeNodes.keys()).map(
      (path) => this.plugins.deactivate(path)
    );
    await Promise.allSettled(deactivationPromises);
    this.storedPlugins.clear();
  };
}
