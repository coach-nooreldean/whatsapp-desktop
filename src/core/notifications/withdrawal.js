/*
 * Notification banner withdrawal policies for active and read conversations.
 */
'use strict';

const ARRIVAL_SETTLE_MS = 4000;

function withdrawOpenChat(banners, openChat, win) {
  if (!banners || !openChat) return;
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible() || win.isMinimized() || !win.isFocused()) return;

  const closed = banners.closeKey(openChat);
  if (closed) {
    console.log('withdrew %d notification(s) for %s: it is the chat on screen', closed, openChat);
  }
}

function withdrawRingingCalls(banners, ringingBanners) {
  if (!banners || !ringingBanners.size) return;
  for (const id of [...ringingBanners]) {
    ringingBanners.delete(id);
    if (banners.closeMessage(id)) {
      console.log('withdrew the ringing: the client is open');
    }
  }
}

function withdrawReadChat({ banners, key, unreadChatNames, withdrawing, onReschedule }) {
  const waiting = withdrawing.get(key);
  if (waiting) {
    clearTimeout(waiting);
    withdrawing.delete(key);
  }
  if (!banners || unreadChatNames.has(key)) return;

  const closed = banners.closeKey(key, ARRIVAL_SETTLE_MS);
  if (closed) {
    console.log('withdrew %d notification(s) for %s: it has been read', closed, key);
  }

  const left = banners.guardRemaining(key, ARRIVAL_SETTLE_MS);
  if (left > 0 && typeof onReschedule === 'function') {
    console.log('holding %s for another %dms before withdrawing: the banner is new', key, Math.round(left));
    onReschedule(left + 50);
  }
}

module.exports = {
  ARRIVAL_SETTLE_MS,
  withdrawOpenChat,
  withdrawRingingCalls,
  withdrawReadChat,
};
