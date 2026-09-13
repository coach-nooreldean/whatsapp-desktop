'use strict';

const assert = require('assert');
const { format, parse, coerce } = require('../src/config/ini.js');
const { DEFAULTS } = require('../src/config/defaults.js');
const { PRIVACY_CSS, PrivacyManager } = require('../src/privacy.js');
const { LockManager } = require('../src/lock.js');

console.log('Testing Privacy Shield & Blur...');
{
  const mockConfig = {
    values: { ...DEFAULTS },
    get(k) { return this.values[k]; },
    set(k, v) { this.values[k] = v; },
    save() {},
  };

  const privacy = new PrivacyManager(mockConfig);
  assert.strictEqual(privacy.blurContacts, true, 'privacy.blur-contacts must be true by default');
  assert.strictEqual(privacy.isBlurred(), false, 'should not be blurred initially');

  privacy.toggleStealth();
  assert.strictEqual(privacy.isBlurred(), true, 'isBlurred must be true after toggleStealth');

  const classes = privacy.getClasses();
  assert.ok(classes.includes('wa-privacy-active'), 'classes must include wa-privacy-active');
  assert.ok(classes.includes('wa-privacy-hover'), 'classes must include wa-privacy-hover');
  assert.ok(classes.includes('wa-privacy-contacts'), 'classes must include wa-privacy-contacts');

  // Verify CSS contains chat list and avatar rules
  assert.ok(PRIVACY_CSS.includes('#pane-side [role="row"]'), 'PRIVACY_CSS must target #pane-side [role="row"]');
  assert.ok(PRIVACY_CSS.includes('#pane-side img'), 'PRIVACY_CSS must target #pane-side img');
  assert.ok(PRIVACY_CSS.includes('#side [role="row"]'), 'PRIVACY_CSS must target #side [role="row"]');
  assert.ok(PRIVACY_CSS.includes('header span[title]'), 'PRIVACY_CSS must target header span[title]');
  assert.ok(PRIVACY_CSS.includes(':hover'), 'PRIVACY_CSS must support hover reveal');
  console.log('  ok   Privacy Shield defaults and CSS rules verified');
}

console.log('Testing Config Serialization & Roundtrip...');
{
  const sampleValues = {
    ...DEFAULTS,
    'privacy.stealth': true,
    'privacy.auto-blur': false,
    'privacy.hover-reveal': true,
    'privacy.blur-contacts': true,
    'lock.enabled': true,
    'lock.timeout': 30,
    'lock.auto-lock-on-system-lock': true,
    'accounts.hibernation-minutes': 45,
    'view.hyprland-accent': false,
    'mpris.enabled': true,
  };

  const formatted = format(sampleValues);
  assert.ok(formatted.includes('[privacy]'), 'formatted text must contain [privacy] section');
  assert.ok(formatted.includes('stealth = true'), 'formatted text must serialize privacy.stealth');
  assert.ok(formatted.includes('blur-contacts = true'), 'formatted text must serialize privacy.blur-contacts');
  assert.ok(formatted.includes('[lock]'), 'formatted text must contain [lock] section');
  assert.ok(formatted.includes('enabled = true'), 'formatted text must serialize lock.enabled');
  assert.ok(formatted.includes('timeout = 30'), 'formatted text must serialize lock.timeout');
  assert.ok(formatted.includes('[accounts]'), 'formatted text must contain [accounts] section');
  assert.ok(formatted.includes('hibernation-minutes = 45'), 'formatted text must serialize hibernation-minutes');
  assert.ok(formatted.includes('hyprland-accent = false'), 'formatted text must serialize hyprland-accent');

  const parsed = parse(formatted);
  assert.strictEqual(coerce(parsed['privacy.stealth'], false), true, 'roundtrip privacy.stealth');
  assert.strictEqual(coerce(parsed['privacy.auto-blur'], true), false, 'roundtrip privacy.auto-blur');
  assert.strictEqual(coerce(parsed['privacy.blur-contacts'], false), true, 'roundtrip privacy.blur-contacts');
  assert.strictEqual(coerce(parsed['lock.enabled'], false), true, 'roundtrip lock.enabled');
  assert.strictEqual(coerce(parsed['lock.timeout'], 15), 30, 'roundtrip lock.timeout');
  assert.strictEqual(coerce(parsed['accounts.hibernation-minutes'], 30), 45, 'roundtrip accounts.hibernation-minutes');
  assert.strictEqual(coerce(parsed['view.hyprland-accent'], true), false, 'roundtrip view.hyprland-accent');
  console.log('  ok   Config roundtrip for privacy, lock, and accounts verified');
}

console.log('Testing LockManager...');
{
  const mockConfig = {
    values: { ...DEFAULTS },
    get(k) { return this.values[k]; },
    set(k, v) { this.values[k] = v; },
    save() {},
  };

  const lock = new LockManager(mockConfig);
  if (!lock.hasPasscode()) {
    assert.strictEqual(lock.isEnabled(), false, 'lock should not be enabled without passcode');
    assert.strictEqual(lock.lock(), false, 'lock() must return false without passcode');
  }
  console.log('  ok   LockManager passcode requirements verified');
}

console.log('All privacy, lock, and settings tests PASSED!');
