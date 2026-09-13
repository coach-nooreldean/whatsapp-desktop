/*
 * Command Palette and Quick Switcher controller for WhatsApp Desktop.
 *
 * Provides a floating spotlight / palette (Ctrl+K) for rapid keyboard
 * navigation, account switching, stealth blur toggling, locking, and chat search.
 */
'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

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
    const list = [
      {
        id: 'action:chat-search',
        title: 'Jump to Chat Search',
        description: 'Focus WhatsApp Web search input to find contacts or messages',
        category: 'Chat',
        shortcut: 'Ctrl+K /',
        icon: 'search',
      },
      {
        id: 'action:privacy',
        title: 'Toggle Privacy Shield',
        description: 'Instantly blur chat messages, previews, and media',
        category: 'Privacy',
        shortcut: 'Ctrl+Alt+P',
        icon: 'shield',
      },
      {
        id: 'action:lock',
        title: 'Lock WhatsApp',
        description: 'Lock application immediately with passcode',
        category: 'Security',
        shortcut: 'Ctrl+Alt+L',
        icon: 'lock',
      },
      {
        id: 'action:toggle-sidebar',
        title: 'Toggle Accounts Sidebar',
        description: 'Collapse or expand the vertical multi-account sidebar',
        category: 'Navigation',
        shortcut: 'Ctrl+Alt+S',
        icon: 'sidebar',
      },
      {
        id: 'action:settings',
        title: 'Open Settings',
        description: 'Configure appearance, privacy, notifications, and security',
        category: 'System',
        shortcut: 'Ctrl+,',
        icon: 'settings',
      },
      {
        id: 'action:fonts',
        title: 'Configure Fonts',
        description: 'Adjust typography for Arabic and Latin scripts',
        category: 'System',
        shortcut: '',
        icon: 'font',
      },
      {
        id: 'action:reload',
        title: 'Reload Active Account',
        description: 'Reload the active WhatsApp Web view',
        category: 'System',
        shortcut: 'Ctrl+R',
        icon: 'reload',
      },
      {
        id: 'action:clear-cache',
        title: 'Clear Disk & Media Cache',
        description: 'Free up disk space by purging cached media without logging out',
        category: 'Maintenance',
        shortcut: '',
        icon: 'trash',
      },
      {
        id: 'action:custom-css',
        title: 'Open custom.css in Editor',
        description: 'Customize WhatsApp Web styles in your default Linux text editor',
        category: 'Appearance',
        shortcut: '',
        icon: 'code',
      },
      {
        id: 'action:mute-call',
        title: 'Toggle Call Mute',
        description: 'Mute or unmute active WhatsApp voice/video call microphone',
        category: 'Calls',
        shortcut: 'Super+Alt+M',
        icon: 'mic',
      },
    ];

    // Dynamic account switching items
    if (this.accountsMgr) {
      const accounts = this.accountsMgr.getAccounts ? this.accountsMgr.getAccounts() : [];
      const activeId = this.accountsMgr.getActiveId ? this.accountsMgr.getActiveId() : null;
      accounts.forEach((acc, idx) => {
        const isActive = acc.id === activeId;
        const shortcut = idx < 9 ? `Ctrl+${idx + 1}` : '';
        list.push({
          id: `account:switch:${acc.id}`,
          title: `Switch to ${acc.name}${isActive ? ' (Active)' : ''}`,
          description: `Switch view to WhatsApp account #${idx + 1}`,
          category: 'Accounts',
          shortcut,
          color: acc.color,
          icon: 'user',
          isActive,
        });
      });
    }

    return list;
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
    const width = Math.min(580, Math.floor(bounds.width * 0.8));
    const height = 380;
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
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      transparent: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'palette-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.win.loadFile(path.join(__dirname, '..', 'palette.html'));

    this.win.once('ready-to-show', () => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.show();
        this.win.focus();
        this.sendInit();
      }
    });

    this.win.on('blur', () => {
      this.hide();
    });

    this.win.on('closed', () => {
      this.win = null;
    });
  }

  sendInit() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('palette:init', {
      actions: this.buildActions(),
      theme: this.theme,
      font: this.uiFont,
    });
  }

  hide() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  toggle() {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  executeAction(actionId) {
    this.hide();
    if (!actionId) return;

    if (actionId.startsWith('account:switch:')) {
      const accId = actionId.replace('account:switch:', '');
      if (this.actions && this.actions.switchAccount) {
        this.actions.switchAccount(accId);
      }
      return;
    }

    switch (actionId) {
      case 'action:chat-search':
        if (this.actions && this.actions.focusChatSearch) this.actions.focusChatSearch();
        break;
      case 'action:privacy':
        if (this.actions && this.actions.togglePrivacy) this.actions.togglePrivacy();
        break;
      case 'action:lock':
        if (this.actions && this.actions.lockApp) this.actions.lockApp();
        break;
      case 'action:toggle-sidebar':
        if (this.actions && this.actions.toggleSidebar) this.actions.toggleSidebar();
        break;
      case 'action:settings':
        if (this.actions && this.actions.openSettings) this.actions.openSettings();
        break;
      case 'action:fonts':
        if (this.actions && this.actions.openFonts) this.actions.openFonts();
        break;
      case 'action:reload':
        if (this.actions && this.actions.reload) this.actions.reload();
        break;
      case 'action:clear-cache':
        if (this.actions && this.actions.clearCache) this.actions.clearCache();
        break;
      case 'action:custom-css':
        if (this.actions && this.actions.openCustomCss) this.actions.openCustomCss();
        break;
      case 'action:mute-call':
        if (this.actions && this.actions.toggleCallMute) this.actions.toggleCallMute();
        break;
    }
  }
}

module.exports = {
  PaletteManager,
};
