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

  const actions = {
    togglePrivacy: () => { privacyToggled = true; },
    lockApp: () => { appLocked = true; },
    switchAccountByIndex: (idx) => { accountSwitched = idx; },
  };

  const fakePreventDefault = () => {};

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

} catch (err) {
  failures++;
  console.error('Unexpected error in test-shortcuts-and-permissions.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('shortcuts and permissions checks pass');
}
