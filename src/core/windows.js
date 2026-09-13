/*
 * Auxiliary dialogs, settings, fonts, about, and WhatsApp call popups.
 *
 * Decomposed into:
 *   - src/core/windows/updates.js: Update checking and site opening
 *   - src/core/windows/popups.js: WhatsApp call popups and WebPreferences
 *   - src/core/windows/settings-window.js: Settings dialog creator
 *   - src/core/windows/fonts-window.js: Fonts & typography dialog creator
 *   - src/core/windows/about-window.js: About dialog creator
 *   - src/core/windows/account-window.js: Add-account dialog creator
 *   - src/core/windows/lock-window.js: Passcode lock screen overlay creator
 */
'use strict';

const { UpdateController, SITES, UPDATE_FRESH_MS } = require('./windows/updates.js');
const { PopupManager } = require('./windows/popups.js');
const { createSettingsWindow } = require('./windows/settings-window.js');
const { createFontsWindow } = require('./windows/fonts-window.js');
const { createAboutWindow } = require('./windows/about-window.js');
const { createAddAccountWindow } = require('./windows/account-window.js');
const { createLockWindow } = require('./windows/lock-window.js');

class DialogManager {
  constructor({ config, appIcon, uiFont, getMainWindow, APP_ID, TITLE }) {
    this.config = config;
    this.appIcon = appIcon;
    this.uiFont = uiFont;
    this.getMainWindow = getMainWindow;
    this.APP_ID = APP_ID;
    this.TITLE = TITLE;

    this.settingsWin = null;
    this.addAccountWin = null;
    this.fontsWin = null;
    this.aboutWin = null;
    this.lockWin = null;

    this.updater = new UpdateController();
    this.popupMgr = new PopupManager({ config, appIcon, uiFont, TITLE });
  }

  get popups() {
    return this.popupMgr.popups;
  }

  get lastUpdate() {
    return this.updater.lastUpdate;
  }

  set lastUpdate(val) {
    this.updater.lastUpdate = val;
  }

  get lastUpdateAt() {
    return this.updater.lastUpdateAt;
  }

  set lastUpdateAt(val) {
    this.updater.lastUpdateAt = val;
  }

  get checking() {
    return this.updater.checking;
  }

  set checking(val) {
    this.updater.checking = val;
  }

  get waitingOnCheck() {
    return this.updater.waitingOnCheck;
  }

  get pretendVersion() {
    return this.updater.pretendVersion;
  }

  set pretendVersion(val) {
    this.updater.pretendVersion = val;
  }

  get aboutShouldCheck() {
    return this.updater.aboutShouldCheck;
  }

  set aboutShouldCheck(val) {
    this.updater.aboutShouldCheck = val;
  }

  getCurrentVersion(app) {
    return this.updater.getCurrentVersion(app);
  }

  setPretendVersion(version) {
    this.updater.setPretendVersion(version);
  }

  checkForUpdates(app, tray, done) {
    return this.updater.checkForUpdates(app, tray, done, () => this.aboutWin);
  }

  openSite(where) {
    return this.updater.openSite(where);
  }

  popupOptions(features) {
    return this.popupMgr.popupOptions(features);
  }

  adoptPopup(popup, opts) {
    return this.popupMgr.adoptPopup(popup, opts);
  }

  openSettings() {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      this.settingsWin.show();
      this.settingsWin.focus();
      return this.settingsWin;
    }

    this.settingsWin = createSettingsWindow({
      appIcon: this.appIcon,
      uiFont: this.uiFont,
      onClosed: () => {
        this.settingsWin = null;
      },
    });

    return this.settingsWin;
  }

  openAddAccountWindow() {
    if (this.addAccountWin && !this.addAccountWin.isDestroyed()) {
      this.addAccountWin.show();
      this.addAccountWin.focus();
      return this.addAccountWin;
    }

    this.addAccountWin = createAddAccountWindow({
      appIcon: this.appIcon,
      uiFont: this.uiFont,
      parentWin: this.getMainWindow(),
      onClosed: () => {
        this.addAccountWin = null;
      },
    });

    return this.addAccountWin;
  }

  openFonts() {
    if (this.fontsWin && !this.fontsWin.isDestroyed()) {
      this.fontsWin.show();
      this.fontsWin.focus();
      return this.fontsWin;
    }

    this.fontsWin = createFontsWindow({
      appIcon: this.appIcon,
      uiFont: this.uiFont,
      onClosed: () => {
        this.fontsWin = null;
      },
    });

    return this.fontsWin;
  }

  openAbout({ checkNow = false } = {}) {
    if (this.aboutWin && !this.aboutWin.isDestroyed()) {
      this.aboutWin.show();
      this.aboutWin.focus();
      if (checkNow) this.aboutWin.webContents.send('about:changed', { checkNow: true });
      return this.aboutWin;
    }

    this.aboutShouldCheck = checkNow;
    this.aboutWin = createAboutWindow({
      appIcon: this.appIcon,
      uiFont: this.uiFont,
      onClosed: () => {
        this.aboutWin = null;
      },
    });

    return this.aboutWin;
  }

  showLockWindow() {
    if (this.lockWin && !this.lockWin.isDestroyed()) {
      this.lockWin.focus();
      return;
    }
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;

    this.lockWin = createLockWindow({
      parentWin: win,
      onClosed: () => {
        this.lockWin = null;
      },
    });
  }

  hideLockWindow() {
    if (this.lockWin && !this.lockWin.isDestroyed()) {
      this.lockWin.destroy();
      this.lockWin = null;
    }
  }

  notifyWindowsTheme(theme) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      this.settingsWin.webContents.send('settings:changed', { theme });
    }
    if (this.fontsWin && !this.fontsWin.isDestroyed()) {
      this.fontsWin.webContents.send('settings:changed', { theme });
    }
    if (this.aboutWin && !this.aboutWin.isDestroyed()) {
      this.aboutWin.webContents.send('about:changed', { theme });
    }
  }

  notifyWindowsAutostart(enable) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      this.settingsWin.webContents.send('settings:changed', { autostart: enable });
    }
  }
}

module.exports = {
  DialogManager,
  SITES,
  UPDATE_FRESH_MS,
};
