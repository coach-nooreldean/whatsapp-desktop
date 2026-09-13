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
 *
 * Fully supports Arabic keyboard layout via input.code and Arabic glyph mappings.
 */
'use strict';

function isKeyMatch(input, letter, arabicChar, codeName) {
  const targetCode = (codeName || `Key${letter.toUpperCase()}`).toLowerCase();
  if (input.code && input.code.toLowerCase() === targetCode) {
    return true;
  }
  const k = (input.key || '').toLowerCase();
  return k === letter.toLowerCase() || (arabicChar && k === arabicChar.toLowerCase());
}

function getAccountIndex(input) {
  if (input.code) {
    const m = input.code.match(/^(?:Digit|Numpad)([1-9])$/);
    if (m) return parseInt(m[1], 10) - 1;
  }
  if (input.key && /^[1-9]$/.test(input.key)) {
    return parseInt(input.key, 10) - 1;
  }
  const arabicDigits = {
    '١': 0, '٢': 1, '٣': 2, '٤': 3, '٥': 4,
    '٦': 5, '٧': 6, '٨': 7, '٩': 8,
  };
  if (input.key && arabicDigits[input.key] !== undefined) {
    return arabicDigits[input.key];
  }
  return -1;
}

function handleShortcut(event, input, actions) {
  if (input.type !== 'keyDown') return false;
  const ctrl = !!(input.control || input.meta);
  if (!ctrl) return false;

  // Quit: Ctrl+Q
  if (!input.alt && !input.shift && isKeyMatch(input, 'q', 'ض')) {
    event.preventDefault();
    if (actions.quit) actions.quit();
    return true;
  }

  // Close / Hide to tray: Ctrl+W
  if (!input.alt && !input.shift && isKeyMatch(input, 'w', 'ص')) {
    event.preventDefault();
    if (actions.closeWindow) actions.closeWindow();
    return true;
  }

  // Reload: Ctrl+R
  if (!input.alt && !input.shift && isKeyMatch(input, 'r', 'ق')) {
    event.preventDefault();
    if (actions.reload) actions.reload();
    return true;
  }

  // DevTools: Ctrl+Shift+I
  if (!input.alt && input.shift && isKeyMatch(input, 'i', 'ه')) {
    event.preventDefault();
    if (actions.toggleDevTools) actions.toggleDevTools();
    return true;
  }

  // Settings: Ctrl+,
  if (!input.alt && !input.shift && (
    (input.code && input.code.toLowerCase() === 'comma') ||
    input.key === ',' || input.key === '،' || input.key === 'و'
  )) {
    event.preventDefault();
    if (actions.openSettings) actions.openSettings();
    return true;
  }

  // Command Palette / Quick Switcher: Ctrl+K
  if (!input.alt && !input.shift && isKeyMatch(input, 'k', 'ن')) {
    event.preventDefault();
    if (actions.openCommandPalette) actions.openCommandPalette();
    return true;
  }

  // Ctrl+1 through Ctrl+9 switches accounts
  if (!input.alt && !input.shift) {
    const accIdx = getAccountIndex(input);
    if (accIdx >= 0 && accIdx < 9) {
      event.preventDefault();
      if (actions.switchAccountByIndex) actions.switchAccountByIndex(accIdx);
      return true;
    }
  }

  // Ctrl+Alt+A opens Add Account
  if (input.alt && !input.shift && isKeyMatch(input, 'a', 'ش')) {
    event.preventDefault();
    if (actions.openAddAccount) actions.openAddAccount();
    return true;
  }

  // Ctrl+Alt+S toggles sidebar collapse/expand
  if (input.alt && !input.shift && isKeyMatch(input, 's', 'س')) {
    event.preventDefault();
    if (actions.toggleSidebar) actions.toggleSidebar();
    return true;
  }

  // Ctrl+Alt+P toggles Privacy Shield (Stealth mode)
  if (input.alt && !input.shift && isKeyMatch(input, 'p', 'ح')) {
    event.preventDefault();
    if (actions.togglePrivacy) actions.togglePrivacy();
    return true;
  }

  // Ctrl+Alt+L locks application (App Lock)
  if (input.alt && !input.shift && isKeyMatch(input, 'l', 'م')) {
    event.preventDefault();
    if (actions.lockApp) actions.lockApp();
    return true;
  }

  // Zoom controls
  if (!input.alt) {
    const isPlus = (input.code && (input.code === 'Equal' || input.code === 'NumpadAdd')) ||
      input.key === '+' || input.key === '=';
    if (isPlus) {
      event.preventDefault();
      if (actions.zoomIn) actions.zoomIn();
      return true;
    }

    const isMinus = (input.code && (input.code === 'Minus' || input.code === 'NumpadSubtract')) ||
      input.key === '-';
    if (isMinus) {
      event.preventDefault();
      if (actions.zoomOut) actions.zoomOut();
      return true;
    }

    const isReset = (input.code && (input.code === 'Digit0' || input.code === 'Numpad0')) ||
      input.key === '0' || input.key === '٠';
    if (isReset) {
      event.preventDefault();
      if (actions.zoomReset) actions.zoomReset();
      return true;
    }
  }

  return false;
}

module.exports = {
  handleShortcut,
  isKeyMatch,
  getAccountIndex,
};
