/*
 * Tests for Privacy Shield and Stealth Mode (src/privacy.js).
 */
'use strict';

const assert = require('assert');
const { PRIVACY_CSS, PrivacyManager } = require('../src/privacy.js');

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

// Mock config
class MockConfig {
  constructor(initial = {}) {
    this.data = { ...initial };
  }
  get(key) {
    return this.data[key];
  }
  set(key, val) {
    this.data[key] = val;
  }
  save() {}
}

try {
  // Test 1: CSS contains core selectors
  check('privacy CSS contains message blur selector', PRIVACY_CSS.includes('.wa-privacy-active #main .message-in .copyable-text'), true);
  check('privacy CSS contains media blur selector', PRIVACY_CSS.includes('body.wa-privacy-active #main img'), true);
  check('privacy CSS contains hover reveal', PRIVACY_CSS.includes('.wa-privacy-hover #main .message-in:hover'), true);

  // Test 2: Initial state with defaults
  const cfg = new MockConfig({
    'privacy.stealth': false,
    'privacy.auto-blur': true,
    'privacy.hover-reveal': true,
    'privacy.blur-contacts': false,
  });
  const pm = new PrivacyManager(cfg);

  check('privacy manager initial blurred state with window focused is false', pm.isBlurred(), false);
  check('classes empty when not blurred', pm.getClasses(), []);

  // Test 3: Auto-blur on focus loss
  pm.setWindowFocus(false);
  check('privacy manager blurs when window loses focus (autoBlur enabled)', pm.isBlurred(), true);
  check('classes include active and hover', pm.getClasses().includes('wa-privacy-active') && pm.getClasses().includes('wa-privacy-hover'), true);

  // Focus restored
  pm.setWindowFocus(true);
  check('privacy manager unblurs when window gains focus', pm.isBlurred(), false);

  // Test 4: Manual stealth toggle
  pm.toggleStealth();
  check('manual stealth toggle enables blur even when window is focused', pm.isBlurred(), true);
  check('manual stealth saves to config', cfg.get('privacy.stealth'), true);

  pm.toggleStealth();
  check('manual stealth toggle disables blur', pm.isBlurred(), false);
  check('manual stealth saves false to config', cfg.get('privacy.stealth'), false);

  // Test 5: Inject script generation
  pm.toggleStealth();
  const script = pm.getInjectScript();
  check('inject script includes wa-privacy-active class', script.includes('wa-privacy-active'), true);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-privacy.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('privacy checks pass');
}
