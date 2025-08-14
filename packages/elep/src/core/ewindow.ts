import { type BrowserWindow } from 'electron';
import { createDuplexTransport } from '@eleplug/muxen';
import { type Transport } from '@eleplug/transport';
import { IpcLink } from '../transport/ipc-link.js';

/**
 * A secure wrapper around an Electron `BrowserWindow` instance.
 *
 * This class is designed to be "pin-able" via `erpc`, allowing core systems or
 * other plugins to safely perform actions on a window without having direct
- * access to the powerful, and potentially insecure, `BrowserWindow` object.
 * It manages its own lifecycle and the lifecycle of transports connected to its
 * renderer process.
 */
export class EWindow {
  private readonly transports = new Map<string, Transport>();
  private isDestroyed = false;

  /**
   * @param window The raw `BrowserWindow` instance to wrap and manage.
   */
  constructor(
    private readonly window: BrowserWindow,
  ) {
    // Crucially, listen for the 'closed' event to trigger cleanup and prevent memory leaks.
    this.window.once('closed', () => this.cleanup());

    // Automatically open the core transport channel required for the system to
    // communicate with the renderer process.
    this.openTransport('ebus-core');
  }

  /**
   * Central cleanup logic for this EWindow instance.
   * This method is called when the underlying BrowserWindow is closed, and it
   * ensures all associated transports are gracefully shut down. It is idempotent.
   */
  private cleanup(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    const allTransports = Array.from(this.transports.values());
    for (const transport of allTransports) {
      transport.close().catch(err => {
        console.error(`[EWindow] Error closing transport on window cleanup:`, err);
      });
    }
    this.transports.clear();
  }

  // --- Pin-able Public API ---

  /**
   * Opens a named, multiplexed transport channel to this window's renderer process.
   * If a transport with the same namespace already exists, it returns the existing instance.
   * This is the primary bridge for all `erpc` and `ebus` communication.
   *
   * @param namespace A unique name for the transport channel (e.g., 'my-plugin-rpc').
   * @returns A `Transport` instance. Note that `Transport` itself is a pin-able type,
   *          allowing it to be passed to other plugins.
   * @throws An `Error` if the window has already been destroyed.
   */
  public openTransport(namespace: string): Transport {
    if (this.isDestroyed) {
      throw new Error('Cannot open transport: The window has been destroyed.');
    }
    
    if (this.transports.has(namespace)) {
      return this.transports.get(namespace)!;
    }

    const link = new IpcLink(this.window.webContents, namespace);
    const transport = createDuplexTransport(link);

    this.transports.set(namespace, transport);

    // When the transport closes (e.g., due to link failure), remove it from the map.
    transport.onClose(() => {
      this.transports.delete(namespace);
    });

    return transport;
  }
  
  /**
   * Opens the DevTools for this window's web contents.
   * @throws An `Error` if the window has been destroyed.
   */
  public openDevTools(): void {
    if (this.isDestroyed) throw new Error('Cannot open DevTools: The window has been destroyed.');
    this.window.webContents.openDevTools();
  }

  /**
   * Loads a URL (including `http://`, `file://`, or `plugin://`) into the window.
   * This is a proxy to `BrowserWindow.loadURL`.
   * @param url The URL to load.
   * @throws An `Error` if the window has been destroyed.
   */
  public async loadURL(url: string): Promise<void> {
    if (this.isDestroyed) throw new Error('Cannot load URL: The window has been destroyed.');
    return this.window.loadURL(url);
  }

  /**
   * Gets the current title of the window.
   * @returns The window title.
   * @throws An `Error` if the window has been destroyed.
   */
  public getTitle(): string {
    if (this.isDestroyed) throw new Error('Cannot get title: The window has been destroyed.');
    return this.window.getTitle();
  }

  /**
   * Brings the window to the front and gives it focus.
   * @throws An `Error` if the window has been destroyed.
   */
  public focus(): void {
    if (this.isDestroyed) throw new Error('Cannot focus window: The window has been destroyed.');
    this.window.focus();
  }

  /**
   * Shows the window if it is currently hidden.
   * @throws An `Error` if the window has been destroyed.
   */
  public show(): void {
    if (this.isDestroyed) throw new Error('Cannot show window: The window has been destroyed.');
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