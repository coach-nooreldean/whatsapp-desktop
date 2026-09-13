/*
 * Tests for Command Palette & Quick Switcher (src/core/palette.js).
 */
'use strict';

const { PaletteManager } = require('../src/core/palette.js');

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

try {
  // Mock AccountsManager
  class MockAccountsManager {
    constructor() {
      this.activeId = 'acc_1';
      this.accounts = [
        { id: 'default', name: 'Primary Account', color: '#25D366' },
        { id: 'acc_1', name: 'Work Account', color: '#0088cc' },
      ];
    }
    getAccounts() {
      return this.accounts;
    }
    getActiveId() {
      return this.activeId;
    }
  }

  const accountsMgr = new MockAccountsManager();
  const executed = [];

  const actions = {
    focusChatSearch: () => executed.push('chat-search'),
    togglePrivacy: () => executed.push('privacy'),
    lockApp: () => executed.push('lock'),
    toggleSidebar: () => executed.push('sidebar'),
    openSettings: () => executed.push('settings'),
    openFonts: () => executed.push('fonts'),
    reload: () => executed.push('reload'),
    switchAccount: id => executed.push(`switch:${id}`),
    clearCache: () => executed.push('clear-cache'),
    openCustomCss: () => executed.push('custom-css'),
    toggleCallMute: () => executed.push('mute-call'),
  };

  const palette = new PaletteManager({
    getParentWindow: () => null,
    accountsMgr,
    actions,
    theme: 'dracula',
    uiFont: 'Cantarell',
  });

  // Test 1: Action list contains default actions
  const actionList = palette.buildActions();
  check('actionList has chat-search', actionList.some(a => a.id === 'action:chat-search'), true);
  check('actionList has privacy toggle', actionList.some(a => a.id === 'action:privacy'), true);
  check('actionList has lock', actionList.some(a => a.id === 'action:lock'), true);
  check('actionList has toggle-sidebar', actionList.some(a => a.id === 'action:toggle-sidebar'), true);
  check('actionList has settings', actionList.some(a => a.id === 'action:settings'), true);
  check('actionList has fonts', actionList.some(a => a.id === 'action:fonts'), true);
  check('actionList has reload', actionList.some(a => a.id === 'action:reload'), true);
  check('actionList has clear-cache', actionList.some(a => a.id === 'action:clear-cache'), true);
  check('actionList has custom-css', actionList.some(a => a.id === 'action:custom-css'), true);
  check('actionList has mute-call', actionList.some(a => a.id === 'action:mute-call'), true);

  // Test 2: Dynamic account items included
  check('actionList includes default account', actionList.some(a => a.id === 'account:switch:default'), true);
  check('actionList includes secondary account', actionList.some(a => a.id === 'account:switch:acc_1'), true);

  const activeItem = actionList.find(a => a.id === 'account:switch:acc_1');
  check('active account marked isActive', activeItem.isActive, true);
  check('active account title indicates active', activeItem.title.includes('(Active)'), true);
  check('active account color preserved', activeItem.color, '#0088cc');

  // Test 3: Action execution routing
  palette.executeAction('action:chat-search');
  check('chat-search action executed', executed.includes('chat-search'), true);

  palette.executeAction('action:privacy');
  check('privacy action executed', executed.includes('privacy'), true);

  palette.executeAction('action:lock');
  check('lock action executed', executed.includes('lock'), true);

  palette.executeAction('action:toggle-sidebar');
  check('toggle-sidebar action executed', executed.includes('sidebar'), true);

  palette.executeAction('action:settings');
  check('settings action executed', executed.includes('settings'), true);

  palette.executeAction('action:clear-cache');
  check('clear-cache action executed', executed.includes('clear-cache'), true);

  palette.executeAction('action:custom-css');
  check('custom-css action executed', executed.includes('custom-css'), true);

  palette.executeAction('action:mute-call');
  check('mute-call action executed', executed.includes('mute-call'), true);

  palette.executeAction('account:switch:default');
  check('switchAccount action executed with id', executed.includes('switch:default'), true);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-palette.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('palette checks pass');
}
