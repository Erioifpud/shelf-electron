// src/transport/ipc-renderer-link.ts
import mimic from "@eleplug/mimic";
import { AsyncEventEmitter } from "@eleplug/transport";
var IpcRendererLink = class {
  /**
   * @param ipc The `IpcShape` adapter, created by `createAdapter` from the
   *            preload script, which provides namespaced communication methods.
   */
  constructor(ipc) {
    this.ipc = ipc;
    this.messageListener = (_event, message) => {
      this.events.emit("message", mimic.parse(message));
    };
    this.ipc.on(this.messageListener);
  }
  events = new AsyncEventEmitter();
  isClosed = false;
  // A reference to the listener function for proper removal.
  messageListener;
  onMessage(handler) {
    this.events.on("message", handler);
  }
  sendMessage(packet) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link is closed.`));
    }
    this.ipc.send(mimic.stringify(packet));
    return Promise.resolve();
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    return this.internalClose();
  }
  abort(reason) {
    return this.internalClose(reason);
  }
  internalClose(reason) {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;
    this.ipc.off(this.messageListener);
    this.events.emit("close", reason);
    this.events.removeAllListeners();
    return Promise.resolve();
  }
};

export {
  IpcRendererLink
};
