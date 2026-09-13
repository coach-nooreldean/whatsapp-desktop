/*
 * Dynamic stylesheet generation, CSS injection, theme application, and custom.css watching.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { nativeTheme } = require('electron');
const style = require('../style.js');
const { CUSTOM_CSS_PATH } = require('../config.js');
const { PRIVACY_CSS } = require('../privacy.js');
const { getWebThemeCss, detectHyprlandColors } = require('../themes.js');
const desktop = require('../desktop.js');

class StyleManager {
  constructor({ config, uiFont, forcingFont, chosenFonts, getMainWindow, getAccountViews, getActiveAccountId }) {
    this.config = config;
    this.uiFont = uiFont;
    this.forcingFont = forcingFont;
    this.chosenFonts = chosenFonts;
    this.getMainWindow = getMainWindow;
    this.getAccountViews = getAccountViews;
    this.getActiveAccountId = getActiveAccountId;

    this.drawnWith = null;
    this.pageFontStack = '';
    this.hyprlandColors = null;
    this.styling = Promise.resolve();
  }

  setPageFontStack(stack) {
    this.pageFontStack = stack;
  }

  styleSheet() {
    const wanted = {
      fontSize: this.config.get('view.font-size'),
    };
    const sheet = style.build(wanted, this.drawnWith);
    this.drawnWith = wanted;

    const currentTheme = this.config.get('view.theme') || 'system';
    const useHyprland = this.config.get('view.hyprland-accent') !== false;
    const webThemeCss = getWebThemeCss(
      currentTheme,
      useHyprland ? (this.hyprlandColors || detectHyprlandColors()) : null
    );

    let customCss = '';
    if (this.config.get('view.custom-css-enabled') && fs.existsSync(CUSTOM_CSS_PATH)) {
      try {
        customCss = fs.readFileSync(CUSTOM_CSS_PATH, 'utf8');
      } catch (e) {}
    }

    return [
      sheet,
      this.forcingFont(this.config) ? style.fontFaces(this.pageFontStack, this.chosenFonts(this.config)) : '',
      webThemeCss,
      PRIVACY_CSS,
      customCss,
    ].filter(Boolean).join('\n');
  }

  async drawStyleForView(item) {
    if (!item || !item.view || item.view.webContents.isDestroyed()) return;
    const css = this.styleSheet();

    const stale = item.cssKeys || [];
    item.cssKeys = [];
    for (const key of stale) {
      try {
        await item.view.webContents.removeInsertedCSS(key);
      } catch (e) {}
    }

    if (css) {
      try {
        const key = await item.view.webContents.insertCSS(css, { cssOrigin: 'user' });
        item.cssKeys.push(key);
      } catch (err) {
        console.warn('Failed to insert user CSS for account view: %s', err.message);
      }
    }
  }

  async drawStyle() {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    const family = this.uiFont(this.config);

    const accountViews = this.getAccountViews();
    for (const [, item] of accountViews) {
      await this.drawStyleForView(item);
    }

    const activeAccountId = this.getActiveAccountId();
    const activeItem = accountViews.get(activeAccountId);
    if (activeItem) {
      require('../main-css.js').track(
        win,
        () => activeItem.cssKeys[activeItem.cssKeys.length - 1] || null,
        key => { activeItem.cssKeys = key ? [key] : []; }
      );
    }

    console.log('drawing in %s at %dpx%s', family, this.config.get('view.font-size'),
                this.pageFontStack ? '' : ' (waiting for the page to say what it asks for)');
  }

  applyStyle() {
    this.styling = this.styling.catch(() => {}).then(() => this.drawStyle());
    return this.styling;
  }

  setTheme(theme, { notifySidebarState, notifyWindowsTheme }) {
    this.config.set('view.theme', theme);
    this.config.save();

    if (theme === 'light') {
      nativeTheme.themeSource = 'light';
    } else if (theme === 'system') {
      nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
    } else {
      nativeTheme.themeSource = 'dark';
    }

    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      let bg = nativeTheme.shouldUseDarkColors ? '#0b141a' : '#ffffff';
      if (theme === 'oled') bg = '#000000';
      else if (theme === 'nord') bg = '#2e3440';
      else if (theme === 'catppuccin') bg = '#1e1e2e';
      win.setBackgroundColor(bg);
    }

    this.applyStyle();
    if (notifySidebarState) notifySidebarState();
    if (notifyWindowsTheme) notifyWindowsTheme(theme);
  }

  initCustomCssWatcher() {
    try {
      if (!fs.existsSync(CUSTOM_CSS_PATH)) {
        const template = `/*
 * WhatsApp Desktop - Custom User Stylesheet
 * 
 * Any CSS written here will be injected into WhatsApp Web and hot-reloaded upon saving.
 * Example customizations:
 *
 *   /* Compact chat list: */
 *   /* #pane-side [role="row"] { height: 60px !important; } */
 *
 *   /* Hide chat list avatars: */
 *   /* #pane-side [role="gridcell"] img { display: none !important; } */
 */
`;
        fs.mkdirSync(path.dirname(CUSTOM_CSS_PATH), { recursive: true });
        fs.writeFileSync(CUSTOM_CSS_PATH, template, { mode: 0o644 });
      }

      let debounceTimer = null;
      fs.watch(CUSTOM_CSS_PATH, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            console.log('custom.css changed, hot-reloading styles...');
            this.drawStyle();
          }, 120);
        }
      });
    } catch (err) {
      console.warn('could not initialize custom.css watcher: %s', err.message);
    }
  }
}

module.exports = {
  StyleManager,
};
