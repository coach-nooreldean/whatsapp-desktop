/*
 * Desktop notification coordinator (Banners).
 *
 * Coordinates active notifications, expiration timeouts, low-urgency drawer filing,
 * and user interactions (click, inline reply, mark-as-read).
 *
 * Modularized into:
 *   - src/notify/entry.js: Single notification banner lifecycle, actions, and timers
 *   - src/notify/avatars.js: Avatar image caching and periodic cleanup
 *   - src/notify/seen.js: Seen notification deduplication state file manager
 */
'use strict';

const { Notification } = require('electron');
const { avatarPath, sweepAvatars } = require('./notify/avatars.js');
const { Seen, SEEN_TTL_MS } = require('./notify/seen.js');
const { Entry } = require('./notify/entry.js');

const SAME_MESSAGE_MS = 15000;
const SAME_ID_MS = SEEN_TTL_MS;

class Banners {
  constructor({ seconds = 12, appIcon = null, stateFile = null, hidePreview = false } = {}) {
    this.seconds = seconds;
    this.appIcon = appIcon;
    this.hidePreview = hidePreview;
    this.byKey = new Map();
    this.seen = stateFile ? new Seen(stateFile) : null;
  }

  get supported() {
    return Notification.isSupported();
  }

  show({ identity, msgId, key, title, body, icon, onClick, onMarkAsRead, onReply, redacted, ongoing }) {
    if (!this.supported || !title) return null;

    if (identity && this.seen) {
      if (this.seen.has(identity, msgId ? SAME_ID_MS : SAME_MESSAGE_MS)) {
        console.log('already announced: the same message reported twice');
        return null;
      }
      this.seen.add(identity);
    }

    const entry = new Entry(this, {
      key,
      msgId,
      title,
      body: this.hidePreview ? redacted || 'New message' : body,
      iconPath: avatarPath(icon) || this.appIcon || undefined,
      onClick,
      onMarkAsRead,
      onReply,
      ongoing,
    });

    let set = this.byKey.get(entry.key);
    if (!set) this.byKey.set(entry.key, (set = new Set()));
    set.add(entry);

    return entry.show(this.seconds);
  }

  _forget(entry) {
    const set = this.byKey.get(entry.key);
    if (!set) return;
    set.delete(entry);
    if (!set.size) this.byKey.delete(entry.key);
  }

  closeKey(key, minimumAge = 0) {
    const set = this.byKey.get(key);
    if (!set) return 0;
    let closed = 0;
    for (const entry of [...set]) {
      if (entry.ongoing) continue;
      if (Date.now() - entry.raisedAt < minimumAge) continue;
      entry.dispose();
      closed++;
    }
    return closed;
  }

  guardRemaining(key, minimumAge) {
    const set = this.byKey.get(key);
    if (!set) return 0;
    let longest = 0;
    for (const entry of set) {
      const left = minimumAge - (Date.now() - entry.raisedAt);
      if (left > longest) longest = left;
    }
    return longest;
  }

  closeMessage(msgId) {
    if (!msgId) return 0;
    let closed = 0;
    for (const set of [...this.byKey.values()]) {
      for (const entry of [...set]) {
        if (entry.msgId === msgId) {
          entry.dispose();
          closed++;
        }
      }
    }
    return closed;
  }

  trim(key, keep) {
    const set = this.byKey.get(key);
    if (!set) return 0;
    const live = [...set].filter(entry => !entry.ongoing);
    const going = keep > 0 ? live.slice(0, Math.max(0, live.length - keep)) : live;
    for (const entry of going) entry.dispose();
    return going.length;
  }

  countFor(key) {
    const set = this.byKey.get(key);
    return set ? set.size : 0;
  }

  keys() {
    return [...this.byKey.keys()];
  }
}

module.exports = {
  Banners,
  sweepAvatars,
  avatarPath,
  Entry,
};
