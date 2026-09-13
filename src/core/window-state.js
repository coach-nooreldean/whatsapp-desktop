/*
 * Window state machine, focus tracking, and Wayland/X11 raise strategies.
 */
'use strict';

const { screen: electronScreen } = require('electron');
const debug = require('../debug.js');

const FOCUS_GRACE_MS = 400;
const RAISE_VERIFY_MS = 250;
const RAISE_COALESCE_MS = 600;

function clampToScreen(width, height) {
  try {
    const primaryDisplay = electronScreen.getPrimaryDisplay();
    const area = primaryDisplay ? primaryDisplay.workAreaSize : { width: 1920, height: 1080 };
    return {
      width: Math.min(Math.max(400, Math.round(width || 1000)), area.width),
      height: Math.min(Math.max(300, Math.round(height || 700)), area.height),
    };
  } catch (e) {
    return {
      width: Math.min(Math.max(400, Math.round(width || 1000)), 1920),
      height: Math.min(Math.max(300, Math.round(height || 700)), 1080),
    };
  }
}

class WindowStateManager {
  constructor({ config, onWayland = false }) {
    this.config = config;
    this.onWayland = onWayland;
    this.windowState = { visible: false, minimized: false, focused: false };
    this.remapping = false;
    this.blurredAt = 0;
    this.graceTimer = null;
    this.raising = { gen: 0, at: 0, took: false };
    this.raiseStrategy = '';
    this.raiseMeasured = true;
    this.win = null;
    this.tray = null;
  }

  setWindow(win) {
    this.win = win;
  }

  setTray(tray) {
    this.tray = tray;
  }

  windowOnScreen() {
    return this.remapping || (this.windowState.visible && !this.windowState.minimized);
  }

  windowInFront() {
    return this.remapping || (this.windowOnScreen() &&
      (this.windowState.focused || Date.now() - this.blurredAt < FOCUS_GRACE_MS));
  }

  traceWindowState() {
    if (!this.win) return;
    const win = this.win;

    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore']) {
      win.on(event, () => debug.trace('window event: %s %s', event, JSON.stringify({
        visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused() })));
    }

    const set = change => {
      Object.assign(this.windowState, change);
      const onScreen = this.windowOnScreen();
      debug.trace('window: %s -> %s', JSON.stringify(this.windowState),
        onScreen ? 'on the screen' : 'away');
      if (this.tray) this.tray.setInFront(this.windowInFront());
    };

    win.on('show', () => set({ visible: true, minimized: false }));
    win.on('hide', () => set({ visible: false, focused: false }));
    win.on('minimize', () => set({ minimized: true }));
    win.on('restore', () => set(win.isFocused() ? { minimized: false } : {}));

    win.on('focus', () => {
      clearTimeout(this.graceTimer);
      this.raising.took = true;
      set({ minimized: false, focused: true });
    });

    win.on('blur', () => {
      this.blurredAt = Date.now();
      set({ focused: false });
      clearTimeout(this.graceTimer);
      this.graceTimer = setTimeout(() => {
        if (this.tray) this.tray.setInFront(this.windowInFront());
      }, FOCUS_GRACE_MS + 50);
    });
  }

  remapWindow() {
    if (!this.win) return;
    this.remapping = true;
    this.win.hide();

    if (this.win.isMinimized()) this.win.restore();

    this.win.show();
    this.win.focus();
    setTimeout(() => { this.remapping = false; }, 0);
  }

  activateWindow() {
    if (!this.win) return;
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
  }

  raiseWindow(strategy, why, verify) {
    if (!this.win) return;
    const gen = ++this.raising.gen;
    this.raising.at = Date.now();
    this.raising.took = false;
    debug.trace('raise: %s (%s)', strategy, why || 'no reason given');

    if (strategy === 'remap') this.remapWindow();
    else this.activateWindow();

    if (!verify) return;

    setTimeout(() => {
      if (gen !== this.raising.gen || !this.win || this.win.isDestroyed()) return;
      if (this.raising.took || this.win.isFocused()) return;
      const other = strategy === 'remap' ? 'activate' : 'remap';
      console.log('the window did not come forward when raised by %s; %s from here on',
                  strategy, other);
      this.raiseStrategy = other;
      this.raiseWindow(other, why, false);
    }, RAISE_VERIFY_MS);
  }

  showWindow(why) {
    if (!this.win || this.win.isDestroyed()) return;

    if (this.win.isVisible() && !this.win.isMinimized() && this.win.isFocused()) {
      this.win.focus();
      return;
    }

    if (Date.now() - this.raising.at < RAISE_COALESCE_MS) {
      debug.trace('raise: a second ask (%s) arrived while one was still settling; ignored',
                  why || 'no reason given');
      return;
    }

    if (!this.raiseStrategy) {
      const asked = String(this.config.get('behaviour.raise') || 'auto').toLowerCase();
      this.raiseMeasured = asked !== 'activate' && asked !== 'remap';
      this.raiseStrategy = this.raiseMeasured ? (this.onWayland ? 'remap' : 'activate') : asked;
      console.log('raising the window by %s%s', this.raiseStrategy,
                  this.raiseMeasured ? '' : ', as the config asks');
    }
    this.raiseWindow(this.raiseStrategy, why, this.raiseMeasured);
  }

  hideWindow() {
    if (!this.win || this.win.isDestroyed()) return;
    this.raising.gen++;
    this.win.hide();
  }

  toggleWindow() {
    if (this.windowInFront()) this.hideWindow();
    else this.showWindow('the tray was asked for it');
  }

  pushFocus({ privacyMgr, applyPrivacyState, lockMgr, accountViews, activeAccountId, withdrawOpen, withdrawRinging }) {
    if (!this.win || this.win.isDestroyed()) return;
    const onScreen = this.remapping || (this.win.isVisible() && !this.win.isMinimized());
    const active = onScreen && this.win.isFocused();

    if (privacyMgr) {
      privacyMgr.setWindowFocus(active);
      if (applyPrivacyState) applyPrivacyState();
    }
    if (active && lockMgr) {
      lockMgr.recordActivity();
    }
    if (accountViews) {
      for (const [id, item] of accountViews) {
        if (item.view && !item.view.webContents.isDestroyed()) {
          const isThisActive = active && (id === activeAccountId);
          item.view.webContents.send('wa:focus', isThisActive);
          item.view.webContents.send('wa:on-screen', onScreen);
        }
      }
    }

    if (active) {
      if (withdrawOpen) withdrawOpen();
      if (withdrawRinging) withdrawRinging();
    }
  }
}

module.exports = {
  clampToScreen,
  WindowStateManager,
  FOCUS_GRACE_MS,
  RAISE_VERIFY_MS,
  RAISE_COALESCE_MS,
};
