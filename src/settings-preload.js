'use strict';

/* The bridge for the client's own windows -- Settings and Fonts. One preload
   for both: they ask the same client the same questions, and `close` shuts
   whichever of them asked, so neither needs a channel of its own. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: theme => ipcRenderer.invoke('settings:set-theme', theme),
  setAutostart: enable => ipcRenderer.invoke('settings:set-autostart', enable),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  close: () => ipcRenderer.send('settings:close'),
  /* Only the Fonts window asks for this, and only when the client has said a
     restart would finish what it started -- see changeSetting in main.js. */
  restart: () => ipcRenderer.send('settings:restart'),
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  getActiveAccountId: () => ipcRenderer.invoke('accounts:get-active'),
  getPalette: () => ipcRenderer.invoke('accounts:get-palette'),
  switchAccount: id => ipcRenderer.invoke('accounts:switch', id),
  addAccount: data => ipcRenderer.invoke('accounts:add', data),
  removeAccount: id => ipcRenderer.invoke('accounts:remove', id),
  setPasscode: pin => ipcRenderer.invoke('lock:set-passcode', pin),
  removePasscode: currentPin => ipcRenderer.invoke('lock:remove-passcode', currentPin),
  getLockStatus: () => ipcRenderer.invoke('lock:get-status'),
  onSettingsChanged: callback => {
    ipcRenderer.on('settings:changed', (_, data) => callback(data));
  },
});
