/*
 * Electron Tray fallback implementation.
 */
'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const { waitForHost } = require('./watcher.js');

class ElectronTray {
  constructor({ normal, attention, onToggle, onShow, onHide, onQuit, onSettings,
                onFonts, onAbout, getUpdate, title = 'WhatsApp' }) {
    this.icons = {
      normal: nativeImage.createFromPath(normal),
      attention: nativeImage.createFromPath(attention || normal),
    };
    this.handlers = { onToggle, onShow, onHide, onQuit, onSettings, onFonts,
                      onAbout, getUpdate };
    this.title = title;
    this.unread = false;
    /* Where the window was when this was last told. The word above it cannot
       move -- see renderMenu -- but what the click does still should, and the
       last thing an event said is a better answer than asking a window the
       desktop has been holding the keyboard away from. */
    this.inFront = null;

    this.tray = null;
    this.stopWaiting = waitForHost(() => this.build());
  }

  build() {
    if (this.tray) return;
    try {
      this.tray = new Tray(this.icons.normal);
      /* A click on the icon, where one is delivered at all: no menu was drawn,
         so nothing was promised and the app may decide for itself. */
      this.tray.on('click', () => this.handlers.onToggle && this.handlers.onToggle());
    } catch (e) {
      console.log(`tray: could not be created (${e.message})`);
      this.tray = null;
      return;
    }
    this.render();
  }

  render() {
    this.renderMenu();
    this.renderIcon();
  }

  /*
   * One item, one word, and the word never changes -- because changing it is
   * what breaks the button.
   *
   * The wording ought to follow the window, the way Telegram's does, and it was
   * built that way and measured. What came back settles it. Electron offers one
   * lever, setContextMenu, and pulling it renumbers the whole menu: read off the
   * session bus, the item was id 19 before a hide and id 28 after, every other
   * id moved with it, and the layout revision went 2 -> 3.
   *
   * gnome-shell draws its popup from the layout it cached, and that cache holds
   * the old ids as surely as it holds the old word. So the click lands on an id
   * that no longer exists: `Event(19, 'clicked')` against this client answers
   * "error occurred in Event" and the window does not move. That is the whole of
   * the bug that has been chased through three designs -- not a stale word, a
   * dead click. Open the tray, click, nothing; open it again and it works,
   * because by then the shell has re-read the layout.
   *
   * Both of Electron's other openings are shut. `menuItem.label` and
   * `menuItem.visible` are plain JS properties: measured against Electron 40,
   * assigning to either sends no signal, changes no layout and moves no
   * revision. A property update -- `ItemsPropertiesUpdated`, which the shell
   * applies to an open popup, and which is how Telegram keeps its own wording
   * right -- cannot be sent from here at all. Telegram is Qt, owns its dbusmenu,
   * keeps its ids for the life of the process and rewrites the label when the
   * shell asks with `AboutToShow`. Reaching that from here means writing the
   * StatusNotifierItem and its menu by hand over DBus, the way the GTK client
   * did, rather than using Electron's Tray.
   *
   * So: never rebuilt, therefore never renumbered, therefore the first click
   * always works. The word says both things it does, and which one happens is
   * decided from where the window last reported itself -- see act(). Left click
   * on the icon asks the app instead, where a host delivers one at all; GNOME's
   * opens the menu instead.
   */
  renderMenu() {
    if (!this.tray) return;

    this.tray.setContextMenu(Menu.buildFromTemplate([
      {
        /* Telegram's words for the half that needed better ones: the window is
           not being closed, it is going where this icon is. */
        label: 'Open / Minimize to Tray',
        click: () => this.act(),
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => this.handlers.onSettings && this.handlers.onSettings(),
      },
      {
        /* A window of their own, which is what the item says. The theme used to
           be the item under this one -- three radio buttons that are already in
           the settings window, and the owner had them taken back out: a menu
           earns its length, and this is not the only way to that switch. */
        label: 'Fonts…',
        click: () => this.handlers.onFonts && this.handlers.onFonts(),
      },
      { type: 'separator' },
      {
        /* Whatever the last check found is written in as the menu is built.
           This tray cannot change one label without building the whole menu
           again -- see renderMenu -- so the wording lands on the next build
           rather than the moment an answer arrives. The item in tray-sni.js,
           which is the one nearly everybody gets, updates in place. */
        label: this.aboutLabel(),
        click: () => this.handlers.onAbout && this.handlers.onAbout(),
      },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Ctrl+Q', click: () => this.handlers.onQuit && this.handlers.onQuit() },
    ]));
  }

  /* The About item, which names a release when the daily check has found one --
     the menu's only announcement, and the way into the window that can do
     something about it. */
  aboutLabel() {
    const found = this.handlers.getUpdate && this.handlers.getUpdate();
    return found && found.newer ? `About WhatsApp — ${found.latest} is out` : 'About WhatsApp';
  }

  /* The icon and its tooltip, which are not the menu -- and are kept apart from
     it because a message arriving would otherwise throw the whole menu away and
     build another, for a change that never touched a single item of it. */
  renderIcon() {
    if (!this.tray) return;
    this.tray.setToolTip(this.unread ? `${this.title} — unread messages` : this.title);
    this.tray.setImage(this.unread ? this.icons.attention : this.icons.normal);
  }

  /* Whichever half of the word applies. Read from what the window last said
     rather than asked now, because the menu that was clicked has had the
     keyboard for as long as it was open. */
  act() {
    const handlers = this.handlers;
    if (this.inFront && handlers.onHide) handlers.onHide();
    else if (!this.inFront && handlers.onShow) handlers.onShow();
    else if (handlers.onToggle) handlers.onToggle();
  }

  /* The Electron tray's word never moves, for the reason written over
     renderMenu, so this only remembers, and nothing is redrawn. */
  setInFront(inFront) { this.inFront = inFront; }

  /* Marked, never counted: WhatsApp's own title counts unread CHATS, not
     messages, so a number drawn from it would be wrong for exactly the case a
     number is wanted. The state is kept whether or not there is an icon to draw
     it on yet, because a host arriving later renders from it. */
  setAttention(unread) {
    if (unread === this.unread) return;
    this.unread = unread;
    this.renderIcon();
  }

  destroy() {
    if (this.stopWaiting) this.stopWaiting();
    if (!this.tray) return;
    try {
      this.tray.destroy();
    } catch (err) {
      // Tray instance might already be destroyed
    }
    this.tray = null;
  }
}

module.exports = { ElectronTray };
