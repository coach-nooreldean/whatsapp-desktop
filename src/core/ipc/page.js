/*
 * IPC channels for WhatsApp page DOM-level events, link resolution, and fallbacks.
 */
'use strict';

const { ipcMain } = require('electron');
const bidi = require('../../bidi.js');
const { pushName, readBody, mediaFromWords, kindOf } = require('../../wording.js');
const { SEP } = require('../../page/inject.js');
const fonts = require('../../fonts.js');
const links = require('../../links.js');

function registerPageIpc(ctx) {
  const {
    app,
    config,
    accountsMgr,
    viewManager,
    styleManager,
    notificationCoordinator,
    getMainWindow,
    forcingFont,
  } = ctx;

  ipcMain.on('wa:log', (event, message) => console.log('page: %s', message));

  ipcMain.on('wa:font-stack', (event, stack) => {
    if (!forcingFont(config) || typeof stack !== 'string') return;
    if (stack === styleManager.pageFontStack) return;
    styleManager.setPageFontStack(stack);
    styleManager.applyStyle();
    fonts.learn(app.getPath('userData'), stack.split(','));
  });

  ipcMain.on('wa:focus-request', () => ctx.showWindow('the page asked for the focus'));

  ipcMain.on('wa:link-unresolved', (event, chat) => {
    const phone = links.digitsOf(chat && chat.phone);
    const win = getMainWindow();
    if (!phone || !win || win.isDestroyed()) return;
    const query = 'phone=' + encodeURIComponent(phone) +
                  (ctx.deepLinkManager.pendingText ? '&text=' + encodeURIComponent(ctx.deepLinkManager.pendingText) : '');
    ctx.deepLinkManager.pendingText = '';
    console.log('loading WhatsApp\'s own send page for +%s', phone);
    win.loadURL('https://web.whatsapp.com/send?' + query).catch(() => {});
  });

  ipcMain.on('wa:invite-unresolved', (event, invite) => {
    const code = links.inviteOf(invite && invite.code);
    const win = getMainWindow();
    if (!code || !win || win.isDestroyed()) return;
    console.log('loading WhatsApp\'s own invite page for %s', code);
    win.loadURL('https://web.whatsapp.com/accept?code=' + encodeURIComponent(code)).catch(() => {});
  });

  ipcMain.on('wa:composer-ready', () => {
    const win = getMainWindow();
    if (!ctx.deepLinkManager.pendingText || !win || win.isDestroyed()) return;
    win.webContents.focus();
    win.webContents.insertText(ctx.deepLinkManager.pendingText);
    console.log('put the link\'s message in the composer (%d characters)', ctx.deepLinkManager.pendingText.length);
    ctx.deepLinkManager.pendingText = '';
  });

  ipcMain.on('wa:arrival', event => {
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    if (item && item.storeLive) return;
    if (!notificationCoordinator.bannersAreOurs()) return;
    notificationCoordinator.lastArrivalAt = Date.now();
    notificationCoordinator.describeThenNotify(accId);
  });

  ipcMain.on('wa:page-notification', (event, note) => {
    const accId = viewManager.getAccountIdByWebContents(event.sender);
    const item = viewManager.accountViews.get(accId);
    if (item && item.storeLive) return;
    if (!note || !config.get('notifications.enabled')) return;

    const { sender, message: said, mark } = readBody(note.body, note.group);
    const message = mediaFromWords(said) || said;

    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    const banner = notificationCoordinator.banners.show({
      identity: (accId !== 'default' ? accId + SEP : '') + [note.chat || note.title, sender, message].join(SEP),
      key: (accId !== 'default' ? accId + SEP : '') + (note.chat || note.title),
      title: bidi.paragraph(prefix + pushName(note.title)),
      body: bidi.line(sender, message, mark),
      redacted: bidi.words(mark, kindOf(message)),
      icon: note.avatar,
      onClick: () => {
        if (accId !== viewManager.activeAccountId) viewManager.switchToAccount(accId);
        ctx.showWindow('a banner was clicked');
        if (item && !item.view.webContents.isDestroyed()) {
          item.view.webContents.send('wa:notification-clicked', note.id);
        }
      },
    });

    if (banner) {
      notificationCoordinator.pageBanners.set(note.id, banner);
      while (notificationCoordinator.pageBanners.size > 256) {
        notificationCoordinator.pageBanners.delete(notificationCoordinator.pageBanners.keys().next().value);
      }
      console.log('raised [%s]: %s', acc ? acc.name : accId, mark + (mediaFromWords(said) || 'a message of words'));
      if (note.silent) console.log('the page asked for a silent notification; the tone is played anyway');
      notificationCoordinator.playTone();
    }
  });

  ipcMain.on('wa:page-notification-close', (event, note) => {
    if (!note) return;
    const banner = notificationCoordinator.pageBanners.get(note.id);
    notificationCoordinator.pageBanners.delete(note.id);
    if (!banner) return;
    if (notificationCoordinator.unreadChatNames.has(banner.key)) {
      console.log('WhatsApp closed its notification for %s but the chat still has ' +
                  'something unread; leaving the banner up', banner.key);
      return;
    }
    banner.dispose();
    console.log('withdrew a notification for %s: WhatsApp closed it and the chat is caught up',
                banner.key);
  });
}

module.exports = {
  registerPageIpc,
};
