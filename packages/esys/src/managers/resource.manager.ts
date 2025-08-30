import type { Container, ResourceGetResponse } from "../types.js";
import { assertIsPluginResourceUri } from "../utils.js";
import type { Registry } from "../registry.js";

/**
 * The ResourceManager provides a unified facade for accessing resources from all
 * mounted containers. It acts as the central router for all `plugin://` resource
 * requests, validating them and dispatching them to the correct container.
 */
export class ResourceManager {
  private readonly getContainers: () => Map<string, Container>;
  private readonly registry: Registry;

  /**
   * @param getContainers A function returning the map of currently mounted containers.
   * @param registry A reference to the system's plugin registry for access validation.
   */
  constructor(getContainers: () => Map<string, Container>, registry: Registry) {
    this.getContainers = getContainers;
    this.registry = registry;
  }

  /**
   * Retrieves the appropriate container instance based on its name.
   * @param name The name of the container.
   * @returns The container instance.
   * @throws An `Error` if the container is not mounted.
   */
  #getContainer(name: string): Container {
    const container = this.getContainers().get(name);
    if (!container) {
      throw new Error(
        `[ResourceManager] Container with name '${name}' is not mounted or does not exist.`
      );
    }
    return container;
  }

  /**
   * Retrieves a resource's readable stream by its full URI.
   * It parses and validates the URI to determine the correct container and then delegates
   * the request.
   * @param uri The full URI of the resource (e.g., "plugin://.../path/to/asset.js").
   */
  public async get(uri: string): Promise<ResourceGetResponse> {
    // Centralized validation: ensures URI is for a resource and the plugin is registered.
    const { pluginUri, containerName } = assertIsPluginResourceUri(uri);
    if (!this.registry.findOne({ uri: pluginUri })) {
      throw new Error(
        `[ResourceManager] Cannot access resource: Plugin '${pluginUri}' is not registered.`
      );
    }

    const container = this.#getContainer(containerName);
    return container.resources.get(uri);
  }

  /**
   * Writes or overwrites a resource from a readable stream.
   * @param uri The full URI of the resource to write to.
   * @param stream A readable stream containing the new resource content.
   */
  public async put(uri: string, stream: ReadableStream): Promise<void> {
    const { pluginUri, containerName } = assertIsPluginResourceUri(uri);
    if (!this.registry.findOne({ uri: pluginUri })) {
      throw new Error(
        `[ResourceManager] Cannot write resource: Plugin '${pluginUri}' is not registered.`
      );
    }

    const container = this.#getContainer(containerName);
    await container.resources.put(uri, stream);
  }

  /**
   * Lists the contents of a directory-like resource within a plugin.
   * @param uri The full URI of the directory to list.
   */
  public async list(uri: string): Promise<string[]> {
    const { pluginUri, containerName } = assertIsPluginResourceUri(uri);
    if (!this.registry.findOne({ uri: pluginUri })) {
      throw new Error(
        `[ResourceManager] Cannot list contents: Plugin '${pluginUri}' is not registered.`
      );
    }

    const container = this.#getContainer(containerName);
    return container.resources.list(uri);
  }
}
