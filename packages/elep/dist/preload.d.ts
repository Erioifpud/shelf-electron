import { IpcRenderer } from 'electron';
import { I as IpcShape } from './types-D8kZ49Qq.js';

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
declare function createAdapter(channel: string, ipcRenderer: IpcRenderer): IpcShape;

export { createAdapter };
