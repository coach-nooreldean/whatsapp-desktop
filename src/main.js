/*
 * whatsapp-desktop -- WhatsApp Web in a window of its own.
 *
 * It loads web.whatsapp.com, so it is the same client WhatsApp serves to a
 * browser: no reverse-engineered protocol and nothing that puts an account at
 * risk. What the browser will not do is live in the tray, keep the desktop's
 * font, and raise a banner per message that GNOME cannot swallow -- and that is
 * the whole of what this adds.
 */
'use strict';

const { app, globalShortcut } = require('electron');
const path = require('path');

const manifest = require('../package.json');
const { Config } = require('./config.js');
const { AccountsManager } = require('./accounts.js');
const { PrivacyManager } = require('./privacy.js');
const { LockManager } = require('./lock.js');

// Core subsystems
const {
  APP_ID,
  TITLE,
  handleCliArgs,
  initEnvironment,
  uiFont,
  forcingFont,
  chosenFonts,
  configureFonts,
  initFontConfig,
  initChromiumSwitches,
} = require('./core/switches.js');
const { WindowStateManager } = require('./core/window-state.js');
const { DialogManager } = require('./core/windows.js');
const { configureSession } = require('./core/session.js');
const { StyleManager } = require('./core/styling.js');
const { ViewManager } = require('./core/views.js');
const { DeepLinkManager, isWhatsApp, isOwnPage } = require('./core/deep-links.js');
const { NotificationCoordinator } = require('./core/notifications.js');
const {
  applyPrivacyState,
  togglePrivacy,
  lockApp,
  pushFocus,
  CommandPaletteController,
  createViewHandlers,
} = require('./core/actions.js');
const { createKeyHandler, onPopupKey } = require('./core/input.js');
const { createSettingsHandler } = require('./core/settings-handler.js');
const { bootstrapApp } = require('./core/app-bootstrap.js');

// Early CLI arguments & environment
handleCliArgs(app, manifest);
initEnvironment(app);

const hidden = process.argv.includes('--hidden');
const config = new Config();
initFontConfig(app, config);
const { onWayland } = initChromiumSwitches(app, config);

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const iconFile = (size, name) =>
  path.join(__dirname, '..', 'data', 'icons', String(size), name);
const appIcon = iconFile(256, `apps/${APP_ID}.png`);

// Managers
const privacyMgr = new PrivacyManager(config);
const lockMgr = new LockManager(config);
const accountsMgr = new AccountsManager();
const windowStateMgr = new WindowStateManager({ config, onWayland });

let appRunner = null;
let quitting = false;

const getMainWindow = () => (appRunner ? appRunner.getMainWindow() : null);
const getTray = () => (appRunner ? appRunner.getTray() : null);
const getViewHandlers = () => (appRunner ? appRunner.getViewHandlers() : null);

const dialogMgr = new DialogManager({
  config,
  appIcon,
  uiFont: () => uiFont(config),
  getMainWindow,
  APP_ID,
  TITLE,
});

const deepLinkMgr = new DeepLinkManager({
  getMainWindow,
  showWindow: why => windowStateMgr.showWindow(why),
});

const viewMgr = new ViewManager({
  config,
  accountsMgr,
  privacyMgr,
  uiFont,
  configureSession: ses => configureSession(ses, { config, app, onWayland }),
  getMainWindow,
});

const styleMgr = new StyleManager({
  config,
  uiFont,
  forcingFont,
  chosenFonts,
  getMainWindow,
  getAccountViews: () => viewMgr.accountViews,
  getActiveAccountId: () => viewMgr.activeAccountId,
});

const notificationCoord = new NotificationCoordinator({
  config,
  app,
  banners: null,
  getMainWindow,
  getTray,
  accountsMgr,
  viewManager: viewMgr,
  showWindow: why => windowStateMgr.showWindow(why),
});

const paletteController = new CommandPaletteController({
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
});

const doPushFocus = () =>
  pushFocus({ windowStateMgr, privacyMgr, lockMgr, viewMgr, notificationCoord });

const changeSetting = createSettingsHandler({
  config,
  viewMgr,
  paletteController,
  styleMgr,
  privacyMgr,
  windowStateMgr,
  applyPrivacyState: () => applyPrivacyState(viewMgr, privacyMgr),
  configureFonts,
  app,
  getMainWindow,
});

const quit = () => {
  quitting = true;
  if (appRunner && appRunner.getLifecycleManager()) {
    appRunner.getLifecycleManager().dispose();
  }
  app.quit();
};

const keyHandler = createKeyHandler({
  getMainWindow,
  viewMgr,
  accountsMgr,
  dialogMgr,
  config,
  actions: {
    toggleCommandPalette: () => paletteController.toggle(),
    togglePrivacy: () => togglePrivacy(viewMgr, privacyMgr),
    lockApp: () => lockApp(lockMgr, dialogMgr),
  },
  quit,
  getViewHandlers,
});

// App Lifecycle Events
app.on('second-instance', (event, argv) => deepLinkMgr.handleSecondInstance(argv));
app.on('open-url', (event, url) => deepLinkMgr.handleOpenUrl(event, url));
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  quitting = true;
  try { globalShortcut.unregisterAll(); } catch (e) {}
  if (getTray()) getTray().destroy();
});

// Main ready bootstrap
app.whenReady().then(() => {
  appRunner = bootstrapApp({
    app,
    config,
    onWayland,
    appIcon,
    iconFile,
    APP_ID,
    TITLE,
    manifest,
    privacyMgr,
    lockMgr,
    accountsMgr,
    windowStateMgr,
    dialogMgr,
    deepLinkMgr,
    viewMgr,
    styleMgr,
    notificationCoord,
    actions: {
      pushFocus: doPushFocus,
      togglePrivacy: () => togglePrivacy(viewMgr, privacyMgr),
      lockApp: () => lockApp(lockMgr, dialogMgr),
      createViewHandlers,
    },
    changeSetting,
    paletteController,
    keyHandler,
    onPopupKey,
    forcingFont,
    uiFont,
    hidden,
    quit,
    isQuitting: () => quitting,
    setQuitting: val => { quitting = val; },
    isOwnPage,
    isWhatsApp,
  });
});
