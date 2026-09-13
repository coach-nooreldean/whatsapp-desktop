/*
 * The tray icon, spoken rather than borrowed.
 *
 * Implements StatusNotifierItem and com.canonical.dbusmenu over src/dbus.js.
 *
 * Modularized into:
 *   - src/tray/sni-constants.js: D-Bus interface XMLs, path constants, and item IDs
 *   - src/tray/pixmap.js: NativeImage to network byte order ARGB32 pixmap conversion
 *   - src/tray/menu-layout.js: DBusMenu layout trees, property schemas, and formatting
 *   - src/tray/watcher.js: Host availability detection via gdbus monitor
 *   - src/tray/electron.js: Fallback Electron Tray wrapper
 */
'use strict';

const { nativeImage } = require('electron');
const { Bus } = require('./dbus');
const debug = require('./debug.js');

const {
  WATCHER,
  WATCHER_PATH,
  ITEM_PATH,
  MENU_PATH,
  SNI_IFACE,
  MENU_IFACE,
  PROPS_IFACE,
  INTROSPECT_IFACE,
  ID,
  ITEM_XML,
  MENU_XML,
} = require('./tray/sni-constants.js');

const { pixmap } = require('./tray/pixmap.js');
const {
  vs,
  vb,
  getItemProperties,
  getMenuLayout,
  getMenuProperties,
} = require('./tray/menu-layout.js');

class SniTray {
  constructor({
    normal,
    attention,
    onToggle,
    onShow,
    onHide,
    onQuit,
    onSettings,
    onFonts,
    getInFront,
    onAbout,
    getUpdate,
    title = 'WhatsApp',
    appId = 'whatsapp-desktop',
  }) {
    this.icons = {
      normal: nativeImage.createFromPath(normal),
      attention: nativeImage.createFromPath(attention || normal),
    };
    this.pixmaps = {
      normal: pixmap(this.icons.normal),
      attention: pixmap(this.icons.attention),
    };
    this.handlers = {
      onToggle,
      onShow,
      onHide,
      onQuit,
      onSettings,
      onFonts,
      onAbout,
      getUpdate,
    };
    this.title = title;
    this.appId = appId;
    this.unread = false;
    this.inFront = null;
    this.inFrontNow = getInFront || null;
    this.menuOpen = false;
    this.revision = 1;

    this.bus = null;
    this.busName = null;
    this.registered = false;
    this.dead = false;
  }

  start(cb) {
    Bus.connect((err, bus) => {
      if (err) { cb(err); return; }
      if (this.dead) { bus.close(); return; }
      this.bus = bus;

      this.busName = `org.kde.StatusNotifierItem-${process.pid}-1`;
      bus.requestName(this.busName, nameErr => {
        if (nameErr) { cb(nameErr); return; }
        this.exportItem();
        this.exportMenu();
        this.watchForHost();
        cb(null);
      });
    });
  }

  itemProperties() {
    const marks = this.unread;
    return [
      ['Category', vs('ApplicationStatus')],
      ['Id', vs(this.appId)],
      ['Title', vs(this.title)],
      ['Status', vs(marks ? 'NeedsAttention' : 'Active')],
      ['WindowId', ['u', 0]],
      ['IconName', vs('')],
      ['IconPixmap', ['a(iiay)', marks ? this.pixmaps.attention : this.pixmaps.normal]],
      ['OverlayIconName', vs('')],
      ['OverlayIconPixmap', ['a(iiay)', []]],
      ['AttentionIconName', vs('')],
      ['AttentionIconPixmap', ['a(iiay)', this.pixmaps.attention]],
      ['AttentionMovieName', vs('')],
      ['ToolTip', ['(sa(iiay)ss)', ['', [], marks ? `${this.title} — unread messages` : this.title, '']]],
      ['ItemIsMenu', vb(false)],
      ['Menu', ['o', MENU_PATH]],
    ];
  }

  exportItem() {
    const properties = () => this.itemProperties();

    this.bus.export(ITEM_PATH, {
      [SNI_IFACE]: {
        Activate: (args, reply) => { this.refreshToggle(); this.toggle(); reply(); },
        SecondaryActivate: (args, reply) => { this.refreshToggle(); this.toggle(); reply(); },
        Scroll: (args, reply) => reply(),
        ContextMenu: (args, reply) => reply(),
      },
      [PROPS_IFACE]: {
        Get: ([, name], reply, fail) => {
          const found = properties().find(p => p[0] === name);
          if (!found) { fail('org.freedesktop.DBus.Error.InvalidArgs', `no property ${name}`); return; }
          reply('v', [found[1]]);
        },
        GetAll: (args, reply) => reply('a{sv}', [properties()]),
        Set: (args, reply) => reply(),
      },
      [INTROSPECT_IFACE]: {
        Introspect: (args, reply) => reply('s', [ITEM_XML]),
      },
    });
  }

  toggleLabel() {
    return this.inFront ? 'Minimize to Tray' : 'Open WhatsApp';
  }

  aboutLabel() {
    const found = this.handlers.getUpdate && this.handlers.getUpdate();
    return found && found.newer ? `About WhatsApp — ${found.latest} is out` : 'About WhatsApp';
  }

  itemProps(id, wanted) {
    return getItemProperties(this, id, wanted);
  }

  layout(id, depth, wanted) {
    return getMenuLayout(this, id, depth, wanted);
  }

