
/**
 * This preload script serves as the entry point for renderer-side utilities.
 *
 * Its primary export, `createAdapter`, is a factory function used by the
 * renderer process to create a communication channel (an IpcShape adapter)
 * for a specific namespace.
 *
 * Note: For this to work as intended, the renderer process must be configured
 * to be able to execute this script and access its exports. In a full sandbox
 * with contextIsolation, a contextBridge would be required to expose this
 * functionality securely. This implementation follows the original, simpler design.
 */
export { createAdapter } from './transport/ipc-adapter.js';