/*
 * Tests for Storage Maintenance and Safe Cache Clearing.
 * Verifies that cache calculation and clearing safely preserves user logins,
 * IndexedDB databases, cookies, and LocalStorage while purging temporary HTTP/shader cache.
 */
'use strict';

const assert = require('assert');

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

// Mock Electron Session
class MockSession {
  constructor(partition, cacheBytes = 10485760) {
    this.partition = partition;
    this.cacheBytes = cacheBytes;
    this.cacheCleared = false;
    this.codeCacheCleared = false;
    this.storageDataCleared = false;
    this.clearedStorageTypes = [];
  }

  async getCacheSize() {
    return this.cacheBytes;
  }

  async clearCache() {
    this.cacheCleared = true;
    this.cacheBytes = 0;
  }

  async clearCodeCaches(options) {
    this.codeCacheCleared = true;
  }

  async clearStorageData(options) {
    this.storageDataCleared = true;
    this.clearedStorageTypes = options && options.storages ? options.storages : ['all'];
  }
}

// Logic mirror from main.js for testing storage maintenance
async function calculateAllCaches(sessions) {
  let total = 0;
  for (const s of sessions) {
    try {
      total += await s.getCacheSize();
    } catch (e) {}
  }
  return total;
}

async function clearAllCaches(sessions) {
  for (const s of sessions) {
    try {
      await s.clearCache();
      await s.clearCodeCaches({});
    } catch (e) {}
  }
  return { ok: true };
}

(async () => {
  try {
    const sDefault = new MockSession('default', 15 * 1024 * 1024);
    const sAcc1 = new MockSession('persist:account-acc_1', 25 * 1024 * 1024);
    const sAcc2 = new MockSession('persist:account-acc_2', 10 * 1024 * 1024);
    const allSessions = [sDefault, sAcc1, sAcc2];

    // Test 1: Calculating cache size aggregates across all partitions
    const totalBytes = await calculateAllCaches(allSessions);
    check('total cache size is sum of partitions (50MB)', totalBytes, 50 * 1024 * 1024);

    // Test 2: Safe clearing triggers clearCache and clearCodeCaches
    const res = await clearAllCaches(allSessions);
    check('clearAllCaches returns ok: true', res.ok, true);

    check('default session cache was cleared', sDefault.cacheCleared, true);
    check('default session code cache was cleared', sDefault.codeCacheCleared, true);
    check('account 1 session cache was cleared', sAcc1.cacheCleared, true);
    check('account 1 session code cache was cleared', sAcc1.codeCacheCleared, true);
    check('account 2 session cache was cleared', sAcc2.cacheCleared, true);
    check('account 2 session code cache was cleared', sAcc2.codeCacheCleared, true);

    // Test 3: CRITICAL - clearStorageData is NEVER called (preserves IndexedDB and login credentials)
    check('default session cookies and IndexedDB were untouched', sDefault.storageDataCleared, false);
    check('account 1 cookies and IndexedDB were untouched', sAcc1.storageDataCleared, false);
    check('account 2 cookies and IndexedDB were untouched', sAcc2.storageDataCleared, false);

    // Test 4: Calculation after clearing returns 0
    const clearedTotal = await calculateAllCaches(allSessions);
    check('total cache size after clearing is 0', clearedTotal, 0);

    // Test 5: Fault tolerance - session that throws error does not abort entire clear operation
    const faultySession = {
      getCacheSize: async () => { throw new Error('Disk IO error'); },
      clearCache: async () => { throw new Error('Permission denied'); },
      clearCodeCaches: async () => {},
    };
    const mixedSessions = [new MockSession('valid', 5 * 1024 * 1024), faultySession];

    const safeTotal = await calculateAllCaches(mixedSessions);
    check('faulty session error is caught during calculation', safeTotal, 5 * 1024 * 1024);

    const safeClearRes = await clearAllCaches(mixedSessions);
    check('faulty session error is caught during clearing', safeClearRes.ok, true);

  } catch (err) {
    failures++;
    console.error('Unexpected error in test-storage-maintenance.js:', err);
  }

  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('storage maintenance checks pass');
    process.exit(0);
  }
})();
