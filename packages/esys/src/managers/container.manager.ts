import type { Bus } from "@eleplug/ebus";
import type { Container, ContainerFactory } from "../types.js";
import { ResourceManager } from "./resource.manager.js";

/**
 * The ContainerManager is responsible for the lifecycle of all Container instances,
 * including mounting, unmounting, and providing access. It acts as a central
 * registry for all plugin sources.
 */
export class ContainerManager {
  public readonly resources: ResourceManager;
  private readonly containers = new Map<string, Container>();

  /**
   * @param bus The central EBUS instance, which will be passed to container factories.
   */
  constructor(private readonly bus: Bus) {
    // The ResourceManager is instantiated here, depending on this manager's
    // internal `containers` map to route resource requests.
    this.resources = new ResourceManager(() => this.containers);
  }

  /**
   * Mounts a new container, making it available to the system.
   * @param name The unique name for the container.
   * @param factory A factory function that creates the container instance.
   * @throws Throws an error if a container with the same name is already mounted.
   */
  public async mount(name: string, factory: ContainerFactory): Promise<void> {
    if (this.containers.has(name)) {
      throw new Error(`Container with name '${name}' is already mounted.`);
    }
    const container = await factory(this.bus);
    this.containers.set(name, container);
  }

  /**
   * Unmounts a container from the system, calling its `close` method to release resources.
   * @param name The name of the container to unmount.
   */
  public async unmount(name: string): Promise<void> {
    const container = this.containers.get(name);
    if (!container) {
      console.warn(`Attempted to unmount non-existent container: '${name}'.`);
      return;
    }

    try {
      await container.close();
    } finally {
      this.containers.delete(name);
    }
  }

  /**
   * Retrieves a mounted container instance by its name.
   * @param name The name of the container.
   * @returns The `Container` instance, or `undefined` if not found.
   */
  public get(name: string): Container | undefined {
    return this.containers.get(name);
  }

  /**
   * Gracefully closes all mounted containers.
   * This is typically called during system shutdown.
   */
  public async closeAll(): Promise<void> {
    const closePromises = Array.from(this.containers.values()).map((c) =>
      c.close()
    );
    await Promise.allSettled(closePromises);
    this.containers.clear();
  }
}
