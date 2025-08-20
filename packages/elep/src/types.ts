/**
 * A utility type that recursively converts a complex type (like one from Electron)
 * into a plain JavaScript object, making it serializable.
 */
export type Convert<T> = T extends (infer U)[]
  ? Convert<U>[]
  : T extends object
    ? { [K in keyof T]: Convert<T[K]> }
    : T;

/**
 * Defines the abstract shape of the namespaced IPC communicator exposed by the preload script.
 * This is the contract between the renderer process (`IpcRendererLink`) and the secure
 * preload environment.
 */
export interface IpcRendererAdapter {
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
  on: (channelId: string, listener: (payload: string) => void) => void;
  
  /**
   * Removes a previously registered listener from a channel.
   * @param channelId The channel ID to stop listening on.
   * @param listener The original callback function to remove.
   */
  off: (channelId: string, listener: (payload: string) => void) => void;
}