/*
 * Tests for System Screen Lock & Suspend auto-lock integration (src/core/lifecycle.js).
 */
'use strict';

const EventEmitter = require('events');
const { LifecycleManager } = require('../src/core/lifecycle.js');

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
  // Mock Config
  class MockConfig {
    constructor(initial = {}) {
      this.data = { ...initial };
    }
    get(k) {
      return this.data[k];
    }
    set(k, v) {
      this.data[k] = v;
    }
  }

  // Mock LockManager
  class MockLockManager {
    constructor(enabled = true, isLocked = false) {
      this._enabled = enabled;
      this.isLocked = isLocked;
    }
    isEnabled() {
      return this._enabled;
    }
    checkIdleTimeout() {
      return false;
    }
  }

  // Test 1: System screen lock triggers lockApp when enabled
  {
    const config = new MockConfig({ 'lock.auto-lock-on-system-lock': true });
    const lockMgr = new MockLockManager(true, false);
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('screen-lock');
    check('screen-lock event triggers lockApp when active', locked, true);
  }

  // Test 2: System suspend triggers lockApp
  {
    const config = new MockConfig({ 'lock.auto-lock-on-system-lock': true });
    const lockMgr = new MockLockManager(true, false);
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('suspend');
    check('suspend event triggers lockApp when active', locked, true);
  }

  // Test 3: System lock ignored if already locked
  {
    const config = new MockConfig({ 'lock.auto-lock-on-system-lock': true });
    const lockMgr = new MockLockManager(true, true); // already locked
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('screen-lock');
    check('screen-lock ignored when already locked', locked, false);
  }

  // Test 4: System lock ignored if App Lock is disabled
  {
    const config = new MockConfig({ 'lock.auto-lock-on-system-lock': true });
    const lockMgr = new MockLockManager(false, false); // disabled
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('screen-lock');
    check('screen-lock ignored when App Lock is disabled', locked, false);
  }

  // Test 5: System lock ignored if user turned off lock.auto-lock-on-system-lock
  {
    const config = new MockConfig({ 'lock.auto-lock-on-system-lock': false });
    const lockMgr = new MockLockManager(true, false);
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('screen-lock');
    check('screen-lock ignored when auto-lock toggle is false', locked, false);
  }

  // Test 6: Default auto-lock is enabled when lock.auto-lock-on-system-lock is undefined
  {
    const config = new MockConfig({});
    const lockMgr = new MockLockManager(true, false);
    let locked = false;

    const mgr = new LifecycleManager({
      config,
      lockMgr,
      accountsMgr: { checkInactivity: () => [] },
      lockApp: () => { locked = true; },
      notifySidebarState: () => {},
      checkForUpdates: () => {},
    });

    mgr.handleSystemLock('screen-lock');
    check('auto-lock defaults to true when key not set', locked, true);
  }

} catch (err) {
  failures++;
  console.error('Unexpected error in test-system-lock.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('system-lock checks pass');
}
