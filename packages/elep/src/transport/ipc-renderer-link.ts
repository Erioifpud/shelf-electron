import mimic from "@eleplug/mimic";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { Link, MultiplexedPacket } from "@eleplug/muxen";

/**
 * Defines the abstract shape of the namespaced IPC communicator exposed by the preload script.
 * This is the contract between the renderer and the secure preload environment.
 */
export interface IpcRendererAdapter {
  send: (channelId: string, payload: string) => void;
  on: (channelId: string, listener: (payload: string) => void) => void;
  off: (channelId: string, listener: (payload: string) => void) => void;
}

/**
 * An implementation of the `Link` interface for the Electron renderer process.
 * It uses a pre-configured adapter (provided by the preload script) to communicate
 * securely with the `GlobalIpcRouter` in the main process.
 */
export class IpcRendererLink implements Link {
  private readonly events = new AsyncEventEmitter<{
    message: (message: MultiplexedPacket) => void;
    close: (reason?: Error) => void;
  }>();

  private isClosed = false;
  private readonly messageListener: (payload: string) => void;

  /**
   * @param channelId The unique channel identifier obtained from the handshake process.
   * @param ipcAdapter The adapter object exposed by the preload script, providing
   *                   sandboxed access to IPC communication.
   */
  constructor(
    private readonly channelId: string,
    private readonly ipcAdapter: IpcRendererAdapter
  ) {
    this.messageListener = (payload: string) => {
      this.events.emit("message", mimic.parse(payload));
    };

    // Use the adapter to register a listener for incoming messages on our channel.
    this.ipcAdapter.on(this.channelId, this.messageListener);
  }

  public onMessage(handler: (message: MultiplexedPacket) => void): void {
    this.events.on("message", handler);
  }

  public sendMessage(packet: MultiplexedPacket): Promise<void> {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link (${this.channelId}) is closed.`));
    }
    // Use the adapter to send the message.
    this.ipcAdapter.send(this.channelId, mimic.stringify(packet));
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

    // Use the adapter to remove the listener.
    this.ipcAdapter.off(this.channelId, this.messageListener);

    this.events.emit("close", reason);
    this.events.removeAllListeners();

    return Promise.resolve();
  }
}
