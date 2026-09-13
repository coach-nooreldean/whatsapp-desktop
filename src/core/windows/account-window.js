/*
 * Add-Account modal dialog creation and lifecycle.
 */
'use strict';

const { BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');

function createAddAccountWindow({ appIcon, uiFont, parentWin, onClosed }) {
  const isDark = !!(nativeTheme && nativeTheme.shouldUseDarkColors);
  const settingsFont = uiFont();

  const win = new BrowserWindow({
    width: 400,
    height: 300,
    parent: parentWin && !parentWin.isDestroyed() ? parentWin : null,
    modal: true,
    center: true,
    resizable: false,
    frame: false,
    title: 'إضافة حساب واتساب / Add WhatsApp Account',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontFamily: {
        standard: settingsFont,
        sansSerif: settingsFont,
        serif: settingsFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', '..', 'add-account.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('closed', () => {
    if (typeof onClosed === 'function') onClosed();
  });

  return win;
}

module.exports = {
  createAddAccountWindow,
};
