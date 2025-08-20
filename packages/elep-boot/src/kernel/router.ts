import { ECore } from "@eleplug/elep";
import {
  pin,
  PIN_FREE_KEY,
  PIN_ID_KEY,
  __pin_brand,
  rpc,
} from "@eleplug/erpc";

/**
 * Creates the erpc Router for the `__kernel` node.
 * The kernel is a special, privileged node that provides access to core
 * application functionalities that are too dangerous to expose directly.
 *
 * @param ecore - The main `ECore` instance to be securely exposed.
 * @returns A type-safe erpc Router that defines the kernel's API.
 */
export function createKernelRouter(ecore: ECore) {
  return {
    /**
     * Provides secure access to core Electron functionalities.
     *
     * @design
     * This procedure returns a `Pin<ECore>`, which is a remote proxy.
     * This prevents plugins from gaining direct access to the `ECore` object
     * or the underlying Electron `app` module, while still allowing them to
     * invoke its methods (like `createWindow`). Access to this procedure
     * should be restricted via the `ebus` group permission system to plugins
     * belonging to the 'kernel' group.
     *
     * @returns A `Pin<ECore>` object.
     */
    core: rpc.ask(() => pin(ecore)),
  };
}

/**
 * Infers the exact API type from the router factory function for use in
 * the PluginApiMap.
 */
export type KernelApi = ReturnType<typeof createKernelRouter>;
