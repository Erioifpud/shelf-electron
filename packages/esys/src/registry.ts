import Loki from "lokijs";
import type { PluginRegistryEntry } from "./types.js";

/**
 * The Registry is the database for plugin metadata and serves as the "single source of truth"
 * for the system's desired state. It supports both in-memory and file-based persistent storage.
 */
export class Registry {
  private db: Loki;
  private plugins!: Collection<PluginRegistryEntry>;

  // The constructor is private to enforce instance creation via static factory methods.
  private constructor(db: Loki) {
    this.db = db;
  }

  /**
   * Initializes the 'plugins' collection within the LokiJS database.
   * Sets up unique constraints and indices for efficient querying.
   */
  private initPlugins(): void {
    this.plugins =
      this.db.getCollection<PluginRegistryEntry>("plugins") ||
      this.db.addCollection("plugins", {
        unique: ["uri"], // The URI is the primary key for each plugin instance.
        indices: ["name", "state"], // Index common query fields for performance.
      });
  }

  /**
   * Creates an in-memory-only Registry.
   * Data is not persisted and will be lost when the process exits.
   * Ideal for testing or temporary sessions.
   * @returns A Promise that resolves with a new Registry instance.
   */
  public static async createMemory(): Promise<Registry> {
    const db = new Loki("esys-registry.db", { persistenceMethod: "memory" });
    const registry = new Registry(db);
    registry.initPlugins();
    return registry;
  }

  /**
   * Creates a Registry that persists data to a file.
   * Enables autoload and autosave for data integrity.
   * @param filePath The path to the database file.
   * @returns A Promise that resolves with the loaded Registry instance.
   */
  public static async createPersistent(filePath: string): Promise<Registry> {
    return new Promise((resolve, reject) => {
      const db = new Loki(filePath, {
        adapter: new Loki.LokiFsAdapter(),
        autoload: true,
        autosave: true,
        autosaveInterval: 4000,
        autoloadCallback: (err) => {
          if (err) return reject(err);

          const registry = new Registry(db);
          registry.initPlugins();
          resolve(registry);
        },
      });
    });
  }

  /**
   * Finds multiple plugin entries matching a LokiJS query.
   * @param query A LokiJS query object.
   * @returns An array of matching plugin registry entries.
   */
  public find(
    query: LokiQuery<PluginRegistryEntry & LokiObj>
  ): PluginRegistryEntry[] {
    return this.plugins.find(query);
  }

  /**
   * Finds a single plugin entry matching a LokiJS query.
   * @param query A LokiJS query object.
   * @returns The first matching entry, or `null` if not found.
   */
  public findOne(
    query: LokiQuery<PluginRegistryEntry & LokiObj>
  ): PluginRegistryEntry | null {
    return this.plugins.findOne(query);
  }

  /**
   * Updates a plugin's desired state ('enable' or 'disable').
   * @param uri The unique URI of the plugin.
   * @param state The new desired state.
   */
  public updateState(uri: string, state: "enable" | "disable"): void {
    const entry = this.plugins.findOne({ uri });
    if (entry) {
      entry.state = state;
      this.plugins.update(entry);
    }
  }

  /**
   * Updates a plugin's actual runtime status ('running', 'stopped', or 'error').
   * @param uri The unique URI of the plugin.
   * @param status The new runtime status.
   * @param error An optional error message if the status is 'error'.
   */
  public updateStatus(
    uri: string,
    status: "running" | "stopped" | "error",
    error?: string
  ): void {
    const entry = this.plugins.findOne({ uri });
    if (entry) {
      entry.status = status;
      entry.error = error;
      this.plugins.update(entry);
    }
  }

  /**
   * Registers a new plugin or updates an existing one (upsert).
   * If an entry with the same URI exists, its metadata is updated, but its state is preserved.
   * If it's a new entry, it's inserted with a default state of 'disable' and 'stopped'.
   * @param entry The plugin data to register.
   */
  public register(
    entry: Omit<PluginRegistryEntry, "state" | "status" | "error">
  ): void {
    const existing = this.plugins.findOne({ uri: entry.uri });
    if (existing) {
      // Update metadata but preserve existing state.
      existing.name = entry.name;
      existing.version = entry.version;
      existing.pluginDependencies = entry.pluginDependencies;
      existing.main = entry.main;
      this.plugins.update(existing);
    } else {
      // Insert new entry with default states.
      this.plugins.insert({ ...entry, state: "disable", status: "stopped" });
    }
  }

  /**
   * Permanently removes a plugin entry from the registry.
   * @param uri The unique URI of the plugin to remove.
   */
  public unregister(uri: string): void {
    this.plugins.findAndRemove({ uri });
  }

  /**
   * Manually triggers a save of the database to its persistent storage.
   * This is useful before a planned shutdown.
   */
  public async save(): Promise<void> {
    // No-op for in-memory databases.
    if (this.db.persistenceMethod === "memory" || !this.db.persistenceAdapter)
      return;

    return new Promise((resolve, reject) => {
      this.db.saveDatabase((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
