/*
 * Command Palette and Quick Switcher controller for WhatsApp Desktop.
 *
 * Provides a floating spotlight / palette (Ctrl+K) for rapid keyboard
 * navigation, account switching, stealth blur toggling, locking, and chat search.
 *
 * Modularized into:
 *   - src/core/palette/actions.js: Command catalog items and dynamic account action generator
 */
'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const { STATIC_ACTIONS, buildPaletteActions } = require('./palette/actions.js');

class PaletteManager {
  constructor({ getParentWindow, accountsMgr, actions, theme = 'system', uiFont = '' }) {
    this.getParentWindow = getParentWindow;
    this.accountsMgr = accountsMgr;
    this.actions = actions || {};
    this.theme = theme;
    this.uiFont = uiFont;
    this.win = null;
  }

  setTheme(theme) {
    this.theme = theme;
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('palette:theme', theme);
    }
  }

  buildActions() {
    return buildPaletteActions(this.accountsMgr);
  }

  show() {
    const parent = this.getParentWindow ? this.getParentWindow() : null;
    if (!parent || parent.isDestroyed()) return;

    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      this.sendInit();
      return;
    }

    const bounds = parent.getContentBounds();
    const width = 580;
    const height = 420;
    const x = Math.round(bounds.x + (bounds.width - width) / 2);
    const y = Math.round(bounds.y + Math.max(40, (bounds.height - height) / 3));

    this.win = new BrowserWindow({
      width,
      height,
      x,
      y,
      parent,
      modal: false,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      transparent: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'palette-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.win.loadFile(path.join(__dirname, '..', 'palette.html'));

    this.win.once('ready-to-show', () => {
      this.win.show();
      this.win.focus();
      this.sendInit();
    });

    this.win.on('blur', () => {
      this.hide();
    });

    this.win.on('closed', () => {
      this.win = null;
    });
  }

  hide() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
    const parent = this.getParentWindow ? this.getParentWindow() : null;
    if (parent && !parent.isDestroyed()) {
      parent.focus();
    }
  }

  toggle() {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  sendInit() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('palette:init', {
      actions: this.buildActions(),
      theme: this.theme,
      font: this.uiFont,
    });
  }

  executeAction(actionId) {
    this.hide();
    if (!actionId) return;

    if (actionId.startsWith('account:switch:')) {
      const targetId = actionId.slice('account:switch:'.length);
      if (this.actions.switchAccount) {
        this.actions.switchAccount(targetId);
      }
      return;
    }

    switch (actionId) {
      case 'action:chat-search':
        if (this.actions.focusChatSearch) this.actions.focusChatSearch();
        else if (this.actions.chatSearch) this.actions.chatSearch();
        break;
      case 'action:privacy':
        if (this.actions.togglePrivacy) this.actions.togglePrivacy();
        break;
      case 'action:lock':
        if (this.actions.lockApp) this.actions.lockApp();
        break;
      case 'action:toggle-sidebar':
        if (this.actions.toggleSidebar) this.actions.toggleSidebar();
        break;
      case 'action:settings':
        if (this.actions.openSettings) this.actions.openSettings();
        break;
      case 'action:fonts':
        if (this.actions.openFonts) this.actions.openFonts();
        break;
      case 'action:reload':
        if (this.actions.reload) this.actions.reload();
        else if (this.actions.reloadAccount) this.actions.reloadAccount();
        break;
      case 'action:clear-cache':
        if (this.actions.clearCache) this.actions.clearCache();
        break;
      case 'action:custom-css':
        if (this.actions.openCustomCss) this.actions.openCustomCss();
        break;
      case 'action:mute-call':
        if (this.actions.toggleCallMute) this.actions.toggleCallMute();
        break;
      default:
        console.log('Palette: unhandled action %s', actionId);
    }
  }

  execute(actionId) {
    return this.executeAction(actionId);
  }
}

module.exports = {
  PaletteManager,
  STATIC_ACTIONS,
  buildPaletteActions,
};
