/*
 * Multi-account WebContentsView creation, isolation, navigation, and cleanup.
 */
'use strict';

const { WebContentsView, session, dialog } = require('electron');
const path = require('path');
const sound = require('../../sound.js');

const WHATSAPP_URL = 'https://web.whatsapp.com/';

function createAccountWebContentsView({
  account,
  config,
  uiFont,
  configureSession,
  privacyMgr,
  handlers = {},
  activeAccountId,
}) {
  const family = uiFont(config);
  const ses = account.id === 'default'
    ? session.defaultSession
    : session.fromPartition(`persist:account_${account.id}`);

  configureSession(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: !!config.get('behaviour.spellcheck'),
      autoplayPolicy: 'no-user-gesture-required',
      defaultFontFamily: { standard: family, sansSerif: family, serif: family },
      defaultFontSize: config.get('view.font-size'),
      backgroundThrottling: false,
    },
  });

  const item = {
    id: account.id,
    account,
    view,
    cssKeys: [],
    loadedAt: 0,
    unreadChats: 0,
    unreadMessages: null,
    title: '',
    storeLive: false,
    activeChatId: '',
    unreadChatNames: new Set(),
  };

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key === ',') {
      event.preventDefault();
      if (handlers.openSettings) handlers.openSettings();
      return;
    }
    if (handlers.onKey) handlers.onKey(event, input);
  });

  view.webContents.on('did-finish-load', async () => {
    item.loadedAt = Date.now();
    if (account.id === activeAccountId() && handlers.onActiveAccountLoaded) {
      handlers.onActiveAccountLoaded(item, view);
    }

    if (handlers.drawStyleForView) await handlers.drawStyleForView(item);

    view.webContents.setZoomFactor(Number(config.get('view.zoom')) || 1);
    view.webContents.send('wa:config', {
      notifications: !!config.get('notifications.enabled'),
      downloadStickers: config.get('media.download-stickers') !== false,
      hideControlsWhenPaused: config.get('media.hide-controls-when-paused') !== false,
      muteSendTone: !config.get('notifications.outgoing-sound'),
      mutePageTone: !config.get('notifications.whatsapp-sound'),
    });

    if (config.get('notifications.sound')) {
      const tone = sound.tone();
      if (tone) view.webContents.send('wa:tone', tone);
    }

    item.view.webContents.executeJavaScript(privacyMgr.getInjectScript()).catch(() => {});
    if (handlers.pushFocus) handlers.pushFocus();
  });

  view.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.warn('account [%s] load failed (%d %s); trying again in 5s', account.name, code, description);
    setTimeout(() => {
      if (view && !view.webContents.isDestroyed()) view.webContents.loadURL(WHATSAPP_URL);
    }, 5000);
  });

  view.webContents.on('render-process-gone', (event, details) => {
    console.warn('account [%s] page went away (%s); reloading', account.name, details.reason);
    if (details.reason !== 'clean-exit' && view && !view.webContents.isDestroyed()) {
      view.webContents.reload();
    }
  });

  view.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (handlers.onAccountTitle) handlers.onAccountTitle(account.id, title);
  });

  view.webContents.setWindowOpenHandler(({ url, features }) => {
    if (handlers.isOwnPage && !handlers.isOwnPage(url)) {
      if (handlers.openExternally) handlers.openExternally(url);
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: handlers.popupOptions ? handlers.popupOptions(features) : {},
    };
  });

  if (handlers.adoptPopup) {
    view.webContents.on('did-create-window', handlers.adoptPopup);
  }

  if (handlers.showContextMenu) {
    view.webContents.on('context-menu', (event, params) => handlers.showContextMenu(view.webContents, params));
  }

  view.webContents.on('will-navigate', (event, url) => {
    if (handlers.onWillNavigate) handlers.onWillNavigate(event, url);
  });

  view.webContents.loadURL(WHATSAPP_URL);
  return item;
}

module.exports = {
  createAccountWebContentsView,
  WHATSAPP_URL,
};
