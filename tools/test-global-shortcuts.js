/*
 * Tests for global system shortcuts (Super+Alt+W for summon/hide, Super+Alt+M for call mute).
 */
'use strict';

const assert = require('assert');

let failures = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log('  ok   ' + label);
    return;
  }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

// Mock globalShortcut
class MockGlobalShortcut {
  constructor() {
    this.registered = new Map(); // accelerator -> callback
  }

  register(acc, cb) {
    if (!acc || typeof acc !== 'string') return false;
    this.registered.set(acc, cb);
    return true;
  }

  unregister(acc) {
    return this.registered.delete(acc);
  }

  unregisterAll() {
    this.registered.clear();
  }

  isRegistered(acc) {
    return this.registered.has(acc);
  }

  trigger(acc) {
    const cb = this.registered.get(acc);
    if (cb) cb();
  }
}

// Mock Window and WebContents
class MockWindow {
  constructor() {
    this.visible = false;
    this.focused = false;
    this.messages = [];
  }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  show() { this.visible = true; }
  focus() { this.focused = true; }
  hide() { this.visible = false; this.focused = false; }
  get webContents() {
    return {
      send: (channel, ...args) => {
        this.messages.push([channel, ...args]);
      }
    };
  }
}

function wireShortcuts({ globalShortcut, config, win, onToggleMute }) {
  globalShortcut.unregisterAll();
  if (config.get('shortcuts.global-enabled') === false) return;

  const toggleKey = config.get('shortcuts.global-toggle') || 'Super+Alt+W';
  const muteKey = config.get('shortcuts.global-mute') || 'Super+Alt+M';

  globalShortcut.register(toggleKey, () => {
    if (!win) return;
    if (win.isVisible() && win.focused) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  globalShortcut.register(muteKey, () => {
    if (onToggleMute) onToggleMute();
  });
}

try {
  const globalShortcut = new MockGlobalShortcut();
  const win = new MockWindow();
  const mockConfigData = {
    'shortcuts.global-enabled': true,
    'shortcuts.global-toggle': 'Super+Alt+W',
    'shortcuts.global-mute': 'Super+Alt+M',
  };
  const config = {
    get: k => mockConfigData[k],
  };

  let muteToggled = false;
  wireShortcuts({
    globalShortcut,
    config,
    win,
    onToggleMute: () => { muteToggled = true; }
  });

  // Test 1: Both shortcuts registered
  check('Super+Alt+W registered', globalShortcut.isRegistered('Super+Alt+W'), true);
  check('Super+Alt+M registered', globalShortcut.isRegistered('Super+Alt+M'), true);

  // Test 2: Triggering toggle key shows window when hidden
  check('window initially hidden', win.isVisible(), false);
  globalShortcut.trigger('Super+Alt+W');
  check('window is visible after toggle shortcut', win.isVisible(), true);
  check('window is focused after toggle shortcut', win.focused, true);

  // Test 3: Triggering toggle key hides window when visible and focused
  globalShortcut.trigger('Super+Alt+W');
  check('window is hidden after second toggle shortcut', win.isVisible(), false);

  // Test 4: Triggering mute key invokes onToggleMute callback
  check('muteToggled initially false', muteToggled, false);
  globalShortcut.trigger('Super+Alt+M');
  check('muteToggled is true after mute shortcut', muteToggled, true);

  // Test 5: Custom key combinations
  mockConfigData['shortcuts.global-toggle'] = 'Control+Alt+W';
  mockConfigData['shortcuts.global-mute'] = 'Control+Alt+M';
  wireShortcuts({ globalShortcut, config, win, onToggleMute: () => {} });

  check('old shortcuts unregistered', globalShortcut.isRegistered('Super+Alt+W'), false);
  check('new custom toggle registered', globalShortcut.isRegistered('Control+Alt+W'), true);
  check('new custom mute registered', globalShortcut.isRegistered('Control+Alt+M'), true);

  // Test 6: Disabling global shortcuts unregisters all
  mockConfigData['shortcuts.global-enabled'] = false;
  wireShortcuts({ globalShortcut, config, win, onToggleMute: () => {} });
  check('no shortcuts registered when disabled', globalShortcut.registered.size, 0);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-global-shortcuts.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('global shortcuts checks pass');
  process.exit(0);
}
