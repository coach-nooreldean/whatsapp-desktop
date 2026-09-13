/*
 * Tests for modular core architecture.
 * Verifies that all extracted core modules export their expected interfaces,
 * instantiate properly, and maintain correct defaults and behaviors.
 */
'use strict';

const assert = require('assert');
const { Config } = require('../src/config.js');
const { AccountsManager } = require('../src/accounts.js');
const { PrivacyManager } = require('../src/privacy.js');
const { LockManager } = require('../src/lock.js');

// Core modules
const switches = require('../src/core/switches.js');
const { WindowStateManager, clampToScreen } = require('../src/core/window-state.js');
const { DialogManager } = require('../src/core/windows.js');
const sessionModule = require('../src/core/session.js');
const { StyleManager } = require('../src/core/styling.js');
const { ViewManager } = require('../src/core/views.js');
const deepLinks = require('../src/core/deep-links.js');
const { NotificationCoordinator } = require('../src/core/notifications.js');
const globalShortcuts = require('../src/core/global-shortcuts.js');
const ipc = require('../src/core/ipc.js');

// Newly extracted core modules
const mainWindowModule = require('../src/core/main-window.js');
const actionsModule = require('../src/core/actions.js');
const settingsHandlerModule = require('../src/core/settings-handler.js');
const inputModule = require('../src/core/input.js');
const mprisController = require('../src/core/mpris-controller.js');
const trayController = require('../src/core/tray-controller.js');
const appBootstrap = require('../src/core/app-bootstrap.js');

// Newly extracted submodules across the codebase
const ipcSettings = require('../src/core/ipc/settings.js');
const ipcAbout = require('../src/core/ipc/about.js');
const ipcPage = require('../src/core/ipc/page.js');
const ipcStore = require('../src/core/ipc/store.js');
const ipcAccounts = require('../src/core/ipc/accounts.js');
const styleBidi = require('../src/style/bidi-rules.js');
const styleRules = require('../src/style/rules.js');
const styleFonts = require('../src/style/fonts.js');
const notifyAvatars = require('../src/notify/avatars.js');
const notifySeen = require('../src/notify/seen.js');
const debugProfiler = require('../src/debug/profiler.js');
const debugCommands = require('../src/debug/commands.js');
const traySniConstants = require('../src/tray/sni-constants.js');
const pageVideo = require('../src/page/video.js');
const pageCaret = require('../src/page/caret.js');
const fontsCatalogue = require('../src/fonts/catalogue.js');
const fontsDocument = require('../src/fonts/document.js');
const fontsLearning = require('../src/fonts/learning.js');
const trayWatcher = require('../src/tray/watcher.js');
const trayElectron = require('../src/tray/electron.js');
const windowsUpdates = require('../src/core/windows/updates.js');
const windowsPopups = require('../src/core/windows/popups.js');

// Newly extracted deep modules
const dbusConstants = require('../src/dbus/constants.js');
const dbusSignatures = require('../src/dbus/signatures.js');
const dbusWriter = require('../src/dbus/writer.js');
const dbusReader = require('../src/dbus/reader.js');
const dbusMessage = require('../src/dbus/message.js');
const dbusClient = require('../src/dbus/client.js');
const trayPixmap = require('../src/tray/pixmap.js');
const trayMenuLayout = require('../src/tray/menu-layout.js');
const winSettings = require('../src/core/windows/settings-window.js');
const winFonts = require('../src/core/windows/fonts-window.js');
const winAccount = require('../src/core/windows/account-window.js');
const winAbout = require('../src/core/windows/about-window.js');
const winLock = require('../src/core/windows/lock-window.js');
const viewsSidebar = require('../src/core/views/sidebar.js');
const viewsAccount = require('../src/core/views/account-views.js');
const configDefaults = require('../src/config/defaults.js');
const configIni = require('../src/config/ini.js');
const wordingMarks = require('../src/wording/marks.js');
const wordingPhrases = require('../src/wording/phrases.js');
const mprisConstants = require('../src/mpris/constants.js');
const mprisService = require('../src/mpris/service.js');
const notifBadge = require('../src/core/notifications/badge.js');
const notifWithdrawal = require('../src/core/notifications/withdrawal.js');
const paletteActions = require('../src/core/palette/actions.js');
const notifyEntry = require('../src/notify/entry.js');
const accountsConstants = require('../src/accounts/constants.js');
const accountsStorage = require('../src/accounts/storage.js');
const bidiCharacters = require('../src/bidi/characters.js');
const bidiDetector = require('../src/bidi/detector.js');
const themesPalettes = require('../src/themes/palettes.js');
const themesPywal = require('../src/themes/pywal.js');
const lockCrypto = require('../src/lock/crypto.js');
const lockStorage = require('../src/lock/storage.js');
const pageTone = require('../src/page/tone.js');
const pagePanels = require('../src/page/panels.js');

