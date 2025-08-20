/**
 * @fileoverview
 * Provides a dedicated class for reading and parsing the `package.json`
 * of the project where `elep-dev` is currently being executed.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PluginManifest } from './types.js';

/**
 * A special configuration field within `package.json` for elep-dev specific settings.
 * @example
 * // in package.json
 * {
 *   "name": "my-plugin",
 *   "elep": {
 *     "dtsOutput": "dist/types/anvil.d.ts"
 *   }
 * }
 */
interface ElepDevConfig {
  /**
   * Overrides the default output path for the `elep dts` command.
   * Path is relative to the project root.
   */
  dtsOutput?: string;
}

/**
 * Represents the structure of the current project's manifest, including the
 * optional `elep` configuration field.
 */
interface ProjectManifestWithElep extends PluginManifest {
  elep?: ElepDevConfig;
}

/**
 * Manages the loading and caching of the root project's `package.json`.
 * It serves as the primary source of configuration for the `elep-dev` commands,
 * providing access to the project's manifest and any `elep`-specific settings.
 */
export class ProjectConfig {
  /** The absolute path to the project's root directory. */
  public readonly rootPath: string;
  private manifest: ProjectManifestWithElep | null = null;

  /**
   * Creates an instance of ProjectConfig.
   * @param rootPath The absolute path to the project's root directory (e.g., `process.cwd()`).
   */
  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Reads, parses, validates, and caches the project's `package.json` file.
   * @returns A promise that resolves to the parsed manifest object.
   * @throws An error if the `package.json` cannot be found or is malformed.
   */
  async getManifest(): Promise<ProjectManifestWithElep> {
    if (this.manifest) {
      return this.manifest;
    }

    const pkgPath = path.join(this.rootPath, 'package.json');
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const parsedManifest = JSON.parse(content);
      
      // Basic validation to ensure it's a valid package manifest.
      if (typeof parsedManifest.name !== 'string' || typeof parsedManifest.version !== 'string') {
        throw new Error('The "name" and "version" fields are required and must be strings in package.json.');
      }

      this.manifest = parsedManifest;
      return this.manifest as ProjectManifestWithElep;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Could not find package.json in the current directory: ${this.rootPath}`);
      }
      throw new Error(`Failed to read or parse package.json at ${pkgPath}: ${error.message}`);
    }
  }

  /**
   * Determines the final output path for the generated `d.ts` file.
   * It prioritizes the path defined in `package.json`'s `elep.dtsOutput` field
   * over the default path provided by the CLI command.
   * @param defaultPath The default path to use if no override is specified in `package.json`.
   * @returns A promise that resolves to the absolute path for the output file.
   */
  async getDtsOutputPath(defaultPath: string): Promise<string> {
    const manifest = await this.getManifest();
    const relativePath = manifest.elep?.dtsOutput || defaultPath;
    return path.join(this.rootPath, relativePath);
  }
}