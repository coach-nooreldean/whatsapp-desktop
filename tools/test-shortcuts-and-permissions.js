/*
 * Tests for modular core components (src/core/shortcuts.js & src/core/permissions.js).
 */
'use strict';

const assert = require('assert');
const { handleShortcut } = require('../src/core/shortcuts.js');
const { isWhatsApp, chromeUserAgent } = require('../src/core/permissions.js');

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
  // 1. Permissions / URL validation
  check('isWhatsApp allows web.whatsapp.com', isWhatsApp('https://web.whatsapp.com/'), true);
  check('isWhatsApp allows mmg.whatsapp.net', isWhatsApp('https://mmg.whatsapp.net/media'), true);
  check('isWhatsApp allows blob URLs', isWhatsApp('blob:https://web.whatsapp.com/1234'), true);
  check('isWhatsApp allows empty URL (media calls)', isWhatsApp(''), true);
  check('isWhatsApp rejects external untrusted domain', isWhatsApp('https://malicious-site.com/'), false);

  // 2. User Agent format
  const ua = chromeUserAgent({ chrome: '132.0.6834.110' });
  check('chromeUserAgent includes Chrome 132', ua.includes('Chrome/132.0.0.0'), true);
  check('chromeUserAgent includes Linux x86_64', ua.includes('Linux x86_64'), true);

  // 3. Shortcut Handling
  let privacyToggled = false;
  let appLocked = false;
  let accountSwitched = -1;
  let paletteOpened = false;

  const actions = {
    togglePrivacy: () => { privacyToggled = true; },
    lockApp: () => { appLocked = true; },
    switchAccountByIndex: (idx) => { accountSwitched = idx; },
    openCommandPalette: () => { paletteOpened = true; },
  };

  const fakePreventDefault = () => {};

  // Test Ctrl+K (Command Palette)
  const kHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: 'k' },
    actions
  );
  check('handleShortcut handles Ctrl+K', kHandled, true);
  check('actions.openCommandPalette was invoked', paletteOpened, true);

  // Test Ctrl+Alt+P (Privacy Shield)
  const pHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'p' },
    actions
  );
  check('handleShortcut handles Ctrl+Alt+P', pHandled, true);
  check('actions.togglePrivacy was invoked', privacyToggled, true);

  // Test Ctrl+Alt+L (App Lock)
  const lHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'l' },
    actions
  );
  check('handleShortcut handles Ctrl+Alt+L', lHandled, true);
  check('actions.lockApp was invoked', appLocked, true);

  // Test Ctrl+2 (Account 2)
  const numHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: '2' },
    actions
  );
  check('handleShortcut handles Ctrl+2', numHandled, true);
  check('actions.switchAccountByIndex was passed index 1', accountSwitched, 1);

  // 4. Arabic Keyboard Layout Shortcut Tests
  let arabicPrivacyToggled = false;
  let arabicAppLocked = false;
  let arabicSidebarToggled = false;
  let arabicAddAccountOpened = false;
  let arabicSettingsOpened = false;
  let arabicAccountSwitched = -1;
  let arabicQuitCalled = false;
  let arabicWindowClosed = false;

  const arabicActions = {
    togglePrivacy: () => { arabicPrivacyToggled = true; },
    lockApp: () => { arabicAppLocked = true; },
    toggleSidebar: () => { arabicSidebarToggled = true; },
    openAddAccount: () => { arabicAddAccountOpened = true; },
    openSettings: () => { arabicSettingsOpened = true; },
    switchAccountByIndex: (idx) => { arabicAccountSwitched = idx; },
    quit: () => { arabicQuitCalled = true; },
    closeWindow: () => { arabicWindowClosed = true; },
  };

  // Test Ctrl+Alt+P with Arabic key 'ح' and code 'KeyP'
  const arPHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'ح', code: 'KeyP' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+Alt+P (ح)', arPHandled, true);
  check('arabicActions.togglePrivacy was invoked', arabicPrivacyToggled, true);

  // Test Ctrl+Alt+L with Arabic key 'م' (even if code is missing)
  const arLHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'م' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+Alt+L (م without code)', arLHandled, true);
  check('arabicActions.lockApp was invoked', arabicAppLocked, true);

  // Test Ctrl+Alt+S with Arabic key 'س'
  const arSHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'س', code: 'KeyS' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+Alt+S (س)', arSHandled, true);
  check('arabicActions.toggleSidebar was invoked', arabicSidebarToggled, true);

  // Test Ctrl+Alt+A with Arabic key 'ش'
  const arAHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: true, key: 'ش', code: 'KeyA' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+Alt+A (ش)', arAHandled, true);
  check('arabicActions.openAddAccount was invoked', arabicAddAccountOpened, true);

  // Test Ctrl+, with Arabic key '،' and code 'Comma'
  const arSettingsHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: '،', code: 'Comma' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+, (،)', arSettingsHandled, true);
  check('arabicActions.openSettings was invoked', arabicSettingsOpened, true);

  // Test Ctrl+W with Arabic key 'ص'
  const arWHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: 'ص', code: 'KeyW' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+W (ص)', arWHandled, true);
  check('arabicActions.closeWindow was invoked', arabicWindowClosed, true);

  // Test Ctrl+Q with Arabic key 'ض'
  const arQHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: 'ض', code: 'KeyQ' },
    arabicActions
  );
  check('handleShortcut handles Arabic Ctrl+Q (ض)', arQHandled, true);
  check('arabicActions.quit was invoked', arabicQuitCalled, true);

  // Test Ctrl+٣ (Eastern Arabic numeral 3 -> account index 2)
  const arDigitHandled = handleShortcut(
    { preventDefault: fakePreventDefault },
    { type: 'keyDown', control: true, alt: false, key: '٣' },
    arabicActions
  );
  check('handleShortcut handles Eastern Arabic Ctrl+٣', arDigitHandled, true);
  check('arabicActions.switchAccountByIndex was passed index 2', arabicAccountSwitched, 2);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-shortcuts-and-permissions.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('shortcuts and permissions checks pass');
}
