'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getInitialState: () => ipcRenderer.invoke('sidebar:get-state'),
  switchAccount: id => ipcRenderer.send('sidebar:switch-account', id),
  removeAccount: id => ipcRenderer.invoke('sidebar:remove-account', id),
  showContextMenu: id => ipcRenderer.send('sidebar:context-menu', id),
  openAddModal: () => ipcRenderer.send('sidebar:open-add-dialog'),
  setCollapsed: collapsed => ipcRenderer.send('sidebar:set-collapsed', collapsed),
  togglePrivacy: () => ipcRenderer.send('sidebar:toggle-privacy'),
  lockApp: () => ipcRenderer.send('sidebar:lock-app'),
  openSettings: () => ipcRenderer.send('sidebar:open-settings'),
  openFonts: () => ipcRenderer.send('sidebar:open-fonts'),
  openAbout: () => ipcRenderer.send('sidebar:open-about'),
  onStateChange: callback => {
    ipcRenderer.on('sidebar:state-changed', (event, state) => callback(state));
  },
  onCollapsedChange: callback => {
    ipcRenderer.on('sidebar:collapsed-changed', (event, collapsed) => callback(collapsed));
  },
});
