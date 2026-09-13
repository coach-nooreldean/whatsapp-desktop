/*
 * Application lifecycle, system power events, and background timers for WhatsApp Desktop.
 */
'use strict';

const { powerMonitor } = require('electron');

class LifecycleManager {
  constructor({ config, lockMgr, accountsMgr, lockApp, notifySidebarState, checkForUpdates, onHibernateAccount }) {
    this.config = config;
    this.lockMgr = lockMgr;
    this.accountsMgr = accountsMgr;
    this.lockApp = lockApp;
    this.notifySidebarState = notifySidebarState;
    this.checkForUpdates = checkForUpdates;
    this.onHibernateAccount = onHibernateAccount;

    this.hibernationInterval = null;
    this.idleLockInterval = null;
    this.updateInterval = null;
    this.updateFirstTimeout = null;
  }

  init() {
    this.wirePowerMonitor();
    this.startTimers();
  }

  wirePowerMonitor() {
    if (!powerMonitor) return;

    // Desktop session locked (GNOME, KDE Plasma, systemd-logind lock signal)
    powerMonitor.on('lock-screen', () => {
      this.handleSystemLock('screen-lock');
    });

    // System suspended (laptop lid closed, sleep state)
    powerMonitor.on('suspend', () => {
      this.handleSystemLock('suspend');
    });
  }

  handleSystemLock(reason) {
    if (!this.lockMgr || !this.lockMgr.isEnabled() || this.lockMgr.isLocked) return;

    const autoLock = this.config.get('lock.auto-lock-on-system-lock') !== false;
    if (autoLock) {
      console.log(`Auto-locking WhatsApp Desktop due to system ${reason}`);
      if (typeof this.lockApp === 'function') {
        this.lockApp();
      }
    }
  }

  startTimers() {
    // 1. Account hibernation check (every 60s)
    this.hibernationInterval = setInterval(() => {
      const timeoutMin = Number(this.config.get('accounts.hibernation-minutes'));
      if (timeoutMin && timeoutMin > 0) {
        const slept = this.accountsMgr.checkInactivity(timeoutMin);
        if (slept && slept.length > 0) {
          if (typeof this.onHibernateAccount === 'function') {
            slept.forEach(acc => this.onHibernateAccount(acc));
          }
          if (typeof this.notifySidebarState === 'function') {
            this.notifySidebarState();
          }
        }
      }
    }, 60 * 1000);

    // 2. Passcode idle timeout check (every 30s)
    this.idleLockInterval = setInterval(() => {
      if (this.lockMgr && this.lockMgr.isEnabled() && !this.lockMgr.isLocked && this.lockMgr.checkIdleTimeout()) {
        if (typeof this.lockApp === 'function') {
          this.lockApp();
        }
      }
    }, 30 * 1000);

    // 3. Update checks
    if (this.config.get('updates.check') !== false) {
      const UPDATE_FIRST_MS = 45 * 1000;
      const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;

      this.updateFirstTimeout = setTimeout(() => {
        if (typeof this.checkForUpdates === 'function') this.checkForUpdates();
      }, UPDATE_FIRST_MS);

      this.updateInterval = setInterval(() => {
        if (typeof this.checkForUpdates === 'function') this.checkForUpdates();
      }, UPDATE_EVERY_MS);
    }
  }

  dispose() {
    if (this.hibernationInterval) clearInterval(this.hibernationInterval);
    if (this.idleLockInterval) clearInterval(this.idleLockInterval);
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.updateFirstTimeout) clearTimeout(this.updateFirstTimeout);
  }
}

module.exports = {
  LifecycleManager,
};
