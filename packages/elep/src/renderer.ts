import {
  IpcRendererLink,
  type IpcRendererAdapter,
} from "./transport/ipc-renderer-link.js";
import { createDuplexTransport } from "@eleplug/muxen";
import {
  createClient,
  type Api,
  type Client,
  type Transferable,
  type TransferableArray,
} from "@eleplug/erpc";

// Type definition for the API exposed by the preload script.
interface PreloadIpcApi {
  openTransport: () => Promise<string>;
  transports: IpcRendererAdapter;
}

// Access the API exposed on the window object by the preload script.
const ipcProvider: PreloadIpcApi = (window as any).__elep_ipc__;
if (!ipcProvider) {
  throw new Error(
    "Elep preload script was not loaded or context bridge failed. Ensure `contextIsolation` is enabled and the preload script is correctly configured in your window options."
  );
}

// A promise cache to ensure the erpc client is created only once per page load.
let serviceClientPromise: Promise<any> | null = null;

/**
 * Establishes a connection to the plugin's main process service and returns
 * a type-safe erpc client.
 *
 * @returns A promise that resolves to the erpc client for the service defined
 *          in `createWindow`.
 */
export async function getService<
  TApi extends Api<void, TransferableArray, Transferable>,
>(): Promise<Client<TApi>> {
  if (!serviceClientPromise) {
    serviceClientPromise = (async () => {
      // 1. Initiate the handshake via the preload script to get the unique channel ID.
      const channelId = await ipcProvider.openTransport();

      // 2. Create the renderer-side link using the channel ID and the transport
      //    adapter provided by the preload script.
      const link = new IpcRendererLink(channelId, ipcProvider.transports);

      // 3. Build the full duplex transport on top of the link.
      const transport = createDuplexTransport(link);

      // 4. Create the erpc client.
      const client = await createClient(transport);
      return client.procedure;
    })();
  }
  return serviceClientPromise;
}

// --- Re-exporting other relevant modules for the renderer ---

export { IpcRendererLink };
export type { Convert } from "./types.js";
export type { ECore } from "./core/ecore.js";
export type { EWindow } from "./core/ewindow.js";
export type { EWindowOptions } from "./core/ewindow-options.js";

export * from "@eleplug/anvil";
export * from "@eleplug/ebus";
export * from "@eleplug/erpc";
export * from "@eleplug/esys";
export * from "@eleplug/muxen";
export * from "@eleplug/transport";
