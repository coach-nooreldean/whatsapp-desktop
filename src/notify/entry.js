/*
 * Single notification banner lifecycle, actions, inline replies, and timers.
 */
'use strict';

const { Notification } = require('electron');

class Entry {
  constructor(owner, { key, msgId, title, body, iconPath, onClick, onMarkAsRead, onReply, ongoing }) {
    this.owner = owner;
    this.key = key || title;
    this.msgId = msgId || '';
    this.title = title;
    this.body = body || '';
    this.iconPath = iconPath;
    this.onClick = onClick;
    this.onMarkAsRead = onMarkAsRead;
    this.onReply = onReply;
    this.raisedAt = Date.now();
    this.settled = false;
    this.timer = null;
    this.current = null;
    this.ongoing = !!ongoing;
  }

  _open() {
    if (typeof this.onClick === 'function') {
      try {
        this.onClick();
      } catch (err) {
        console.error('Failed to run notification click callback: %s', err.message);
      }
    }
  }

  _watch(notification) {
    this.current = notification;
    let ours = false;
    notification.__retire = () => {
      ours = true;
      try {
        notification.close();
      } catch (err) {
        // Notification might already be destroyed or closed
      }
    };
    notification.on('click', () => {
      this.settled = true;
      this._open();
      this.dispose();
    });
    notification.on('action', (event, index) => {
      this.settled = true;
      if (typeof this.onMarkAsRead === 'function') {
        try {
          this.onMarkAsRead();
        } catch (err) {
          console.error('Failed to run mark-as-read callback: %s', err.message);
        }
      }
      this.dispose();
    });
    notification.on('reply', (event, replyText) => {
      this.settled = true;
      if (typeof this.onReply === 'function' && replyText) {
        try {
          this.onReply(replyText);
        } catch (err) {
          console.error('Failed to run reply callback: %s', err.message);
        }
      }
      this.dispose();
    });
    notification.on('close', () => {
      if (ours) return;
      this.settled = true;
      this.dispose();
    });
  }

  show(seconds) {
    const actions = this.ongoing ? [] : [{ type: 'button', text: 'Mark as Read' }];
    const banner = new Notification({
      title: this.title,
      body: this.body,
      icon: this.iconPath,
      urgency: 'normal',
      timeoutType: 'default',
      actions: actions,
      hasReply: !this.ongoing,
      replyPlaceholder: 'Reply...',
    });
    this._watch(banner);
    banner.show();

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.settled) return;
      banner.__retire();

      const filed = new Notification({
        title: this.title,
        body: this.body,
        icon: this.iconPath,
        urgency: 'low',
        silent: true,
        timeoutType: 'default',
        actions: actions,
        hasReply: !this.ongoing,
        replyPlaceholder: 'Reply...',
      });
      this._watch(filed);
      filed.show();
    }, Math.max(1, seconds) * 1000);
    if (this.timer && this.timer.unref) this.timer.unref();

    return this;
  }

  dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.current) {
      this.current.__retire();
      this.current = null;
    }
    this.owner._forget(this);
  }
}

module.exports = {
  Entry,
};
