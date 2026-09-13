/*
 * Application readiness bootstrap: initial sessions, themes, banners,
 * IPC wiring, window creation, desktop integration, and watchers.
 */
'use strict';

const path = require('path');
const { session, nativeTheme, globalShortcut } = require('electron');
const { Banners, sweepAvatars } = require('../notify.js');
const desktop = require('../desktop.js');
const debug = require('../debug.js');
const links = require('../links.js');
const { chromeUserAgent } = require('./permissions.js');
const { configureSession, applySpellcheckToSession, clearAllCaches } = require('./session.js');
const { wireIpc } = require('./ipc.js');
const { wireGlobalShortcuts } = require('./global-shortcuts.js');
const { LifecycleManager } = require('./lifecycle.js');
const { createMainWindow } = require('./main-window.js');
const { setupMpris } = require('./mpris-controller.js');
const { setupTray } = require('./tray-controller.js');

function initSessionAndTheme(app, config, onWayland) {
  sweepAvatars();
  app.userAgentFallback = chromeUserAgent();
  configureSession(session.defaultSession, { config, app, onWayland });

  const initialTheme = config.get('view.theme') || 'system';
  if (initialTheme === 'dark') {
    nativeTheme.themeSource = 'dark';
  } else if (initialTheme === 'light') {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
  }
}

function initBanners(app, config, appIcon, notificationCoord) {
  const banners = new Banners({
    seconds: Number(config.get('notifications.banner-seconds')) || 12,
    appIcon,
    hidePreview: !!config.get('notifications.hide-preview'),
    stateFile: path.join(app.getPath('userData'), 'announced.json'),
  });
  notificationCoord.setBanners(banners);
  return banners;
}

function watchDesktopSettings(config, styleMgr) {
  desktop.watch(['color-scheme', 'font-name'], key => {
    if (key === 'color-scheme') {
      if ((config.get('view.theme') || 'system') === 'system') {
        nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
      }
    } else {
      styleMgr.applyStyle();
    }
  });
}

function bootstrapApp(context) {
  const {
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
    actions,
    changeSetting,
    paletteController,
    keyHandler,
    onPopupKey,
    forcingFont,
    uiFont,
    hidden,
    quit,
    isQuitting,
    setQuitting,
  } = context;

  // 1. Session and theme configuration
  initSessionAndTheme(app, config, onWayland);

  // 2. Desktop notification banners
  const banners = initBanners(app, config, appIcon, notificationCoord);

  let win = null;
  let tray = null;
  let mprisService = null;
  let lifecycleMgr = null;

  const viewHandlers = actions.createViewHandlers({
    dialogMgr,
    actions,
    styleMgr,
    notificationCoord,
    deepLinkMgr,
    onKey: keyHandler,
    onPopupKey: (popup, event, input) => onPopupKey(popup, event, input, quit),
    isOwnPage: context.isOwnPage,
    isWhatsApp: context.isWhatsApp,
  });

  const getMainWindow = () => win;
  const getTray = () => tray;
  const getViewHandlers = () => viewHandlers;

  // 3. Central IPC Wiring
  wireIpc({
    app,
    config,
    accountsMgr,
    privacyMgr,
    lockMgr,
    viewManager: viewMgr,
    dialogManager: dialogMgr,
    styleManager: styleMgr,
    notificationCoordinator: notificationCoord,
    deepLinkManager: deepLinkMgr,
    getMainWindow,
    getTray,
    changeSetting,
    getPaletteManager: () => paletteController.getManager(),
    getMprisService: () => mprisService,
    forcingFont,
    uiFont,
    manifest,
    APP_ID,
    TITLE,
    showWindow: why => windowStateMgr.showWindow(why),
    togglePrivacy: () => actions.togglePrivacy(viewMgr, privacyMgr),
    lockApp: () => actions.lockApp(lockMgr, dialogMgr),
    viewHandlers,
    setQuitting,
    wireGlobalShortcuts: () => wireGlobalShortcuts({
      config,
      globalShortcut,
      getMainWindow,
      showWindow: why => windowStateMgr.showWindow(why),
      viewManager: viewMgr,
    }),
    applySpellcheckToSession,
    clearAllCaches,
  });

  // 4. Create primary window
  win = createMainWindow({
    config,
    TITLE,
    appIcon,
    viewMgr,
    windowStateMgr,
    accountsMgr,
    lockMgr,
    actions: {
      pushFocus: () => actions.pushFocus(),
      lockApp: () => actions.lockApp(lockMgr, dialogMgr),
    },
    getViewHandlers,
    hidden,
    isQuitting,
  });

  // 5. Custom CSS hot reloading
  styleMgr.initCustomCssWatcher();

  // 6. Global keyboard accelerators
  wireGlobalShortcuts({
    config,
    globalShortcut,
    getMainWindow,
    showWindow: why => windowStateMgr.showWindow(why),
    viewManager: viewMgr,
  });

  // 7. MPRIS D-Bus integration
  mprisService = setupMpris({
    config,
    windowStateMgr,
    viewMgr,
    quit,
  });

  // 8. Lifecycle & inactivity management
  lifecycleMgr = new LifecycleManager({
    config,
    lockMgr,
    accountsMgr,
    lockApp: () => actions.lockApp(lockMgr, dialogMgr),
    notifySidebarState: () => viewMgr.notifySidebarState(),
    checkForUpdates: done => dialogMgr.checkForUpdates(app, tray, done),
    onHibernateAccount: acc => viewMgr.hibernateAccount(acc),
  });
  lifecycleMgr.init();

  // 9. URL Scheme and command-line arguments
  console.log('whatsapp: links -> %s',
              links.claim(app, APP_ID, { enabled: config.get('links.claim-scheme') !== false }));
  const launchedFor = links.inArgv(process.argv);
  if (launchedFor) {
    deepLinkMgr.openLink(launchedFor, 'the link this client was started for');
  }

  // 10. System Tray
  tray = setupTray({
    iconFile,
    APP_ID,
    TITLE,
    windowStateMgr,
    dialogMgr,
    quit,
    app,
  });

  // 11. Debug rig
  debug.install(() => win, () => banners, {
    show: () => windowStateMgr.showWindow('the debug rig'),
    toggle: () => windowStateMgr.toggleWindow(),
    onScreen: () => windowStateMgr.windowOnScreen(),
    inFront: () => windowStateMgr.windowInFront(),
    settings: () => dialogMgr.openSettings(),
    fonts: () => dialogMgr.openFonts(),
    set: changeSetting,
    about: () => dialogMgr.openAbout({ app, tray }),
    checkUpdate: done => dialogMgr.checkForUpdates(app, tray, done),
    pretendVersion: version => dialogMgr.setPretendVersion(version),
    lastUpdate: () => dialogMgr.lastUpdate,
  });

  // 12. Desktop font & dark-mode watcher
  watchDesktopSettings(config, styleMgr);

  return {
    getMainWindow,
    getTray,
    getMprisService: () => mprisService,
    getLifecycleManager: () => lifecycleMgr,
    getViewHandlers,
  };
}

module.exports = {
  bootstrapApp,
  initSessionAndTheme,
  initBanners,
  watchDesktopSettings,
};
