import * as esbuild from "esbuild";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import findCacheDir from "find-cache-dir";
import { LRUCache } from "lru-cache";
import type { ElepConfig, DevConfig } from "./config-types.js";

const CONFIG_NOT_FOUND = Symbol("CONFIG_NOT_FOUND");

/**
 * Manages the Just-In-Time (JIT) compilation and loading of plugin configuration files
 * (e.g., `elep.prod.ts`, `elep.dev.ts`).
 *
 * @design
 * This implementation is heavily inspired by Vite's config loading strategy to provide
 * a robust way to load TypeScript configuration files on the fly.
 *
 * **Workflow:**
 * 1.  **Cache Check**: First, checks an in-memory LRU cache for the config.
 * 2.  **File Resolution**: Scans the plugin's directory for supported config file names
 *     (e.g., `elep.prod.ts`, `elep.prod.js`).
 * 3.  **JIT Compilation with esbuild**:
 *     - Bundles the config file into a single ESM string.
 *     - **Crucially**, it uses `packages: 'external'` to keep `node_modules` out of
 *       the bundle. This is key for performance and correctness.
 *     - Injects file-scope variables like `__dirname` and `import.meta.url` to ensure
 *       compatibility with different module authoring styles.
 * 4.  **Write to Temp Cache File**: The bundled ESM code is written to a temporary
 *     `.mjs` file inside a local `node_modules/.elep/cache` directory. This location
 *     is vital because it allows Node.js's module resolver to correctly find the
 *     `external` packages.
 * 5.  **Dynamic Import**: The temporary file is loaded using a dynamic `import()`.
 * 6.  **Cleanup**: The temporary file is deleted in a `finally` block.
 *
 * @internal
 */
export class ConfigLoader {
  private readonly prodCache = new LRUCache<
    string,
    ElepConfig | typeof CONFIG_NOT_FOUND
  >({ max: 100 });
  private readonly devCache = new LRUCache<
    string,
    DevConfig | typeof CONFIG_NOT_FOUND
  >({ max: 100 });

  constructor(private readonly rootPath: string) {}

  public async loadProdConfig(pluginPath: string): Promise<ElepConfig | null> {
    return this._loadConfig<ElepConfig>(
      pluginPath,
      "elep.prod",
      this.prodCache
    );
  }

  public async loadDevConfig(pluginPath: string): Promise<DevConfig | null> {
    return this._loadConfig<DevConfig>(pluginPath, "elep.dev", this.devCache);
  }

  private async _loadConfig<TConfig extends object>(
    pluginPath: string,
    configBaseName: string,
    cache: LRUCache<string, TConfig | typeof CONFIG_NOT_FOUND>
  ): Promise<TConfig | null> {
    const pluginAbsolutePath = path.resolve(this.rootPath, pluginPath);
    const cached = cache.get(pluginAbsolutePath);
    if (cached !== undefined) {
      return cached === CONFIG_NOT_FOUND ? null : cached;
    }

    const configPath = await this.resolveConfigFile(
      pluginAbsolutePath,
      configBaseName
    );
    if (configPath === null) {
      cache.set(pluginAbsolutePath, CONFIG_NOT_FOUND);
      return null;
    }

    let tempFilePath: string | null = null;
    try {
      const uniqueId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const result = await esbuild.build({
        absWorkingDir: pluginAbsolutePath,
        entryPoints: [configPath],
        write: false,
        bundle: true,
        format: "esm",
        platform: "node",
        target: `node${process.versions.node}`,
        // Keep node_modules external to the bundle.
        packages: "external",
        // Define common CJS variables for compatibility.
        define: {
          __dirname: JSON.stringify(path.dirname(configPath)),
          __filename: JSON.stringify(configPath),
          "import.meta.url": JSON.stringify(pathToFileURL(configPath).href),
        },
      });

      const [outputFile] = result.outputFiles;
      if (!outputFile) {
        throw new Error("esbuild compilation did not produce an output file.");
      }

      const cacheDir = findCacheDir({
        name: "elep",
        cwd: pluginAbsolutePath,
        create: true,
      });
      if (!cacheDir) {
        throw new Error(
          `Could not find or create a cache directory for plugin at ${pluginAbsolutePath}.`
        );
      }

      tempFilePath = path.join(cacheDir, `config.${uniqueId}.mjs`);
      await fsp.writeFile(tempFilePath, outputFile.text);

      // Append a unique query string to bust the import cache.
      const module = await import(
        `${pathToFileURL(tempFilePath).href}?t=${uniqueId}`
      );
      const config = module.default as TConfig;

      if (!config) {
        throw new Error(
          `Config file at '${configPath}' must have a default export.`
        );
      }

      cache.set(pluginAbsolutePath, config);
      return config;
    } catch (error: any) {
      const cleanError = new Error(
        `Error loading ${path.basename(configPath)} for plugin '${pluginPath}': ${error.message}`
      );
      cleanError.stack = error.stack;
      throw cleanError;
    } finally {
      if (tempFilePath) {
        // Asynchronously unlink without waiting, as it's not critical.
        fsp.unlink(tempFilePath).catch(() => {});
      }
    }
  }

  private async resolveConfigFile(
    pluginAbsolutePath: string,
    baseName: string
  ): Promise<string | null> {
    for (const ext of ["ts", "js", "mjs"]) {
      const configPath = path.join(pluginAbsolutePath, `${baseName}.${ext}`);
      try {
        await fsp.access(configPath, fsp.constants.F_OK);
        return configPath;
      } catch {
        // Continue to the next extension.
      }
    }
    return null;
  }
}
