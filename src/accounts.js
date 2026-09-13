/*
 * Accounts management for multi-account WhatsApp Desktop.
 *
 * Stores account metadata in:
 *   ~/.config/whatsapp-desktop/accounts.json
 *
 * The primary account ('default') uses session.defaultSession,
 * ensuring existing login sessions are preserved without any interruption.
 * Secondary accounts use isolated partitions ('persist:account_<id>').
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'whatsapp-desktop'
);
const ACCOUNTS_PATH = path.join(CONFIG_DIR, 'accounts.json');

const DEFAULT_PALETTE = [
  '#25D366', // WhatsApp Green
  '#0088cc', // Telegram Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ef4444', // Red
  '#10b981', // Emerald
];

const DEFAULT_ACCOUNT = {
  id: 'default',
  name: 'الحساب الأساسي',
  color: '#25D366',
  partition: 'default',
  isDefault: true,
  unread: 0,
};

class AccountsManager {
  constructor() {
    this.accounts = [];
    this.activeId = 'default';
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(ACCOUNTS_PATH)) {
        const content = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
          this.accounts = parsed.accounts.map(acc => ({
            id: String(acc.id),
            name: String(acc.name || 'حساب'),
            color: String(acc.color || DEFAULT_PALETTE[0]),
            partition: acc.id === 'default' ? 'default' : String(acc.partition || `persist:account_${acc.id}`),
            isDefault: acc.id === 'default',
            unread: 0,
          }));

          // Ensure default account always exists
          if (!this.accounts.some(a => a.isDefault)) {
            this.accounts.unshift({ ...DEFAULT_ACCOUNT });
          }

          this.activeId = parsed.activeId && this.accounts.some(a => a.id === parsed.activeId)
            ? parsed.activeId
            : this.accounts[0].id;
          return;
        }
      }
    } catch (e) {
      console.warn('Could not read accounts.json:', e.message);
    }

    // Default state: single default account
    this.accounts = [{ ...DEFAULT_ACCOUNT }];
    this.activeId = 'default';
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      const data = {
        activeId: this.activeId,
        accounts: this.accounts.map(acc => ({
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

  getAccounts() {
    return this.accounts.map(a => ({ ...a }));
  }

  getAccount(id) {
    return this.accounts.find(a => a.id === id) || null;
  }

  getActiveId() {
    return this.activeId;
  }

  setActiveId(id) {
    if (this.accounts.some(a => a.id === id)) {
      this.activeId = id;
      this.save();
      return true;
    }
    return false;
  }

  getActiveAccount() {
    return this.getAccount(this.activeId) || this.accounts[0];
  }

  addAccount({ name, color }) {
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const id = `acc_${Date.now().toString(36)}_${randomSuffix}`;
    const chosenColor = color || DEFAULT_PALETTE[this.accounts.length % DEFAULT_PALETTE.length];
    const newAccount = {
      id,
      name: (name || `حساب ${this.accounts.length + 1}`).trim(),
      color: chosenColor,
      partition: `persist:account_${id}`,
      isDefault: false,
      unread: 0,
    };
    this.accounts.push(newAccount);
    this.save();
    return newAccount;
  }

  updateAccount(id, updates) {
    const acc = this.accounts.find(a => a.id === id);
    if (!acc) return null;

    if (updates.name && typeof updates.name === 'string') {
      acc.name = updates.name.trim();
    }
    if (updates.color && typeof updates.color === 'string') {
      acc.color = updates.color.trim();
    }
    this.save();
    return { ...acc };
  }

  removeAccount(id) {
    // Cannot remove default account
    if (id === 'default') return false;

    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.accounts.splice(index, 1);
    if (this.activeId === id) {
      this.activeId = this.accounts[0] ? this.accounts[0].id : 'default';
    }
    this.save();
    return true;
  }

  setUnread(id, count) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
      acc.unread = Math.max(0, parseInt(count, 10) || 0);
    }
  }

  setUnreadCount(id, count) {
    return this.setUnread(id, count);
  }

  getTotalUnread() {
    return this.accounts.reduce((sum, acc) => sum + (acc.unread || 0), 0);
  }
}

AccountsManager.AccountsManager = AccountsManager;
AccountsManager.DEFAULT_PALETTE = DEFAULT_PALETTE;

module.exports = AccountsManager;
