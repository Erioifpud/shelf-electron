import { type WebContents } from "electron";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { Link, MultiplexedPacket } from "@eleplug/muxen";
import { ipcRouter } from "./global-ipc-router.js";

/**
 * An implementation of the `Link` interface for the Electron main process.
 * It establishes a dedicated communication channel with a specific renderer process
 * over a unique channel ID, managed entirely by the `GlobalIpcRouter`.
 */
export class IpcLink implements Link {
  private readonly events = new AsyncEventEmitter<{
    message: (message: MultiplexedPacket) => void;
    close: (reason?: Error) => void;
  }>();

  private isClosed = false;

  /**
   * @param webContents The `WebContents` object of the target renderer process.
   * @param channelId The unique, globally managed channel identifier for this link,
   *                  provided by the `GlobalIpcRouter`.
   */
  constructor(
    private readonly webContents: WebContents,
    private readonly channelId: string
  ) {
    if (this.webContents.isDestroyed()) {
      throw new Error("Cannot create IpcLink for a destroyed WebContents.");
    }

    const messageListener = (packet: MultiplexedPacket) => {
      // No need to check event.sender, as the router guarantees the message
      // is for this specific channelId.
      this.events.emit("message", packet);
    };

    // Register this link's listener with the central router.
    ipcRouter.registerListener(this.channelId, messageListener);

    // The router's cleanup mechanism will handle the 'destroyed' event,
    // but we can also listen here to trigger our own close logic.
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
   * Sends a message to the associated renderer process via the `GlobalIpcRouter`.
   * @param packet The multiplexed packet to send.
   */
  public sendMessage(packet: MultiplexedPacket): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link (${this.channelId}) is closed.`));
    }
    // Delegate sending to the central router.
    ipcRouter.sendMessage(this.webContents, this.channelId, packet);
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
   * Centralized cleanup logic for closing the link. It's idempotent.
   */
  private internalClose(reason?: Error): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;

    // Unregister the listener from the central router to prevent memory leaks.
    ipcRouter.removeListener(this.channelId);

    this.events.emit("close", reason);
    this.events.removeAllListeners();

    return Promise.resolve();
  }
}
