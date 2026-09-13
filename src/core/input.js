/*
 * Keyboard shortcuts and popup input event handling.
 */
'use strict';

const { handleShortcut, isKeyMatch } = require('./shortcuts.js');

function adjustZoom(viewMgr, config, delta) {
  const activeWc = viewMgr.getActiveWebContents();
  const currentZoom = activeWc ? activeWc.getZoomFactor() : 1;
  const newZoom = delta === 0 ? 1 : Math.max(0.3, Math.min(3, currentZoom + delta));

  config.set('view.zoom', newZoom);
  for (const [, item] of viewMgr.accountViews) {
    if (item.view && !item.view.webContents.isDestroyed()) {
      item.view.webContents.setZoomFactor(newZoom);
    }
  }
}

function createKeyHandler(options) {
  const {
    getMainWindow,
    viewMgr,
    accountsMgr,
    dialogMgr,
    config,
    actions,
    quit,
    getViewHandlers,
  } = options;

  return function onKey(event, input) {
    const win = getMainWindow();
    if (input.type !== 'keyDown' || !win) return;

    handleShortcut(event, input, {
      quit: () => quit(),
      closeWindow: () => win.close(),
      reload: () => {
        const activeWc = viewMgr.getActiveWebContents();
        if (activeWc) activeWc.reload();
      },
      toggleDevTools: () => {
        const activeWc = viewMgr.getActiveWebContents();
        if (activeWc) activeWc.toggleDevTools();
      },
      openSettings: () => dialogMgr.openSettings(),
      openCommandPalette: () => actions.toggleCommandPalette(),
      switchAccountByIndex: idx => {
        const accounts = accountsMgr.getAccounts();
        if (idx >= 0 && idx < accounts.length) {
          viewMgr.switchToAccount(accounts[idx].id, getViewHandlers());
        }
      },
      openAddAccount: () => dialogMgr.openAddAccountWindow(),
      toggleSidebar: () => viewMgr.toggleSidebar(),
      togglePrivacy: () => actions.togglePrivacy(),
      lockApp: () => actions.lockApp(),
      zoomIn: () => adjustZoom(viewMgr, config, 0.1),
      zoomOut: () => adjustZoom(viewMgr, config, -0.1),
      zoomReset: () => adjustZoom(viewMgr, config, 0),
    });
  };
}

function onPopupKey(popup, event, input, quit) {
  if (input.type !== 'keyDown' || popup.isDestroyed()) return;
  const ctrl = !!(input.control || input.meta);

  if (ctrl && !input.alt && !input.shift && isKeyMatch(input, 'q', 'ض')) {
    event.preventDefault();
    if (typeof quit === 'function') quit();
    return;
  }
  if (ctrl && !input.alt && !input.shift && isKeyMatch(input, 'w', 'ص')) {
    event.preventDefault();
    popup.close();
    return;
  }
  if (ctrl && !input.alt && input.shift && isKeyMatch(input, 'i', 'ه')) {
    event.preventDefault();
    popup.webContents.toggleDevTools();
  }
}

module.exports = {
  createKeyHandler,
  onPopupKey,
  adjustZoom,
};
