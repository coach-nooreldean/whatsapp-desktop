/*
 * Persistent deduplication cache for announced messages.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* How long a row is worth keeping. What is actually asked of this list is a
   window of seconds (SAME_MESSAGE_MS) -- the hour is simply how long a row
   is worth the bytes. */
const SEEN_TTL_MS = 60 * 60 * 1000;
const SEEN_MAX = 4096;

class Seen {
  constructor(file) {
    this.file = file;
    this.at = new Map();                  // digest -> when it was announced
    this.dirty = false;
    this.flushTimer = null;
    this.load();
  }

  static digest(identity) {
    return crypto.createHash('sha256').update(String(identity)).digest('hex').slice(0, 24);
  }

  load() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { return; }
    if (!raw || typeof raw !== 'object' || !raw.seen) return;
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [key, at] of Object.entries(raw.seen))
      if (typeof at === 'number' && at > cutoff) this.at.set(key, at);
    console.log('carried %d announced message(s) over from the last session', this.at.size);
  }

  /* Written on a timer rather than per notification: a burst is a dozen messages
     in a few seconds and each one would otherwise be a synchronous write. */
  save() {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.dirty) return;
      this.dirty = false;
      const cutoff = Date.now() - SEEN_TTL_MS;
      for (const [key, at] of this.at) if (at < cutoff) this.at.delete(key);
      while (this.at.size > SEEN_MAX) this.at.delete(this.at.keys().next().value);
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(this.file, JSON.stringify({ seen: Object.fromEntries(this.at) }),
                         { mode: 0o600 });
      } catch (e) {
        console.warn('could not remember which messages were announced: %s', e.message);
      }
    }, 5000);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  /* Whether this exact message has been announced inside the window. */
  has(identity, windowMs) {
    const at = this.at.get(Seen.digest(identity));
    return at !== undefined && Date.now() - at < windowMs;
  }

  add(identity) {
    this.at.set(Seen.digest(identity), Date.now());
    this.save();
  }
}

module.exports = {
  SEEN_TTL_MS,
  SEEN_MAX,
  Seen,
};
