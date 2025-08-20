import { app } from "electron";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getConfig } from "./config.js";
import { bootstrap } from "./app.js";

/**
 * The main entry point for the Elep application.
 * This function parses command-line arguments, initializes the Electron app lifecycle,
 * loads the configuration, and starts the bootloader.
 */
async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("dev", {
      alias: "d",
      type: "boolean",
      description:
        "Run in development mode. Enables dev-time features for plugins.",
      default: false,
    })
    .option("config", {
      type: "string",
      description: "Provide the entire configuration as a single JSON string.",
    })
    .option("path", {
      type: "string",
      description:
        "Specify an exact path to the configuration file (e.g., /path/to/my.config.json).",
    })
    .option("cwd", {
      type: "boolean",
      description:
        "Use the current working directory as the root for config lookup, overriding the default.",
      default: false,
    })
    .help()
    .alias("h", "help")
    .check((argv) => {
      // Enforce mutual exclusivity for configuration sources.
      const configSources = ["config", "path"].filter((key) => argv[key]);
      if (configSources.length > 1) {
        throw new Error(
          `Options --${configSources.join(" and --")} are mutually exclusive.`
        );
      }
      return true;
    })
    .parseAsync();

  // Standard Electron app lifecycle handler.
  app.on("window-all-closed", () => {
    // On macOS, it's common for applications to stay active until the user quits explicitly.
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  try {
    // It is critical to wait for the 'ready' event before accessing most `app` APIs,
    // especially `app.getAppPath()`.
    await app.whenReady();

    // Now that the app is ready, we can safely determine the configuration.
    // The `getAppPath` function is passed in to be called at the correct time.
    const { config, appRoot } = await getConfig(argv, () => app.getAppPath());

    // With the configuration loaded, start the main application logic.
    await bootstrap(config, appRoot, argv.dev);
  } catch (err) {
    console.error("Fatal error during application startup:", err);
    process.exit(1);
  }
}

// Execute the main function to start the application.
main();
