/*
 * Accounts JSON file persistence and schema migrations.
 */
'use strict';

const fs = require('fs');
const { CONFIG_DIR } = require('../config.js');
const { DEFAULT_ACCOUNT, DEFAULT_PALETTE, ACCOUNTS_PATH } = require('./constants.js');

function loadAccountsFromDisk() {
  try {
    if (fs.existsSync(ACCOUNTS_PATH)) {
      const content = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
        const accounts = parsed.accounts.map(acc => ({
          id: String(acc.id),
          name: String(acc.name || 'حساب'),
          color: String(acc.color || DEFAULT_PALETTE[0]),
          partition: acc.id === 'default' ? 'default' : String(acc.partition || `persist:account_${acc.id}`),
          isDefault: acc.id === 'default',
          unread: 0,
          lastActive: Date.now(),
          isSleeping: false,
        }));

        if (!accounts.some(a => a.isDefault)) {
          accounts.unshift({ ...DEFAULT_ACCOUNT, lastActive: Date.now(), isSleeping: false });
        }

        const activeId = parsed.activeId && accounts.some(a => a.id === parsed.activeId)
          ? parsed.activeId
          : accounts[0].id;

        return { accounts, activeId };
      }
    }
  } catch (e) {
    console.warn('Could not read accounts.json:', e.message);
  }

  return {
    accounts: [{ ...DEFAULT_ACCOUNT }],
    activeId: 'default',
  };
}

function saveAccountsToDisk(activeId, accounts) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const data = {
      activeId,
      accounts: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        color: acc.color,
        partition: acc.partition,
        isDefault: !!acc.isDefault,
      })),
    };
    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('Could not write accounts.json:', e.message);
  }
}

module.exports = {
  loadAccountsFromDisk,
  saveAccountsToDisk,
};
