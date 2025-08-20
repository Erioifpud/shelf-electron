// --- Core Elep Classes & Types (Main Application Logic) ---
export { ECore } from "./core/ecore.js";
export { EWindow } from "./core/ewindow.js";
export type { EWindowOptions } from "./core/ewindow-options.js";
export { FileContainer } from "./container/file-container.js";
export { IpcLink } from "./transport/ipc-link.js";
export { IpcRendererLink } from "./transport/ipc-renderer-link.js";
export type { Convert } from "./types.js";

// --- New Configuration Helpers and Types ---
export { defineProdConfig, defineDevConfig } from "./container/config-types.js";
export type { ElepConfig, DevConfig } from "./container/config-types.js";

// --- From @eleplug/anvil (Plugin Definition Contract) ---
export * from "@eleplug/anvil";

// --- From @eleplug/esys (System Orchestration & Plugin Management) ---
export * from "@eleplug/esys";

// --- From @eleplug/ebus (Event Bus & Communication Patterns) ---
import {
  type Api,
  createServer,
  pin,
  type Pin,
  type Transport,
  type Client,
} from "@eleplug/erpc";
import type {
  BusContext,
  ECore,
  EWindow,
  EWindowOptions,
  TransferableArray,
} from "./renderer.js";
export * from "@eleplug/ebus";

// --- From @eleplug/erpc (Core RPC Framework) ---
export * from "@eleplug/erpc";

// --- From @eleplug/plexus (Dependency Resolution Engine) ---
export * from "@eleplug/plexus";

// --- From @eleplug/muxen (Transport Multiplexing) ---
export * from "@eleplug/muxen";

/**
 * Creates a new application window and sets up a service to handle connections from it.
 * This is the primary API for plugins to create user interfaces.
 *
 * @param node The EBUS Node instance of the calling plugin.
 * @param options Configuration for the window, including the `service` API to expose.
 * @returns A promise that resolves to a `Pin<EWindow>`, a remote proxy to the created window,
 *          which can be used for actions like `loadURL` or `close`.
 */
export async function openWindow<
  TApi extends Api<BusContext, TransferableArray, Transferable>,
>(
  core: Pin<ECore>,
  options: EWindowOptions,
  service?: TApi
): Promise<Pin<EWindow>> {
  // 1. Ask the kernel to create the physical window and its EWindow wrapper.
  const eWindowProxy = await core.createWindow(options);

  // 2. Define the handler that will be executed in the main process every time
  //    the renderer in this new window requests a connection.
  const connectionHandler = (transport: Transport) => {
    // For each new connection, create a dedicated erpc server instance.
    createServer(transport, service ?? {});
  };

  // 3. Register this handler with the EWindow instance. The `pin` function from
  //    erpc makes our local `connectionHandler` function remotely callable by the
  //    EWindow object living in the kernel's context.
  await eWindowProxy.accept(pin(connectionHandler));

  // 4. Return the window proxy to the plugin, allowing further interaction.
  return eWindowProxy;
}
