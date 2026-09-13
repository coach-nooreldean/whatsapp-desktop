/*
 * App Lock and Passcode Protection for WhatsApp Desktop.
 *
 * Provides PIN/passcode locking with PBKDF2 cryptographic hashing,
 * inactivity auto-lock timers, and rate-limiting against brute force.
 *
 * Stored in: ~/.config/whatsapp-desktop/security.json (mode 0600)
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { CONFIG_DIR } = require('./config.js');
const SECURITY_PATH = path.join(CONFIG_DIR, 'security.json');

const ITERATIONS = 100000;
const KEYLEN = 32;
const DIGEST = 'sha256';

class LockManager {
  constructor(config) {
    this.config = config;
    this.salt = null;
    this.hash = null;
    this.isLocked = false;
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
    this.lastActivity = Date.now();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(SECURITY_PATH)) {
        const content = fs.readFileSync(SECURITY_PATH, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && parsed.salt && parsed.hash) {
          this.salt = parsed.salt;
          this.hash = parsed.hash;
          // If a passcode exists and lock is enabled, start locked
          if (this.config.get('lock.enabled') !== false) {
            this.isLocked = true;
          }
        }
      }
    } catch (e) {
      console.warn('Could not read security.json:', e.message);
    }
  }

  save() {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      const data = {
        salt: this.salt,
        hash: this.hash,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(SECURITY_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (e) {
      console.warn('Could not write security.json:', e.message);
    }
  }

  hasPasscode() {
    return !!(this.salt && this.hash);
  }

  isEnabled() {
    return this.hasPasscode() && (this.config.get('lock.enabled') !== false);
  }

  setPasscode(pin) {
    if (!pin || typeof pin !== 'string' || pin.trim().length < 4) {
      throw new Error('Passcode must be at least 4 characters long');
    }
    const clean = pin.trim();
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.pbkdf2Sync(clean, salt, ITERATIONS, KEYLEN, DIGEST);
    this.salt = salt;
    this.hash = derived.toString('hex');
    this.save();
    this.config.set('lock.enabled', true);
    this.config.save();
    return true;
  }

  removePasscode(currentPin) {
    if (!this.hasPasscode()) return true;
    if (!this.verify(currentPin)) {
      throw new Error('Incorrect passcode');
    }
    this.salt = null;
    this.hash = null;
    try {
      if (fs.existsSync(SECURITY_PATH)) fs.unlinkSync(SECURITY_PATH);
    } catch (e) {}
    this.config.set('lock.enabled', false);
    this.config.save();
    this.isLocked = false;
    return true;
  }

  verify(pin) {
    if (!this.hasPasscode()) return true;
    if (Date.now() < this.lockoutUntil) {
      const waitSec = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
      throw new Error(`Too many failed attempts. Try again in ${waitSec}s.`);
    }

    const clean = String(pin || '').trim();
    const derived = crypto.pbkdf2Sync(clean, this.salt, ITERATIONS, KEYLEN, DIGEST);
    const attemptBuf = Buffer.from(derived.toString('hex'), 'utf8');
    const targetBuf = Buffer.from(this.hash, 'utf8');

    if (attemptBuf.length === targetBuf.length && crypto.timingSafeEqual(attemptBuf, targetBuf)) {
      this.failedAttempts = 0;
      this.isLocked = false;
      this.recordActivity();
      return true;
    }

    this.failedAttempts++;
    if (this.failedAttempts >= 5) {
      this.lockoutUntil = Date.now() + 30000; // 30s lockout
    }
    return false;
  }

  lock() {
    if (this.isEnabled()) {
      this.isLocked = true;
      return true;
    }
    return false;
  }

  unlock(pin) {
    return this.verify(pin);
  }

  recordActivity() {
    this.lastActivity = Date.now();
  }

  checkIdleTimeout() {
    if (!this.isEnabled() || this.isLocked) return false;
    const timeoutMin = Number(this.config.get('lock.timeout'));
    // If timeout is <= 0 or not configured, auto-lock is disabled
    if (!timeoutMin || timeoutMin <= 0) return false;

    const idleMs = Date.now() - this.lastActivity;
    if (idleMs >= timeoutMin * 60 * 1000) {
      this.lock();
      return true;
    }
    return false;
  }
}

module.exports = {
  LockManager,
  SECURITY_PATH,
};
