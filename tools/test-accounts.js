/*
 * Tests for multi-account management (src/accounts.js).
 *
 * Verifies account lifecycle, partition isolation, default account safeguards,
 * unread count calculations, and real JSON persistence in isolated temp storage.
 * Designed according to Test Guard rules.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point XDG_CONFIG_HOME to an isolated temporary test directory (Rule 9)
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-accounts-test-'));
process.env.XDG_CONFIG_HOME = testDir;

const AccountsManager = require('../src/accounts.js');
const accountsFile = path.join(testDir, 'whatsapp-desktop', 'accounts.json');

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
  /* -------------------------------------------------- initialization & defaults */

  const mgr = new AccountsManager();

  check('new manager initializes with single default account',
        mgr.getAccounts().length, 1);

  const defaultAcc = mgr.getActiveAccount();
  check('default account has id "default"', defaultAcc.id, 'default');
  check('default account isDefault flag is true', defaultAcc.isDefault, true);
  check('default account partition is "default"', defaultAcc.partition, 'default');

  check('initial active account id is "default"', mgr.getActiveId(), 'default');

  /* -------------------------------------------------------------- adding accounts */

  const second = mgr.addAccount({ name: 'Work', color: '#0088cc' });
  check('adding account creates distinct non-default account',
        second.isDefault, false);
  check('added account name matches specified name', second.name, 'Work');
  check('added account color matches specified color', second.color, '#0088cc');
  check('added account partition contains persist prefix and id',
        second.partition, `persist:account_${second.id}`);
  check('accounts list now contains two accounts', mgr.getAccounts().length, 2);

  // Data-driven tests for name trimming and default color fallbacks (Rule 3)
  for (const [scenario, input, expectedName] of [
    ['whitespace around account name is trimmed', { name: '  Family  ' }, 'Family'],
    ['empty account name falls back to numbered name', { name: '' }, 'حساب 4'],
    ['null account name falls back to numbered name', { name: null }, 'حساب 5'],
  ]) {
    const acc = mgr.addAccount(input);
    check(scenario, acc.name, expectedName);
  }

  /* ------------------------------------------------------------- account lookup */

  check('getAccount with valid id returns account object',
        mgr.getAccount(second.id).name, 'Work');
  check('getAccount with unknown id returns null',
        mgr.getAccount('nonexistent-id'), null);

  /* ------------------------------------------------------ switching active account */

  check('setActiveId with existing id returns true and updates activeId',
        mgr.setActiveId(second.id), true);
  check('getActiveId reflects switched account', mgr.getActiveId(), second.id);
  check('getActiveAccount reflects switched account',
        mgr.getActiveAccount().id, second.id);

  check('setActiveId with non-existent id returns false',
        mgr.setActiveId('unknown-id'), false);
  check('activeId remains unchanged after failed switch',
        mgr.getActiveId(), second.id);

  /* ------------------------------------------------------------ updating accounts */

  const updated = mgr.updateAccount(second.id, { name: 'Work Office', color: '#8b5cf6' });
  check('updateAccount updates name and color',
        { name: updated.name, color: updated.color },
        { name: 'Work Office', color: '#8b5cf6' });

  check('updateAccount with unknown id returns null',
        mgr.updateAccount('nonexistent', { name: 'Test' }), null);

  /* ------------------------------------------------------------ removing accounts */

  check('removing default account is forbidden and returns false',
        mgr.removeAccount('default'), false);
  check('default account still exists after attempted removal',
        !!mgr.getAccount('default'), true);

  // Remove the currently active account (second)
  check('removing existing secondary account returns true',
        mgr.removeAccount(second.id), true);
  check('removed account is no longer in accounts list',
        mgr.getAccount(second.id), null);
  check('active account falls back to remaining account when active was deleted',
        mgr.getActiveId(), 'default');

  check('removing non-existent account returns false',
        mgr.removeAccount('already-removed'), false);

  /* --------------------------------------------------------- unread count logic */

  const accA = mgr.getAccounts()[0];
  const accB = mgr.getAccounts()[1];

  mgr.setUnread(accA.id, 5);
  mgr.setUnread(accB.id, 3);
  check('getTotalUnread sums unread counts across all accounts',
        mgr.getTotalUnread(), 8);

  mgr.setUnread(accA.id, -2);
  check('negative unread count clamps to zero',
        mgr.getAccount(accA.id).unread, 0);

  /* --------------------------------------------------------- disk persistence (Rule 9) */

  check('accounts.json file is written to config directory',
        fs.existsSync(accountsFile), true);

  // Reloading from disk verifies serialization and deserialization
  const reloaded = new AccountsManager();
  check('reloaded manager loads persisted accounts list length',
        reloaded.getAccounts().length, mgr.getAccounts().length);
  check('reloaded manager preserves default account presence',
        reloaded.getAccount('default') !== null, true);

} finally {
  // Cleanup test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup error
  }
}

console.log(failures ? `\n${failures} failed` : '\naccounts checks pass');
process.exit(failures ? 1 : 0);
