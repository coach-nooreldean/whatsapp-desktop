/*
 * IPC channels for WhatsApp Store events, real-time message sync, calls, reactions, and MPRIS media.
 */
'use strict';

const { ipcMain } = require('electron');
const bidi = require('../../bidi.js');
const { SEP } = require('../../page/inject.js');

function registerStoreIpc(ctx) {
  const {
    accountsMgr,
    viewManager,
    notificationCoordinator,
    getMprisService,
  } = ctx;

  ipcMain.on('wa:store-ready', (event, state) => {
    const ready = !!(state && state.ready);
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    if (item) item.storeLive = ready;
    if (accId === viewManager.activeAccountId) notificationCoordinator.storeLive = ready;
    if (!ready) {
      console.log('WhatsApp\'s store for [%s] is not answering; the chat list watcher is in charge', accId);
      return;
    }
    if (item) item.unreadChatNames = new Set();
    notificationCoordinator.unreadChatNames = new Set();
    for (const timer of notificationCoordinator.withdrawing.values()) clearTimeout(timer);
    notificationCoordinator.withdrawing.clear();
  });

  ipcMain.on('wa:store-message', (event, note) => {
    if (!note || !note.chat || !note.title) return;
    if (!notificationCoordinator.storeBannersAreOurs()) return;

    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    notificationCoordinator.chatTitles.set(note.chat, note.title);
    if (notificationCoordinator.chatTitles.size > 512) {
      notificationCoordinator.chatTitles.delete(notificationCoordinator.chatTitles.keys().next().value);
    }

    const mark = note.mark ? note.mark.trim() : '';
    const said = [mark, note.text].filter(Boolean).join(' ');
    const aimed = note.aimed ? String(note.aimed).trim() : '';
    const body = note.join === 'space' ? bidi.did(note.sender, said, aimed)
                                       : bidi.line(note.sender, said, aimed);
    const banner = notificationCoordinator.banners.show({
      identity: (accId !== 'default' ? accId + SEP : '') + note.msg,
      msgId: (accId !== 'default' ? accId + SEP : '') + note.msg,
      key: (accId !== 'default' ? accId + SEP : '') + note.chat,
      title: bidi.paragraph(prefix + note.title),
      body,
      redacted: bidi.words(aimed, note.redacted || mark || 'New message'),
      icon: note.avatar,
      onClick: () => {
        if (accId !== viewManager.activeAccountId) viewManager.switchToAccount(accId);
        ctx.showWindow('a banner was clicked');
        if (item && !item.view.webContents.isDestroyed()) {
          item.view.webContents.send('wa:store-open', { chat: note.chat, name: note.title,
                                                  preview: note.text, msg: note.msg,
                                                  story: !!note.story });
        }
      },
      onMarkAsRead: () => {
        if (item && !item.view.webContents.isDestroyed()) {
          item.view.webContents.send('wa:store-mark-read', { chat: note.chat, name: note.title, msg: note.msg });
        }
      },
      onReply: (replyText) => {
        if (item && !item.view.webContents.isDestroyed()) {
          item.view.webContents.send('wa:store-reply', { chat: note.chat, name: note.title, msg: note.msg, text: replyText });
        }
      },
    });
    if (!banner) return;
    console.log('raised [%s]: %s in %s%s', acc ? acc.name : accId,
                note.why === 'reaction' ? 'a reaction' : mark || 'a message of words',
                note.title, note.mention ? ' (addressed to you)' : '');
    notificationCoordinator.playTone();
  });

  ipcMain.on('wa:store-ringing', (event, note) => {
    if (!note || !note.chat || !note.title || !note.call) return;
    if (!notificationCoordinator.storeBannersAreOurs()) return;

    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    notificationCoordinator.chatTitles.set(note.chat, note.title);

    const banner = notificationCoordinator.banners.show({
      identity: 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call,
      msgId: 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call,
      key: (accId !== 'default' ? accId + SEP : '') + note.chat,
      ongoing: true,
      title: bidi.paragraph(prefix + note.title),
      body: bidi.line(note.sender, note.mark),
      redacted: note.mark,
      icon: note.avatar,
      onClick: () => {
        if (accId !== viewManager.activeAccountId) viewManager.switchToAccount(accId);
        ctx.showWindow('a ringing banner was clicked');
        if (item && !item.view.webContents.isDestroyed()) {
          item.view.webContents.send('wa:store-open', { chat: note.chat, name: note.title });
        }
      },
    });
    if (!banner) return;
    notificationCoordinator.ringingBanners.add('ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call);
    console.log('ringing [%s]: %s in %s', acc ? acc.name : accId, note.mark, note.title);
  });

  ipcMain.on('wa:store-ring-over', (event, note) => {
    if (!note || !note.call || !notificationCoordinator.banners) return;
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const ringKey = 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call;
    notificationCoordinator.ringingBanners.delete(ringKey);
    if (notificationCoordinator.banners.closeMessage(ringKey)) {
      console.log('the telephone has stopped ringing in %s',
                  notificationCoordinator.chatTitles.get(note.chat) || note.chat);
    }
  });

  ipcMain.on('wa:store-open-arrival', () => {
    if (!notificationCoordinator.storeBannersAreOurs()) return;
    console.log('a message in the chat on screen: nothing raised, and nothing played');
  });

  ipcMain.on('wa:store-read', (event, state) => {
    if (!state) return;
    notificationCoordinator.storeRead(state.chat, Number(state.unread) || 0);
  });

  ipcMain.on('wa:store-active', (event, state) => {
    if (!state) return;
    notificationCoordinator.storeActive(state.chat || '');
  });

  ipcMain.on('wa:store-unread', (event, map) => {
    notificationCoordinator.storeUnread(map);
  });

  ipcMain.on('wa:store-gone', (event, state) => {
    if (!state || !state.msg || !notificationCoordinator.banners) return;
    const closed = notificationCoordinator.banners.closeMessage(state.msg);
    if (!closed) return;
    console.log('withdrew %d notification(s) in %s: %s', closed,
                notificationCoordinator.chatTitles.get(state.chat) || state.chat || 'a chat',
                String(state.msg).startsWith('reaction') ? 'the reaction is gone'
                                                         : 'the message was deleted');
  });

  ipcMain.on('wa:store-count', (event, count) => {
    if (!count || typeof count.messages !== 'number') return;
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    if (item) item.unreadMessages = count.messages;
    if (accId === viewManager.activeAccountId) notificationCoordinator.unreadMessages = count.messages;
    accountsMgr.setUnreadCount(accId, count.messages);
    viewManager.notifySidebarState();
    notificationCoordinator.updateAggregateUnread();
  });

  ipcMain.on('wa:open-chat', (event, name) => {
    if (notificationCoordinator.storeLive) return;
    notificationCoordinator.openChat = typeof name === 'string' ? name : '';
    notificationCoordinator.withdrawOpen();
  });

  ipcMain.on('wa:unread-chats', (event, names) => {
    if (notificationCoordinator.storeLive) return;
    if (!Array.isArray(names) || !notificationCoordinator.banners) return;
    notificationCoordinator.unreadChatNames = new Set(names);
    const held = notificationCoordinator.banners.keys();
    if (held.length) {
      console.log('unread: [%s]; banners still up for: [%s]', names.join(', '), held.join(', '));
    }
    for (const key of new Set([...held, ...notificationCoordinator.withdrawing.keys()])) {
      notificationCoordinator.withdrawRead(key);
    }
  });

  ipcMain.on('wa:unread-count', (event, count) => {
    if (!count || typeof count.messages !== 'number') return;
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    if (item && item.storeLive) return;
    if (item) item.unreadMessages = count.messages;
    if (accId === viewManager.activeAccountId) notificationCoordinator.unreadMessages = count.messages;
    accountsMgr.setUnread(accId, count.messages);
    viewManager.notifySidebarState();
    notificationCoordinator.updateAggregateUnread();
  });

  ipcMain.on('wa:media-playback', (event, data) => {
    const mprisService = getMprisService();
    if (mprisService && data) {
      mprisService.updateTrack({
        title: data.title,
        artist: data.artist || 'WhatsApp',
        durationSec: data.duration,
        positionSec: data.position,
        state: data.state || (data.playing ? 'Playing' : 'Paused'),
      });
    }
  });
}

module.exports = {
  registerStoreIpc,
};
