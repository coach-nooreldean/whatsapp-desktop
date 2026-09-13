/*
 * Preload bridge for Command Palette (src/palette.html).
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onInit: callback => {
    ipcRenderer.on('palette:init', (_, data) => callback(data));
  },
  onTheme: callback => {
    ipcRenderer.on('palette:theme', (_, theme) => callback(theme));
  },
  executeAction: actionId => {
    ipcRenderer.send('palette:execute', actionId);
  },
  close: () => {
    ipcRenderer.send('palette:close');
  },
});
