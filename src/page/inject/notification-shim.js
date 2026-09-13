/*
 * Interception of window.Notification and ServiceWorker notifications to forward to Electron.
 */
'use strict';

const installNotificationShim = ({
  win,
  send,
  log,
  storeLive,
  chatNameFor,
  chatKindFor,
  avatarFor,
  rememberName,
  fetchAvatar,
  withTimeout,
  on,
}) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const Real = w.Notification;
  if (!Real) return null;

  const logger = typeof log === 'function' ? log : () => {};
  const sender = typeof send === 'function' ? send : () => {};
  const isStoreLive = typeof storeLive === 'function' ? storeLive : () => false;

  let nextId = 1;
  const raised = new Map();

  class Shimmed {
    constructor(title, options = {}) {
      this.__id = nextId++;
      this.title = String(title == null ? '' : title);
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || '';
      this.data = options.data;
      this.silent = !!options.silent;
      this.__handlers = { click: [], close: [], show: [], error: [] };
      raised.set(this.__id, this);

      const chat = typeof chatNameFor === 'function' ? chatNameFor(this.title) : '';
      if (isStoreLive()) return;
      logger('WhatsApp raised a notification of its own');
      Promise.resolve()
        .then(() => {
          if (!this.icon) return typeof avatarFor === 'function' ? avatarFor(this.title) : '';
          if (typeof rememberName === 'function') rememberName(this.title);
          return typeof withTimeout === 'function' && typeof fetchAvatar === 'function'
            ? withTimeout(fetchAvatar(this.icon))
            : '';
        })
        .catch(() => '')
        .then(avatar => sender('page-notification', {
          id: this.__id, title: this.title, body: this.body,
          chat: chat,
          group: typeof chatKindFor === 'function' ? chatKindFor(this.title) : null,
          avatar: avatar || '', silent: this.silent,
        }));
    }

    close() {
      raised.delete(this.__id);
      sender('page-notification-close', { id: this.__id });
      this.__fire('close');
    }

    addEventListener(type, fn) { (this.__handlers[type] || (this.__handlers[type] = [])).push(fn); }
    removeEventListener(type, fn) {
      const list = this.__handlers[type] || [];
      const at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    }

    __fire(type) {
      const Evt = w.Event || Event;
      const event = new Evt(type);
      try { Object.defineProperty(event, 'target', { value: this, configurable: true }); } catch (e) {}
      const inline = this['on' + type];
      if (typeof inline === 'function') { try { inline.call(this, event); } catch (e) {} }
      for (const fn of (this.__handlers[type] || [])) { try { fn.call(this, event); } catch (e) {} }
    }

    static get permission() { return 'granted'; }
    static requestPermission(callback) {
      if (typeof callback === 'function') callback('granted');
      return Promise.resolve('granted');
    }
  }

  if (typeof on === 'function') {
    on('notification-clicked', id => {
      const note = raised.get(id);
      if (note) note.__fire('click');
    });
    on('notification-closed', id => {
      const note = raised.get(id);
      if (!note) return;
      raised.delete(id);
      note.__fire('close');
    });
  }

  w.Notification = Shimmed;

  try {
    const proto = w.ServiceWorkerRegistration && w.ServiceWorkerRegistration.prototype;
    if (proto && proto.showNotification) {
      proto.showNotification = function (title, options) {
        new Shimmed(title, options);
        return Promise.resolve();
      };
      proto.getNotifications = function () { return Promise.resolve([]); };
    }
  } catch (e) { logger('could not shim the service worker notifications: ' + e.message); }

  return Shimmed;
};

module.exports = { installNotificationShim };
