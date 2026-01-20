const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer
contextBridge.exposeInMainWorld('chatguardDesktop', {
  // Keystore operations
  keystore: {
    store: (keyId, key) => ipcRenderer.invoke('keystore:store', keyId, key),
    retrieve: (keyId) => ipcRenderer.invoke('keystore:retrieve', keyId),
    delete: (keyId) => ipcRenderer.invoke('keystore:delete', keyId),
  },

  // Platform info
  platform: process.platform,
  isDesktop: true,

  // App info
  getVersion: () => require('../../package.json').version,
});
