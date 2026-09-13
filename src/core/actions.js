/*
 * Application action bridge coordinating views, privacy, security, palette,
 * and viewHandlers integration.
 */
'use strict';

const fs = require('fs');
const { dialog, shell } = require('electron');
const { CUSTOM_CSS_PATH } = require('../config.js');
const { PaletteManager } = require('./palette.js');
const { clearAllCaches } = require('./session.js');
const { toggleCallMute } = require('./global-shortcuts.js');
const coreMenu = require('./menu.js');
const debug = require('../debug.js');
const links = require('../links.js');

function applyPrivacyState(viewMgr, privacyMgr) {
  const script = privacyMgr.getInjectScript();
  for (const [, item] of viewMgr.accountViews) {
    if (item.view && !item.view.webContents.isDestroyed()) {
      item.view.webContents.executeJavaScript(script).catch(() => {});
    }
  }
  viewMgr.notifySidebarState();
}

function togglePrivacy(viewMgr, privacyMgr) {
  privacyMgr.toggleStealth();
  applyPrivacyState(viewMgr, privacyMgr);
}

function lockApp(lockMgr, dialogMgr) {
  if (!lockMgr.isEnabled()) return;
  lockMgr.lock();
  dialogMgr.showLockWindow();
}

function focusChatSearch(viewMgr) {
  const activeItem = viewMgr.accountViews.get(viewMgr.activeAccountId);
  if (activeItem && activeItem.view && !activeItem.view.webContents.isDestroyed()) {
    activeItem.view.webContents.focus();
    activeItem.view.webContents.executeJavaScript(`(() => {
      const searchBox = document.querySelector('#side [role="textbox"]') ||
                        document.querySelector('#side div[contenteditable="true"]') ||
                        document.querySelector('[data-testid="chat-list-search"]') ||
                        document.querySelector('div[contenteditable="true"][data-tab="3"]');
      if (searchBox) {
        searchBox.focus();
        searchBox.click();
      }
    })()`).catch(() => {});
  }
}

function pushFocus(options) {
  const { windowStateMgr, privacyMgr, lockMgr, viewMgr, notificationCoord } = options;
  windowStateMgr.pushFocus({
    privacyMgr,
    applyPrivacyState: () => applyPrivacyState(viewMgr, privacyMgr),
    lockMgr,
    accountViews: viewMgr.accountViews,
    activeAccountId: viewMgr.activeAccountId,
    withdrawOpen: () => notificationCoord.withdrawOpen(),
    withdrawRinging: () => notificationCoord.withdrawRinging(),
  });
}

function showContextMenu(contents, params) {
  coreMenu.showContextMenu(contents, params, debug.trace);
}

class CommandPaletteController {
  constructor(options) {
    this.options = options;
    this.paletteMgr = null;
  }

  getManager() {
    return this.paletteMgr;
  }

  setTheme(theme) {
    if (this.paletteMgr) {
      this.paletteMgr.setTheme(theme);
    }
  }

  toggle() {
    if (!this.paletteMgr) {
      const {
        getMainWindow,
        accountsMgr,
        viewMgr,
        dialogMgr,
        styleMgr,
        config,
        uiFont,
        privacyMgr,
        lockMgr,
        getViewHandlers,
      } = this.options;

      this.paletteMgr = new PaletteManager({
        getParentWindow: getMainWindow,
        accountsMgr,
        actions: {
          focusChatSearch: () => focusChatSearch(viewMgr),
          togglePrivacy: () => togglePrivacy(viewMgr, privacyMgr),
          lockApp: () => lockApp(lockMgr, dialogMgr),
          toggleSidebar: () => viewMgr.toggleSidebar(),
          openSettings: () => dialogMgr.openSettings(),
          openFonts: () => dialogMgr.openFonts(),
          reload: () => {
            const activeWc = viewMgr.getActiveWebContents();
            if (activeWc) activeWc.reload();
          },
          clearCache: async () => {
            await clearAllCaches(viewMgr.accountViews);
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Cache Cleared',
                message: 'WhatsApp Desktop temporary cache was successfully cleared. Your login sessions were kept safe.',
              }).catch(() => {});
            }
          },
          openCustomCss: async () => {
            if (!fs.existsSync(CUSTOM_CSS_PATH)) styleMgr.initCustomCssWatcher();
            await shell.openPath(CUSTOM_CSS_PATH);
          },
          toggleCallMute: () => toggleCallMute(viewMgr),
          switchAccount: id => viewMgr.switchToAccount(id, getViewHandlers()),
        },
        theme: config.get('view.theme') || 'system',
        uiFont: uiFont(config),
      });
    }
    this.paletteMgr.toggle();
  }
}

function createViewHandlers(options) {
  const {
    dialogMgr,
    actions,
    styleMgr,
    notificationCoord,
    deepLinkMgr,
    onKey,
    onPopupKey,
    isOwnPage,
    isWhatsApp,
  } = options;

  return {
    openSettings: () => dialogMgr.openSettings(),
    onKey,
    drawStyleForView: item => styleMgr.drawStyleForView(item),
    pushFocus: () => actions.pushFocus(),
    onAccountTitle: (accId, title) => notificationCoord.onAccountTitle(accId, title),
    isOwnPage,
    openExternally: url => deepLinkMgr.openExternally(url),
    popupOptions: features => dialogMgr.popupOptions(features),
    adoptPopup: popup => dialogMgr.adoptPopup(popup, {
      showContextMenu,
      styleSheet: () => styleMgr.styleSheet(),
      onPopupKey,
      openExternally: url => deepLinkMgr.openExternally(url),
      isWhatsApp,
    }),
    showContextMenu,
    onWillNavigate: (event, url) => {
      const link = isOwnPage(url) ? null : links.from(url);
      if (link) {
        event.preventDefault();
        deepLinkMgr.openLink(link, 'a link in the page');
        return;
      }
      if (isWhatsApp(url)) return;
      event.preventDefault();
      deepLinkMgr.openExternally(url);
    },
    onActiveAccountLoaded: (item, view) => {
      notificationCoord.setLoadedAt(item.loadedAt);
      deepLinkMgr.setLoadedAt(item.loadedAt);
      if (deepLinkMgr.pendingChat) {
        view.webContents.send('wa:open-link', {
          phone: deepLinkMgr.pendingChat.phone,
          wantsText: !!deepLinkMgr.pendingChat.text,
        });
        deepLinkMgr.pendingChat = null;
      }
      if (deepLinkMgr.pendingInvite) {
        view.webContents.send('wa:open-invite', { code: deepLinkMgr.pendingInvite });
        deepLinkMgr.pendingInvite = '';
      }
    },
    updateAggregateUnread: () => notificationCoord.updateAggregateUnread(),
  };
}

module.exports = {
  applyPrivacyState,
  togglePrivacy,
  lockApp,
  focusChatSearch,
  pushFocus,
  showContextMenu,
  CommandPaletteController,
  createViewHandlers,
};
