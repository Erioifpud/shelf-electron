/**
 * @fileoverview Main Plugin Entry Point
 *
 * This file is the primary entry point for the plugin, as defined by the "main"
 * field in package.json. Its sole responsibility is to manage the plugin's
 * lifecycle: activation and deactivation.
 *
 * The business logic (the actual API implementation) is imported from `api.ts`.
 */

// This special import registers the TypeScript definitions for the `__kernel` API.
// It doesn't add any runtime code but is essential for enabling type-safe
// calls to `context.link('__kernel')`.
import "@eleplug/elep-boot/kernel";

// Import core Elep and Anvil functions for defining the plugin and creating windows.
import { definePlugin, openWindow } from "@eleplug/elep/main";

// Import our separated business logic (the API implementation).
import { myPluginApi } from "./api";

/**
 * The default export of this file must be a plugin definition.
 * `definePlugin` is a helper function that provides type-checking and autocompletion,
 * ensuring your object conforms to the `Plugin` interface.
 */
export default definePlugin({
  /**
   * The activation function is called by the `esys` orchestrator when the plugin
   * is started. This is where you initialize your plugin's resources, such as UI windows.
   *
   * @param context The PluginActivationContext, which is the plugin's gateway to
   *                interacting with the rest of the Elep system.
   */
  async activate({ link, resolve }) {
    console.log("[Plugin] Example Plugin is activating...");

    // STEP 1: Connect to the Kernel Service
    // The `__kernel` is a special, privileged plugin that provides secure access
    // to core Electron functionalities. `context.link()` is the secure, type-safe
    // way to get a client to another plugin's API.
    const kernel = await link("__kernel");
    const core = await kernel.core.ask();

    // STEP 2: Create a new application window using the kernel.
    // `openWindow` is a high-level utility that handles the complex process of:
    //   1. Creating a secure BrowserWindow.
    //   2. Setting up the secure IPC transport between main and renderer.
    //   3. Starting an ERPC server in the main process to serve the provided API.
    const eWindow = await openWindow(
      core,
      {
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: "Elep Plugin Template",

        autoHideMenuBar: true,
        
        webPreferences: {
          devTools: true, // Very useful for debugging the renderer process.
          webSecurity: false,
        },
      },
      myPluginApi // This is our API object from `api.ts` being served to this window.
    );

    // STEP 3: Load the UI into the window.
    // `context.resolve()` is the REQUIRED way to get a URL for a resource
    // within your plugin. It automatically handles path rewrites defined in
    // `elep.prod.ts` and `elep.dev.ts`, decoupling your code from the
    // final build output structure.
    const rendererUrl = resolve("@renderer/index.html");
    console.log(`[Plugin] Loading Renderer URL: ${rendererUrl}`);
    await eWindow.loadURL(rendererUrl);

    // For convenience during development, let's open the DevTools automatically.
    await eWindow.openDevTools({ mode: "detach" });

    console.log(
      "[Plugin] Window created and ERPC service is now listening for connections."
    );

    // This plugin doesn't need to expose a P2P API to other plugins, so we
    // return an empty object. The primary API is provided to the renderer
    // via the `openWindow` service.
    return {};
  },

  /**
   * The deactivation function is called by the `esys` orchestrator when the
   * plugin is being stopped or the application is shutting down.
   *
   * Use this function to clean up any resources, such as database connections,
   * file listeners, or timers. Windows created via `openWindow` are automatically
   * managed and do not need to be closed here.
   */
  deactivate() {
    console.log(`[Plugin] Example Plugin has been deactivated.`);
  },
});
