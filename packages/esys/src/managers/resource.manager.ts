import type { Container, ResourceGetResponse } from "../types.js";
import { parseUri } from "../utils.js";

/**
 * The ResourceManager provides a unified facade for accessing resources from all
 * mounted containers. It does not store resources itself but instead routes
 * requests to the appropriate container based on the resource URI.
 */
export class ResourceManager {
  // A function that dynamically provides the current map of mounted containers.
  // This pattern avoids circular dependency issues with ContainerManager.
  private readonly getContainers: () => Map<string, Container>;

  /**
   * @param getContainers A function that returns the map of currently mounted containers.
   */
  constructor(getContainers: () => Map<string, Container>) {
    this.getContainers = getContainers;
  }

  /**
   * Retrieves the appropriate container based on its name.
   * @param name The name of the container.
   * @returns The container instance.
   * @throws An `Error` if the container is not mounted.
   */
  #getContainer(name: string): Container {
    const container = this.getContainers().get(name);
    if (!container) {
      throw new Error(
        `Container with name '${name}' is not mounted or does not exist.`
      );
    }
    return container;
  }

  /**
   * Retrieves a resource's readable stream by its full URI.
   * @param uri The full URI of the resource, e.g., "plugin://my-container/path/to/resource.txt".
   * @returns A Promise that resolves to the resource's response object.
   */
  public async get(uri: string): Promise<ResourceGetResponse> {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    return container.resources.get(path);
  }

  /**
   * Writes or overwrites a resource from a readable stream.
   * @param uri The full URI of the resource to write to.
   * @param stream A readable stream containing the new resource content.
   */
  public async put(uri: string, stream: ReadableStream): Promise<void> {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    await container.resources.put(path, stream);
  }

  /**
   * Lists the contents of a directory-like resource.
   * @param uri The full URI of the directory to list.
   * @returns A Promise that resolves to an array of resource names.
   */
  public async list(uri: string): Promise<string[]> {
    const { containerName, path } = parseUri(uri);
    const container = this.#getContainer(containerName);
    return container.resources.list(path);
  }
}
