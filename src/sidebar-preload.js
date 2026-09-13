'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getInitialState: () => ipcRenderer.invoke('sidebar:get-state'),
  switchAccount: id => ipcRenderer.send('sidebar:switch-account', id),
  removeAccount: id => ipcRenderer.invoke('sidebar:remove-account', id),
  showContextMenu: id => ipcRenderer.send('sidebar:context-menu', id),
  openAddModal: () => ipcRenderer.send('sidebar:open-add-dialog'),
  setCollapsed: collapsed => ipcRenderer.send('sidebar:set-collapsed', collapsed),
  onStateChange: callback => {
    ipcRenderer.on('sidebar:state-changed', (event, state) => callback(state));
  },
  onCollapsedChange: callback => {
    ipcRenderer.on('sidebar:collapsed-changed', (event, collapsed) => callback(collapsed));
  },
});
