// src/transport/ipc-adapter.ts
function createAdapter(channel, ipcRenderer) {
  return {
    send: (data) => {
      ipcRenderer.send(channel, data);
    },
    on: (callback) => {
      ipcRenderer.on(channel, callback);
    },
    off: (callback) => {
      ipcRenderer.off(channel, callback);
    }
  };
}
export {
  createAdapter
};
