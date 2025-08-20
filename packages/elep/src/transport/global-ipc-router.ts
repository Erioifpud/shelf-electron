import { ipcMain, app, type WebContents } from "electron";
import type { MultiplexedPacket } from "@eleplug/muxen";
import mimic from "@eleplug/mimic";
import { v4 as uuid } from "uuid";
import type { Transport } from "@eleplug/transport";

/**
 * The callback function registered by an EWindow instance to handle incoming connection requests.
 * It's responsible for creating the main-process side of the transport and returning it
 * along with the unique channel ID for the renderer to connect to.
 * @returns A Promise that resolves with the channel ID and the created Transport instance.
 */
type AcceptCallback = () => Promise<{
  transportChannelId: string;
  transport: Transport;
}>;

/**
 * A singleton that acts as the central router for all IPC traffic between the main
 * process and renderer windows.
 *
 * @design
 * This class eliminates the need for any other module in the main process to interact
 * directly with `ipcMain`. It provides two main functionalities:
 * 1.  **Connection Handshake**: Manages a single, global `elep-handshake` channel. When a
 *     renderer requests a connection, the router finds the corresponding `EWindow`'s
 *     registered `accept` logic and executes it.
 * 2.  **Message Routing**: Manages a single, global `elep-ipc-message` channel. All
 *     data packets are sent over this channel, prefixed with a unique `channelId`. The
 *     router uses this ID to forward the packet to the correct `IpcLink` instance.
 * This centralized approach simplifies lifecycle management, enhances security, and makes
 * the overall communication architecture much cleaner.
 */
class GlobalIpcRouter {
  private static instance: GlobalIpcRouter;

  // Maps a unique channelId to the IpcLink instance listening on it.
  private listeners = new Map<string, (packet: MultiplexedPacket) => void>();
  // Maps a webContentsId to the `accept` callback for that window.
  private acceptors = new Map<number, AcceptCallback>();

  private constructor() {
    // --- Data Plane Listener ---
    // Listens for all data packets from all renderers.
    ipcMain.on(
      "elep-ipc-message",
      (event, channelId: string, payload: string) => {
        const listener = this.listeners.get(channelId);
        if (listener) {
          const packet = mimic.parse(payload) as MultiplexedPacket;
          listener(packet);
        }
      }
    );

    // --- Control Plane Listener (Handshake) ---
    // Listens for connection requests from any renderer.
    ipcMain.handle("elep-handshake", async (event) => {
      const acceptor = this.acceptors.get(event.sender.id);
      if (!acceptor) {
        throw new Error(
          `No service is accepting connections for this window (webContentsId: ${event.sender.id}).`
        );
      }
      // Execute the EWindow's registered logic to create the transport.
      const { transportChannelId } = await acceptor();
      // Return only the channelId to the renderer.
      return transportChannelId;
    });

    // --- Automatic Cleanup ---
    // Hook into the app lifecycle to automatically clean up resources for destroyed windows.
    app.on("web-contents-created", (_event, webContents) => {
      webContents.on("destroyed", () => {
        this.cleanupForWebContents(webContents.id);
      });
    });
  }

  /**
   * Gets the singleton instance of the router.
   */
  public static getInstance(): GlobalIpcRouter {
    if (!GlobalIpcRouter.instance) {
      GlobalIpcRouter.instance = new GlobalIpcRouter();
    }
    return GlobalIpcRouter.instance;
  }

  /**
   * Creates a new, unique channel ID for a given WebContents and namespace.
   * While the router doesn't store this directly, it's a utility for EWindow.
   */
  public createChannelId(webContents: WebContents, namespace: string): string {
    return `ipc-channel:${webContents.id}:${namespace}:${uuid()}`;
  }

  /**
   * Sends a message packet to a specific renderer window on a specific channel.
   */
  public sendMessage(
    webContents: WebContents,
    channelId: string,
    packet: MultiplexedPacket
  ): void {
    if (!webContents.isDestroyed()) {
      webContents.send("elep-ipc-message", channelId, mimic.stringify(packet));
    }
  }

  /**
   * Registers a listener callback for a specific channel ID.
   */
  public registerListener(
    channelId: string,
    listener: (packet: MultiplexedPacket) => void
  ): void {
    this.listeners.set(channelId, listener);
  }

  /**
   * Removes the listener for a specific channel ID.
   */
  public removeListener(channelId: string): void {
    this.listeners.delete(channelId);
  }

  /**
   * Registers a connection acceptor callback for a specific window.
   */
  public registerAcceptor(
    webContents: WebContents,
    callback: AcceptCallback
  ): void {
    this.acceptors.set(webContents.id, callback);
  }

  /**
   * Removes the connection acceptor for a specific window.
   */
  public removeAcceptor(webContentsId: number): void {
    this.acceptors.delete(webContentsId);
  }

  /**
   * Cleans up all listeners and acceptors associated with a destroyed WebContents.
   */
  private cleanupForWebContents(webContentsId: number): void {
    // This method needs to iterate through listeners to find all associated channels.
    // A reverse map (webContentsId -> Set<channelId>) would optimize this, but for now
    // a simple iteration is sufficient.
    for (const channelId of this.listeners.keys()) {
      if (channelId.startsWith(`ipc-channel:${webContentsId}:`)) {
        this.listeners.delete(channelId);
      }
    }
    this.acceptors.delete(webContentsId);
  }
}

/**
 * The singleton instance of the GlobalIpcRouter.
 */
export const ipcRouter = GlobalIpcRouter.getInstance();
