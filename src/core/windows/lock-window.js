/*
 * Lock Screen overlay window creation and lifecycle.
 */
'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

function createLockWindow({ parentWin, onClosed }) {
  if (!parentWin || parentWin.isDestroyed()) return null;

  const bounds = parentWin.getBounds();
  const win = new BrowserWindow({
    parent: parentWin,
    modal: true,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    backgroundColor: '#111b21',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'lock-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', '..', 'lock.html'));
  win.on('closed', () => {
    if (typeof onClosed === 'function') onClosed();
  });

  return win;
}

module.exports = {
  createLockWindow,
};
