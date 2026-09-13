/*
 * Multi-account WebContentsView lifecycle, sidebar management, and view layout.
 *
 * Modularized into:
 *   - src/core/views/sidebar.js: SidebarController for the accounts sidebar WebContentsView
 *   - src/core/views/account-views.js: Account WebContentsView creation and navigation wiring
 */
'use strict';

const { dialog, session } = require('electron');
const { SidebarController } = require('./views/sidebar.js');
const { createAccountWebContentsView, WHATSAPP_URL } = require('./views/account-views.js');

const TITLE = 'WhatsApp';

class ViewManager {
  constructor({ config, accountsMgr, privacyMgr, uiFont, configureSession, getMainWindow }) {
    this.config = config;
    this.accountsMgr = accountsMgr;
    this.privacyMgr = privacyMgr;
    this.uiFont = uiFont;
    this.configureSession = configureSession;
    this.getMainWindow = getMainWindow;

    this.accountViews = new Map(); // id -> item
    this.activeAccountId = this.accountsMgr.getActiveId() || 'default';
    this.win = null;

    this.sidebar = new SidebarController({
      config,
      accountsMgr,
      privacyMgr,
      getMainWindow: () => this.getMainWindowInstance(),
    });
  }

  setWindow(win) {
    this.win = win;
    if (this.sidebar && typeof this.sidebar.setWindow === 'function') {
      this.sidebar.setWindow(win);
    }
    if (win && !win.isDestroyed() && win.contentView) {
      if (this.sidebar && this.sidebar.view && !win.contentView.children.includes(this.sidebar.view)) {
        win.contentView.addChildView(this.sidebar.view);
      }
      for (const [, item] of this.accountViews) {
        if (item.view && !win.contentView.children.includes(item.view)) {
          win.contentView.addChildView(item.view);
        }
      }
      this.updateLayout();
    }
  }

