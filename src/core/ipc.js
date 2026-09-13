/*
 * Consolidated IPC channel wiring coordinator for Settings, About, Accounts, Sidebar, WhatsApp Page, and Store.
 */
'use strict';

const { registerSettingsIpc } = require('./ipc/settings.js');
const { registerAboutIpc } = require('./ipc/about.js');
const { registerPageIpc } = require('./ipc/page.js');
const { registerStoreIpc } = require('./ipc/store.js');
const { registerAccountsIpc } = require('./ipc/accounts.js');

function wireIpc(ctx) {
  registerSettingsIpc(ctx);
  registerAboutIpc(ctx);
  registerPageIpc(ctx);
  registerStoreIpc(ctx);
  registerAccountsIpc(ctx);
}

module.exports = {
  wireIpc,
  registerSettingsIpc,
  registerAboutIpc,
  registerPageIpc,
  registerStoreIpc,
  registerAccountsIpc,
};
