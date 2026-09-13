'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getInitialState: () => ipcRenderer.invoke('sidebar:get-state'),
  switchAccount: id => ipcRenderer.send('sidebar:switch-account', id),
  addAccount: data => ipcRenderer.invoke('sidebar:add-account', data),
  updateAccount: (id, data) => ipcRenderer.invoke('sidebar:update-account', { id, ...data }),
  removeAccount: id => ipcRenderer.invoke('sidebar:remove-account', id),
  showContextMenu: id => ipcRenderer.send('sidebar:context-menu', id),
  openAddModal: () => ipcRenderer.send('sidebar:open-add-dialog'),
  setCollapsed: collapsed => ipcRenderer.send('sidebar:set-collapsed', collapsed),
  onStateChange: callback => {
    ipcRenderer.on('sidebar:state-changed', (event, state) => callback(state));
  },
  onOpenAddModal: callback => {
    ipcRenderer.on('sidebar:open-add-modal', () => callback());
  },
  onCollapsedChange: callback => {
    ipcRenderer.on('sidebar:collapsed-changed', (event, collapsed) => callback(collapsed));
  },
});
