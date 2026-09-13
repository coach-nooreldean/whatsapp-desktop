/*
 * Deep link routing, whatsapp: URL handling, and external navigation.
 */
'use strict';

const { shell } = require('electron');
const links = require('../links.js');

function isWhatsApp(url) {
  if (!url) return true;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:')) return true;
  try {
    const host = new URL(url).hostname;
    return host === 'web.whatsapp.com' || host.endsWith('.whatsapp.com') || host === 'whatsapp.com';
  } catch (e) {
    return false;
  }
}

function isOwnPage(url) {
  if (!url) return true;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:')) return true;
  try {
    return new URL(url).hostname === 'web.whatsapp.com';
  } catch (e) {
    return false;
  }
}

class DeepLinkManager {
  constructor({ getMainWindow, showWindow }) {
    this.getMainWindow = getMainWindow;
    this.showWindow = showWindow;

    this.pendingChat = null;
    this.pendingText = '';
    this.pendingInvite = '';
    this.loadedAt = 0;
  }

  setLoadedAt(timestamp) {
    this.loadedAt = timestamp;
  }

  openLinkedChat(chat, why) {
    const win = this.getMainWindow();
    if (!chat || !win || win.isDestroyed()) return;
    console.log('opening a chat with +%s%s (%s)', chat.phone,
                chat.text ? ' with a message ready to send' : '', why);
    this.showWindow('a link to a chat');
    this.pendingText = chat.text || '';
    if (this.loadedAt) {
      win.webContents.send('wa:open-link', { phone: chat.phone, wantsText: !!this.pendingText });
    } else {
      this.pendingChat = chat;
    }
  }

  openGroupInvite(code, why) {
    const win = this.getMainWindow();
    if (!code || !win || win.isDestroyed()) return;
    console.log('opening a group invite (%s)', why);
    this.showWindow('a group invite');
    if (this.loadedAt) {
      win.webContents.send('wa:open-invite', { code });
    } else {
      this.pendingInvite = code;
    }
  }

  openLink(link, why) {
    if (!link) return;
    if (link.invite) this.openGroupInvite(link.invite, why);
    else this.openLinkedChat(link, why);
  }

  openExternally(url) {
    const link = links.from(url);
    if (link) {
      this.openLink(link, 'a link in the page');
      return;
    }
    if (/^https?:|^mailto:|^tel:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
  }

  handleSecondInstance(argv) {
    const link = links.inArgv(argv);
    if (link) {
      this.openLink(link, 'a link from the desktop');
      return;
    }
    for (const arg of argv) {
      const verb = links.unhandled(arg);
      if (verb) console.log('nothing here opens a whatsapp: "%s" link', verb);
    }
    if (!argv.includes('--hidden')) {
      this.showWindow('a second copy was started');
    }
  }

  handleOpenUrl(event, url) {
    const link = links.from(url);
    if (!link) return;
    event.preventDefault();
    this.openLink(link, 'a link from the desktop');
  }
}

module.exports = {
  isWhatsApp,
  isOwnPage,
  DeepLinkManager,
};
