/*
 * Multi-account vertical sidebar WebContentsView controller.
 */
'use strict';

const { WebContentsView } = require('electron');
const path = require('path');

class SidebarController {
  constructor({ config, accountsMgr, privacyMgr, getMainWindow }) {
    this.config = config;
    this.accountsMgr = accountsMgr;
    this.privacyMgr = privacyMgr;
    this.getMainWindow = getMainWindow;
    this.sidebarView = null;
    this.collapsed = this.config.get('view.sidebar-collapsed') === true;
  }

  get isCollapsed() {
    return this.collapsed;
  }

  get width() {
    return this.collapsed ? 14 : 56;
  }

  get view() {
    return this.sidebarView;
  }

  init() {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;

    this.sidebarView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'sidebar-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    win.contentView.addChildView(this.sidebarView);
    this.sidebarView.webContents.loadFile(path.join(__dirname, '..', '..', 'sidebar.html'));
  }

  toggle(onLayoutUpdate) {
    this.collapsed = !this.collapsed;
    this.config.set('view.sidebar-collapsed', this.collapsed);
    this.config.save();
    if (typeof onLayoutUpdate === 'function') onLayoutUpdate();
    if (this.sidebarView && !this.sidebarView.webContents.isDestroyed()) {
      this.sidebarView.webContents.send('sidebar:collapsed-changed', this.collapsed);
    }
  }

  notifyState(activeAccountId) {
    if (this.sidebarView && !this.sidebarView.webContents.isDestroyed()) {
      this.sidebarView.webContents.send('sidebar:state-changed', {
        accounts: this.accountsMgr.getAccounts(),
        activeId: activeAccountId,
        theme: this.config.get('view.theme') || 'system',
        collapsed: this.collapsed,
        privacyActive: this.privacyMgr.isBlurred(),
      });
      this.sidebarView.webContents.send('sidebar:collapsed-changed', this.collapsed);
    }
  }
}

module.exports = {
  SidebarController,
};
