import { BrowserWindow, type OpenDevToolsOptions } from 'electron';
import { createDuplexTransport } from '@eleplug/muxen';
import { type Transport } from '@eleplug/transport';
import { ipcRouter } from '../transport/global-ipc-router.js';
import { IpcLink } from '../transport/ipc-link.js';
import type { Convert } from '../types.js';
import type { Pin } from '../renderer.js';

/**
 * A secure wrapper around an Electron `BrowserWindow` instance, refactored to
 * act as a connection acceptor for the renderer process.
 *
 * This class is designed to be "pin-able" via `erpc`, allowing core systems or
 * other plugins to safely perform actions on a window. Its primary role in the
 * new architecture is to register an `accept` callback with the `GlobalIpcRouter`,
 * which will be invoked when its corresponding renderer process requests a
 * transport connection.
 */
export class EWindow {
  private readonly window: BrowserWindow;
  private isDestroyed = false;

  /**
   * @param window The raw `BrowserWindow` instance to wrap and manage.
   */
  constructor(window: BrowserWindow) {
    this.window = window;

    // Listen for the 'closed' event to trigger cleanup and prevent memory leaks.
    this.window.once('closed', () => {
        this.isDestroyed = true;
        // The GlobalIpcRouter's 'web-contents-created' hook will handle cleanup
        // of acceptors and listeners, so no explicit cleanup is needed here.
    });
  }

  // --- Pin-able Public API ---

  /**
   * Registers a callback to handle new, incoming `Transport` connection requests
   * from this window's renderer process. This is the core of the C/S model.
   *
   * @design
   * This method is intended to be called by a plugin (the "server") via an erpc
   * proxy. The plugin provides a `pin`-ed callback function. When the renderer
   * (the "client") requests a connection, the `GlobalIpcRouter` invokes the
   * logic defined here, which in turn creates a transport and passes it to the
   * plugin's callback.
   *
   * @param callback A `pin`-ed function from the plugin that will receive the
   *                 newly created `Transport` instance for each connection.
   */
  public accept(callback: Pin<(transport: Transport) => void>): void {
    if (this.isDestroyed) {
      throw new Error("Cannot accept connections: The window has been destroyed.");
    }

    // Define the logic that will be executed when a handshake is requested.
    const acceptor = async (): Promise<{ transportChannelId: string; transport: Transport }> => {
      // 1. Create a unique channel ID for this specific connection instance.
      // We use a fixed "plugin-service" namespace as it's the primary purpose.
      const transportChannelId = ipcRouter.createChannelId(this.window.webContents, 'plugin-service');

      // 2. Create the main-process side of the link and transport.
      const link = new IpcLink(this.window.webContents, transportChannelId);
      const transport = createDuplexTransport(link);

      // 3. Invoke the plugin-provided callback with the new transport.
      // This hands off the connection to the plugin's erpc server.
      try {
        await callback(transport);
      } catch (e) {
        // If the plugin's handler fails, we must clean up the transport.
        transport.close().catch(() => {});
        throw e;
      }
      
      // 4. Return the result to the router, which will forward the channel ID to the renderer.
      return { transportChannelId, transport };
    };

    // Register this acceptor logic with the global router for this window.
    ipcRouter.registerAcceptor(this.window.webContents, acceptor);
  }

  /**
   * Opens the DevTools for this window's web contents.
   */
  public openDevTools(options?: Convert<OpenDevToolsOptions>): void {
    if (this.isDestroyed)
      throw new Error('Cannot open DevTools: The window has been destroyed.');
    this.window.webContents.openDevTools(options);
  }

  /**
   * Loads a URL into the window.
   */
  public async loadURL(url: string): Promise<void> {
    if (this.isDestroyed)
      throw new Error('Cannot load URL: The window has been destroyed.');

    await this.window.loadURL(url);
  }

  /**
   * Gets the current title of the window.
   */
  public getTitle(): string {
    if (this.isDestroyed)
      throw new Error('Cannot get title: The window has been destroyed.');
    return this.window.getTitle();
  }

  /**
   * Brings the window to the front and gives it focus.
   */
  public focus(): void {
    if (this.isDestroyed)
      throw new Error('Cannot focus window: The window has been destroyed.');
    this.window.focus();
  }

  /**
   * Shows the window if it is currently hidden.
   */
  public show(): void {
    if (this.isDestroyed)
      throw new Error('Cannot show window: The window has been destroyed.');
    this.window.show();
  }

  /**
   * Closes the window. This is an idempotent operation.
   */
  public closeWindow(): void {
    if (this.isDestroyed) return;
    this.window.close();
  }
}