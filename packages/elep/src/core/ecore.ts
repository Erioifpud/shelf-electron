import { app, protocol, BrowserWindow } from "electron";
import { pin, type Pin } from "@eleplug/erpc";
import { EWindow } from "./ewindow.js";
import type { System } from "@eleplug/esys";
import { type EWindowOptions } from "./ewindow-options.js";
import type { Convert } from "../types.js";
import path from "node:path";

/**
 * Represents the core of the Electron application, acting as a secure proxy to the
 * `app` module and a factory for `EWindow` instances.
 *
 * @design
 * This class is designed to be a singleton, created at application startup and
 * exposed to trusted kernel plugins as a `Pin<ECore>` object. This allows plugins

 * to safely interact with core application functionalities (like creating windows
 * or quitting) without gaining direct access to the powerful and potentially
 * insecure Electron `app` object.
 */
export class ECore {
  private isProtocolRegistered = false;

  constructor(private readonly system: System) {
    this.installProtocolHandler();
  }

  /**
   * Registers the custom `plugin://` protocol handler.
   *
   * @design
   * This method uses `protocol.handle`, the modern and recommended API for
   * implementing custom protocols in Electron. It ensures that any web request
   * for a `plugin://` URI is securely intercepted and resolved by fetching the
   * corresponding resource from the `esys` system's central ResourceManager.
   * This is the foundation for loading all plugin assets (HTML, JS, CSS, images)
   * in a secure, location-agnostic way.
   * The method is idempotent and safely handles being called before or after the
   * `app` 'ready' event.
   */
  private installProtocolHandler(): void {
    if (this.isProtocolRegistered) {
      return;
    }

    app.whenReady().then(() => {
      protocol.handle("plugin", async (request) => {
        const uri = request.url;
        try {
          const { body, mimeType } = await this.system.resources.get(uri);

          const headers = new Headers();
          if (mimeType) {
            headers.append("Content-Type", mimeType);
          }

          // The handler must return a standard web `Response` object.
          return new Response(body, {
            status: 200,
            statusText: "OK",
            headers,
          });
        } catch (error: any) {
          console.error(
            `[ECore] Failed to handle plugin:// protocol for "${uri}":`,
            error.message
          );
          return new Response(null, { status: 404, statusText: "Not Found" });
        }
      });
      this.isProtocolRegistered = true;
    });
  }

  // --- Pin-able Public API ---

  /**
   * Creates a new application window (`BrowserWindow`) managed by an `EWindow` wrapper.
   * This is the foundational method called by the high-level `createWindow` function.
   *
   * @param options Configuration options for the window, defined by `EWindowOptions`.
   * @returns A Promise that resolves to a `Pin<EWindow>`, a remotely-accessible proxy
   *          to the newly created window.
   */
  public async createWindow(
    options: EWindowOptions = {}
  ): Promise<Pin<EWindow>> {
    await app.whenReady();

    // 1. Reliably determine the path to the framework's built-in preload script.
    //    This assumes the preload script is located relative to this file after compilation.
    //    For example, if this file is `dist/index.js` and `dist/main.js`, and preload is `dist/preload.js`.
    const frameworkPreloadPath = path.resolve(__dirname, './preload.js');
    
    // 2. Create the BrowserWindow with the enforced, framework-provided preload script.
    const browserWindow = new BrowserWindow({
      ...options,
      webPreferences: {
        // Enforce security-critical settings, overriding any user-provided values.
        preload: frameworkPreloadPath, // <-- CORRECTED: Use the framework's script.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const eWindow = new EWindow(browserWindow);
    return pin(eWindow);
  }

  /**
   * Retrieves application-level process metrics. Proxies `app.getAppMetrics()`.
   * @returns An array of process metric objects, converted to plain objects.
   */
  public getAppMetrics(): Convert<Electron.ProcessMetric>[] {
    return app.getAppMetrics();
  }

  /**
   * Gets the application's version string from `package.json`. Proxies `app.getVersion()`.
   */
  public getVersion(): string {
    return app.getVersion();
  }

  /**
   * Shuts down the `esys` system gracefully and then quits the Electron application.
   */
  public async quit(): Promise<void> {
    await this.system.shutdown();
    app.quit();
  }
}