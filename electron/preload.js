// Preload script - Bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  toggleAlwaysOnTop: (enabled) => ipcRenderer.invoke('toggle-always-on-top', enabled),
});

console.log('✅ Preload script loaded');
