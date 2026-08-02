'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zjc', {
  createSession: (opts) => ipcRenderer.invoke('create-session', opts),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});
