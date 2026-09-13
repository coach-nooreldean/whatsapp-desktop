/*
 * Accounts management for multi-account WhatsApp Desktop.
 *
 * Stores account metadata in:
 *   ~/.config/whatsapp-desktop/accounts.json
 *
 * Modularized into:
 *   - src/accounts/constants.js: Color palette presets and default account templates
 *   - src/accounts/storage.js: JSON persistence, atomic file I/O, and migrations
 */
'use strict';

const crypto = require('crypto');
const { CONFIG_DIR } = require('./config.js');
const { DEFAULT_PALETTE, DEFAULT_ACCOUNT, ACCOUNTS_PATH } = require('./accounts/constants.js');
const { loadAccountsFromDisk, saveAccountsToDisk } = require('./accounts/storage.js');

class AccountsManager {
  constructor() {
    this.accounts = [];
    this.activeId = 'default';
    this.load();
  }

  load() {
    const { accounts, activeId } = loadAccountsFromDisk();
    this.accounts = accounts;
    this.activeId = activeId;
    this.save();
  }

  save() {
    saveAccountsToDisk(this.activeId, this.accounts);
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
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const accountName = trimmedName || `حساب ${this.accounts.length + 1}`;
    const newAccount = {
      id,
      name: accountName,
      color: chosenColor,
      partition: `persist:account_${id}`,
      isDefault: false,
      unread: 0,
      lastActive: Date.now(),
      isSleeping: false,
    };
    this.accounts.push(newAccount);
    this.save();
    return newAccount;
  }

  removeAccount(id) {
    if (id === 'default') return false; // Prevent removing primary account
    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.accounts.splice(index, 1);
    if (this.activeId === id) {
      this.activeId = this.accounts[0] ? this.accounts[0].id : 'default';
    }
    this.save();
    return true;
  }

  updateAccount(id, updates) {
    const acc = this.accounts.find(a => a.id === id);
    if (!acc) return null;

    if (updates && typeof updates.name === 'string') {
      const trimmed = updates.name.trim();
      if (trimmed) acc.name = trimmed;
    }
    if (updates && typeof updates.color === 'string') {
      const trimmed = updates.color.trim();
      if (trimmed) acc.color = trimmed;
    }
    this.save();
    return { ...acc };
  }

  setUnread(id, count) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
      acc.unread = Math.max(0, parseInt(count, 10) || 0);
    }
  }

  setUnreadCount(id, count) {
    this.setUnread(id, count);
  }

  getTotalUnread() {
    return this.accounts.reduce((sum, a) => sum + (a.unread || 0), 0);
  }

  touchAccount(id) {
    const acc = this.getAccount(id);
    if (acc) {
      acc.lastActive = Date.now();
      acc.isSleeping = false;
    }
  }

  wakeAccount(id) {
    this.touchAccount(id);
  }

  setSleeping(id, sleeping) {
    const acc = this.accounts.find(a => a.id === id);
    if (acc) {
      acc.isSleeping = !!sleeping;
    }
  }

  hibernateAccount(id) {
    if (id === 'default' || id === this.activeId) return false;
    const acc = this.getAccount(id);
    if (acc && !acc.isSleeping) {
      acc.isSleeping = true;
      return true;
    }
    return false;
  }

  checkInactivity(timeoutMinutes) {
    if (!timeoutMinutes || timeoutMinutes <= 0) return [];
    const thresholdMs = timeoutMinutes * 60 * 1000;
    const now = Date.now();
    const slept = [];

    for (const acc of this.accounts) {
      if (acc.id === this.activeId) continue;
      if (acc.isSleeping) continue;

      const idle = now - (acc.lastActive || now);
      if (idle >= thresholdMs) {
        acc.isSleeping = true;
        slept.push(acc.id);
      }
    }
    return slept;
  }

  checkInactivityHibernation(maxInactiveMinutes = 30) {
    const now = Date.now();
    const thresholdMs = maxInactiveMinutes * 60 * 1000;
    const hibernated = [];

    for (const acc of this.accounts) {
      if (acc.id !== 'default' && acc.id !== this.activeId && !acc.isSleeping) {
        if (now - acc.lastActive > thresholdMs) {
          acc.isSleeping = true;
          hibernated.push(acc);
        }
      }
    }
    return hibernated;
  }
}

AccountsManager.AccountsManager = AccountsManager;
AccountsManager.DEFAULT_PALETTE = DEFAULT_PALETTE;
AccountsManager.DEFAULT_ACCOUNT = DEFAULT_ACCOUNT;
AccountsManager.ACCOUNTS_PATH = ACCOUNTS_PATH;

module.exports = AccountsManager;
