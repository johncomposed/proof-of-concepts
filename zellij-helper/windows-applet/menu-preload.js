'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuApi', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  action: (type, payload) => ipcRenderer.invoke('menu-action', { type, ...(payload || {}) }),
  reportHeight: (h) => ipcRenderer.send('menu-height', h),
});
