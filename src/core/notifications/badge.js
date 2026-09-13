/*
 * Aggregate unread calculation and application badge updating.
 */
'use strict';

function calculateAggregateUnread(accountViews) {
  let totalWaiting = 0;
  for (const [, it] of accountViews) {
    const w = it.unreadMessages === null ? (it.unreadChats || 0) : (it.unreadMessages || 0);
    totalWaiting += w;
  }
  return totalWaiting;
}

function applyBadgeToApp(app, count, currentBadge) {
  const wanted = Math.max(0, Math.round(Number(count) || 0));
  if (wanted === currentBadge) return currentBadge;
  try {
    app.badgeCount = wanted;
  } catch (e) {}
  console.log('badge: %d', wanted);
  return wanted;
}

module.exports = {
  calculateAggregateUnread,
  applyBadgeToApp,
};
