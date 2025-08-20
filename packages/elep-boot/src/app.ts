import { app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Bootloader, LifecycleEvent, Registry } from "@eleplug/esys";
import { ECore, FileContainer } from "@eleplug/elep";
import type { AppConfig } from "./config.js";
import { createKernelRouter } from "./kernel/router.js";
import { createPluginUri } from "@eleplug/anvil";
import chalk from "chalk";

/**
 * The application context, passed through the bootloader lifecycle.
 */
interface AppContext {
  config: Required<AppConfig>;
  appRoot: string;
}

/**
 * The main bootstrap function for the application. It configures and runs the
 * esys Bootloader, orchestrating the entire system startup.
 */
export async function bootstrap(
  config: Required<AppConfig>,
  appRoot: string,
  devMode: boolean
) {
  console.log(chalk.cyan.bold("\n[BOOT] Starting Elep Bootloader..."));
  console.log(
    chalk.gray(
      `       Development Mode: ${devMode ? chalk.green("ON") : chalk.red("OFF")}`
    )
  );

  const appContext: AppContext = { config, appRoot };
  const bootloader = new Bootloader(appContext);

  bootloader
    .on(
      LifecycleEvent.BOOTSTRAP,
      async ({ config, appRoot }, registryLoader) => {
        console.log(chalk.cyan.bold("\n[PHASE 1: BOOTSTRAP]"));
        console.log("  - Initializing plugin registry...");
        let registry: Registry;
        if (config.registry) {
          const registryPath = path.resolve(appRoot, config.registry);
          console.log(
            `    - Using persistent registry at: ${chalk.yellow(registryPath)}`
          );
          await fs.mkdir(path.dirname(registryPath), { recursive: true });
          registry = await Registry.createPersistent(registryPath);
        } else {
          console.log(chalk.gray("    - Using in-memory registry."));
          registry = await Registry.createMemory();
        }
        registryLoader.load(registry);
      }
    )
    .on(
      LifecycleEvent.MOUNT_CONTAINERS,
      async ({ config, appRoot }, containerManager) => {
        console.log(chalk.cyan.bold("\n[PHASE 2: MOUNT_CONTAINERS]"));
        for (const name in config.containers) {
          const containerConfig = config.containers[name];
          const containerPath = path.resolve(appRoot, containerConfig.path);
          console.log(
            `  - Mounting container '${chalk.magenta(name)}' from '${chalk.yellow(containerPath)}'`
          );
          await containerManager.mount(name, (bus) => {
            return new FileContainer({ bus, rootPath: containerPath, devMode });
          });
        }
      }
    )
    .on(LifecycleEvent.ATTACH_CORE, async (context, system) => {
      console.log(chalk.cyan.bold("\n[PHASE 3: ATTACH_CORE]"));
      console.log("  - Attaching kernel services...");
      const ecore = new ECore(system);
      const kernelApiRouter = createKernelRouter(ecore);

      await system.bus.join({
        id: "__kernel",
        groups: ["kernel"], // The 'kernel' group provides privileged access.
        api: kernelApiRouter,
      });
      console.log(chalk.green("    - __kernel node attached successfully."));
    })
    .on(LifecycleEvent.RUN, async ({ config }, system) => {
      console.log(chalk.cyan.bold("\n[PHASE 4: RUN]"));
      console.log("  - System is operational. Ensuring plugin states...");

      if (config.plugins && config.plugins.length > 0) {
        for (const pluginShorthandUri of config.plugins) {
          try {
            const separatorIndex = pluginShorthandUri.indexOf("/");
            if (separatorIndex === -1) {
              throw new Error(
                "Invalid format. Expected 'container-name/plugin-path'."
              );
            }
            const containerName = pluginShorthandUri.substring(
              0,
              separatorIndex
            );
            const pluginPath = pluginShorthandUri.substring(separatorIndex + 1);

            const fullUri = createPluginUri(containerName, pluginPath);
            console.log(
              `  - Ensuring plugin '${chalk.magenta(fullUri)}' is enabled...`
            );
            await system.plugins.ensure({
              uri: fullUri,
              enable: true,
              reconcile: false, // Defer reconciliation until all plugins are processed.
            });
          } catch (error: any) {
            console.error(
              chalk.red(
                `    - Failed to ensure plugin '${pluginShorthandUri}': ${error.message}`
              )
            );
          }
        }
      } else {
        console.log(
          chalk.gray("  - No startup plugins defined in configuration.")
        );
      }

      if (system.shouldReconcile()) {
        console.log(
          chalk.blue("\n[RECONCILE] Applying state changes to the system...")
        );
        await system.reconcile();
      }

      console.log(
        chalk.green.bold("\n System is fully configured and reconciled.")
      );
    });

  const system = await bootloader.start();

  app.on("before-quit", async (event) => {
    event.preventDefault();
    console.log(
      chalk.yellow("\n[SHUTDOWN] Gracefully shutting down system...")
    );
    try {
      await system.shutdown();
    } catch (error) {
      console.error(
        chalk.red("[SHUTDOWN] Error during system shutdown:"),
        error
      );
    } finally {
      app.exit();
    }
  });
}
