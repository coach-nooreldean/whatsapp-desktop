/*
 * IPC channels for Accounts, Multi-account sessions, and Sidebar actions.
 */
'use strict';

const { ipcMain, Menu, MenuItem } = require('electron');
const { DEFAULT_PALETTE } = require('../../accounts.js');

function registerAccountsIpc(ctx) {
  const {
    config,
    accountsMgr,
    privacyMgr,
    viewManager,
    dialogManager,
    getMainWindow,
    lockMgr,
  } = ctx;

  ipcMain.handle('sidebar:get-state', () => {
    return {
      accounts: accountsMgr.getAccounts(),
      activeId: viewManager.activeAccountId,
      theme: config.get('view.theme') || 'system',
      collapsed: viewManager.sidebarCollapsed,
      privacyActive: privacyMgr.isBlurred(),
      hasPasscode: lockMgr ? lockMgr.hasPasscode() : false,
    };
  });

  ipcMain.on('sidebar:toggle-privacy', () => ctx.togglePrivacy());
  ipcMain.on('sidebar:lock-app', () => ctx.lockApp());
  ipcMain.on('sidebar:open-settings', () => {
    if (dialogManager && dialogManager.openSettings) {
      dialogManager.openSettings();
    }
  });
  ipcMain.on('sidebar:switch-account', (event, id) => viewManager.switchToAccount(id, ctx.viewHandlers));

  ipcMain.handle('sidebar:remove-account', async (event, id) => {
    return viewManager.removeAccountSession(id, { confirm: true, window: getMainWindow() }, ctx.viewHandlers);
  });

  ipcMain.on('sidebar:context-menu', (event, id) => {
    const acc = accountsMgr.getAccount(id);
    if (!acc) return;
    const win = getMainWindow();
    const menu = new Menu();
    menu.append(new MenuItem({ label: acc.name, enabled: false }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Switch to this account / الانتقال لهذا الحساب',
      click: () => viewManager.switchToAccount(id, ctx.viewHandlers),
    }));
    if (id !== 'default') {
      menu.append(new MenuItem({
        label: 'Remove Account / حذف الحساب',
        click: () => viewManager.removeAccountSession(id, { confirm: true, window: win }, ctx.viewHandlers),
      }));
    }
    menu.popup({ window: win });
  });

  ipcMain.on('sidebar:set-collapsed', (event, collapsed) => {
    viewManager.sidebarCollapsed = !!collapsed;
    config.set('view.sidebar-collapsed', viewManager.sidebarCollapsed);
    config.save();
    viewManager.updateLayout();
    if (viewManager.sidebarView && !viewManager.sidebarView.webContents.isDestroyed()) {
      viewManager.sidebarView.webContents.send('sidebar:collapsed-changed', viewManager.sidebarCollapsed);
    }
  });

  ipcMain.on('sidebar:open-add-dialog', () => dialogManager.openAddAccountWindow());

  ipcMain.handle('accounts:get', () => accountsMgr.getAccounts());
  ipcMain.handle('accounts:get-active', () => viewManager.activeAccountId);
  ipcMain.handle('accounts:get-palette', () => DEFAULT_PALETTE);
  ipcMain.handle('accounts:switch', async (event, id) => {
    viewManager.switchToAccount(id, ctx.viewHandlers);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    return true;
  });
  ipcMain.handle('accounts:add', async (event, data) => viewManager.addAccountSession(data, ctx.viewHandlers));
  ipcMain.handle('accounts:remove', async (event, id) => {
    return viewManager.removeAccountSession(id, { confirm: true, window: dialogManager.settingsWin || getMainWindow() }, ctx.viewHandlers);
  });
}

module.exports = {
  registerAccountsIpc,
};
