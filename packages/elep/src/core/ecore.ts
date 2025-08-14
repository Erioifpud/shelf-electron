import { app, protocol, BrowserWindow } from "electron";
import { pin, type Pin } from "@eleplug/erpc";
import { EWindow } from "./ewindow.js";
import type { System } from "@eleplug/esys";
import { Readable } from "node:stream";
import { type EWindowOptions } from "./ewindow-options.js";
import { fileSync as createTempFileSync } from "tmp";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Convert } from "../types.js";

/**
 * Represents the core of the Electron application, acting as a proxy to the
 * `app` module and a factory for `EWindow` instances.
 *
 * This class is designed to be a singleton, created at application startup and
 * exposed to plugins as a `Pin<ECore>` object, allowing them to safely interact
 * with core application functionalities like creating windows and quitting.
 */
export class ECore {
  private isProtocolRegistered = false;

  /**
   * Creates an instance of ECore.
   * @param system A reference to the main `esys` System instance, which is used
   *               to handle `plugin://` protocol requests for resource loading.
   */
  constructor(private readonly system: System) {
    this.installProtocolHandler();
  }

  /**
   * Registers the custom `plugin://` protocol handler.
   * This method ensures that requests for `plugin://` URIs are intercepted and
   * resolved by fetching the corresponding resource from the `esys` system.
   * It is idempotent and safely handles being called before or after the
   * `app` 'ready' event.
   */
  private installProtocolHandler(): void {
    if (this.isProtocolRegistered) {
      return;
    }

    // Ensure this runs only after the app is ready. If already ready, it runs immediately.
    app.whenReady().then(() => {
      // The `protocol.handle` API is the modern and recommended way to implement custom protocols.
      protocol.handle("plugin", async (request) => {
        const uri = request.url;
        try {
          // Request the resource from the central resource manager.
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

          // Return a standard error response if the resource is not found or an error occurs.
          return new Response(null, {
            status: 404,
            statusText: "Not Found",
          });
        }
      });
      this.isProtocolRegistered = true;
    });
  }

  /**
   * Securely streams a preload script from a plugin resource URI to a temporary
   * file on the local filesystem. This is a critical security step, as Electron's
   * `preload` option requires an absolute file path, and we must not expose
   * the application's internal file structure to plugins.
   * @param preloadUri The `plugin://` URI of the preload script to load.
   * @returns A promise that resolves to the absolute path of the temporary file.
   * @throws An error if the resource cannot be fetched or written to a temporary file.
   */
  private async streamPreloadToTempFile(preloadUri: string): Promise<string> {
    try {
      // 1. Fetch the resource stream from the esys system.
      const { body } = await this.system.resources.get(preloadUri);
      const nodeReadable = Readable.fromWeb(body as any);

      // 2. Create a temporary file. 'tmp' handles secure creation and cleanup on process exit.
      const tempFile = createTempFileSync({
        prefix: "elep-preload-",
        postfix: ".js",
      });
      const writeStream = createWriteStream(tempFile.name);

      // 3. Pipe the resource stream into the temporary file.
      await pipeline(nodeReadable, writeStream);

      return tempFile.name;
    } catch (error: any) {
      // Wrap any errors in a more informative message.
      throw new Error(
        `Failed to load preload script from "${preloadUri}": ${error.message}`
      );
    }
  }

  // --- Pin-able Public API ---

  /**
   * Creates a new application window (`BrowserWindow`) managed by an `EWindow` wrapper.
   * This method provides a simplified and secure interface for plugins to create UI.
   *
   * @param options Configuration options for the window, defined by `EWindowOptions`.
   * @returns A Promise that resolves to a `Pin<EWindow>`, a remotely-accessible proxy
   *          to the newly created window.
   */
  public async createWindow(
    options: EWindowOptions = {}
  ): Promise<Pin<EWindow>> {
    await app.whenReady();

    let preloadPath: string | undefined = undefined;
    const preloadUri = options.webPreferences?.preload;

    // If a preload URI is specified, securely process it.
    if (preloadUri) {
      preloadPath = await this.streamPreloadToTempFile(preloadUri);
    }

    const browserWindow = new BrowserWindow({
      // Spread user-provided top-level options (e.g., width, height, frame).
      ...options,
      webPreferences: {
        // Spread user-provided, non-critical webPreferences.
        ...options.webPreferences,

        // Enforce security-critical settings, overriding any user-provided values.
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Wrap the BrowserWindow in our EWindow class.
    const eWindow = new EWindow(browserWindow);

    // Pin the EWindow instance to make it securely available for remote calls.
    return pin(eWindow);
  }

  /**
   * Retrieves application-level process metrics, such as CPU and memory usage.
   * This is a direct proxy to Electron's `app.getAppMetrics()`.
   * @returns An array of process metric objects.
   */
  public getAppMetrics(): Convert<Electron.ProcessMetric>[] {
    return app.getAppMetrics();
  }

  /**
   * Gets the application's version string, as defined in `package.json`.
   * This is a direct proxy to Electron's `app.getVersion()`.
   * @returns The application version string.
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
