/*
 * Default palettes and account templates for multi-account management.
 */
'use strict';

const path = require('path');
const { CONFIG_DIR } = require('../config.js');

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
  lastActive: Date.now(),
  isSleeping: false,
};

module.exports = {
  DEFAULT_PALETTE,
  DEFAULT_ACCOUNT,
  ACCOUNTS_PATH,
};
