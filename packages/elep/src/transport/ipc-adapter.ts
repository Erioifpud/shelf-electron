import type { IpcRenderer, IpcRendererEvent } from "electron";
import type { IpcShape } from "../types.js";

/**
 * Creates a namespaced adapter for Electron's `ipcRenderer`.
 * This factory function is the core of the preload script's functionality.
 * It takes a specific channel name (namespace) and returns an object
 * that conforms to the `IpcShape` interface. This allows the renderer-side
 * `IpcRendererLink` to communicate on a dedicated channel without needing to
 * know the channel name itself, which is a good separation of concerns.
 *
 * @param channel The specific IPC channel (namespace) this adapter will operate on.
 * @param ipcRenderer A reference to Electron's `ipcRenderer` module.
 * @returns An `IpcShape` object with `send`, `on`, and `off` methods bound to the specified channel.
 */
export function createAdapter(
  channel: string,
  ipcRenderer: IpcRenderer
): IpcShape {
  return {
    send: (data: string) => {
      ipcRenderer.send(channel, data);
    },
    on: (callback: (event: IpcRendererEvent, message: string) => void) => {
      ipcRenderer.on(channel, callback);
    },
    off: (callback: (event: IpcRendererEvent, message: string) => void) => {
      ipcRenderer.off(channel, callback);
    },
  };
}
