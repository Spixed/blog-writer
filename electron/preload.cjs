const { contextBridge, ipcRenderer } = require('electron');

// Keep the sandboxed bridge minimal: filesystem access stays in the main
// process and the renderer only receives a selected directory path.
contextBridge.exposeInMainWorld('blogWriter', {
  chooseDirectory: () => ipcRenderer.invoke('blog-writer:choose-directory'),
});
