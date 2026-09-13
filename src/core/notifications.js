/*
 * Notifications, tone playback, banner withdrawals, and WhatsApp store state synchronization.
 */
'use strict';

const desktop = require('../desktop.js');
const bidi = require('../bidi.js');
const { kindOf, pushName, readBody, mediaFromWords } = require('../wording.js');
const { SEP } = require('../page/inject.js');

const STARTUP_GRACE_MS = 30000;
const TITLE_FALLBACK_MS = 2000;
const ARRIVAL_SETTLE_MS = 4000;
const TITLE = 'WhatsApp';

class NotificationCoordinator {
  constructor({ config, app, banners, getMainWindow, getTray, accountsMgr, viewManager, showWindow }) {
    this.config = config;
    this.app = app;
    this.banners = banners;
    this.getMainWindow = getMainWindow;
    this.getTray = getTray;
    this.accountsMgr = accountsMgr;
    this.viewManager = viewManager;
    this.showWindow = showWindow;

    this.ringingBanners = new Set();
    this.pageBanners = new Map();
    this.withdrawing = new Map();
    this.unreadChatNames = new Set();
    this.openChat = '';

    this.storeLive = false;
    this.activeChatId = '';
    this.chatTitles = new Map();

    this.loadedAt = 0;
    this.lastArrivalAt = 0;
    this.badgeShown = -1;
    this.unreadMessages = null;
    this.unreadChats = 0;
  }

  setBanners(banners) {
    this.banners = banners;
  }

  setLoadedAt(timestamp) {
    this.loadedAt = timestamp;
  }

  playTone() {
    if (!this.config.get('notifications.sound')) return;
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;

    if (!desktop.notificationsAllowed()) {
      console.log('the tone is not played: the desktop is not taking notifications');
      return;
    }
    if (!desktop.eventSoundsEnabled()) {
      console.log('the tone is not played: the desktop has its alert sounds off');
      return;
    }
    win.webContents.send('wa:play-tone', null);
  }

  withdrawOpen() {
    if (!this.banners || !this.openChat) return;
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible() || win.isMinimized() || !win.isFocused()) return;

