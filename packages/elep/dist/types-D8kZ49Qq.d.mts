import { IpcRendererEvent } from 'electron';

/**
 * A utility type that recursively converts a complex type (like one from Electron)
 * into a plain JavaScript object, making it serializable.
 */
type Convert<T> = T extends (infer U)[] ? Convert<U>[] : T extends object ? {
    [K in keyof T]: Convert<T[K]>;
} : T;
/**
 * Defines the abstract shape of a namespaced IPC communicator.
 * This interface is the contract between the `ipc-adapter` and the `IpcRendererLink`,
 * allowing them to be decoupled.
 */
type IpcShape = {
    send: (data: string) => void;
    on: (callback: (event: IpcRendererEvent, message: string) => void) => void;
    off: (callback: (event: IpcRendererEvent, message: string) => void) => void;
};

export type { Convert as C, IpcShape as I };