  getMainWindowInstance() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    if (typeof this.getMainWindow === 'function') {
      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) return win;
    }
    return null;
  }

  get sidebarView() {
    return this.sidebar.view;
  }

  set sidebarView(v) {
    this.sidebar.sidebarView = v;
  }

  get sidebarCollapsed() {
    return this.sidebar.isCollapsed;
  }

  set sidebarCollapsed(v) {
    this.sidebar.collapsed = !!v;
  }

  getActiveAccountView() {
    const item = this.accountViews.get(this.activeAccountId);
    return item ? item.view : null;
  }

  getActiveWebContents() {
    const view = this.getActiveAccountView();
    return view && !view.webContents.isDestroyed() ? view.webContents : null;
  }

  getAccountIdByWebContents(wc) {
    if (!wc) return 'default';
    for (const [id, item] of this.accountViews) {
      if (item.view && !item.view.webContents.isDestroyed() && item.view.webContents.id === wc.id) {
        return id;
      }
    }
    return 'default';
  }

  initSidebar(winPassed) {
    if (winPassed && !winPassed.isDestroyed()) {
      this.win = winPassed;
    }
    this.sidebar.init(winPassed || this.getMainWindowInstance());
  }

  updateLayout() {
    const win = this.getMainWindowInstance();
    if (!win || win.isDestroyed()) return;
    const bounds = win.getContentBounds();

    const sidebarWidth = this.sidebar.width;

    if (this.sidebar.view && !this.sidebar.view.webContents.isDestroyed()) {
      this.sidebar.view.setBounds({ x: 0, y: 0, width: sidebarWidth, height: bounds.height });
      this.sidebar.view.setVisible(true);
    }

    for (const [id, item] of this.accountViews) {
      if (item.view && !item.view.webContents.isDestroyed()) {
        if (id === this.activeAccountId) {
          item.view.setBounds({
            x: sidebarWidth,
            y: 0,
            width: Math.max(0, bounds.width - sidebarWidth),
            height: bounds.height,
          });
          item.view.setVisible(true);
        } else {
          item.view.setVisible(false);
        }
      }
    }
  }

  toggleSidebar() {
    this.sidebar.toggle(() => this.updateLayout());
  }

  notifySidebarState() {
    this.sidebar.notifyState(this.activeAccountId);
  }

  switchToAccount(id, { pushFocus, updateAggregateUnread } = {}) {
    if (!this.accountsMgr.getAccount(id)) return;
    this.activeAccountId = id;
    this.accountsMgr.setActiveId(id);
    this.accountsMgr.wakeAccount(id);
    this.updateLayout();
    if (pushFocus) pushFocus();
    this.notifySidebarState();

    const item = this.accountViews.get(id);
    const win = this.getMainWindowInstance();
    if (item && !item.view.webContents.isDestroyed()) {
      item.view.webContents.setBackgroundThrottling(false);
      item.view.webContents.focus();
      const title = item.view.webContents.getTitle();
      if (win && !win.isDestroyed()) win.setTitle(title && title.trim() ? title : TITLE);
    }
    if (updateAggregateUnread) updateAggregateUnread();
  }

  hibernateAccount(acc) {
    if (!acc || acc.id === this.activeAccountId) return;
    const item = this.accountViews.get(acc.id);
    if (item && item.view && !item.view.webContents.isDestroyed()) {
      item.view.webContents.setBackgroundThrottling(true);
      item.view.webContents.send('wa:on-screen', false);
      item.view.webContents.send('wa:focus', false);
      item.view.webContents.invalidate();
    }
  }

  createAccountView(account, handlers = {}) {
    if (this.accountViews.has(account.id)) return this.accountViews.get(account.id);

    const item = createAccountWebContentsView({
      account,
      config: this.config,
      uiFont: this.uiFont,
      configureSession: this.configureSession,
      privacyMgr: this.privacyMgr,
      handlers,
      activeAccountId: () => this.activeAccountId,
    });

    this.accountViews.set(account.id, item);

    const win = this.getMainWindowInstance();
    if (win && !win.isDestroyed() && win.contentView) {
      if (!win.contentView.children.includes(item.view)) {
        win.contentView.addChildView(item.view);
      }
      this.updateLayout();
    }

    return item;
  }

  async addAccountSession(data, handlers = {}) {
    const acc = this.accountsMgr.addAccount(data);
    this.createAccountView(acc, handlers);
    this.switchToAccount(acc.id, handlers);
    this.notifySidebarState();
    return acc;
  }

  async removeAccountSession(id, options = {}, handlers = {}) {
    if (id === 'default') return false;
    const acc = this.accountsMgr.getAccount(id);
    if (!acc) return false;

    const win = this.getMainWindowInstance();
    if (options.confirm) {
      const parentWin = options.window || win;
      const { response } = await dialog.showMessageBox(parentWin, {
        type: 'question',
        buttons: ['Cancel', 'Remove / حذف'],
        defaultId: 1,
        cancelId: 0,
        title: 'Remove Account / حذف الحساب',
        message: `Are you sure you want to remove account "${acc.name}"? This will log out this session.`,
      });
      if (response !== 1) return false;
    }

    if (this.activeAccountId === id) {
      this.switchToAccount('default', handlers);
    }

    const item = this.accountViews.get(id);
    if (item) {
      if (win && !win.isDestroyed() && win.contentView) {
        try {
          win.contentView.removeChildView(item.view);
        } catch (err) {
          console.warn('Failed to remove child view for account %s: %s', id, err.message);
        }
      }
      this.accountViews.delete(id);
    }

    try {
      const ses = session.fromPartition('persist:account_' + id);
      await ses.clearStorageData();
    } catch (err) {
      console.error('Failed to clear partition storage for account %s: %s', id, err.message);
    }

    this.accountsMgr.removeAccount(id);
    this.updateLayout();
    this.notifySidebarState();
    if (handlers.updateAggregateUnread) handlers.updateAggregateUnread();
    return true;
  }
}

module.exports = {
  ViewManager,
  WHATSAPP_URL,
  TITLE,
};