    const closed = this.banners.closeKey(this.openChat);
    if (closed) {
      console.log('withdrew %d notification(s) for %s: it is the chat on screen',
        closed, this.openChat);
    }
  }

  withdrawRinging() {
    if (!this.banners || !this.ringingBanners.size) return;
    for (const id of [...this.ringingBanners]) {
      this.ringingBanners.delete(id);
      if (this.banners.closeMessage(id)) {
        console.log('withdrew the ringing: the client is open');
      }
    }
  }

  withdrawRead(key) {
    const waiting = this.withdrawing.get(key);
    if (waiting) {
      clearTimeout(waiting);
      this.withdrawing.delete(key);
    }
    if (!this.banners || this.unreadChatNames.has(key)) return;

    const closed = this.banners.closeKey(key, ARRIVAL_SETTLE_MS);
    if (closed) {
      console.log('withdrew %d notification(s) for %s: it has been read', closed, key);
    }

    const left = this.banners.guardRemaining(key, ARRIVAL_SETTLE_MS);
    if (left > 0) {
      console.log('holding %s for another %dms before withdrawing: the banner is new',
        key, Math.round(left));
      this.withdrawing.set(key, setTimeout(() => this.withdrawRead(key), left + 50));
    }
  }

  storeRead(chatId, unread) {
    if (!this.banners || !chatId) return;
    const held = this.banners.countFor(chatId);
    if (!held) return;
    const closed = this.banners.trim(chatId, unread);
    if (!closed) return;
    console.log('withdrew %d notification(s) for %s: %s', closed,
      this.chatTitles.get(chatId) || chatId,
      unread ? unread + ' message(s) still unread' : 'it has been read');
  }

  storeActive(chatId) {
    this.activeChatId = chatId || '';
    if (!this.banners || !this.activeChatId) return;
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible() || win.isMinimized() || !win.isFocused()) return;
    const closed = this.banners.trim(this.activeChatId, 0);
    if (closed) {
      console.log('withdrew %d notification(s) for %s: it is the chat on screen',
        closed, this.chatTitles.get(this.activeChatId) || this.activeChatId);
    }
  }

  storeUnread(map) {
    if (!this.banners || !map || typeof map !== 'object') return;
    for (const key of this.banners.keys()) {
      this.storeRead(key, Number(map[key]) || 0);
    }
  }

  storeBannersAreOurs() {
    if (!this.storeLive || !this.banners) return false;
    if (!this.config.get('notifications.enabled')) return false;
    if (Date.now() - this.loadedAt < STARTUP_GRACE_MS) {
      console.log('notification skipped: the client is still syncing');
      return false;
    }
    return true;
  }

  bannersAreOurs() {
    if (!this.config.get('notifications.enabled')) return false;
    const win = this.getMainWindow();
    if (!win || win.isDestroyed() || !win.isVisible() || !win.isFocused()) return false;
    if (Date.now() - this.loadedAt < STARTUP_GRACE_MS) {
      console.log('notification skipped: the client is still syncing');
      return false;
    }
    return true;
  }

  setBadge(count) {
    const wanted = Math.max(0, Math.round(Number(count) || 0));
    if (wanted === this.badgeShown) return;
    this.badgeShown = wanted;
    try {
      this.app.badgeCount = wanted;
    } catch (e) { }
    console.log('badge: %d', wanted);
  }

  updateAggregateUnread() {
    let totalWaiting = 0;
    const accountViews = this.viewManager.accountViews;
    for (const [, it] of accountViews) {
      const w = it.unreadMessages === null ? (it.unreadChats || 0) : (it.unreadMessages || 0);
      totalWaiting += w;
    }
    const tray = this.getTray();
    if (tray) tray.setAttention(totalWaiting > 0);
    this.setBadge(totalWaiting);

    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      const activeItem = accountViews.get(this.viewManager.activeAccountId);
      const title = activeItem && activeItem.title ? activeItem.title : TITLE;
      win.setTitle(title && title.trim() ? title : TITLE);
    }
  }

  describeThenNotify(targetAccountId = this.viewManager.activeAccountId) {
    return setTimeout(async () => {
      const win = this.getMainWindow();
      if (!win || win.isDestroyed()) return;
      const item = this.viewManager.accountViews.get(targetAccountId);
      if (!item || !item.view || item.view.webContents.isDestroyed()) return;

      let answer = '';
      try {
        answer = await item.view.webContents.executeJavaScript(
          'window.__waDescribeUnread ? window.__waDescribeUnread() : ""', true);
      } catch (e) {
        console.warn('could not ask the page what arrived: %s', e.message);
        return;
      }

      if (answer === 'open') {
        console.log('a message in the chat on screen: nothing raised, and nothing played');
        return;
      }
      if (!answer) {
        console.log('notification skipped: nothing the page could name');
        return;
      }

      const [chat, sender, message, avatar, token] = answer.split(SEP);
      if (!chat || !message) return;

      const acc = this.accountsMgr.getAccount(targetAccountId);
      const prefix = (this.accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

      const raised = this.banners.show({
        identity: (targetAccountId !== 'default' ? targetAccountId + SEP : '') + [chat, sender, message].join(SEP),
        key: (targetAccountId !== 'default' ? targetAccountId + SEP : '') + chat,
        title: bidi.paragraph(prefix + chat),
        body: bidi.line(sender, message),
        redacted: kindOf(message),
        icon: avatar,
        onClick: () => {
          if (targetAccountId !== this.viewManager.activeAccountId) {
            this.viewManager.switchToAccount(targetAccountId);
          }
          this.showWindow('a banner was clicked');
          if (item && !item.view.webContents.isDestroyed()) {
            item.view.webContents.send('wa:open-chat-request', { token, name: chat, preview: message });
          }
        },
        onMarkAsRead: () => {
          if (item && !item.view.webContents.isDestroyed()) {
            item.view.webContents.send('wa:mark-chat-read-request', { token, name: chat, preview: message });
          }
        },
        onReply: (replyText) => {
          if (item && !item.view.webContents.isDestroyed()) {
            item.view.webContents.send('wa:reply-chat-request', { token, name: chat, preview: message, text: replyText });
          }
        },
      });
      if (raised) this.playTone();
    }, 250);
  }

  onAccountTitle(accId, title) {
    const item = this.viewManager.accountViews.get(accId);
    if (!item) return;
    item.title = title || '';

    let chats = 0;
    const m = /^\((\d+)\)/.exec(title || '');
    if (m) chats = parseInt(m[1], 10) || 1;

    if (!item.storeLive &&
      chats > (item.unreadChats || 0) &&
      Date.now() - this.lastArrivalAt > TITLE_FALLBACK_MS &&
      this.bannersAreOurs()) {
      this.describeThenNotify(accId);
    }
    item.unreadChats = chats;
    if (accId === this.viewManager.activeAccountId) this.unreadChats = chats;

    if (item.storeLive) {
      this.updateAggregateUnread();
      return;
    }

    if (chats === 0) {
      item.unreadMessages = 0;
      if (accId === this.viewManager.activeAccountId) this.unreadMessages = 0;
    }

    const waiting = item.unreadMessages === null ? chats : item.unreadMessages;
    this.accountsMgr.setUnreadCount(accId, waiting);
    this.viewManager.notifySidebarState();
    this.updateAggregateUnread();
  }
}

module.exports = {
  NotificationCoordinator,
  STARTUP_GRACE_MS,
  TITLE_FALLBACK_MS,
  ARRIVAL_SETTLE_MS,
};
