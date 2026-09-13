/*
 * Curated Themes and Hyprland / System Color Adoption.
 *
 * Modularized into:
 *   - src/themes/palettes.js: Curated theme specifications (Dark, Light, OLED, Nord, etc.)
 *   - src/themes/pywal.js: Dynamic Pywal / Wallust / Hyprland color parser
 */
'use strict';

const { THEMES } = require('./themes/palettes.js');
const { detectHyprlandColors } = require('./themes/pywal.js');

/**
 * Generate CSS overrides for WhatsApp Web page when a custom theme is active.
 */
function getWebThemeCss(themeKey, hyprAccent = null) {
  const theme = THEMES[themeKey];
  if (!theme || themeKey === 'system' || themeKey === 'light' || themeKey === 'dark') {
    if (hyprAccent) {
      return `
        /* Dynamic Hyprland accent tint */
        :root { --accent: ${hyprAccent} !important; --teal: ${hyprAccent} !important; }
        .active-pill { background-color: ${hyprAccent} !important; }
      `;
    }
    return '';
  }

  const effectiveAccent = hyprAccent || theme.accent;

  return `
  /* WhatsApp Desktop - Theme: ${theme.name} */
  :root {
    --bg-color: ${theme.bg} !important;
    --background-default: ${theme.bg} !important;
    --background-default-hover: ${theme.card} !important;
    --panel-background-lighter: ${theme.card} !important;
    --panel-background-deep: ${theme.bg} !important;
    --conversation-panel-background: ${theme.bg} !important;
    --border-strong: ${theme.border} !important;
    --border-subtle: ${theme.border} !important;
    --primary-strong: ${effectiveAccent} !important;
    --primary: ${effectiveAccent} !important;
    --teal: ${effectiveAccent} !important;
  }

  body, #app, #main, #pane-side, [data-testid="conversation-panel-wrapper"] {
    background-color: ${theme.bg} !important;
    color: ${theme.text} !important;
  }

  header, [data-testid="chatlist-header"], [data-testid="conversation-header"] {
    background-color: ${theme.card} !important;
    border-color: ${theme.border} !important;
  }

  .message-in .copyable-text {
    background-color: ${theme.incomingBubble} !important;
    color: ${theme.text} !important;
  }

  .message-out .copyable-text {
    background-color: ${theme.outgoingBubble} !important;
    color: ${theme.text} !important;
  }
  `;
}

module.exports = {
  THEMES,
  detectHyprlandColors,
  getWebThemeCss,
};
