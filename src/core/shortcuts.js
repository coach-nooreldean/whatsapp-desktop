/*
 * Keyboard shortcuts handler for WhatsApp Desktop.
 *
 * Handles global accelerator mappings:
 *   - Ctrl+Q: Quit application
 *   - Ctrl+W: Hide window to tray
 *   - Ctrl+R: Reload active account view
 *   - Ctrl+Shift+I: Toggle devtools
 *   - Ctrl+,: Open Settings dialog
 *   - Ctrl+1 through Ctrl+9: Switch between accounts
 *   - Ctrl+Alt+A: Open Add Account dialog
 *   - Ctrl+Alt+S: Toggle accounts sidebar
 *   - Ctrl+Alt+P: Toggle Privacy Shield (Stealth blur)
 *   - Ctrl+Alt+L: Lock application (App Lock)
 *   - Ctrl + / - / 0: Zoom in, out, reset
 */
'use strict';

function handleShortcut(event, input, actions) {
  if (input.type !== 'keyDown') return false;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();

  // Quit
  if (ctrl && key === 'q') {
    event.preventDefault();
    if (actions.quit) actions.quit();
    return true;
  }

  // Close / Hide to tray
  if (ctrl && key === 'w') {
    event.preventDefault();
    if (actions.closeWindow) actions.closeWindow();
    return true;
  }

  // Reload
  if (ctrl && key === 'r') {
    event.preventDefault();
    if (actions.reload) actions.reload();
    return true;
  }

  // DevTools
  if (ctrl && input.shift && key === 'i') {
    event.preventDefault();
    if (actions.toggleDevTools) actions.toggleDevTools();
    return true;
  }

  // Settings
  if (ctrl && key === ',') {
    event.preventDefault();
    if (actions.openSettings) actions.openSettings();
    return true;
  }

  // Command Palette / Quick Switcher
  if (ctrl && !input.alt && key === 'k') {
    event.preventDefault();
    if (actions.openCommandPalette) actions.openCommandPalette();
    return true;
  }

  // Ctrl+1 through Ctrl+9 switches accounts
  if (ctrl && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
    const idx = parseInt(input.key, 10) - 1;
    event.preventDefault();
    if (actions.switchAccountByIndex) actions.switchAccountByIndex(idx);
    return true;
  }

  // Ctrl+Alt+A opens Add Account
  if (ctrl && input.alt && key === 'a') {
    event.preventDefault();
    if (actions.openAddAccount) actions.openAddAccount();
    return true;
  }

  // Ctrl+Alt+S toggles sidebar collapse/expand
  if (ctrl && input.alt && key === 's') {
    event.preventDefault();
    if (actions.toggleSidebar) actions.toggleSidebar();
    return true;
  }

  // Ctrl+Alt+P toggles Privacy Shield (Stealth mode)
  if (ctrl && input.alt && key === 'p') {
    event.preventDefault();
    if (actions.togglePrivacy) actions.togglePrivacy();
    return true;
  }

  // Ctrl+Alt+L locks application (App Lock)
  if (ctrl && input.alt && key === 'l') {
    event.preventDefault();
    if (actions.lockApp) actions.lockApp();
    return true;
  }

  // Zoom controls
  if (ctrl && (key === '+' || key === '=')) {
    event.preventDefault();
    if (actions.zoomIn) actions.zoomIn();
    return true;
  }
  if (ctrl && key === '-') {
    event.preventDefault();
    if (actions.zoomOut) actions.zoomOut();
    return true;
  }
  if (ctrl && key === '0') {
    event.preventDefault();
    if (actions.zoomReset) actions.zoomReset();
    return true;
  }

  return false;
}

module.exports = {
  handleShortcut,
};
