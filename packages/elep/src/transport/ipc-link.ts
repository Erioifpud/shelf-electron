import mimic from "@eleplug/mimic";
import { type WebContents, ipcMain } from "electron";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { Link, MultiplexedPacket } from "@eleplug/muxen";

/**
 * An implementation of the `Link` interface for the Electron main process.
 * It establishes a dedicated communication channel with a specific renderer process
 * over a given namespace.
 */
export class IpcLink implements Link {
  private readonly events = new AsyncEventEmitter<{
    message: (message: MultiplexedPacket) => void;
    close: (reason?: Error) => void;
  }>();

  private isClosed = false;

  // A reference to the specific listener function is kept for proper removal.
  private readonly messageListener: (
    event: Electron.IpcMainEvent,
    message: string
  ) => void;

  /**
   * @param webContents The `WebContents` object of the target renderer process.
   * @param namespace The unique channel name for this link.
   */
  constructor(
    private readonly webContents: WebContents,
    public readonly namespace: string
  ) {
    if (this.webContents.isDestroyed()) {
      throw new Error("Cannot create IpcLink for a destroyed WebContents.");
    }

    this.messageListener = (event: Electron.IpcMainEvent, message: string) => {
      // Security: Ensure the message is from the WebContents we are linked to.
      if (event.sender === this.webContents) {
        const packet = mimic.parse(message) as MultiplexedPacket;
        this.events.emit("message", packet);
      }
    };

    // Listen for messages on the specific namespace channel.
    ipcMain.on(this.namespace, this.messageListener);

    // Ensure cleanup when the renderer process/window is closed.
    this.webContents.once("destroyed", () => this.close());
  }

  /**
   * Registers a handler for incoming messages from the linked renderer.
   * @param handler The function to execute when a message is received.
   */
  public onMessage(handler: (message: MultiplexedPacket) => void): void {
    this.events.on("message", handler);
  }

  /**
   * Sends a message to the associated renderer process on the link's namespace.
   * @param packet The multiplexed packet to send.
   */
  public sendMessage(packet: MultiplexedPacket): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link (${this.namespace}) is closed.`));
    }
    this.webContents.send(this.namespace, mimic.stringify(packet));
    return Promise.resolve();
  }

  /**
   * Registers a handler for when the communication link is closed.
   * @param handler The function to execute upon closing.
   */
  public onClose(handler: (reason?: Error) => void): void {
    this.events.on("close", handler);
  }

  public close(): Promise<void> {
    return this.internalClose();
  }

  public abort(reason: Error): Promise<void> {
    return this.internalClose(reason);
  }

  /**
   * Centralized cleanup logic for closing the link.
   * This is idempotent and safe to call multiple times.
   */
  private internalClose(reason?: Error): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;

    // Remove the specific listener from the global ipcMain.
    ipcMain.removeListener(this.namespace, this.messageListener);

    this.events.emit("close", reason);
    this.events.removeAllListeners();

    return Promise.resolve();
  }
}
