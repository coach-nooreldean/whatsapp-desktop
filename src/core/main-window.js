/*
 * Primary application window creation and window lifecycle event wiring.
 */
'use strict';

const { BrowserWindow, Menu, nativeTheme } = require('electron');
const { clampToScreen } = require('./window-state.js');

function wireWindowEvents(win, options) {
  const {
    config,
    viewMgr,
    windowStateMgr,
    lockMgr,
    actions,
    hidden,
    isQuitting,
  } = options;

  win.on('resize', () => viewMgr.updateLayout());
  win.on('maximize', () => viewMgr.updateLayout());
  win.on('unmaximize', () => viewMgr.updateLayout());

  win.on('close', event => {
    if (win && !win.isDestroyed()) {
      const bounds = win.getBounds();
      config.set('window.width', bounds.width);
      config.set('window.height', bounds.height);
      const activeWc = viewMgr.getActiveWebContents();
      if (activeWc) config.set('view.zoom', activeWc.getZoomFactor());
      config.save();
    }
    if (!isQuitting() && config.get('behaviour.close-to-tray')) {
      event.preventDefault();
      windowStateMgr.hideWindow();
    }
  });

  win.on('minimize', event => {
    if (config.get('behaviour.minimize-to-tray')) {
      event.preventDefault();
      windowStateMgr.hideWindow();
    } else {
      actions.pushFocus();
    }
  });

    for (const event of ['show', 'hide', 'focus', 'blur', 'restore']) {
    win.on(event, () => actions.pushFocus());
  }

  win.on('closed', () => {
    windowStateMgr.setWindow(null);
    if (viewMgr && typeof viewMgr.setWindow === 'function') {
      viewMgr.setWindow(null);
    }
  });

  windowStateMgr.traceWindowState();

  win.once('ready-to-show', () => {
    viewMgr.updateLayout();
    if (!hidden) windowStateMgr.showWindow('the client started');
    actions.pushFocus();
    viewMgr.notifySidebarState();
    if (lockMgr.isEnabled()) {
      actions.lockApp();
    }
  });
}

function createMainWindow(options) {
  const {
    config,
    TITLE,
    appIcon,
    viewMgr,
    windowStateMgr,
    accountsMgr,
    getViewHandlers,
  } = options;

  const { width, height } = clampToScreen(config.get('window.width'), config.get('window.height'));

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 500,
    minHeight: 400,
    title: TITLE,
    icon: appIcon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b141a' : '#ffffff',
  });

  // Backward compatibility getter so win.webContents always targets active view
  Object.defineProperty(win, 'webContents', {
    get: () => viewMgr.getActiveWebContents(),
    configurable: true,
  });

  Menu.setApplicationMenu(null);
  windowStateMgr.setWindow(win);
  if (viewMgr && typeof viewMgr.setWindow === 'function') {
    viewMgr.setWindow(win);
  }

  viewMgr.initSidebar(win);

  const viewHandlers = getViewHandlers();
  const accounts = accountsMgr.getAccounts();
  for (const acc of accounts) {
    viewMgr.createAccountView(acc, viewHandlers);
  }

  viewMgr.switchToAccount(viewMgr.activeAccountId || 'default', viewHandlers);
  viewMgr.updateLayout();

  wireWindowEvents(win, options);

  return win;
}

module.exports = {
  createMainWindow,
  wireWindowEvents,
};
