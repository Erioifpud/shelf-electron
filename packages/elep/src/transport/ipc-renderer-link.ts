import mimic from "@eleplug/mimic";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { Link, MultiplexedPacket } from "@eleplug/muxen";
import type { IpcShape } from "../types.js";
import type { IpcRendererEvent } from "electron";

/**
 * An implementation of the `Link` interface for the Electron renderer process.
 * It uses a pre-configured `IpcShape` adapter to communicate with a corresponding
 * `IpcLink` in the main process over a dedicated channel.
 */
export class IpcRendererLink implements Link {
  private readonly events = new AsyncEventEmitter<{
    message: (message: MultiplexedPacket) => void;
    close: (reason?: Error) => void;
  }>();

  private isClosed = false;

  // A reference to the listener function for proper removal.
  private readonly messageListener: (
    event: IpcRendererEvent,
    message: string
  ) => void;

  /**
   * @param ipc The `IpcShape` adapter, created by `createAdapter` from the
   *            preload script, which provides namespaced communication methods.
   */
  constructor(private readonly ipc: IpcShape) {
    this.messageListener = (_event, message) => {
      this.events.emit("message", mimic.parse(message));
    };

    this.ipc.on(this.messageListener);
  }

  public onMessage(handler: (message: MultiplexedPacket) => void): void {
    this.events.on("message", handler);
  }

  public sendMessage(packet: MultiplexedPacket): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link is closed.`));
    }
    this.ipc.send(mimic.stringify(packet));
    return Promise.resolve();
  }

  public onClose(handler: (reason?: Error) => void): void {
    this.events.on("close", handler);
  }

  public close(): Promise<void> {
    return this.internalClose();
  }

  public abort(reason: Error): Promise<void> {
    return this.internalClose(reason);
  }

  private internalClose(reason?: Error): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;

    this.ipc.off(this.messageListener);

    this.events.emit("close", reason);
    this.events.removeAllListeners();

    return Promise.resolve();
  }
}
