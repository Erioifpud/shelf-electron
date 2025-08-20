import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// A type-safe reference for the listener map.
type IpcListener = (payload: string) => void;

/**
 * The API exposed to the renderer process via the context bridge.
 * It provides the necessary functions to establish and maintain a sandboxed
 * communication link with the main process.
 */
interface ElepIpcApi {
  /**
   * Initiates a handshake with the main process to obtain a unique channel ID
   * for this window's primary service transport.
   * This method is idempotent; subsequent calls within the same page load
   * will return the same Promise.
   * @returns A Promise that resolves with the unique channel ID string.
   */
  openTransport: () => Promise<string>;

  /**
   * The low-level transport object for sending and receiving messages.
   */
  transports: {
    /**
     * Sends a payload to the main process on a specific channel.
     * @param channelId The target channel ID.
     * @param payload The stringified message payload.
     */
    send: (channelId: string, payload: string) => void;
    /**
     * Registers a listener for messages arriving on a specific channel.
     * @param channelId The channel ID to listen on.
     * @param listener The callback function to execute with the message payload.
     */
    on: (channelId: string, listener: IpcListener) => void;
    /**
     * Removes a previously registered listener from a channel.
     * @param channelId The channel ID to stop listening on.
     * @param listener The original callback function to remove.
     */
    off: (channelId: string, listener: IpcListener) => void;
  };
}

// --- Implementation ---

// A promise cache to ensure the handshake is only performed once per page load.
let channelIdPromise: Promise<string> | null = null;

// A map to store the actual Electron IPC listeners, allowing us to correctly
// remove them later when `off` is called.
const listenerMap = new Map<IpcListener, (event: IpcRendererEvent, ...args: any[]) => void>();

const api: ElepIpcApi = {
  openTransport: (): Promise<string> => {
    if (channelIdPromise) {
      return channelIdPromise;
    }
    // Invoke the global handshake handler in the main process. The router will
    // identify this specific window via `event.sender` and route the request
    // to the correct EWindow's acceptor.
    channelIdPromise = ipcRenderer.invoke('elep-handshake');
    return channelIdPromise;
  },

  transports: {
    send: (channelId: string, payload: string): void => {
      // All messages are sent over the single, global 'elep-ipc-message' channel,
      // prefixed with their specific channelId for routing by the GlobalIpcRouter.
      ipcRenderer.send('elep-ipc-message', channelId, payload);
    },

    on: (channelId: string, listener: IpcListener): void => {
      // We create a wrapper listener to filter messages by channelId.
      const ipcListener = (
        _event: IpcRendererEvent,
        receivedChannelId: string,
        payload: string,
      ) => {
        if (receivedChannelId === channelId) {
          listener(payload);
        }
      };
      // Store the wrapper so we can find it during `off()`.
      listenerMap.set(listener, ipcListener);
      ipcRenderer.on('elep-ipc-message', ipcListener);
    },

    off: (channelId: string, listener: IpcListener): void => {
      const ipcListener = listenerMap.get(listener);
      if (ipcListener) {
        ipcRenderer.off('elep-ipc-message', ipcListener);
        listenerMap.delete(listener);
      }
    },
  },
};

// Securely expose the API to the renderer process.
contextBridge.exposeInMainWorld('__elep_ipc__', api);