/*
 * Configuration defaults, path constants, and descriptions.
 */
'use strict';

const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'whatsapp-desktop'
);
const CONFIG_PATH = path.join(CONFIG_DIR, 'whatsapp-desktop.conf');
const CUSTOM_CSS_PATH = path.join(CONFIG_DIR, 'custom.css');

const DEFAULTS = {
  'view.theme': 'system', // 'system' (follow desktop), 'dark', or 'light'
  'view.font': '', // empty: follow the desktop font
  'view.font-size': 16, // WhatsApp sizes in rem, so this scales the client
  'view.zoom': 1.0,
  'view.force-font': true, // draw the page in one family, like a browser told to ignore page fonts
  'view.sidebar-collapsed': false, // whether the multi-account sidebar is collapsed
  'view.language': 'ar', // 'ar' (Arabic) or 'en' (English)

  /* A font per script, and a switch per script to say whether the desktop's own
     is being followed. */
  'fonts.latin-inherit': true,
  'fonts.latin-family': '', // empty: the desktop font, as before
  'fonts.latin-size': 100, // per cent of the family's own size
  'fonts.latin-bold': false,
  'fonts.latin-italic': false,
  'fonts.arabic-inherit': true,
  'fonts.arabic-family': '', // empty: whatever the system draws Arabic in
  'fonts.arabic-size': 100,
  'fonts.arabic-bold': false,
  'fonts.arabic-italic': false,

  'window.width': 1200,
  'window.height': 800,

  'behaviour.close-to-tray': true,
  'behaviour.minimize-to-tray': false,
  'behaviour.spellcheck': true,
  'behaviour.raise': 'auto',

  'notifications.enabled': true,
  'notifications.sound': true, // a tone for the banners this client raises itself
  'notifications.outgoing-sound': false, // WhatsApp's own tone for a message you send
  'notifications.whatsapp-sound': false, // let WhatsApp play its own tone for a message arriving
  'notifications.banner-seconds': 12,
  'notifications.hide-preview': false, // the chat and the kind of message, never the words

  'media.download-stickers': true,
  'media.hide-controls-when-paused': true,
  'media.ask-where-to-save': true,
  'media.download-dir': '',

  'links.claim-scheme': true,
  'updates.check': true,

  /* Privacy Shield & Stealth Mode: blur chats, media, and contacts */
  'privacy.stealth': false,
  'privacy.auto-blur': true,
  'privacy.hover-reveal': true,
  'privacy.blur-contacts': true,

  /* App Lock & Passcode */
  'lock.enabled': false,
  'lock.timeout': 15,
  'lock.auto-lock-on-system-lock': true,

  /* Linux Desktop MPRIS2 Media Player */
  'mpris.enabled': true,

  /* Multi-account memory optimization (minutes of inactivity before sleeping background account) */
  'accounts.hibernation-minutes': 30,

  /* Dynamic Hyprland / system accent color adoption */
  'view.hyprland-accent': true,

  /* Custom user stylesheet (~/.config/whatsapp-desktop/custom.css) */
  'view.custom-css-enabled': false,

  /* Linux System & Display flags */
  'system.force-x11': false,
  'system.hardware-acceleration': true,

  /* Global OS-wide keyboard shortcuts */
  'shortcuts.global-enabled': true,
  'shortcuts.global-toggle': 'Super+Alt+W',
  'shortcuts.global-mute': 'Super+Alt+M',

  /* Spellchecking languages */
  'behaviour.spellcheck-languages': 'en-US,ar',
};

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  CUSTOM_CSS_PATH,
  DEFAULTS,
};
