import { Registry } from "./registry.js";

/**
 * The RegistryLoader provides a Registry instance to the Bootloader during the
 * BOOTSTRAP lifecycle phase. It acts as a placeholder, allowing the user to
 * load or create a Registry asynchronously and provide it to the system at the
 * appropriate time.
 * @internal
 */
export class RegistryLoader {
  private _registry: Registry | null = null;

  /**
   * Loads a Registry instance.
   * This method must be called once during the BOOTSTRAP event callback.
   * @param registry The Registry instance to be used by the system.
   * @throws An error if a registry has already been loaded.
   */
  public load(registry: Registry): void {
    if (this._registry) {
      throw new Error("Registry has already been loaded.");
    }
    this._registry = registry;
  }

  /**
   * Retrieves the loaded Registry instance.
   * This is called internally by the Bootloader after the BOOTSTRAP phase.
   * @returns A Promise that resolves with the loaded Registry instance.
   * @throws An error if `load()` was not called.
   */
  public async getRegistry(): Promise<Registry> {
    if (!this._registry) {
      throw new Error(
        "Registry has not been loaded. Please call the 'load(registry)' method on the RegistryLoader instance during the BOOTSTRAP lifecycle event."
      );
    }
    return Promise.resolve(this._registry);
  }
}