  exportMenu() {
    this.bus.export(MENU_PATH, {
      [MENU_IFACE]: {
        GetLayout: ([parent, depth, wanted], reply) => {
          debug.trace('menu: GetLayout(%s, %s), label "%s"', parent, depth, this.toggleLabel());
          reply('u(ia{sv}av)', [this.revision, this.layout(parent, depth, wanted)]);
        },

        GetGroupProperties: ([ids, wanted], reply) => {
          const all = Object.values(ID);
          const asked = ids && ids.length ? ids : all;
          reply('a(ia{sv})', [asked.map(id => [id, this.itemProps(id, wanted)])]);
        },

        GetProperty: ([id, name], reply, fail) => {
          const found = this.itemProps(id, [name])[0];
          if (!found) { fail('org.freedesktop.DBus.Error.InvalidArgs', `no property ${name}`); return; }
          reply('v', [found[1]]);
        },

        AboutToShow: ([id], reply) => {
          const changed = this.refreshToggle();
          debug.trace('menu: AboutToShow(%s) -> %s, label "%s"', id, changed, this.toggleLabel());
          reply('b', [changed || id === ID.ROOT]);
        },

        AboutToShowGroup: ([ids], reply) => {
          this.refreshToggle();
          debug.trace('menu: AboutToShowGroup(%s), label "%s"', JSON.stringify(ids), this.toggleLabel());
          reply('aiai', [[], ids || []]);
        },

        Event: ([id, event], reply) => {
          debug.trace('menu: Event(%s, %s)', id, event);
          this.handle(id, event);
          reply();
        },

        EventGroup: ([events], reply) => {
          for (const [id, event] of events || []) this.handle(id, event);
          reply('ai', [[]]);
        },
      },

      [PROPS_IFACE]: {
        Get: ([, name], reply, fail) => {
          const props = this.menuProperties();
          const found = props.find(p => p[0] === name);
          if (!found) { fail('org.freedesktop.DBus.Error.InvalidArgs', `no property ${name}`); return; }
          reply('v', [found[1]]);
        },
        GetAll: (args, reply) => reply('a{sv}', [this.menuProperties()]),
        Set: (args, reply) => reply(),
      },

      [INTROSPECT_IFACE]: {
        Introspect: (args, reply) => reply('s', [MENU_XML]),
      },
    });
  }

  menuProperties() {
    return getMenuProperties();
  }

  handle(id, event) {
    if (event === 'opened') { this.menuOpen = true; return; }
    if (event === 'closed') { this.menuOpen = false; this.refreshToggle(); return; }
    if (event !== 'clicked') return;
    this.menuOpen = false;
    this.activate(id);
  }

  activate(id) {
    const h = this.handlers;
    if (id === ID.TOGGLE) this.toggle();
    else if (id === ID.SETTINGS) h.onSettings && h.onSettings();
    else if (id === ID.FONTS) h.onFonts && h.onFonts();
    else if (id === ID.QUIT) h.onQuit && h.onQuit();
    else if (id === ID.ABOUT) h.onAbout && h.onAbout();
  }

  toggle() {
    const h = this.handlers;
    if (this.inFront && h.onHide) h.onHide();
    else if (!this.inFront && h.onShow) h.onShow();
    else if (h.onToggle) h.onToggle();
  }

  refreshToggle() {
    const wanted = this.inFrontNow ? this.inFrontNow() : this.inFront;
    if (wanted === this.inFront) return false;
    this.inFront = wanted;
    this.pushProperties([ID.TOGGLE]);
    return true;
  }

  pushProperties(ids) {
    if (!this.bus || !this.registered) return;
    const updated = ids.map(id => [id, this.itemProps(id, [])]);
    this.bus.signal({
      path: MENU_PATH, interface: MENU_IFACE, member: 'ItemsPropertiesUpdated',
      signature: 'a(ia{sv})a(ias)', body: [updated, []],
    });
  }

  setInFront(inFront) {
    if (this.menuOpen) return;
    if (inFront === this.inFront) return;
    this.inFront = inFront;
    this.pushProperties([ID.TOGGLE]);
  }

  setAttention(unread) {
    if (unread === this.unread) return;
    this.unread = unread;
    if (!this.bus || !this.registered) return;
    for (const member of ['NewIcon', 'NewAttentionIcon', 'NewStatus']) {
      this.bus.signal({
        path: ITEM_PATH, interface: SNI_IFACE, member,
        signature: member === 'NewStatus' ? 's' : undefined,
        body: member === 'NewStatus' ? [unread ? 'NeedsAttention' : 'Active'] : [],
      });
    }
    this.bus.signal({ path: ITEM_PATH, interface: SNI_IFACE, member: 'NewToolTip' });
  }

  watchForHost() {
    this.bus.addMatch(
      `type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',` +
      `member='NameOwnerChanged',arg0='${WATCHER}'`);

    this.bus.onSignal(msg => {
      if (msg.member !== 'NameOwnerChanged') return;
      const [name, , owner] = msg.body || [];
      if (name === WATCHER && owner) this.register();
    });

    this.bus.call({
      destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus', member: 'NameHasOwner',
      signature: 's', body: [WATCHER],
    }, (err, body) => {
      if (!err && body && body[0]) this.register();
      else console.log('tray: no status icon host yet; the icon appears when one arrives');
    });
  }

  register() {
    if (this.dead || !this.bus) return;
    this.bus.call({
      destination: WATCHER, path: WATCHER_PATH,
      interface: WATCHER, member: 'RegisterStatusNotifierItem',
      signature: 's', body: [this.busName],
    }, err => {
      if (err) { console.log(`tray: the host refused this icon (${err.message})`); return; }
      this.registered = true;
      console.log('tray: registered with a status icon host');
    });
  }

  destroy() {
    this.dead = true;
    if (this.bus) { this.bus.close(); this.bus = null; }
  }
}

module.exports = { SniTray, ID };