// Newly extracted inject submodules
const injectRows = require('../src/page/inject/rows.js');
const injectAvatars = require('../src/page/inject/avatars.js');
const injectSounds = require('../src/page/inject/sounds.js');
const injectNav = require('../src/page/inject/navigation.js');
const injectDrawer = require('../src/page/inject/drawer-escape.js');
const injectComposer = require('../src/page/inject/composer-bar.js');
const injectArrivals = require('../src/page/inject/arrivals.js');
const injectJump = require('../src/page/inject/jump.js');
const injectNotification = require('../src/page/inject/notification-shim.js');
const injectWatcher = require('../src/page/inject/watcher.js');

let failures = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log('  ok   ' + label);
    return;
  }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

try {
  // 1. switches.js
  check('switches APP_ID is correct', switches.APP_ID, 'io.github.shehawey.whatsapp-desktop');
  check('switches TITLE is correct', switches.TITLE, 'WhatsApp');
  const mockConfig = new Config();
  check('uiFont returns desktop font by default', typeof switches.uiFont(mockConfig), 'string');
  check('forcingFont returns true by default (view.force-font defaults to true)', switches.forcingFont(mockConfig), true);

  // 2. window-state.js
  const clamped = clampToScreen(50, 50);
  check('clampToScreen clamps min width to at least 400', clamped.width >= 400, true);
  check('clampToScreen clamps min height to at least 300', clamped.height >= 300, true);

  const winState = new WindowStateManager({ config: mockConfig, onWayland: true });
  check('initial windowOnScreen is false', winState.windowOnScreen(), false);
  check('initial windowInFront is false', winState.windowInFront(), false);

  // 3. windows.js (DialogManager)
  const dialogMgr = new DialogManager({
    config: mockConfig,
    appIcon: 'icon.png',
    uiFont: () => 'Sans',
    getMainWindow: () => null,
    APP_ID: switches.APP_ID,
    TITLE: switches.TITLE,
  });
  dialogMgr.setPretendVersion('9.9.9');
  check('getCurrentVersion honors pretendVersion', dialogMgr.getCurrentVersion({ getVersion: () => '1.0.0' }), '9.9.9');

  const popupOpts = dialogMgr.popupOptions('width=500,height=600');
  check('popupOptions preserves TITLE', popupOpts.title, 'WhatsApp');
  check('popupOptions sets contextIsolation to false for calls', popupOpts.webPreferences.contextIsolation, false);

  // 4. session.js
  check('getSpellcheckLanguages parses string setting',
        sessionModule.getSpellcheckLanguages({ get: () => 'en-US,ar,fr' }),
        ['en-US', 'ar', 'fr']);
  check('getSpellcheckLanguages defaults to en-US,ar',
        sessionModule.getSpellcheckLanguages({ get: () => '' }),
        ['en-US', 'ar']);

  // 5. styling.js
  const styleMgr = new StyleManager({
    config: mockConfig,
    uiFont: () => 'Sans',
    forcingFont: () => false,
    chosenFonts: () => ({ latin: { family: 'Sans' }, arabic: null }),
    getMainWindow: () => null,
    getAccountViews: () => new Map(),
    getActiveAccountId: () => 'default',
  });
  const sheet = styleMgr.styleSheet();
  check('styleSheet produces a non-empty CSS string', typeof sheet === 'string' && sheet.length > 0, true);

  // 6. views.js
  const privacyMgr = new PrivacyManager(mockConfig);
  const viewMgr = new ViewManager({
    config: mockConfig,
    accountsMgr: new AccountsManager(),
    privacyMgr,
    uiFont: () => 'Sans',
    configureSession: () => {},
    getMainWindow: () => null,
  });
  check('viewManager activeAccountId matches accountsMgr.getActiveId()',
        viewMgr.activeAccountId,
        viewMgr.accountsMgr.getActiveId());
  check('viewManager getActiveAccountView is null when empty', viewMgr.getActiveAccountView(), null);
  check('viewManager getAccountIdByWebContents handles null', viewMgr.getAccountIdByWebContents(null), 'default');
  const mockWin = {
    isDestroyed: () => false,
    contentView: { children: [], addChildView(v) { this.children.push(v); } },
    getContentBounds: () => ({ width: 1000, height: 700 }),
    setTitle: () => {},
  };
  viewMgr.setWindow(mockWin);
  check('viewManager setWindow sets internal win', viewMgr.win === mockWin, true);
  check('sidebar setWindow receives win', viewMgr.sidebar.win === mockWin, true);

  // 7. deep-links.js
  check('isWhatsApp accepts web.whatsapp.com', deepLinks.isWhatsApp('https://web.whatsapp.com/'), true);
  check('isWhatsApp rejects evil.com', deepLinks.isWhatsApp('https://evil.com/'), false);
  check('isOwnPage accepts web.whatsapp.com', deepLinks.isOwnPage('https://web.whatsapp.com/'), true);
  check('isOwnPage rejects faq.whatsapp.com', deepLinks.isOwnPage('https://faq.whatsapp.com/'), false);

  // 8. notifications.js
  const notifCoord = new NotificationCoordinator({
    config: mockConfig,
    app: { badgeCount: 0 },
    banners: null,
    getMainWindow: () => null,
    getTray: () => null,
    accountsMgr: new AccountsManager(),
    viewManager: viewMgr,
    showWindow: () => {},
  });
  check('initial storeLive is false', notifCoord.storeLive, false);
  check('bannersAreOurs with null window is false', notifCoord.bannersAreOurs(), false);
  notifCoord.setBadge(5);
  check('setBadge sets badgeShown', notifCoord.badgeShown, 5);

  // 9. global-shortcuts.js
  check('toggleCallMute function exists', typeof globalShortcuts.toggleCallMute, 'function');
  check('wireGlobalShortcuts function exists', typeof globalShortcuts.wireGlobalShortcuts, 'function');

  // 10. ipc.js
  check('wireIpc function exists', typeof ipc.wireIpc, 'function');

  // 11. input.js
  check('createKeyHandler function exists', typeof inputModule.createKeyHandler, 'function');
  check('onPopupKey function exists', typeof inputModule.onPopupKey, 'function');
  check('adjustZoom function exists', typeof inputModule.adjustZoom, 'function');

  let popupClosed = false;
  let quitCalled = false;
  const mockPopup = {
    isDestroyed: () => false,
    close: () => { popupClosed = true; },
    webContents: { toggleDevTools: () => {} },
  };
  inputModule.onPopupKey(mockPopup, { preventDefault: () => {} }, { type: 'keyDown', control: true, key: 'w' }, () => { quitCalled = true; });
  check('onPopupKey handles Ctrl+W to close popup', popupClosed, true);

  inputModule.onPopupKey(mockPopup, { preventDefault: () => {} }, { type: 'keyDown', control: true, key: 'q' }, () => { quitCalled = true; });
  check('onPopupKey handles Ctrl+Q to quit', quitCalled, true);

  // 12. actions.js
  check('applyPrivacyState function exists', typeof actionsModule.applyPrivacyState, 'function');
  check('togglePrivacy function exists', typeof actionsModule.togglePrivacy, 'function');
  check('lockApp function exists', typeof actionsModule.lockApp, 'function');
  check('pushFocus function exists', typeof actionsModule.pushFocus, 'function');
  check('CommandPaletteController class exists', typeof actionsModule.CommandPaletteController, 'function');
  check('createViewHandlers function exists', typeof actionsModule.createViewHandlers, 'function');

  const paletteCtrl = new actionsModule.CommandPaletteController({
    getMainWindow: () => null,
    accountsMgr: new AccountsManager(),
    viewMgr,
    dialogMgr,
    styleMgr,
    config: mockConfig,
    uiFont: () => 'Sans',
    privacyMgr,
    lockMgr: new LockManager(mockConfig),
    getViewHandlers: () => ({}),
  });
  check('initial palette manager instance is null until toggled', paletteCtrl.getManager(), null);

  const mockViewHandlers = actionsModule.createViewHandlers({
    dialogMgr,
    actions: { pushFocus: () => {} },
    styleMgr,
    notificationCoord: notifCoord,
    deepLinkMgr: { openLink: () => {}, openExternally: () => {}, setLoadedAt: () => {} },
    onKey: () => {},
    onPopupKey: () => {},
    isOwnPage: deepLinks.isOwnPage,
    isWhatsApp: deepLinks.isWhatsApp,
  });
  check('createViewHandlers returns object with openSettings', typeof mockViewHandlers.openSettings, 'function');
  check('createViewHandlers returns object with onWillNavigate', typeof mockViewHandlers.onWillNavigate, 'function');
  check('createViewHandlers returns object with onActiveAccountLoaded', typeof mockViewHandlers.onActiveAccountLoaded, 'function');

  // 13. settings-handler.js
  check('createSettingsHandler function exists', typeof settingsHandlerModule.createSettingsHandler, 'function');
  check('updateZoom function exists', typeof settingsHandlerModule.updateZoom, 'function');
  check('updateTheme function exists', typeof settingsHandlerModule.updateTheme, 'function');
  check('updatePrivacy function exists', typeof settingsHandlerModule.updatePrivacy, 'function');

  const settingsHandler = settingsHandlerModule.createSettingsHandler({
    config: mockConfig,
    viewMgr,
    paletteController: paletteCtrl,
    styleMgr,
    privacyMgr,
    windowStateMgr: winState,
    applyPrivacyState: () => {},
    configureFonts: () => ({ changed: false }),
    app: { exit: () => {} },
    getMainWindow: () => null,
  });
  const resSystem = settingsHandler('system.foo', 'bar');
  check('settingsHandler returns restart: true on system.* changes', resSystem.restart, true);
  const resTheme = settingsHandler('view.theme', 'dark');
  check('settingsHandler returns ok: true on theme changes', resTheme.ok, true);

  // 14. mpris-controller.js
  check('setupMpris function exists', typeof mprisController.setupMpris, 'function');
  check('MEDIA_SCRIPTS has playPause script', typeof mprisController.MEDIA_SCRIPTS.playPause, 'string');
  check('MEDIA_SCRIPTS has stop script', typeof mprisController.MEDIA_SCRIPTS.stop, 'string');

  // 15. tray-controller.js
  check('setupTray function exists', typeof trayController.setupTray, 'function');

  // 16. main-window.js
  check('createMainWindow function exists', typeof mainWindowModule.createMainWindow, 'function');
  check('wireWindowEvents function exists', typeof mainWindowModule.wireWindowEvents, 'function');

  // 17. app-bootstrap.js
  check('bootstrapApp function exists', typeof appBootstrap.bootstrapApp, 'function');
  check('initSessionAndTheme function exists', typeof appBootstrap.initSessionAndTheme, 'function');
  check('initBanners function exists', typeof appBootstrap.initBanners, 'function');

  // 18. Extracted IPC domain submodules
  check('registerSettingsIpc function exists', typeof ipcSettings.registerSettingsIpc, 'function');
  check('registerAboutIpc function exists', typeof ipcAbout.registerAboutIpc, 'function');
  check('registerPageIpc function exists', typeof ipcPage.registerPageIpc, 'function');
  check('registerStoreIpc function exists', typeof ipcStore.registerStoreIpc, 'function');
  check('registerAccountsIpc function exists', typeof ipcAccounts.registerAccountsIpc, 'function');

  // 19. Extracted style submodules
  check('styleBidi ARABIC_CLIP exists', typeof styleBidi.ARABIC_CLIP, 'string');
  check('styleBidi MESSAGE_BIDI exists', typeof styleBidi.MESSAGE_BIDI, 'string');
  check('styleRules CONVERSATION_SCROLL exists', typeof styleRules.CONVERSATION_SCROLL, 'string');
  check('styleRules BUBBLE_MIN exists', typeof styleRules.BUBBLE_MIN, 'string');
  check('styleFonts stack function exists', typeof styleFonts.stack, 'function');
  check('styleFonts fontFaces function exists', typeof styleFonts.fontFaces, 'function');

  // 20. Extracted notify submodules
  check('notifyAvatars avatarPath exists', typeof notifyAvatars.avatarPath, 'function');
  check('notifyAvatars sweepAvatars exists', typeof notifyAvatars.sweepAvatars, 'function');
  check('notifySeen Seen class exists', typeof notifySeen.Seen, 'function');

  // 21. Extracted debug submodules
  check('debugProfiler runScrollProbe exists', typeof debugProfiler.runScrollProbe, 'function');
  check('debugCommands handleCommand exists', typeof debugCommands.handleCommand, 'function');

  // 22. Extracted tray submodules
  check('traySniConstants ID object exists', typeof traySniConstants.ID, 'object');
  check('traySniConstants ITEM_XML exists', typeof traySniConstants.ITEM_XML, 'string');

  // 23. Extracted page submodules
  check('pageVideo fixVideo exists', typeof pageVideo.fixVideo, 'function');
  check('pageCaret setupCaretRestore exists', typeof pageCaret.setupCaretRestore, 'function');

  // 24. Extracted fonts submodules
  check('fontsCatalogue scan exists', typeof fontsCatalogue.scan, 'function');
  check('fontsCatalogue pick exists', typeof fontsCatalogue.pick, 'function');
  check('fontsCatalogue installed exists', typeof fontsCatalogue.installed, 'function');
  check('fontsDocument document_ exists', typeof fontsDocument.document_, 'function');
  check('fontsDocument escapeXml exists', typeof fontsDocument.escapeXml, 'function');
  check('fontsLearning learn exists', typeof fontsLearning.learn, 'function');
  check('fontsLearning REPLACED is array', Array.isArray(fontsLearning.REPLACED), true);

  // 25. Extracted tray submodules
  check('trayWatcher waitForHost exists', typeof trayWatcher.waitForHost, 'function');
  check('trayWatcher hostPresent exists', typeof trayWatcher.hostPresent, 'function');
  check('trayElectron ElectronTray exists', typeof trayElectron.ElectronTray, 'function');

  // 26. Extracted windows submodules
  check('windowsUpdates UpdateController exists', typeof windowsUpdates.UpdateController, 'function');
  check('windowsUpdates SITES exists', typeof windowsUpdates.SITES, 'object');
  check('windowsPopups PopupManager exists', typeof windowsPopups.PopupManager, 'function');

  // 27. Extracted dbus submodules
  check('dbusConstants TYPE METHOD_CALL is 1', dbusConstants.TYPE.METHOD_CALL, 1);
  check('dbusConstants NO_REPLY_EXPECTED is 1', dbusConstants.NO_REPLY_EXPECTED, 1);
  check('dbusConstants ALIGN y is 1', dbusConstants.ALIGN.y, 1);
  check('dbusSignatures alignOf string is 4', dbusSignatures.alignOf('s'), 4);
  check('dbusSignatures splitTypes say gives 2 elements', dbusSignatures.splitTypes('say').length, 2);
  check('dbusWriter Writer class exists', typeof dbusWriter.Writer, 'function');
  check('dbusWriter marshalBody exists', typeof dbusWriter.marshalBody, 'function');
  check('dbusReader Reader class exists', typeof dbusReader.Reader, 'function');
  check('dbusMessage encode exists', typeof dbusMessage.encode, 'function');
  check('dbusMessage decode exists', typeof dbusMessage.decode, 'function');
  check('dbusClient Bus class exists', typeof dbusClient.Bus, 'function');
  check('dbusClient sessionAddress exists', typeof dbusClient.sessionAddress, 'function');

  // 28. Extracted tray submodules (pixmap & menu layout)
  check('trayPixmap pixmap exists', typeof trayPixmap.pixmap, 'function');
  check('trayMenuLayout getMenuLayout exists', typeof trayMenuLayout.getMenuLayout, 'function');
  check('trayMenuLayout getMenuProperties exists', typeof trayMenuLayout.getMenuProperties, 'function');

  // 29. Extracted windows submodules (windows individual dialogs)
  check('winSettings createSettingsWindow exists', typeof winSettings.createSettingsWindow, 'function');
  check('winFonts createFontsWindow exists', typeof winFonts.createFontsWindow, 'function');
  check('winAccount createAddAccountWindow exists', typeof winAccount.createAddAccountWindow, 'function');
  check('winAbout createAboutWindow exists', typeof winAbout.createAboutWindow, 'function');
  check('winLock createLockWindow exists', typeof winLock.createLockWindow, 'function');

  // 30. Extracted views submodules
  check('viewsSidebar SidebarController exists', typeof viewsSidebar.SidebarController, 'function');
  check('viewsAccount createAccountWebContentsView exists', typeof viewsAccount.createAccountWebContentsView, 'function');

  // 31. Extracted config submodules
  check('configDefaults DEFAULTS object exists', typeof configDefaults.DEFAULTS, 'object');
  check('configDefaults DEFAULTS minimize-to-tray is false', configDefaults.DEFAULTS['behaviour.minimize-to-tray'], false);
  check('configIni parse exists', typeof configIni.parse, 'function');
  check('configIni format exists', typeof configIni.format, 'function');

  // 32. Extracted wording submodules
  check('wordingMarks MISSED is object', typeof wordingMarks.MISSED, 'object');
  check('wordingMarks MARKS image exists', typeof wordingMarks.MARKS.image, 'string');
  check('wordingPhrases mediaFromWords exists', typeof wordingPhrases.mediaFromWords, 'function');
  check('wordingPhrases kindOf exists', typeof wordingPhrases.kindOf, 'function');

  // 33. Extracted mpris submodules
  check('mprisConstants MPRIS_XML exists', typeof mprisConstants.MPRIS_XML, 'string');
  check('mprisConstants MPRIS_PATH is /org/mpris/MediaPlayer2', mprisConstants.MPRIS_PATH, '/org/mpris/MediaPlayer2');
  check('mprisService MprisService exists', typeof mprisService.MprisService, 'function');

  // 34. Extracted notifications submodules
  check('notifBadge calculateAggregateUnread exists', typeof notifBadge.calculateAggregateUnread, 'function');
  check('notifBadge applyBadgeToApp exists', typeof notifBadge.applyBadgeToApp, 'function');
  check('notifWithdrawal withdrawOpenChat exists', typeof notifWithdrawal.withdrawOpenChat, 'function');
  check('notifWithdrawal withdrawRingingCalls exists', typeof notifWithdrawal.withdrawRingingCalls, 'function');

  // 35. Extracted palette submodules
  check('paletteActions STATIC_ACTIONS is array', Array.isArray(paletteActions.STATIC_ACTIONS), true);
  check('paletteActions buildPaletteActions exists', typeof paletteActions.buildPaletteActions, 'function');

  // 36. Extracted notify submodules
  check('notifyEntry Entry class exists', typeof notifyEntry.Entry, 'function');

  // 37. Extracted accounts submodules
  check('accountsConstants DEFAULT_PALETTE is array', Array.isArray(accountsConstants.DEFAULT_PALETTE), true);
  check('accountsConstants DEFAULT_ACCOUNT id is default', accountsConstants.DEFAULT_ACCOUNT.id, 'default');
  check('accountsStorage loadAccountsFromDisk exists', typeof accountsStorage.loadAccountsFromDisk, 'function');
  check('accountsStorage saveAccountsToDisk exists', typeof accountsStorage.saveAccountsToDisk, 'function');

  // 38. Extracted bidi submodules
  check('bidiCharacters RLM is correct', bidiCharacters.RLM, '\u200F');
  check('bidiCharacters RTL is RegExp', bidiCharacters.RTL instanceof RegExp, true);
  check('bidiDetector directionOf exists', typeof bidiDetector.directionOf, 'function');
  check('bidiDetector paragraph exists', typeof bidiDetector.paragraph, 'function');

  // 39. Extracted themes submodules
  check('themesPalettes THEMES object exists', typeof themesPalettes.THEMES, 'object');
  check('themesPalettes THEMES contains dark theme', 'dark' in themesPalettes.THEMES, true);
  check('themesPywal detectHyprlandColors exists', typeof themesPywal.detectHyprlandColors, 'function');

  // 40. Extracted lock submodules
  check('lockCrypto deriveHash exists', typeof lockCrypto.deriveHash, 'function');
  check('lockCrypto verifyHash exists', typeof lockCrypto.verifyHash, 'function');
  check('lockStorage loadSecurityState exists', typeof lockStorage.loadSecurityState, 'function');
  check('lockStorage saveSecurityState exists', typeof lockStorage.saveSecurityState, 'function');

  // 41. Extracted page submodules
  check('pageTone createTonePlayer exists', typeof pageTone.createTonePlayer, 'function');
  check('pagePanels emojiPanel exists', typeof pagePanels.emojiPanel, 'function');
  check('pagePanels composer exists', typeof pagePanels.composer, 'function');
  check('pagePanels deepestIn exists', typeof pagePanels.deepestIn, 'function');

  // 42. Extracted page/inject submodules
  check('injectRows strip exists', typeof injectRows.strip, 'function');
  check('injectRows isArrival exists', typeof injectRows.isArrival, 'function');
  check('injectRows unreadCount exists', typeof injectRows.unreadCount, 'function');
  check('injectAvatars fetchAvatar exists', typeof injectAvatars.fetchAvatar, 'function');
  check('injectAvatars avatarFor exists', typeof injectAvatars.avatarFor, 'function');
  check('injectSounds createSoundManager exists', typeof injectSounds.createSoundManager, 'function');
  check('injectSounds USER_MEDIA is RegExp', injectSounds.USER_MEDIA instanceof RegExp, true);
  check('injectNav findRow exists', typeof injectNav.findRow, 'function');
  check('injectNav pressRow exists', typeof injectNav.pressRow, 'function');
  check('injectDrawer slideTheDrawer exists', typeof injectDrawer.slideTheDrawer, 'function');
  check('injectDrawer setupEscapeHandler exists', typeof injectDrawer.setupEscapeHandler, 'function');
  check('injectComposer setupComposerBar exists', typeof injectComposer.setupComposerBar, 'function');
  check('injectArrivals setupArrivals exists', typeof injectArrivals.setupArrivals, 'function');
  check('injectJump watchTheJumps exists', typeof injectJump.watchTheJumps, 'function');
  check('injectNotification installNotificationShim exists', typeof injectNotification.installNotificationShim, 'function');
  check('injectWatcher createWatcher exists', typeof injectWatcher.createWatcher, 'function');
  check('injectWatcher SEP exists', typeof injectWatcher.SEP, 'string');

  if (failures === 0) {
    console.log('modular architecture checks pass');
  } else {
    process.exit(1);
  }
} catch (err) {
  console.error('Modular architecture test failed with error:', err);
  process.exit(1);
}
