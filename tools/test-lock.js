/*
 * Tests for App Lock and Passcode (src/lock.js).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point XDG_CONFIG_HOME to an isolated temporary test directory
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-lock-test-'));
process.env.XDG_CONFIG_HOME = testDir;

const { LockManager } = require('../src/lock.js');

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
  const cfg = new MockConfig({
    'lock.enabled': true,
    'lock.timeout': 15,
  });

  const lm = new LockManager(cfg);

  // Initially no passcode set
  check('initially has no passcode', lm.hasPasscode(), false);
  check('initially is not enabled', lm.isEnabled(), false);

  // Set passcode
  lm.setPasscode('1234');
  check('has passcode after setting', lm.hasPasscode(), true);
  check('is enabled after setting', lm.isEnabled(), true);

  // Lock
  lm.lock();
  check('is locked after explicit lock', lm.isLocked, true);

  // Verify failure with wrong PIN
  const wrongRes = lm.verify('9999');
  check('verify returns false on wrong PIN', wrongRes, false);
  check('remains locked on wrong PIN', lm.isLocked, true);

  // Verify success with correct PIN
  const rightRes = lm.verify('1234');
  check('verify returns true on correct PIN', rightRes, true);
  check('unlocks on correct PIN', lm.isLocked, false);

  // Idle timeout check
  lm.lastActivity = Date.now() - (20 * 60 * 1000); // 20 min ago (timeout is 15 min)
  const timedOut = lm.checkIdleTimeout();
  check('checkIdleTimeout returns true when idle exceeds timeout', timedOut, true);
  check('is locked after idle timeout', lm.isLocked, true);

  // Remove passcode
  lm.unlock('1234');
  lm.removePasscode('1234');
  check('hasPasscode is false after removal', lm.hasPasscode(), false);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-lock.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('lock checks pass');
}
