/**
 * @fileoverview
 * Implements the logic for discovering all valid plugins within the `elep_plugins/`
 * staging directory. It gracefully handles cases where the directory does not exist,
 * which is a valid scenario for plugins without dependencies.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { DiscoveredPlugin, PluginManifest } from './types.js';

/**
 * Scans the `elep_plugins` directory to identify all staged plugins.
 * This class serves as a crucial data source for both the `dev` and `dts` commands,
 * providing a snapshot of the current development runtime environment.
 */
export class PluginDiscovery {
  /** The absolute path to the `elep_plugins` staging directory. */
  private readonly stagingPath: string;

  /**
   * Creates an instance of PluginDiscovery.
   * @param rootPath The absolute path to the project's root directory.
   */
  constructor(rootPath: string) {
    this.stagingPath = path.join(rootPath, 'elep_plugins');
  }

  /**
   * Scans the `elep_plugins` directory, identifies all valid plugin subdirectories,
   * and reads their `package.json` manifests.
   * If the directory does not exist, it returns an empty array, which is a valid
   * state indicating a zero-dependency setup.
   * @returns A promise that resolves to an array of `DiscoveredPlugin` objects.
   */
  async discoverPlugins(): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];
    try {
      const entries = await fs.readdir(this.stagingPath, { withFileTypes: true });

      for (const entry of entries) {
        // We only care about directories or symbolic links to directories.
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }

        const pluginDirName = entry.name;
        const pluginAbsolutePath = path.join(this.stagingPath, pluginDirName);
        const pkgJsonPath = path.join(pluginAbsolutePath, 'package.json');
        
        try {
          const content = await fs.readFile(pkgJsonPath, 'utf-8');
          const manifest = JSON.parse(content) as PluginManifest;

          // A plugin is considered valid if its manifest has a name and version.
          if (manifest.name && manifest.version) {
            discovered.push({
              name: manifest.name,
              version: manifest.version,
              pathInStaging: pluginDirName,
              manifest: manifest,
            });
          } else {
             console.warn(`[Discovery] Skipping '${pluginDirName}': "name" and "version" are missing in package.json.`);
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            console.warn(`[Discovery] Skipping directory '${pluginDirName}': No package.json found.`);
          } else {
            console.warn(`[Discovery] Skipping directory '${pluginDirName}': Invalid package.json: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // This is a non-fatal condition. It simply means there are no dependencies.
        // The calling logic handles the empty array appropriately.
        return [];
      }
      // Re-throw other unexpected filesystem errors.
      throw error; 
    }

    return discovered;
  }
}