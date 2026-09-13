/*
 * Tests for Account Hibernation and Inactivity Management (src/accounts.js).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-hibernate-test-'));
process.env.XDG_CONFIG_HOME = testDir;

const { AccountsManager } = require('../src/accounts.js');

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
  const mgr = new AccountsManager();

  // Add secondary account
  const sec = mgr.addAccount({ name: 'Work Account', color: '#0088cc' });
  check('secondary account isSleeping is initially false', sec.isSleeping, false);

  // Active account is default
  check('active account is default', mgr.getActiveId(), 'default');

  // Simulate inactivity on secondary account: 35 minutes ago
  sec.lastActive = Date.now() - (35 * 60 * 1000);

  // Check with 30-minute threshold
  const slept = mgr.checkInactivity(30);
  check('checkInactivity identifies inactive secondary account', slept.includes(sec.id), true);
  check('secondary account isSleeping is now true', mgr.getAccount(sec.id).isSleeping, true);

  // Default (active) account is never slept even if idle
  const defAcc = mgr.getAccount('default');
  defAcc.lastActive = Date.now() - (60 * 60 * 1000);
  const slept2 = mgr.checkInactivity(30);
  check('active account is not slept', defAcc.isSleeping, false);

  // Waking secondary account
  mgr.wakeAccount(sec.id);
  check('wakeAccount resets isSleeping to false', mgr.getAccount(sec.id).isSleeping, false);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-hibernation.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('hibernation checks pass');
}
