import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Arguments } from "yargs";
import chalk from "chalk";

/**
 * Defines the structure of the application configuration file (e.g., config.json).
 */
export interface AppConfig {
  /** Optional path to a file for the persistent plugin registry. If omitted, an in-memory registry is used. */
  registry?: string;
  /** A record mapping container names to their configuration, primarily their path relative to the app root. */
  containers?: Record<string, { path: string }>;
  /**
   * A list of plugins to ensure are installed and enabled on startup.
   * Uses a short-form URI: "container-name/path-in-container"
   */
  plugins?: string[];
}

/**
 * A constant holding the safe default values for the application configuration.
 * This ensures the application can run even with a minimal or missing config file.
 */
const DEFAULT_CONFIG: Required<AppConfig> = {
  registry: "", // An empty string signifies an in-memory registry.
  containers: {},
  plugins: [],
};

/**
 * Loads and parses a configuration file from a specific, absolute path.
 * @param configPath - The absolute path to the config.json file.
 * @returns A Promise that resolves to the parsed AppConfig object.
 * @throws An error if the file cannot be read or parsed.
 */
async function loadConfigFromFile(configPath: string): Promise<AppConfig> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as AppConfig;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse config from ${configPath}: Invalid JSON format. ${error.message}`
      );
    }
    // Re-throw other errors (like file access errors) with more context.
    throw new Error(
      `Failed to load config from ${configPath}: ${error.message}`
    );
  }
}

/**
 * Determines and loads the application configuration based on CLI arguments and conventions.
 *
 * @description
 * The configuration source is determined with the following precedence:
 * 1.  `--config <JSON_STRING>`: The entire configuration is provided as a JSON string.
 * 2.  `--path <FILE_PATH>`: An explicit, absolute path to a configuration file is provided.
 * 3.  `--cwd`: The current working directory is used as the root to search for `config.json`.
 * 4.  **Default**: The Electron application's root path (`app.getAppPath()`) is used to search for `config.json`.
 *
 * @param argv - The parsed arguments object from yargs.
 * @param getAppPath - A function to retrieve Electron's app path, called only when needed.
 * @returns A Promise resolving to an object with the fully resolved, validated configuration and the determined application root path.
 */
export async function getConfig(
  argv: Arguments<{
    config?: string;
    path?: string;
    cwd?: boolean;
  }>,
  getAppPath: () => string
): Promise<{ config: Required<AppConfig>; appRoot: string }> {
  let userConfig: AppConfig = {};
  let appRoot: string = "";

  if (argv.config) {
    console.log(
      chalk.blue("[Config] Using configuration from --config argument.")
    );
    try {
      userConfig = JSON.parse(argv.config);
      // When config is a string, paths are assumed to be relative to the current working directory.
      appRoot = process.cwd();
    } catch (e: any) {
      throw new Error(`Invalid JSON in --config argument: ${e.message}`);
    }
  } else {
    let configPath: string;
    if (argv.path) {
      configPath = path.resolve(argv.path);
      appRoot = path.dirname(configPath);
      console.log(
        chalk.blue(
          `[Config] Using explicit config path: ${chalk.yellow(configPath)}`
        )
      );
    } else {
      appRoot = argv.cwd ? process.cwd() : getAppPath();
      const rootSource = argv.cwd
        ? "current working directory (via --cwd)"
        : "Electron app path (default)";
      console.log(chalk.blue(`[Config] Using ${rootSource} as root.`));
      configPath = path.join(appRoot, "config.json");
    }

    try {
      userConfig = await loadConfigFromFile(configPath);
    } catch (error: any) {
      // Gracefully handle the common case where the config file doesn't exist.
      if (error.message.includes("ENOENT")) {
        console.warn(
          chalk.yellow(
            `[Config] Config file not found at ${configPath}. Using default settings.`
          )
        );
      } else {
        // Log other errors (e.g., parsing) but proceed with defaults to prevent a crash.
        console.error(error);
        console.warn(
          chalk.yellow(
            `[Config] Using default settings due to error during config load.`
          )
        );
      }
    }
  }

  // Merge the loaded user configuration over the safe defaults and return.
  return {
    config: { ...DEFAULT_CONFIG, ...userConfig },
    appRoot,
  };
}
