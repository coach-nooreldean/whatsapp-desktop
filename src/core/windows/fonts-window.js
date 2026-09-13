/*
 * Fonts and Typography configuration window creation and lifecycle.
 */
'use strict';

const { BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const { clampToScreen } = require('../window-state.js');

function createFontsWindow({ appIcon, uiFont, onClosed }) {
  const isDark = !!(nativeTheme && nativeTheme.shouldUseDarkColors);
  const panel = clampToScreen(560, 720);
  const settingsFont = uiFont();

  const win = new BrowserWindow({
    width: panel.width,
    height: panel.height,
    center: true,
    resizable: false,
    frame: false,
    title: 'WhatsApp Fonts',
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
  win.loadFile(path.join(__dirname, '..', '..', 'fonts.html'));

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
  createFontsWindow,
};
