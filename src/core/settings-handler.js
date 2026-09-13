/*
 * Settings mutation dispatcher handling dynamic preference updates.
 */
'use strict';

const { session, globalShortcut } = require('electron');
const { applySpellcheckToSession } = require('./session.js');
const { wireGlobalShortcuts } = require('./global-shortcuts.js');

function updateZoom(viewMgr, value) {
  const factor = Number(value) || 1.0;
  for (const [, item] of viewMgr.accountViews) {
    if (item.view && !item.view.webContents.isDestroyed()) {
      item.view.webContents.setZoomFactor(factor);
    }
  }
}

function updateTheme(options, value) {
  const { paletteController, viewMgr, styleMgr, dialogMgr } = options;
  paletteController.setTheme(value || 'system');
  viewMgr.notifySidebarState();
  if (styleMgr && styleMgr.setTheme) {
    styleMgr.setTheme(value || 'system', {
      notifySidebarState: () => viewMgr.notifySidebarState(),
      notifyWindowsTheme: t => {
        if (dialogMgr && dialogMgr.notifyWindowsTheme) dialogMgr.notifyWindowsTheme(t);
      },
    });
  } else if (styleMgr && styleMgr.applyStyle) {
    styleMgr.applyStyle();
  }
}

function updatePrivacy(privacyMgr, config, applyPrivacyState) {
  privacyMgr.manualStealth = !!config.get('privacy.stealth');
  privacyMgr.autoBlur = config.get('privacy.auto-blur') !== false;
  privacyMgr.hoverReveal = config.get('privacy.hover-reveal') !== false;
  privacyMgr.blurContacts = config.get('privacy.blur-contacts') !== false;
  applyPrivacyState();
}

function updateSpellcheck(viewMgr, config) {
  for (const { view } of viewMgr.accountViews.values()) {
    if (view && view.webContents && view.webContents.session) {
      applySpellcheckToSession(view.webContents.session, config);
    }
  }
  applySpellcheckToSession(session.defaultSession, config);
}

function createSettingsHandler(options) {
  const {
    config,
    viewMgr,
    paletteController,
    styleMgr,
    privacyMgr,
    windowStateMgr,
    applyPrivacyState,
    configureFonts,
    app,
    getMainWindow,
    dialogMgr,
    lockMgr,
  } = options;

  return function changeSetting(key, value) {
    config.set(key, value);
    config.save();

    if (key === 'view.zoom') {
      updateZoom(viewMgr, value);
    } else if (key === 'view.theme') {
      updateTheme({ paletteController, viewMgr, styleMgr, dialogMgr }, value);
    } else if (key === 'view.hyprland-accent' || key === 'view.font-size' || key === 'view.custom-css-enabled') {
      styleMgr.applyStyle();
    } else if (key.startsWith('privacy.')) {
      updatePrivacy(privacyMgr, config, applyPrivacyState);
    } else if (key.startsWith('shortcuts.')) {
      wireGlobalShortcuts({
        config,
        globalShortcut,
        getMainWindow,
        showWindow: why => windowStateMgr.showWindow(why),
        viewManager: viewMgr,
      });
    } else if (key.startsWith('behaviour.spellcheck')) {
      updateSpellcheck(viewMgr, config);
    } else if (key.startsWith('lock.')) {
      if (lockMgr && key === 'lock.enabled' && value && !lockMgr.hasPasscode()) {
        config.set('lock.enabled', false);
        config.save();
      }
      if (viewMgr && viewMgr.notifySidebarState) viewMgr.notifySidebarState();
    } else if (key.startsWith('system.')) {
      return { ok: true, restart: true };
    } else if (key.startsWith('fonts.') || key === 'view.font' || key === 'view.force-font') {
      const written = configureFonts(config, app);
      styleMgr.applyStyle();
      return { ok: true, restart: !!written.changed };
    }

    return { ok: true, restart: false };
  };
}

module.exports = {
  createSettingsHandler,
  updateZoom,
  updateTheme,
  updatePrivacy,
  updateSpellcheck,
};
