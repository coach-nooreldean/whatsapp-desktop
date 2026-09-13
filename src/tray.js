/*
 * The tray icon coordinator for WhatsApp Desktop.
 *
 * Decomposed into:
 *   - src/tray/watcher.js: StatusNotifierWatcher DBus detection
 *   - src/tray/electron.js: Electron Tray fallback implementation
 *   - src/tray-sni.js: DBus StatusNotifierItem native implementation
 */
'use strict';

const { SniTray, ID } = require('./tray-sni.js');
const { ElectronTray } = require('./tray/electron.js');

/*
 * Which of the two to use, decided at runtime rather than in the build.
 *
 * The one in electron.js is Electron's and is honest about what it cannot do. The one in
 * tray-sni.js speaks StatusNotifierItem itself, keeps its ids, and can therefore
 * let the item say where the window is. That is the whole reason it was written
 * -- but it needs a session bus, and a machine without one still has to get a
 * tray icon rather than an error. So it is tried, and if the bus is not there or
 * will not have us, Electron's takes over.
 *
 * Everything before the answer arrives is remembered and replayed into whichever
 * one wins, because the window is up and reporting itself long before a bus
 * handshake comes back.
 */
class TrayIcon {
  constructor(options) {
    this.impl = null;
    this.queued = { unread: false, inFront: null };

    const sni = new SniTray(options);
    sni.start(err => {
      if (err) {
        console.log(`tray: this desktop would not be spoken to directly (${err.message}); using Electron's tray`);
        this.adopt(new ElectronTray(options));
        return;
      }
      console.log('tray: one item, and its wording follows the window');
      this.adopt(sni);
    });
  }

  adopt(impl) {
    this.impl = impl;
    impl.setAttention(this.queued.unread);
    if (this.queued.inFront !== null) impl.setInFront(this.queued.inFront);
  }

  setInFront(inFront) {
    this.queued.inFront = inFront;
    if (this.impl) this.impl.setInFront(inFront);
  }

  setAttention(unread) {
    this.queued.unread = unread;
    if (this.impl) this.impl.setAttention(unread);
  }

  /*
   * A check came back, and one item's wording follows it.
   *
   * The only thing out here that redraws an item, and it redraws exactly one.
   * The item in tray-sni.js is updated in place, which is what that file exists
   * to make possible; Electron's tray could only be told by building the whole
   * menu again, and a rebuild renumbers every id -- the dead-click bug written
   * up over renderMenu. A word that waits for the next build is a far smaller
   * thing than a Quit that does nothing, so on that path this deliberately does
   * not redraw.
   */
  refreshUpdate() {
    if (this.impl && this.impl.pushProperties) this.impl.pushProperties([ID.ABOUT]);
  }

  destroy() {
    if (this.impl) this.impl.destroy();
    this.impl = null;
  }
}

module.exports = { TrayIcon };
