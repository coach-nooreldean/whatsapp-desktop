/*
 * IPC channels for About dialog and application version/update information.
 */
'use strict';

const { ipcMain } = require('electron');

function registerAboutIpc(ctx) {
  const {
    app,
    config,
    dialogManager,
    uiFont,
    manifest,
    APP_ID,
    TITLE,
  } = ctx;

  ipcMain.handle('about:get', () => {
    const checkNow = dialogManager.aboutShouldCheck ||
      Date.now() - dialogManager.lastUpdateAt > (10 * 60 * 1000);
    dialogManager.aboutShouldCheck = false;
    return {
      name: TITLE,
      version: dialogManager.getCurrentVersion(app),
      icon: `../data/icons/128/apps/${APP_ID}.png`,
      license: manifest.license,
      author: String(manifest.author || '').replace(/\s*<[^>]*>/, ''),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      theme: config.get('view.theme') || 'system',
      font: uiFont(config),
      update: dialogManager.lastUpdate,
      checkNow,
    };
  });

  ipcMain.handle('about:check-update', () => new Promise(resolve => {
    dialogManager.checkForUpdates(app, ctx.getTray(), resolve);
  }));

  ipcMain.on('about:open', (_, where) => dialogManager.openSite(where));

  ipcMain.on('about:close', () => {
    if (dialogManager.aboutWin && !dialogManager.aboutWin.isDestroyed()) {
      dialogManager.aboutWin.close();
    }
  });
}

module.exports = {
  registerAboutIpc,
};
