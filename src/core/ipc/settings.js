/*
 * IPC channels for Settings, Custom CSS, Spellcheck, App Lock, and Command Palette.
 */
'use strict';

const { ipcMain, BrowserWindow, nativeTheme, shell, session } = require('electron');
const fs = require('fs');
const autostart = require('../../autostart.js');
const fonts = require('../../fonts.js');
const desktop = require('../../desktop.js');
const { CUSTOM_CSS_PATH } = require('../../config.js');

function registerSettingsIpc(ctx) {
  const {
    app,
    config,
    lockMgr,
    viewManager,
    dialogManager,
    styleManager,
    changeSetting,
    getPaletteManager,
    uiFont,
    applySpellcheckToSession,
    clearAllCaches,
  } = ctx;

  ipcMain.handle('settings:get', () => {
    return {
      theme: config.get('view.theme') || 'system',
      language: config.get('view.language') || 'ar',
      hyprlandAccent: config.get('view.hyprland-accent') !== false,
      autostart: autostart.isEnabled(),
      closeToTray: !!config.get('behaviour.close-to-tray'),
      minimizeToTray: !!config.get('behaviour.minimize-to-tray'),
      notifyEnabled: !!config.get('notifications.enabled'),
      notifySound: !!config.get('notifications.sound'),
      outgoingSound: !!config.get('notifications.outgoing-sound'),
      zoom: Number(config.get('view.zoom')) || 1.0,
      fontSize: Number(config.get('view.font-size')) || 16,
      privacyStealth: !!config.get('privacy.stealth'),
      privacyAutoBlur: config.get('privacy.auto-blur') !== false,
      privacyHoverReveal: config.get('privacy.hover-reveal') !== false,
      privacyBlurContacts: !!config.get('privacy.blur-contacts'),
      hibernationMinutes: config.get('accounts.hibernation-minutes') != null ? config.get('accounts.hibernation-minutes') : 30,
      lockOnSystemLock: config.get('lock.auto-lock-on-system-lock') !== false,
      customCssEnabled: !!config.get('view.custom-css-enabled'),
      globalShortcutsEnabled: config.get('shortcuts.global-enabled') !== false,
      globalShortcutToggle: config.get('shortcuts.global-toggle') || 'Super+Alt+W',
      globalShortcutMute: config.get('shortcuts.global-mute') || 'Super+Alt+M',
      forceX11: !!config.get('system.force-x11'),
      hardwareAcceleration: config.get('system.hardware-acceleration') !== false,
      spellcheckEnabled: config.get('behaviour.spellcheck') !== false,
      spellcheckLanguages: config.get('behaviour.spellcheck-languages') || 'en-US,ar',
      font: uiFont(config),
      fonts: {
        desktop: desktop.interfaceFont(),
        systemArabic: fonts.defaultFor('ar'),
        latin: {
          inherit: !!config.get('fonts.latin-inherit'),
          family: config.get('fonts.latin-family') || '',
          size: Number(config.get('fonts.latin-size')) || 100,
          bold: !!config.get('fonts.latin-bold'),
          italic: !!config.get('fonts.latin-italic'),
        },
        arabic: {
          inherit: !!config.get('fonts.arabic-inherit'),
          family: config.get('fonts.arabic-family') || '',
          size: Number(config.get('fonts.arabic-size')) || 100,
          bold: !!config.get('fonts.arabic-bold'),
          italic: !!config.get('fonts.arabic-italic'),
        },
        available: fonts.installed(),
      },
    };
  });

  ipcMain.handle('settings:set-theme', (_, theme) => {
    styleManager.setTheme(theme, {
      notifySidebarState: () => viewManager.notifySidebarState(),
      notifyWindowsTheme: t => dialogManager.notifyWindowsTheme(t),
    });
    return true;
  });

  ipcMain.handle('settings:set-autostart', (_, enable) => {
    autostart.setEnabled(enable);
    dialogManager.notifyWindowsAutostart(enable);
    return true;
  });

  ipcMain.handle('settings:set', (_, key, value) => changeSetting(key, value));

  ipcMain.handle('storage:get-cache-size', async () => {
    let totalBytes = 0;
    for (const { view } of viewManager.accountViews.values()) {
      if (view && view.webContents && view.webContents.session) {
        try {
          totalBytes += await view.webContents.session.getCacheSize();
        } catch (e) {}
      }
    }
    return totalBytes;
  });

  ipcMain.handle('storage:clear-cache', async () => {
    return await clearAllCaches(viewManager.accountViews);
  });

  ipcMain.handle('custom-css:open', async () => {
    if (!fs.existsSync(CUSTOM_CSS_PATH)) styleManager.initCustomCssWatcher();
    await shell.openPath(CUSTOM_CSS_PATH);
    return true;
  });

  ipcMain.handle('custom-css:reload', async () => {
    await styleManager.drawStyle();
    return true;
  });

  ipcMain.handle('spellcheck:set-languages', (_, langs) => {
    const langStr = Array.isArray(langs) ? langs.join(',') : String(langs || '');
    config.set('behaviour.spellcheck-languages', langStr);
    config.save();
    for (const { view } of viewManager.accountViews.values()) {
      if (view && view.webContents && view.webContents.session) {
        applySpellcheckToSession(view.webContents.session, config);
      }
    }
    applySpellcheckToSession(session.defaultSession, config);
    return true;
  });

  ipcMain.handle('lock:get-status', () => {
    return {
      enabled: lockMgr.isEnabled(),
      hasPasscode: lockMgr.hasPasscode(),
      timeout: Number(config.get('lock.timeout')) || 15,
      autoLockOnSystemLock: config.get('lock.auto-lock-on-system-lock') !== false,
      isLocked: lockMgr.isLocked,
    };
  });

  ipcMain.handle('lock:set-passcode', (_, pin) => lockMgr.setPasscode(pin));
  ipcMain.handle('lock:remove-passcode', (_, pin) => lockMgr.removePasscode(pin));

  ipcMain.handle('lock:unlock', async (_, pin) => {
    const ok = lockMgr.verify(pin);
    if (ok) dialogManager.hideLockWindow();
    return ok;
  });

  ipcMain.handle('lock:get-theme', () => {
    const t = config.get('view.theme') || 'system';
    if (t === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    return (t === 'light') ? 'light' : 'dark';
  });

  ipcMain.on('palette:execute', (_, actionId) => {
    const pm = getPaletteManager();
    if (pm) pm.executeAction(actionId);
  });

  ipcMain.on('palette:close', () => {
    const pm = getPaletteManager();
    if (pm) pm.hide();
  });

  ipcMain.on('settings:close', event => {
    const asked = BrowserWindow.fromWebContents(event.sender);
    if (asked && !asked.isDestroyed()) asked.close();
  });

  ipcMain.on('settings:restart', () => {
    console.log('restarting at the settings window\'s request');
    ctx.setQuitting(true);
    app.relaunch();
    app.quit();
  });
}

module.exports = {
  registerSettingsIpc,
};
