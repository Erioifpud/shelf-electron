import type {
  Container,
  PluginManifest,
  ResourceGetResponse,
} from "./types.js";
import {
  type Plugin,
  type PluginActivationContext,
  resolvePluginUri,
} from "@eleplug/anvil";
import { p2p, type Bus, type Node } from "@eleplug/ebus";
import { parseUri } from "./utils.js";

/**
 * Represents the internal structure for a plugin stored in this container.
 * @internal
 */
type StoredPlugin = {
  manifest: PluginManifest;
  plugin: Plugin<any>;
};

/**
 * An in-memory implementation of a Container.
 * It does not support persistence but allows for dynamic addition and removal of
 * plugin definitions, making it ideal for testing, prototyping, or managing
 * code-based core plugins. It operates on full canonical URIs.
 */
export class MemoryContainer implements Container {
  /**
   * Stores plugin definitions, keyed by their path within the container.
   * This is an internal implementation detail.
   */
  private readonly storedPlugins = new Map<string, StoredPlugin>();

  /**
   * Stores active EBUS nodes for running plugins, keyed by their path
   * within the container.
   */
  private readonly activeNodes = new Map<string, Node>();

  /**
   * @param name The unique name for this container instance.
   * @param bus The central EBUS instance.
   */
  constructor(
    private readonly name: string,
    private readonly bus: Bus
  ) {}

  // --- Public Management API (for testing and setup) ---

  /**
   * Adds a new plugin definition to the container. This method is typically
   * used for setting up the container's state before the system starts.
   *
   * @param path The unique path for the plugin within this container (e.g., "my-plugin").
   * @param pluginData An object containing the manifest and the plugin implementation.
   */
  public addPlugin(path: string, pluginData: StoredPlugin): void {
    if (this.storedPlugins.has(path)) {
      throw new Error(
        `Cannot add plugin. Path '${path}' already exists in MemoryContainer.`
      );
    }
    this.storedPlugins.set(path, pluginData);
  }

  /**
   * Removes a plugin definition from the container.
   * @param path The path of the plugin to remove.
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

  public readonly plugins = {
    /**
     * Activates a plugin by parsing its URI to find its internal definition,
     * then creating its EBUS node and calling its activate hook.
     */
    activate: async (uri: string): Promise<void> => {
      // The received URI is the canonical root URI for the plugin.
      const { pluginPathInContainer } = parseUri(uri);
      const storedPlugin = this.storedPlugins.get(pluginPathInContainer);

      if (!storedPlugin) {
        throw new Error(
          `Plugin at path '${pluginPathInContainer}' not found in MemoryContainer.`
        );
      }
      if (this.activeNodes.has(pluginPathInContainer)) {
        console.warn(
          `Plugin at path '${pluginPathInContainer}' is already active. Skipping activation.`
        );
        return;
      }

      const { manifest, plugin } = storedPlugin;
      const node = await this.bus.join({
        id: manifest.name,
        groups: manifest.pluginGroups,
      });

      const context: PluginActivationContext = {
        procedure: p2p,
        pluginUri: uri,
        subscribe: node.subscribe.bind(node),
        emiter: node.emiter.bind(node),
        link: (pluginName: string) => node.connectTo(pluginName) as any,
        /**
         * For MemoryContainer, the resolver is a direct pass-through to the
         * static URI resolver, as it does not support path rewrites.
         */
        resolve: (relativePath: string) =>
          resolvePluginUri(uri, relativePath),
      };
      try {
        await node.setApi(plugin.activate(context));

        this.activeNodes.set(pluginPathInContainer, node);
      } catch (error) {
        await node.close();
        throw error;
      }
    },

    deactivate: async (uri: string): Promise<void> => {
      const { pluginPathInContainer } = parseUri(uri);
      const node = this.activeNodes.get(pluginPathInContainer);
      if (node) {
        const storedPlugin = this.storedPlugins.get(pluginPathInContainer);
        await storedPlugin?.plugin.deactivate?.();
        await node.close();
        this.activeNodes.delete(pluginPathInContainer);
      }
    },

    manifest: async (uri: string): Promise<PluginManifest> => {
      const { pluginPathInContainer } = parseUri(uri);
      const storedPlugin = this.storedPlugins.get(pluginPathInContainer);
      if (!storedPlugin) {
        throw new Error(
          `Plugin at path '${pluginPathInContainer}' not found in MemoryContainer.`
        );
      }
      return storedPlugin.manifest;
    },
  };

  public readonly resources = {
    get: async (uri: string): Promise<ResourceGetResponse> => {
      throw new Error(
        "Resource management is not supported by MemoryContainer."
      );
    },
    put: async (uri: string, stream: ReadableStream): Promise<void> => {
      throw new Error(
        "Resource management is not supported by MemoryContainer."
      );
    },
    list: async (uri: string): Promise<string[]> => {
      throw new Error(
        "Resource management is not supported by MemoryContainer."
      );
    },
  };

  public close = async (): Promise<void> => {
    // To call deactivate, we must reconstruct the canonical URI for each active plugin.
    const deactivationPromises = Array.from(this.activeNodes.keys()).map(
      (path) =>
        this.plugins.deactivate(
          `plugin://${this.name}.${path.replace(/[\\/]/g, ".")}`
        )
    );
    await Promise.allSettled(deactivationPromises);
    this.storedPlugins.clear();
    this.activeNodes.clear();
  };
}
