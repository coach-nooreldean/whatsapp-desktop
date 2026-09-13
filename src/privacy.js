/*
 * Privacy Shield & Stealth Mode for WhatsApp Desktop.
 *
 * Provides instant blurring of chat messages, media previews, and contacts
 * to protect conversations from shoulder-surfing in public spaces or office environments.
 *
 * Can be toggled immediately via Ctrl+Alt+P, via the sidebar/header button,
 * or configured to auto-blur whenever the window loses focus.
 */
'use strict';

const PRIVACY_CSS = `
/* WhatsApp Desktop - Privacy Shield */
body.wa-privacy-active #main .message-in .copyable-text,
body.wa-privacy-active #main .message-out .copyable-text,
body.wa-privacy-active #main div[data-pre-plain-text],
body.wa-privacy-active #main span.selectable-text {
  filter: blur(8px) !important;
  transition: filter 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none !important;
}

body.wa-privacy-active #main img,
body.wa-privacy-active #main video,
body.wa-privacy-active #main div[data-testid="audio-player"],
body.wa-privacy-active #main div[data-testid="ptt-draft-player"],
body.wa-privacy-active #main div[data-testid="sticker"],
body.wa-privacy-active #main div[data-testid="image-thumb"],
body.wa-privacy-active #main div[role="button"]:has(span[data-icon="audio-play"]) {
  filter: blur(12px) !important;
  transition: filter 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Chat list: contact names, last message preview, and status text */
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] span[title],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] span[dir="auto"],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] span[dir="ltr"],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] span[dir="rtl"],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] div:has(> span[title]),
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] [data-testid="last-msg-status"],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] div[data-testid="cell-frame-title"],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="gridcell"] span[title],
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="gridcell"] span[dir="auto"],
body.wa-privacy-active.wa-privacy-contacts #pane-side div[role="listitem"] span[title],
body.wa-privacy-active.wa-privacy-contacts #pane-side div[role="listitem"] div:has(> span[title]),
body.wa-privacy-active.wa-privacy-contacts #side [role="row"] span[title],
body.wa-privacy-active.wa-privacy-contacts #side [role="row"] span[dir="auto"] {
  filter: blur(7px) !important;
  transition: filter 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none !important;
}

/* Chat list: profile pictures & avatars */
body.wa-privacy-active.wa-privacy-contacts #pane-side [role="row"] img,
body.wa-privacy-active.wa-privacy-contacts #pane-side img,
body.wa-privacy-active.wa-privacy-contacts #side [role="row"] img,
body.wa-privacy-active.wa-privacy-contacts #side div[role="button"] img {
  filter: blur(10px) !important;
  transition: filter 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Active chat header: contact title and avatar */
body.wa-privacy-active.wa-privacy-contacts header span[title],
body.wa-privacy-active.wa-privacy-contacts header [data-testid="conversation-info-header"] span[title],
body.wa-privacy-active.wa-privacy-contacts header span[dir="auto"],
body.wa-privacy-active.wa-privacy-contacts header img {
  filter: blur(7px) !important;
  transition: filter 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Hover reveal */
body.wa-privacy-active.wa-privacy-hover #main .message-in:hover .copyable-text,
body.wa-privacy-active.wa-privacy-hover #main .message-out:hover .copyable-text,
body.wa-privacy-active.wa-privacy-hover #main div[data-pre-plain-text]:hover,
body.wa-privacy-active.wa-privacy-hover #main span.selectable-text:hover,
body.wa-privacy-active.wa-privacy-hover #main img:hover,
body.wa-privacy-active.wa-privacy-hover #main video:hover,
body.wa-privacy-active.wa-privacy-hover #main div[data-testid="audio-player"]:hover,
body.wa-privacy-active.wa-privacy-hover #main div[data-testid="ptt-draft-player"]:hover,
body.wa-privacy-active.wa-privacy-hover #main div[data-testid="sticker"]:hover,
body.wa-privacy-active.wa-privacy-hover #main div[data-testid="image-thumb"]:hover,
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover span[title],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover span[dir="auto"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover span[dir="ltr"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover span[dir="rtl"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover div:has(> span[title]),
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover [data-testid="last-msg-status"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover div[data-testid="cell-frame-title"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="row"]:hover img,
body.wa-privacy-active.wa-privacy-hover #pane-side [role="gridcell"]:hover span[title],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="gridcell"]:hover span[dir="auto"],
body.wa-privacy-active.wa-privacy-hover #pane-side [role="gridcell"]:hover img,
body.wa-privacy-active.wa-privacy-hover #pane-side div[role="listitem"]:hover span[title],
body.wa-privacy-active.wa-privacy-hover #pane-side div[role="listitem"]:hover div:has(> span[title]),
body.wa-privacy-active.wa-privacy-hover #side [role="row"]:hover span[title],
body.wa-privacy-active.wa-privacy-hover #side [role="row"]:hover span[dir="auto"],
body.wa-privacy-active.wa-privacy-hover #side [role="row"]:hover img,
body.wa-privacy-active.wa-privacy-hover header:hover span[title],
body.wa-privacy-active.wa-privacy-hover header:hover span[dir="auto"],
body.wa-privacy-active.wa-privacy-hover header:hover img {
  filter: none !important;
}
`;

class PrivacyManager {
  constructor(config) {
    this.config = config;
    this.manualStealth = !!config.get('privacy.stealth');
    this.autoBlur = config.get('privacy.auto-blur') !== false;
    this.hoverReveal = config.get('privacy.hover-reveal') !== false;
    this.blurContacts = config.get('privacy.blur-contacts') !== false;
    this.windowFocused = true;
  }

  isBlurred() {
    if (this.manualStealth) return true;
    if (this.autoBlur && !this.windowFocused) return true;
    return false;
  }

  toggleStealth() {
    this.manualStealth = !this.manualStealth;
    this.config.set('privacy.stealth', this.manualStealth);
    this.config.save();
    return this.isBlurred();
  }

  setWindowFocus(focused) {
    this.windowFocused = !!focused;
    return this.isBlurred();
  }

  getClasses() {
    const classes = [];
    if (this.isBlurred()) {
      classes.push('wa-privacy-active');
      if (this.hoverReveal) classes.push('wa-privacy-hover');
      if (this.blurContacts) classes.push('wa-privacy-contacts');
    }
    return classes;
  }

  getInjectScript() {
    const classes = this.getClasses();
    const classStr = JSON.stringify(classes);
    return `(() => {
      const cls = ${classStr};
      const targets = ['wa-privacy-active', 'wa-privacy-hover', 'wa-privacy-contacts'];
      targets.forEach(c => document.body.classList.remove(c));
      cls.forEach(c => document.body.classList.add(c));
    })();`;
  }
}

module.exports = {
  PRIVACY_CSS,
  PrivacyManager,
};
