/*
 * About dialog creation and lifecycle.
 */
'use strict';

const { BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const { clampToScreen } = require('../window-state.js');

function createAboutWindow({ appIcon, uiFont, onClosed }) {
  const isDark = !!(nativeTheme && nativeTheme.shouldUseDarkColors);
  const panel = clampToScreen(430, 610);
  const aboutFont = uiFont();

  const win = new BrowserWindow({
    width: panel.width,
    height: panel.height,
    center: true,
    resizable: false,
    frame: false,
    title: 'About WhatsApp',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'about-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontFamily: {
        standard: aboutFont,
        sansSerif: aboutFont,
        serif: aboutFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', '..', 'about.html'));

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
  createAboutWindow,
};
