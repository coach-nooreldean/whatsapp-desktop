/*
 * WhatsApp Web Call and Auxiliary popup window handling.
 */
'use strict';

const path = require('path');
const { nativeTheme } = require('electron');
const debug = require('../../debug.js');

class PopupManager {
  constructor({ config, appIcon, uiFont, TITLE }) {
    this.config = config;
    this.appIcon = appIcon;
    this.uiFont = uiFont;
    this.TITLE = TITLE;
    this.popups = new Set();
  }

  popupOptions(features) {
    const family = this.uiFont();
    const sized = /(^|,)\s*(width|height)\s*=/i.test(features || '');
    return {
      ...(sized ? {} : { width: 480, height: 640 }),
      title: this.TITLE,
      icon: this.appIcon,
      autoHideMenuBar: true,
      backgroundColor: (nativeTheme && nativeTheme.shouldUseDarkColors) ? '#0b141a' : '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        additionalArguments: ['--wa-popup'],
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
        autoplayPolicy: 'no-user-gesture-required',
        defaultFontFamily: { standard: family, sansSerif: family, serif: family },
        defaultFontSize: this.config.get('view.font-size'),
        backgroundThrottling: false,
      },
    };
  }

  adoptPopup(popup, { showContextMenu, styleSheet, onPopupKey, openExternally, isWhatsApp }) {
    this.popups.add(popup);
    popup.on('closed', () => {
      this.popups.delete(popup);
      debug.trace('popup: closed, %d left', this.popups.size);
    });
    popup.on('close', () => debug.trace('popup: asked to close'));

    const contents = popup.webContents;
    contents.on('context-menu', (event, params) => showContextMenu(contents, params));

    contents.on('did-finish-load', async () => {
      debug.trace('popup: loaded %s', contents.getURL());
      contents.setZoomFactor(Number(this.config.get('view.zoom')) || 1);
      const css = styleSheet();
      if (css) await contents.insertCSS(css, { cssOrigin: 'user' }).catch(() => {});
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (openExternally) openExternally(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (isWhatsApp && isWhatsApp(url)) return;
      event.preventDefault();
      if (openExternally) openExternally(url);
    });

    contents.on('before-input-event', (event, input) => {
      if (onPopupKey) onPopupKey(popup, event, input);
    });

    console.log('WhatsApp asked for a window of its own; %dx%d',
                popup.getBounds().width, popup.getBounds().height);
  }
}

module.exports = {
  PopupManager,
};
