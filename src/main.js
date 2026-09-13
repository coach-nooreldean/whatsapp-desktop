/*
 * whatsapp-desktop -- WhatsApp Web in a window of its own.
 *
 * It loads web.whatsapp.com, so it is the same client WhatsApp serves to a
 * browser: no reverse-engineered protocol and nothing that puts an account at
 * risk. What the browser will not do is live in the tray, keep the desktop's
 * font, and raise a banner per message that GNOME cannot swallow -- and that is
 * the whole of what this adds.
 */
'use strict';

const { app, BrowserWindow, WebContentsView, Menu, MenuItem, dialog, clipboard, session, shell, nativeTheme, ipcMain, screen: electronScreen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { Config } = require('./config.js');
const { AccountsManager, DEFAULT_PALETTE } = require('./accounts.js');
const desktop = require('./desktop.js');
const style = require('./style.js');
const { TrayIcon } = require('./tray.js');
const { Banners, sweepAvatars } = require('./notify.js');
const bidi = require('./bidi.js');
const { kindOf, pushName, readBody, mediaFromWords } = require('./wording.js');
const { SEP } = require('./page/inject.js');
const debug = require('./debug.js');
const sound = require('./sound.js');
const fonts = require('./fonts.js');
const autostart = require('./autostart.js');
const links = require('./links.js');
const updates = require('./update.js');
/* Version, licence and author, read from the one file that already says them. */
const manifest = require('../package.json');

const APP_ID = 'io.github.shehawey.whatsapp-desktop';
const WHATSAPP_URL = 'https://web.whatsapp.com/';
const TITLE = 'WhatsApp';

/* The backlog that syncs in over the first half-minute of a launch rewrites the
   whole chat list, and every row it touches has the shape of an arrival. The
   page-side freshness test catches most of it; this catches the rest. */
const STARTUP_GRACE_MS = 30000;
/* How long after the watcher has spoken the document title stays quiet. The
   title counts unread CHATS and fires on its own clock, so without this the two
   paths announce one message twice. */
const TITLE_FALLBACK_MS = 2000;

/* When the client first asks whether it is out of date, and how often after
   that. A day is more than often enough for something that only ever changes a
   word in a menu, and the first one waits for the client to have finished
   starting. */
const UPDATE_FIRST_MS = 45 * 1000;
const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;
/* How long an answer stands before the About window asks again. Long enough
   that opening the window twice does not spend two requests, short enough that
   what it shows was true this session. */
const UPDATE_FRESH_MS = 10 * 60 * 1000;
/* How long a notification is safe from being withdrawn as "already read". The
   unread pill is drawn a beat after the row moves, so a banner raised in that
   gap would otherwise be taken down by the very next report. */
const ARRIVAL_SETTLE_MS = 4000;

const hidden = process.argv.includes('--hidden');
const config = new Config();
const accountsMgr = new AccountsManager();
const accountViews = new Map(); // id -> { view, account, cssKeys, loadedAt }
let sidebarView = null;
let activeAccountId = accountsMgr.getActiveId();
let sidebarCollapsed = config.get('view.sidebar-collapsed') === true;

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const pkg = require('../package.json');
  console.log(`whatsapp-desktop ${pkg.version}`);
  app.exit(0);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: whatsapp-desktop [options]

Options:
  --hidden        Start minimized to the system tray
  -v, --version   Show version number
  -h, --help      Show this help message
`);
  app.exit(0);
}

/* ------------------------------------------------------------------ paths */

/* The state directory keeps the project's own name rather than the product's.
   ~/.local/share/whatsapp belongs to the GTK client this one replaces, and a
   signed-in WebKit session and a signed-in Chromium session have no business
   sharing a directory -- least of all one the user might reinstall the other
   client into. */
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
app.setPath('userData', path.join(dataHome, 'whatsapp-desktop'));
app.setName('WhatsApp');
process.title = 'WhatsApp';

/* Notifications carry the application's desktop file: without it GNOME files
   every banner under "Electron" and draws Electron's icon on it. */
if (process.platform === 'linux') app.setDesktopName(APP_ID + '.desktop');

const iconFile = (size, name) =>
  path.join(__dirname, '..', 'data', 'icons', String(size), name);
const appIcon = iconFile(256, `apps/${APP_ID}.png`);

/* ----------------------------------------------------------------- fonts */

/* The desktop's font is imposed through fontconfig rather than through a user
   stylesheet, because a stylesheet that matches every element is paid for on
   every scroll -- measured at 212ms of blocked main thread against 82ms for the
   same scroll without it.
 *
 * The catch is when. FONTCONFIG_FILE has to be in the environment the process
 * was executed with: fontconfig is read once, early, and setting the variable
 * from here reaches children but not this process -- measured, the running
 * client had no FONTCONFIG_FILE in /proc/self/environ at all and drew the page
 * in Roboto while `fc-match` against the very same config answered PoetsenOne.
 *
 * So the launcher exports it, and this is the belt to that pair of braces: when
 * the variable did not arrive, the config is written and the client restarts
 * itself once into an environment that has it. Guarded by an argument, because
 * a relaunch loop is a worse bug than the wrong font. */
const INHERITED_FONTCONFIG = process.env.FONTCONFIG_FILE;

/*
 * What the owner asked for, per script, straight out of the config.
 *
 * `fonts.<script>-inherit` is the switch at the head of each of the two groups
 * in Settings, and while one is on this answers for that script what the client
 * has always answered: the desktop's own family, at its own size, in its own
 * weight. The keys under it are read only once it has been turned off -- so a
 * config with a family in it and the switch still on draws in the desktop font,
 * and turning that switch off again brings the choice back without anything
 * having to be picked a second time.
 *
 * They are two switches rather than one because they are two questions. An
 * Arabic face of one's own is the common want here, and it has no business
 * dragging a Latin choice along with it.
 */
const fontPrefs = () => {
  const desktopFamily = config.get('view.font') || desktop.interfaceFont();
  const script = name => (config.get(`fonts.${name}-inherit`) ? null : {
    family: config.get(`fonts.${name}-family`) || '',
    size: Number(config.get(`fonts.${name}-size`)) || 100,
    bold: !!config.get(`fonts.${name}-bold`),
    italic: !!config.get(`fonts.${name}-italic`),
  });
  const latin = script('latin');
  const arabic = script('arabic');
  return {
    /* Both of them left alone, which is the state a client ships in and the
       one the stylesheet has to come out of unchanged. */
    inherit: !latin && !arabic,
    latin: latin ? { ...latin, family: latin.family || desktopFamily } : { family: desktopFamily },
    arabic,
  };
};

/* The same thing with the faces resolved -- which family, and which FILE of it,
   for upright text and for italic. See src/fonts.js: "bold Arabic" is a
   different file, not a declaration. */
const chosenFonts = () => fonts.resolve(fontPrefs());

/* The one family for the client's own windows, which are English and have no
   second script to think about. */
const uiFont = () => fontPrefs().latin.family;

/* Off only when the desktop font is being inherited AND the page is not being
   forced into it: a font chosen by hand is a font that was asked for, and it
   would be an odd switch that then declined to apply it. */
const forcingFont = () => !!config.get('view.force-font') ||
  !config.get('fonts.latin-inherit') || !config.get('fonts.arabic-inherit');

const configureFonts = () => {
  if (!forcingFont()) return { file: null, changed: false };
  return fonts.configure(chosenFonts(), app.getPath('userData'));
};

const fontConfigFile = configureFonts().file;
if (fontConfigFile) {
  process.env.FONTCONFIG_FILE = fontConfigFile;
  if (INHERITED_FONTCONFIG !== fontConfigFile && !process.argv.includes('--font-retry')) {
    console.log('restarting once so Chromium reads %s', fontConfigFile);
    app.relaunch({ args: process.argv.slice(1).concat('--font-retry') });
    app.exit(0);
  }
}

/* -------------------------------------------------------------- switches */

/* Wayland natively rather than through XWayland: it is the difference between
   crisp text on a fractional scale and a blurry upscale, and between smooth
   trackpad scrolling and stepped wheel events.
 *
 * Asked of the socket as well as of the session type, and this matters on
 * somebody else's machine rather than on the one it was written on.
 * XDG_SESSION_TYPE is set by the login session and inherited; a client started
 * from anything that does not pass the whole environment on -- a launcher, a
 * systemd unit, a terminal opened inside something else -- sees it missing,
 * falls through to X11, and lands on XWayland. Nothing announces that: the
 * client simply looks softer and scrolls in steps, which is exactly the report
 * this switch exists to prevent. WAYLAND_DISPLAY is set by the compositor
 * itself, so between the two the answer survives the trip. */
const chromiumFeatures = ['MemoryPurgeOnFreezeLimit', 'WebRTCPipeWireCapturer'];
const onWayland = process.env.XDG_SESSION_TYPE === 'wayland' ||
                  !!process.env.WAYLAND_DISPLAY;
if (onWayland) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  chromiumFeatures.push('WaylandWindowDecorations');
}
/* Said out loud, because the difference is one a user reports as "it looks
   blurry" or "it scrolls in steps" and never as "it is on XWayland". */
console.log('display server: %s', onWayland ? 'wayland, natively' : 'x11');
/* WhatsApp Web is one page that stays open for days. Letting Chromium hand
   memory back when it is not being looked at is worth more here than the
   milliseconds it costs to fault it in again. Electron accepts one
   `enable-features` switch, so keep all requested features in one value instead
   of allowing a later append to replace an earlier one. */
app.commandLine.appendSwitch('enable-features', chromiumFeatures.join(','));

/* Scrolling.
 *
 * A browser scrolls a long chat smoothly because its compositor does the work
 * on the GPU. Chromium decides that per driver, from a blocklist that is years
 * out of date on Linux, and when it decides against it every scroll is a
 * software raster of the whole viewport -- which is exactly the "it lags, the
 * browser does not" report. The blocklist is overridden and rasterisation is
 * asked for explicitly.
 *
 * Smooth scrolling itself is a separate thing: it is what turns a wheel notch
 * into an animation instead of a jump, and Chrome ships it on by default while
 * a bare Electron does not. */
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-smooth-scrolling');
/* WebGPU on Linux/Wayland has a broken CreateExternalTexture pipeline for video
   streams, which causes WhatsApp call cameras to render black 1280x720 frames.
   Disabling WebGPU forces WhatsApp to use its reliable WebGL/direct pipeline. */
app.commandLine.appendSwitch('disable-features', 'WebGPU');
app.commandLine.appendSwitch('disable-webgpu');

/* ------------------------------------------------------------ single copy */

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

/* ----------------------------------------------------------------- state */

let win = null;
let settingsWin = null;
/* The fonts have a window of their own -- see openFonts. */
let fontsWin = null;
let aboutWin = null;
let tray = null;
let banners = null;
let quitting = false;
/* Every user stylesheet this process has put into the page, newest last. One
   key was not enough: two overlapping applyStyle calls both read it, both
   removed the same sheet, and both inserted -- so the older one stayed in the
   page for ever, and being older it still beat the new one at equal
   specificity. That is what a settings stepper pressed twice quickly does, and
   the symptom was a text size that would go up and never come back down. */
let cssKeys = [];
/* The options the sheet in the page was built from, or null before there is one. */
let drawnWith = null;
let loadedAt = 0;
let unreadChats = 0;
/* How many messages are waiting, as the page counted them off the unread pills.
   null until it has, which is what makes the document title's chat count a
   stand-in rather than a permanent answer. */
let unreadMessages = null;
let badgeShown = -1;
let lastArrivalAt = 0;
/* The font stack the page says it wants, which is what gets aliased to the
   desktop font. Empty until the page reports it, a moment after each load. */
let pageFontStack = '';
const pageBanners = new Map();          // page notification id -> the banner raised for it
/* The conversation on screen and the chats that still have something waiting,
   both as the page last reported them, plus the withdrawals that are waiting out
   ARRIVAL_SETTLE_MS before they can be carried out. */
let openChat = '';
let unreadChatNames = new Set();
const withdrawing = new Map();          // chat -> the timer that will try again

/* And the same three questions again, answered by WhatsApp's own store instead
   of by a reading of its chat list. While `storeLive` is true this is the ONLY
   notification path -- the watcher's nudge and the shim over WhatsApp's own
   notifications are both refused below -- because the two of them disagreed
   about what a chat is called, what a mention is and when a message was read,
   and every one of those disagreements was a bug somebody had to report.

   The identities here are WhatsApp's: a chat id rather than a display name (two
   chats can share a name, and this account has three such pairs) and a message
   id rather than the text of a message. */
let storeLive = false;
let activeChatId = '';
const chatTitles = new Map();           // chat id -> what to print for it

/* --------------------------------------------------------------- window */

const clampToScreen = (width, height) => {
  const area = electronScreen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(Math.max(400, Math.round(width)), area.width),
    height: Math.min(Math.max(300, Math.round(height)), area.height),
  };
};

/* Raising a window on Wayland is done by taking it down and putting it back up
   (see showWindow), and for the frame in between the window is genuinely not on
   screen. The page must not hear about that frame. Told the client went away and
   came back, WhatsApp resumes as though it had been in the background for an age
   -- which the owner sees as the client closing and reopening itself every time
   a banner is clicked. While the trick is in progress the honest answer is the
   one it is on its way to: on screen. */
let remapping = false;

const getActiveAccountView = () => {
  const item = accountViews.get(activeAccountId);
  return item ? item.view : null;
};

const getActiveWebContents = () => {
  const view = getActiveAccountView();
  return view && !view.webContents.isDestroyed() ? view.webContents : null;
};

const getAccountIdByWebContents = wc => {
  if (!wc) return 'default';
  for (const [id, item] of accountViews) {
    if (item.view && !item.view.webContents.isDestroyed() && item.view.webContents.id === wc.id) {
      return id;
    }
  }
  return 'default';
};

const notifySidebarState = () => {
  if (sidebarView && !sidebarView.webContents.isDestroyed()) {
    sidebarView.webContents.send('sidebar:state-changed', {
      accounts: accountsMgr.getAccounts(),
      activeId: activeAccountId,
      theme: config.get('view.theme') || 'system',
      collapsed: sidebarCollapsed,
    });
    sidebarView.webContents.send('sidebar:collapsed-changed', sidebarCollapsed);
  }
};

const updateLayout = () => {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getContentBounds();

  const sidebarWidth = sidebarCollapsed ? 14 : 56;

  if (sidebarView && !sidebarView.webContents.isDestroyed()) {
    sidebarView.setBounds({ x: 0, y: 0, width: sidebarWidth, height: bounds.height });
    sidebarView.setVisible(true);
  }

  for (const [id, item] of accountViews) {
    if (item.view && !item.view.webContents.isDestroyed()) {
      if (id === activeAccountId) {
        item.view.setBounds({
          x: sidebarWidth,
          y: 0,
          width: Math.max(0, bounds.width - sidebarWidth),
          height: bounds.height,
        });
        item.view.setVisible(true);
      } else {
        item.view.setVisible(false);
      }
    }
  }
};

const toggleSidebar = () => {
  sidebarCollapsed = !sidebarCollapsed;
  config.set('view.sidebar-collapsed', sidebarCollapsed);
  config.save();
  updateLayout();
  if (sidebarView && !sidebarView.webContents.isDestroyed()) {
    sidebarView.webContents.send('sidebar:collapsed-changed', sidebarCollapsed);
  }
};

const switchToAccount = id => {
  if (!accountsMgr.getAccount(id)) return;
  activeAccountId = id;
  accountsMgr.setActiveId(id);
  updateLayout();
  pushFocus();
  notifySidebarState();
  const item = accountViews.get(id);
  if (item && !item.view.webContents.isDestroyed()) {
    item.view.webContents.focus();
    const title = item.view.webContents.getTitle();
    if (win && !win.isDestroyed()) win.setTitle(title && title.trim() ? title : TITLE);
  }
};

const pushFocus = () => {
  if (!win || win.isDestroyed()) return;
  const onScreen = remapping || (win.isVisible() && !win.isMinimized());
  const active = onScreen && win.isFocused();
  for (const [id, item] of accountViews) {
    if (item.view && !item.view.webContents.isDestroyed()) {
      const isThisActive = active && (id === activeAccountId);
      item.view.webContents.send('wa:focus', isThisActive);
      item.view.webContents.send('wa:on-screen', onScreen);
    }
  }
  /* The tray is deliberately not told anything here. What it needs is tracked
     from the window's own events instead -- see traceWindowState -- because
     asking the window is what got this wrong. */
  /* A window coming back is the user arriving at whatever chat is on screen --
     and at any call the telephone is ringing for. */
  if (active) { withdrawOpen(); withdrawRinging(); }
};

/*
 * Where the window is, and whether the owner is looking at it -- the whole of
 * what the tray's one item needs, both for the word it wears and for what its
 * click does.
 *
 * Three rounds of work went into computing this honestly and each of them was
 * needed: isMinimized() answers false for a window sitting in the dock under
 * GNOME; the focus cannot simply be read, because opening the tray menu is
 * itself what takes the focus off the window; and the focus cannot be left out
 * either, because a window standing behind the editor is one the owner is
 * reaching for. The first is why this is tracked from events at all, the second
 * is what FOCUS_GRACE_MS below is for, and the third is the report this last
 * round answers.
 *
 * The state is worth keeping for the reason it was built: it is the one account
 * of the window that comes from events rather than from queries -- an event is a
 * fact where a query is an opinion. `minimize` fires when the window goes to the
 * dock whatever isMinimized() says a moment later, and `show` and `hide` are the
 * same. Asking isVisible() instead, which is the obvious thing to write, answers
 * true for a window sitting in the dock: the click asking for that window back
 * would take it away instead.
 *
 * The minimised flag under Wayland does not stay true on its own. xdg-shell has
 * no minimised state for a compositor to report back -- a client asks to be
 * minimised and that is the end of the conversation -- so the next configure
 * puts the window back to normal and `restore` arrives seconds after a minimise
 * nobody undid. Measured, in that order, from one click. So a restore is
 * believed only when the window has the focus with it: a window the owner really
 * did fetch out of the dock is a window the compositor activated, and one still
 * sitting in the dock is not.
 */
const windowState = { visible: false, minimized: false, focused: false };

/* Raising the window takes it down for a frame and puts it back up (see
   showWindow), so a window mid-remap is reported as where it is heading -- the
   same reasoning as `remapping` in pushFocus. */
const windowOnScreen = () => remapping || (windowState.visible && !windowState.minimized);

/*
 * When the focus last left the window. Kept because the tray has to tell two
 * blurs apart, and only the clock can.
 *
 * A window that is up but behind something is not a window the owner is looking
 * at, and the tray's item should offer to fetch it rather than to put it away --
 * which is the whole of the report this answers. Whether the owner is looking at
 * it is the focus, and the focus is exactly what asking about the tray destroys:
 * opening a status icon menu on GNOME takes a modal grab, the window loses the
 * keyboard, and the question "is this window in front?" is then asked of a
 * window that looks unfocused because it is being asked about.
 *
 * So a blur that has only just happened is not believed. Nothing a person can do
 * takes the focus off this window and opens the tray inside this many
 * milliseconds; the grab does it in single figures. And a blur that arrives
 * after the menu has asked cannot mislead it either, because the answer is
 * frozen when the menu opens -- see AboutToShow in tray-sni.js.
 */
const FOCUS_GRACE_MS = 400;
let blurredAt = 0;
let graceTimer = null;

/* On the screen and the owner's -- what the tray's one item reads and what its
   click does. */
const windowInFront = () => remapping || (windowOnScreen() &&
  (windowState.focused || Date.now() - blurredAt < FOCUS_GRACE_MS));

/*
 * A raise, and whether it took.
 *
 * There is more than one compositor and they do not agree about what brings a
 * window to the user -- see showWindow below, where both answers live. So this
 * client stops assuming there is only one: it raises the window the way that
 * works here, watches whether the window actually arrived, and swaps to the
 * other way for the rest of the session when it did not.
 *
 * Whether it arrived is answered by the focus event rather than by asking the
 * window, for the reason the whole of windowState is: an event is a fact where
 * a query is an opinion. `gen` is which raise is being watched, so a later
 * raise -- or a hide the owner asked for in between -- retires the check the
 * earlier one left behind.
 */
const RAISE_VERIFY_MS = 250;
/* One click's worth of asking is one raise. WhatsApp's own window.focus() comes
   back to this process as a focus-request (see src/preload.js), so a single
   banner click can ask twice -- and the second ask landing mid-remap is a hide
   arriving after the show, which is the window taken back down. */
const RAISE_COALESCE_MS = 600;
const raising = { gen: 0, at: 0, took: false };
/* Which way up works here: seeded on the first raise, and corrected by
   measurement when the seed turns out to be wrong -- unless the config named
   one, which is taken at its word. A desktop where the measurement itself is
   wrong is the only reason to name one, so measuring it again would be
   answering the same question with the same wrong answer. */
let raiseStrategy = '';
let raiseMeasured = true;

const traceWindowState = () => {
  /* The raw stream, before anything is made of it: which events the compositor
     actually sends and in what order is the whole question about this window,
     and it is asked again every time the tray reads wrong. */
  for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore']) {
    win.on(event, () => debug.trace('window event: %s %s', event, JSON.stringify({
      visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused() })));
  }

  const set = change => {
    Object.assign(windowState, change);
    const onScreen = windowOnScreen();
    debug.trace('window: %s -> %s', JSON.stringify(windowState),
      onScreen ? 'on the screen' : 'away');
    /* The word on the tray's one item, and what its click will do. Only a
       change reaches the desktop. */
    if (tray) tray.setInFront(windowInFront());
  };

  /* Only this program hides and shows this window, and both events arrive when
     it does -- so these two own `visible` outright and nothing else writes it.
     That is not fussiness. `focus` used to set it as well, on the reasoning that
     a window cannot be given the focus while hidden, and the compositor does not
     agree: hide the window from the tray's own menu and the focus comes back to
     it as the menu's grab is released, seconds after it left the screen. The
     tray then believed the window was up, so its item still said "Minimize to
     Tray" and its click hid an already hidden window -- which is precisely the
     "it does nothing, and the next time I open the tray the word is right"
     report. Hiding it again is what emitted the second `hide` that put the word
     right, one open too late. */
  win.on('show', () => set({ visible: true, minimized: false }));
  win.on('hide', () => set({ visible: false, focused: false }));
  win.on('minimize', () => set({ minimized: true }));
  win.on('restore', () => set(win.isFocused() ? { minimized: false } : {}));
  /* Having the focus settles the dock: a window in it does not hold the
     keyboard, whatever a `restore` that never arrived implies. */
  win.on('focus', () => {
    clearTimeout(graceTimer);
    /* The one answer a raise is waiting for. */
    raising.took = true;
    set({ minimized: false, focused: true });
  });
  win.on('blur', () => {
    blurredAt = Date.now();
    set({ focused: false });
    /* And again when the grace above runs out, because the grace is the only
       reason the tray was not told. Without this the desktop keeps "Minimize to
       Tray" in its cache until something else about the window moves, and it is
       from that cache that the menu is drawn -- before anything said here can
       reach it. The tray ignores this while its menu is open; see setInFront. */
    clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      if (tray) tray.setInFront(windowInFront());
    }, FOCUS_GRACE_MS + 50);
  });
};

/*
 * The window, brought to the user by being opened again -- which is not what
 * asking for it does on Wayland.
 *
 * Wayland has no raise. A client cannot put itself in front of anything; the
 * one way up is the xdg-activation protocol, and whether it is granted is the
 * compositor's decision. Measured on the wire, this is the request Chromium
 * sends when focus() is called on a window that is not already in front:
 *
 *   xdg_activation_v1.get_activation_token(new xdg_activation_token_v1)
 *   xdg_activation_token_v1.set_serial(36978, wl_seat)
 *   xdg_activation_token_v1.commit()
 *
 * and mutter's rule for what to do with it (meta-wayland-activation.c) is:
 *
 *   if (!token->seat)    return FALSE;
 *   if (!token->surface) return FALSE;
 *   ...
 *   token_can_activate (token) ? meta_window_activate_full (...)
 *                              : meta_window_set_demands_attention (window);
 *
 * There is no set_surface in that request, so the answer can only ever be no,
 * and "demands attention" is the notification the owner sees: "WhatsApp is
 * ready", posted instead of the window arriving. Chromium omits it on purpose
 * -- DetermineSurface() hands over a surface only for the window that already
 * holds the pointer or keyboard, which by definition is not this one. Qt sets
 * the surface unconditionally, which is why Telegram's tray raises its window
 * on the same desktop and this client's could not. gtk_shell1 would be the
 * other way through and is bound but never used: Chromium creates no
 * gtk_surface1, so there is nothing to call request_focus on.
 *
 * So the window is not raised, it is opened. Taken down and mapped again, it is
 * a new window rather than an old one asking for something, and the compositor
 * gives a new window the focus without being asked -- measured, in every state
 * the tray can find it in. This is not a trick that will age well and it should
 * be deleted the day Electron ships a Chromium that sets the surface; until
 * then it is the only thing that works, and the cost is the window's own
 * closing and opening animation, which cannot be suppressed from here.
 *
 * Asking nicely first is deliberately not tried. It was: request, wait, re-map
 * if refused. It works, and by the time the refusal can be seen the shell has
 * already posted "WhatsApp is ready", which flashes up before the window
 * arrives. There is no withdrawing somebody else's notification, so the only
 * way not to see it is not to earn it.
 *
 * Nor is the re-map one option among several. Measured on GNOME 50, against a
 * second client holding the focus -- because a window asking for the focus it
 * already has proves nothing -- focus() on its own, moveTop() and being briefly
 * always-on-top all leave the window exactly where it was, and only the re-map
 * brings it forward with the focus. Always-on-top had been written up here as
 * the other way through; it is not one any more, whatever it once did.
 *
 * The cost is paid in the dock. A client with no window up is a client that is
 * not running, so for the frame in between the icon leaves an unpinned dock and
 * the icons beside it close the gap, which reads as a flicker. Pinning the app
 * settles it: a favourite keeps its place and only the running dot blinks.
 *
 * And this is one of the two ways up, not the only one. The other is to ask and
 * be given it -- activateWindow below -- which is what X11 has always honoured,
 * and what a shell that activates a window on its application's behalf when its
 * notification is clicked makes work on Wayland as well. Which of the two a
 * machine answers to is measured rather than assumed: see showWindow.
 */
const remapWindow = () => {
  /* Down and up again in one turn of the loop, with no frame in between. The
     frame was insurance -- a compositor that sees an unmap and a map together is
     free to fold them into no change at all, and then nothing is raised -- and
     it was bought at the dock's expense: for that frame this app has no window
     up, which is what a dock reads as not running, so an unpinned icon leaves it
     and the icons beside it close over the space. Measured on mutter, three
     runs out of three from the dock and two out of two from behind another
     window, the window comes back with the focus either way. */
  remapping = true;
  win.hide();

  /* A window taken down while it was minimised keeps that state in Ozone --
     hide() unmaps it and leaves it kMinimized, measured -- and showing it in
     that state ends the process, the whole of it:
       FATAL wayland_toplevel_window.cc:806 "Should not be called with
       kMinimized state"
     so the un-minimising is done here, between the two, while nothing is up.
   *
   * Here rather than before the hide, which is where it used to be and is
   * the whole of the notification that flashed. Wayland has no unminimise:
   * Ozone spends a restore as an activation request, and a request from a
   * window the owner is not using is exactly what focus stealing prevention
   * is for -- the shell refuses it, marks the window as wanting attention
   * and posts "WhatsApp is ready", then withdraws it a frame later when the
   * re-map takes the focus honestly. Asking on behalf of a window with no
   * surface up asks the compositor for nothing, so there is nothing to
   * refuse and nothing to announce.
   *
   * isMinimized() is the right question and the only one: it reads the very
   * state Ozone refuses to be shown in, which is not the same thing as
   * whether the window is in the dock. The tracked flag deliberately is not
   * consulted -- it answers the other question, and restoring a window that
   * is merely maximised would un-maximise it. */
  if (win.isMinimized()) win.restore();

  win.show();
  win.focus();
  /* Cleared a turn later, so that the events the show and the focus raise both
     find the trick still in progress. */
  setTimeout(() => { remapping = false; }, 0);
};

/* The other way up: ask, and be given it.
 *
 * All a raise ever needed to be, and all it is on X11 -- where a client may put
 * its own window in front and Chromium sends the activation with a timestamp
 * that says so. On Wayland it is the compositor's decision (see above), and a
 * shell that hands the client an activation token when its own banner is
 * clicked decides yes: the window arrives without being taken down first, which
 * costs neither the closing animation nor the gap in the dock.
 *
 * The un-minimising comes first and the show after it, which is the opposite of
 * the order in the re-map and for the opposite reason: nothing is unmapped
 * here, so there is no kMinimized window for show() to be refused over -- and a
 * window still in the dock is one show() alone would leave there. */
const activateWindow = () => {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
};

/* One raise, and -- on the first try, never on the correction -- whether it
   took. A window that never took the focus is a window that never arrived,
   whatever was asked for on its behalf; the other way is tried at once for the
   click still waiting on it, and kept for the rest of the session. */
const raiseWindow = (strategy, why, verify) => {
  const gen = ++raising.gen;
  raising.at = Date.now();
  raising.took = false;
  debug.trace('raise: %s (%s)', strategy, why || 'no reason given');
  if (strategy === 'remap') remapWindow();
  else activateWindow();
  if (!verify) return;

  setTimeout(() => {
    /* Retired: a later raise, or a hide the owner asked for in between. */
    if (gen !== raising.gen || !win || win.isDestroyed()) return;
    if (raising.took || win.isFocused()) return;
    const other = strategy === 'remap' ? 'activate' : 'remap';
    console.log('the window did not come forward when raised by %s; %s from here on',
                strategy, other);
    raiseStrategy = other;
    raiseWindow(other, why, false);
  }, RAISE_VERIFY_MS);
};

/*
 * The window, brought to the user, whichever of the two ways this desktop
 * answers to.
 *
 * The re-map is what GNOME 50 needs and it is the seed on any Wayland session;
 * X11 is given the plain ask, which it has always honoured and which costs it
 * neither a flicker nor a rebuild of the page. Neither is trusted: the raise is
 * measured, and a seed that is wrong here is corrected on the first click and
 * not again -- which is the whole of the "clicking a banner leaves the client
 * in the dock" report from GNOME 46, where the re-map is folded into no change
 * at all. `behaviour.raise` in the config settles it by hand for a desktop that
 * wants neither answer measured.
 */
const showWindow = why => {
  if (!win || win.isDestroyed()) return;

  /* Already up, and already the owner's. There is nothing to raise, and raising
     it anyway means the re-map -- which takes the window down for a frame and
     puts the page through a rebuild to no purpose. Clicking a banner while
     looking at the client should move to the chat and do nothing else. */
  if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
    win.focus();
    return;
  }

  /* One click, however many raises it turns into. See RAISE_COALESCE_MS: the
     page asks for the focus on its own account, and the second ask landing
     inside the first raise is a hide arriving after the show. */
  if (Date.now() - raising.at < RAISE_COALESCE_MS) {
    debug.trace('raise: a second ask (%s) arrived while one was still settling; ignored',
                why || 'no reason given');
    return;
  }

  if (!raiseStrategy) {
    const asked = String(config.get('behaviour.raise') || 'auto').toLowerCase();
    raiseMeasured = asked !== 'activate' && asked !== 'remap';
    raiseStrategy = raiseMeasured ? (onWayland ? 'remap' : 'activate') : asked;
    console.log('raising the window by %s%s', raiseStrategy,
                raiseMeasured ? '' : ', as the config asks');
  }
  raiseWindow(raiseStrategy, why, raiseMeasured);
};

const hideWindow = () => {
  if (!win || win.isDestroyed()) return;
  /* And a raise still waiting to be measured is retired with it: a window the
     owner has just put away is not one to fetch back a quarter of a second
     later. */
  raising.gen++;
  win.hide();
};

/* The tray's one item, and the whole of what it does -- for the hosts that
   deliver a click on the icon itself, where there is no menu and so no word to
   have promised anything. GNOME is not one of them: it opens the menu instead,
   and there the item acts on the word it is wearing (see tray-sni.js).
 *
 * "In front" rather than "on screen", because a window sitting behind the editor
 * is one the owner is asking for, not one they are asking to put away. */
const toggleWindow = () => {
  if (windowInFront()) hideWindow();
  else showWindow('the tray was asked for it');
};

const setTheme = theme => {
  config.set('view.theme', theme);
  config.save();
  if (theme === 'dark') {
    nativeTheme.themeSource = 'dark';
  } else if (theme === 'light') {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
  }
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b141a' : '#ffffff');
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:changed', { theme });
  }
  /* The Fonts window is drawn in the same colours and hears the same message --
     it is the settings window's other half, in a frame of its own. */
  if (fontsWin && !fontsWin.isDestroyed()) {
    fontsWin.webContents.send('settings:changed', { theme });
  }
  if (aboutWin && !aboutWin.isDestroyed()) {
    aboutWin.webContents.send('about:changed', { theme });
  }
};

const setAutostart = enable => {
  autostart.setEnabled(enable);
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:changed', { autostart: enable });
  }
};

/* One switch, moved. The settings window asks for this over IPC and the debug
   rig asks for it directly, so both go the same way through the same redraws --
   which is what makes a switch testable without a mouse. */
const changeSetting = (key, value) => {
  config.set(key, value);
  config.save();
  if (key === 'view.zoom') {
    const factor = Number(value) || 1.0;
    for (const [, item] of accountViews) {
      if (item.view && !item.view.webContents.isDestroyed()) {
        item.view.webContents.setZoomFactor(factor);
      }
    }
  }
  if (key === 'view.theme') {
    notifySidebarState();
  }
  if (key === 'view.font-size') applyStyle();

  /*
   * A font change, and the only honest answer to "does this need a restart".
   *
   * Almost all of it does not: the faces are a stylesheet, and a stylesheet
   * goes into a page that is already open -- a family, a size, a weight all
   * land on the conversation while it is being looked at. What cannot is the
   * fontconfig document. Every process that draws text reads that file once, at
   * startup, and it is what answers for the text the page names no family for
   * at all and for the client's own windows. So the file is rewritten now, and
   * whether it CHANGED is what the caller is told: changed, and there is a part
   * of the screen a restart would finish; unchanged, and there is nothing left
   * to do and nothing worth interrupting anybody for.
   */
  if (key.startsWith('fonts.') || key === 'view.font' || key === 'view.force-font') {
    const written = configureFonts();
    applyStyle();
    return { ok: true, restart: !!written.changed };
  }
  return { ok: true, restart: false };
};

/* Answers with the window, so a caller that wants to look at it -- the debug
   rig, which cannot press Ctrl+, -- has something to look at. */
const openSettings = () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  const isDark = nativeTheme.shouldUseDarkColors;
  /* An ordinary window, not one as tall as the screen. This used to be sized to
     the panel -- tall enough that every switch fitted without a scroll -- which
     on a laptop meant a column of settings from the top of the work area to the
     bottom of it for a handful of switches. The panel scrolls; a window this
     size is what the owner asked for, and it is what the settings window of
     anything else on the desktop looks like. */
  const panel = clampToScreen(560, 660);
  const settingsFont = uiFont();
  settingsWin = new BrowserWindow({
    width: panel.width,
    height: panel.height,
    /* Asked for the middle of the screen. Honoured on X11; on Wayland a client
       does not place its own windows and getBounds answers 0,0 whatever is
       asked -- GNOME centres a new window there of its own accord. */
    center: true,
    resizable: false,
    frame: false,
    title: 'WhatsApp Settings',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /* The desktop's font here as well, so the client's own window does not
         arrive in Chromium's default while the page beside it is drawn in the
         family the user chose. This covers whatever falls through to a generic
         family; settings.html is told the name outright and puts it first. */
      defaultFontFamily: {
        standard: settingsFont, sansSerif: settingsFont, serif: settingsFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));

  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    settingsWin.focus();
  });

  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  return settingsWin;
};

let addAccountWin = null;
const openAddAccountWindow = () => {
  if (addAccountWin && !addAccountWin.isDestroyed()) {
    addAccountWin.show();
    addAccountWin.focus();
    return addAccountWin;
  }

  const isDark = nativeTheme.shouldUseDarkColors;
  const settingsFont = uiFont();
  addAccountWin = new BrowserWindow({
    width: 400,
    height: 300,
    parent: win && !win.isDestroyed() ? win : null,
    modal: true,
    center: true,
    resizable: false,
    frame: false,
    title: 'إضافة حساب واتساب / Add WhatsApp Account',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontFamily: {
        standard: settingsFont, sansSerif: settingsFont, serif: settingsFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  addAccountWin.loadFile(path.join(__dirname, 'add-account.html'));

  addAccountWin.once('ready-to-show', () => {
    addAccountWin.show();
    addAccountWin.focus();
  });

  addAccountWin.on('closed', () => {
    addAccountWin = null;
  });

  return addAccountWin;
};

/*
 * The fonts, in a window of their own.
 *
 * They were the bottom half of the settings, and the tray's Fonts item opened
 * that window scrolled to them -- which is a window opened at something rather
 * than a window for it. The owner asked for the second: "Fonts…" opens the
 * fonts. So the section moved out whole, into a window that is the same
 * furniture (src/window.css, src/settings-preload.js, the same `settings:get`
 * answer) with nothing else in it.
 *
 * Taller than the settings window because there is more in it -- two scripts,
 * five controls and a preview each -- and still not as tall as a screen.
 */
const openFonts = () => {
  if (fontsWin && !fontsWin.isDestroyed()) {
    fontsWin.show();
    fontsWin.focus();
    return fontsWin;
  }

  const isDark = nativeTheme.shouldUseDarkColors;
  const panel = clampToScreen(560, 720);
  const settingsFont = uiFont();
  fontsWin = new BrowserWindow({
    width: panel.width,
    height: panel.height,
    center: true,
    resizable: false,
    frame: false,
    title: 'WhatsApp Fonts',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontFamily: {
        standard: settingsFont, sansSerif: settingsFont, serif: settingsFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  fontsWin.loadFile(path.join(__dirname, 'fonts.html'));

  fontsWin.once('ready-to-show', () => {
    fontsWin.show();
    fontsWin.focus();
  });

  fontsWin.on('closed', () => {
    fontsWin = null;
  });

  return fontsWin;
};

/* ------------------------------------------------------ about, and updates */

/*
 * What the last check found, or the reason it could not be made. Kept for the
 * life of the process rather than written down: it is a fact about a web page,
 * and one that a fresh start is welcome to ask again.
 */
let lastUpdate = null;
/* When that answer came back, so the About window can decide whether it is
   worth asking again as it opens. */
let lastUpdateAt = 0;
let checking = false;
const waitingOnCheck = [];

/* Which version is being asked about. The debug rig can put a lower one here so
   that the half of this which only happens when a release is out -- the wording
   in the tray, the button that goes to the site -- can be looked at on a machine
   that is already up to date. */
let pretendVersion = null;
const currentVersion = () => pretendVersion || app.getVersion();

/*
 * One check at a time, whoever asked for it. The menu, the About window and the
 * one that runs by itself all come through here, and a second caller arriving
 * mid-flight waits for the answer already on its way instead of spending another
 * request against an hourly limit of sixty.
 */
const checkForUpdates = done => {
  if (done) waitingOnCheck.push(done);
  if (checking) return;
  checking = true;

  updates.check(currentVersion(), (err, found) => {
    checking = false;
    lastUpdate = err ? { current: currentVersion(), error: err.message } : found;
    lastUpdateAt = Date.now();
    console.log('update: %s', err ? `could not ask (${err.message})`
      : found.newer ? `${found.latest} is out, and this is ${found.current}`
      : `${found.current} is the latest release`);

    /* The tray item says what was found, and the About window redraws if it is
       open -- neither of them asked, and both of them show it. */
    if (tray) tray.refreshUpdate();
    if (aboutWin && !aboutWin.isDestroyed()) {
      aboutWin.webContents.send('about:changed', { update: lastUpdate });
    }

    for (const waiting of waitingOnCheck.splice(0)) waiting(lastUpdate);
  });
};

/* Where each of the About window's links goes, decided here rather than in the
   page: what crosses the bridge is a name, so nothing the page could be talked
   into saying puts an address of its own in front of the browser. */
const SITES = {
  site: updates.SITE,
  /* The section that spells the upgrade out per distribution -- which is the
     honest answer for a client installed from a package repository. */
  update: `${updates.SITE}#update`,
  source: `https://github.com/${updates.REPO}`,
};

const openSite = where => {
  const url = SITES[where] || SITES.site;
  console.log('opening %s', url);
  shell.openExternal(url).catch(e => console.warn('could not open %s: %s', url, e.message));
};

/* Set when the About window is opened by the tray's "Check for Updates", and
   read once by the page as it loads: the window opened to answer a question, so
   it starts asking it without being pressed. */
let aboutShouldCheck = false;

/* Answers with the window, like openSettings, so the debug rig has something to
   measure. */
const openAbout = ({ checkNow = false } = {}) => {
  if (aboutWin && !aboutWin.isDestroyed()) {
    aboutWin.show();
    aboutWin.focus();
    if (checkNow) aboutWin.webContents.send('about:changed', { checkNow: true });
    return aboutWin;
  }

  aboutShouldCheck = checkNow;
  const isDark = nativeTheme.shouldUseDarkColors;
  const panel = clampToScreen(430, 610);
  const aboutFont = uiFont();
  aboutWin = new BrowserWindow({
    width: panel.width,
    height: panel.height,
    center: true,
    resizable: false,
    frame: false,
    title: 'About WhatsApp',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#111b21' : '#f0f2f5',
    webPreferences: {
      preload: path.join(__dirname, 'about-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontFamily: {
        standard: aboutFont, sansSerif: aboutFont, serif: aboutFont,
      },
    },
  });

  Menu.setApplicationMenu(null);
  aboutWin.loadFile(path.join(__dirname, 'about.html'));

  aboutWin.once('ready-to-show', () => {
    aboutWin.show();
    aboutWin.focus();
  });

  aboutWin.on('closed', () => {
    aboutWin = null;
  });

  return aboutWin;
};

/* What the page is drawn with. Lifted out of applyStyle because a call moved
   into a window of its own is a second page of WhatsApp's, and it is this
   client's font it should be drawn in too. */
const styleSheet = () => {
  const wanted = {
    fontSize: config.get('view.font-size'),
  };
  /* What the last sheet said, so this one can contradict it. A sheet inserted at
     user origin cannot be removed again -- see style.js -- so a switch turned
     off is a rule that has to be written, not one that can be left out. */
  const sheet = style.build(wanted, drawnWith);
  drawnWith = wanted;
  return [
    sheet,
    /* The faces themselves: one family name, the Latin font, and -- when the
       two scripts have been chosen apart -- the Arabic one over the range that
       is Arabic. No selector, so no per-element cost, which is the whole
       reason the font lives in @font-face and not in a rule. */
    forcingFont() ? style.fontFaces(pageFontStack, chosenFonts()) : '',
  ].filter(Boolean).join('\n');
};

const drawStyleForView = async (item) => {
  if (!item || !item.view || item.view.webContents.isDestroyed()) return;
  const family = uiFont();
  const css = styleSheet();

  const stale = item.cssKeys || [];
  item.cssKeys = [];
  for (const key of stale) {
    try {
      await item.view.webContents.removeInsertedCSS(key);
    } catch (e) { /* the page navigated; the old sheet went with it */ }
  }

  if (css) {
    try {
      const key = await item.view.webContents.insertCSS(css, { cssOrigin: 'user' });
      item.cssKeys.push(key);
    } catch (e) {}
  }
};

const drawStyle = async () => {
  if (!win || win.isDestroyed()) return;
  const family = uiFont();

  for (const [, item] of accountViews) {
    await drawStyleForView(item);
  }

  const activeItem = accountViews.get(activeAccountId);
  if (activeItem) {
    require('./main-css.js').track(win, () => activeItem.cssKeys[activeItem.cssKeys.length - 1] || null,
                                   key => { activeItem.cssKeys = key ? [key] : []; });
  }

  console.log('drawing in %s at %dpx%s', family, config.get('view.font-size'),
              pageFontStack ? '' : ' (waiting for the page to say what it asks for)');
};

/* One at a time. Inserting a stylesheet and taking the old one out is two round
   trips to the renderer, and a second call arriving in between is what left two
   sheets in the page. */
let styling = Promise.resolve();
const applyStyle = () => {
  styling = styling.catch(() => {}).then(drawStyle);
  return styling;
};

const createAccountView = (account) => {
  if (accountViews.has(account.id)) return accountViews.get(account.id);

  const family = uiFont();
  const ses = account.id === 'default'
    ? session.defaultSession
    : session.fromPartition(`persist:account_${account.id}`);

  configureSession(ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: !!config.get('behaviour.spellcheck'),
      autoplayPolicy: 'no-user-gesture-required',
      defaultFontFamily: { standard: family, sansSerif: family, serif: family },
      defaultFontSize: config.get('view.font-size'),
      backgroundThrottling: false,
    },
  });

  const item = {
    id: account.id,
    account,
    view,
    cssKeys: [],
    loadedAt: 0,
    unreadChats: 0,
    unreadMessages: null,
    title: '',
    storeLive: false,
    activeChatId: '',
    unreadChatNames: new Set(),
  };

  accountViews.set(account.id, item);

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key === ',') {
      event.preventDefault();
      openSettings();
      return;
    }
    onKey(event, input);
  });

  view.webContents.on('did-finish-load', async () => {
    item.loadedAt = Date.now();
    if (account.id === activeAccountId) {
      loadedAt = item.loadedAt;
      if (pendingChat) {
        view.webContents.send('wa:open-link', { phone: pendingChat.phone, wantsText: !!pendingChat.text });
        pendingChat = null;
      }
      if (pendingInvite) {
        view.webContents.send('wa:open-invite', { code: pendingInvite });
        pendingInvite = '';
      }
    }
    await drawStyleForView(item);
    view.webContents.setZoomFactor(Number(config.get('view.zoom')) || 1);
    view.webContents.send('wa:config', {
      notifications: !!config.get('notifications.enabled'),
      downloadStickers: config.get('media.download-stickers') !== false,
      hideControlsWhenPaused: config.get('media.hide-controls-when-paused') !== false,
      muteSendTone: !config.get('notifications.outgoing-sound'),
      mutePageTone: !config.get('notifications.whatsapp-sound'),
    });

    if (config.get('notifications.sound')) {
      const tone = sound.tone();
      if (tone) view.webContents.send('wa:tone', tone);
    }
    pushFocus();
  });

  view.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.warn('account [%s] load failed (%d %s); trying again in 5s', account.name, code, description);
    setTimeout(() => {
      if (view && !view.webContents.isDestroyed()) view.webContents.loadURL(WHATSAPP_URL);
    }, 5000);
  });

  view.webContents.on('render-process-gone', (event, details) => {
    console.warn('account [%s] page went away (%s); reloading', account.name, details.reason);
    if (details.reason !== 'clean-exit' && view && !view.webContents.isDestroyed()) {
      view.webContents.reload();
    }
  });

  view.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    onAccountTitle(account.id, title);
  });

  view.webContents.setWindowOpenHandler(({ url, features }) => {
    if (!isOwnPage(url)) {
      openExternally(url);
      return { action: 'deny' };
    }
    return { action: 'allow', overrideBrowserWindowOptions: popupOptions(features) };
  });

  view.webContents.on('did-create-window', adoptPopup);
  view.webContents.on('context-menu', (event, params) => showContextMenu(view.webContents, params));

  view.webContents.on('will-navigate', (event, url) => {
    const link = isOwnPage(url) ? null : links.from(url);
    if (link) { event.preventDefault(); openLink(link, 'a link in the page'); return; }
    if (isWhatsApp(url)) return;
    event.preventDefault();
    openExternally(url);
  });

  if (win && !win.isDestroyed() && win.contentView) {
    win.contentView.addChildView(view);
    updateLayout();
  }

  view.webContents.loadURL(WHATSAPP_URL);
  return item;
};

const createWindow = () => {
  const { width, height } = clampToScreen(config.get('window.width'), config.get('window.height'));

  win = new BrowserWindow({
    width,
    height,
    minWidth: 500,
    minHeight: 400,
    title: TITLE,
    icon: appIcon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b141a' : '#ffffff',
  });

  // Backward compatibility getter so win.webContents always targets the active view
  Object.defineProperty(win, 'webContents', {
    get: () => getActiveWebContents(),
    configurable: true,
  });

  Menu.setApplicationMenu(null);

  // Initialize sidebar WebContentsView
  sidebarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'sidebar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.contentView.addChildView(sidebarView);
  sidebarView.webContents.loadFile(path.join(__dirname, 'sidebar.html'));

  // Initialize accounts
  const accounts = accountsMgr.getAccounts();
  for (const acc of accounts) {
    createAccountView(acc);
  }

  switchToAccount(activeAccountId || 'default');
  updateLayout();

  win.on('resize', updateLayout);
  win.on('maximize', updateLayout);
  win.on('unmaximize', updateLayout);

  /* ------------------------------------------------------ closing and hiding */

  win.on('close', event => {
    if (win && !win.isDestroyed()) {
      const bounds = win.getBounds();
      config.set('window.width', bounds.width);
      config.set('window.height', bounds.height);
      const activeWc = getActiveWebContents();
      if (activeWc) config.set('view.zoom', activeWc.getZoomFactor());
      config.save();
    }
    if (!quitting && config.get('behaviour.close-to-tray')) {
      event.preventDefault();
      hideWindow();
    }
  });

  win.on('minimize', event => {
    if (config.get('behaviour.minimize-to-tray')) {
      event.preventDefault();
      hideWindow();
    } else {
      pushFocus();
    }
  });

  for (const event of ['show', 'hide', 'focus', 'blur', 'restore']) win.on(event, pushFocus);

  traceWindowState();

  win.once('ready-to-show', () => {
    updateLayout();
    if (!hidden) showWindow('the client started');
    pushFocus();
    notifySidebarState();
  });
};

const isWhatsApp = url => {
  if (!url) return true;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:')) return true;
  try {
    const host = new URL(url).hostname;
    return host === 'web.whatsapp.com' || host.endsWith('.whatsapp.com') || host === 'whatsapp.com';
  } catch (e) {
    return false;
  }
};

/* Narrower than isWhatsApp, and deliberately so. faq.whatsapp.com is WhatsApp
   as well, and it is still a page for a browser rather than for a window of
   this client's: there is no address bar here and no way back. What this answers
   true for is the client itself, and the URLs a page of it opens that carry no
   origin of their own. */
const isOwnPage = url => {
  if (!url) return true;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:')) return true;
  try {
    return new URL(url).hostname === 'web.whatsapp.com';
  } catch (e) {
    return false;
  }
};

/*
 * A link this client is not showing, handed to whatever does show it -- with one
 * exception. A wa.me link is a chat and a chat.whatsapp.com link is a group
 * invite, and sending the owner out to a browser so that the browser can hand
 * either straight back is a round trip nobody asked for. Those are opened here.
 * See src/links.js.
 */
const openExternally = url => {
  const link = links.from(url);
  if (link) { openLink(link, 'a link in the page'); return; }
  if (/^https?:|^mailto:|^tel:/i.test(url)) shell.openExternal(url).catch(() => {});
};

/* A chat asked for before there was a page to ask, and the message that came
   with it. The message is held here rather than sent to the page and asked for
   back: it is this process's to type, and a channel the page can put words into
   is a channel that can be made to type them. */
let pendingChat = null;
let pendingText = '';
let pendingInvite = '';

/*
 * A chat, opened by phone number rather than by clicking a row in the list --
 * which is the only way to reach somebody who is not in it yet.
 *
 * The page does the work, through WhatsApp's own openChatWithContact, so this
 * costs no reload: measured on the live client, the conversation changed in
 * about a second with the URL still at web.whatsapp.com. The window is raised
 * first because a link followed from a browser is somebody asking for this
 * client, not for a chat to change behind a tray icon.
 */
const openLinkedChat = (chat, why) => {
  if (!chat || !win || win.isDestroyed()) return;
  console.log('opening a chat with +%s%s (%s)', chat.phone,
              chat.text ? ' with a message ready to send' : '', why);
  showWindow('a link to a chat');
  /* A link that started this client arrives before there is a page to tell, and
     a send into a window still loading is a send into nothing. It is held and
     handed over by did-finish-load; the page waits from there for WhatsApp's own
     modules, which take a few seconds more. */
  pendingText = chat.text || '';
  if (loadedAt) win.webContents.send('wa:open-link', { phone: chat.phone, wantsText: !!pendingText });
  else pendingChat = chat;
};

/*
 * A group invite, put up where the client already is.
 *
 * The chunk that only /accept loads was the reason this used to be a reload, and
 * the page fetches that chunk itself now: see openInvite in src/page/inject.js
 * for what was measured. The dialog is WhatsApp's own, it comes up over the chat
 * list in about a second, and nothing is joined until the button in it is
 * pressed. The reload is still here, one message away, for the morning
 * WhatsApp's module names change.
 *
 * The window is raised first for the same reason a linked chat raises it: a link
 * followed from a browser is somebody asking for this client, not for a dialog
 * behind a tray icon.
 */
const openGroupInvite = (code, why) => {
  if (!code || !win || win.isDestroyed()) return;
  console.log('opening a group invite (%s)', why);
  showWindow('a group invite');
  /* An invite that started this client arrives before there is a page to tell;
     did-finish-load hands it over, and the page waits from there for WhatsApp's
     own modules. */
  if (loadedAt) win.webContents.send('wa:open-invite', { code });
  else pendingInvite = code;
};

/* Which of the two a link turned out to be. Everything that follows a link --
   the command line, a second copy's argv, macOS's event, a click in the page --
   comes through here so that the answer is decided in one place. */
const openLink = (link, why) => {
  if (!link) return;
  if (link.invite) openGroupInvite(link.invite, why);
  else openLinkedChat(link, why);
};

/* ----------------------------------------------------------------- popups */

/* WhatsApp opens one window of its own: the call, moved out of the chat list by
   "Move to new window". It comes through window.open on the client's own origin,
   so it is allowed -- and then it is this client's window to dress, because
   Chromium's default is an untitled box with Electron's icon and the wrong
   font. */
const popups = new Set();

const popupOptions = features => {
  const family = uiFont();
  /* WhatsApp says how big it wants the window; a size of this client's choosing
     is only put on one that did not ask. */
  const sized = /(^|,)\s*(width|height)\s*=/i.test(features || '');
  return {
    ...(sized ? {} : { width: 480, height: 640 }),
    title: TITLE,
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b141a' : '#ffffff',
    webPreferences: {
      /* Spelled out rather than left to what a child window inherits. The preload
         is not optional here: without it navigator.gpu stays, and that is a call
         window whose video comes through black -- see src/page/inject.js. The
         marker is how the preload tells this window from the client, which is a
         distinction the page cannot be trusted to make for it. */
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--wa-popup'],
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
      defaultFontFamily: { standard: family, sansSerif: family, serif: family },
      defaultFontSize: config.get('view.font-size'),
      /* Never throttled, and said out loud because a child window inherits what
         it is not told. This was tried the other way round for one build, on the
         theory that a call window has nothing that must keep running -- and a
         call window has the call. Wayland's compositor marks a window suspended
         the moment something covers it, Chromium throttles a suspended page when
         it is allowed to, and "switch to video" went from answering on the click
         to answering seconds later. */
      backgroundThrottling: false,
    },
  };
};

/*
 * The right-click menu, which Electron does not draw and a browser does.
 *
 * WhatsApp draws its own over a message: measured on the live page, a
 * right-click anywhere in the conversation -- on a bubble or on the wallpaper
 * between two of them -- is taken by the page and cancelled, so this is never
 * asked for there and WhatsApp's Reply/React/Forward menu is what opens. What
 * is left is everything the page does NOT answer for: the composer, the search
 * boxes, the window's own chrome, and every page a link opens in a popup. Those
 * had nothing at all, which is what the report was.
 *
 * The composer is the one that matters, so the menu is built around it. It is
 * also the only place the spell checker can be acted on: it is on by default
 * (behaviour.spellcheck) and draws its red underline, and without a menu there
 * was no way to see what it wanted instead.
 */
const showContextMenu = (contents, params) => {
  const flags = params.editFlags || {};
  const template = [];
  const rule = () => { if (template.length) template.push({ type: 'separator' }); };

  /* First, above the editing actions, the way every desktop puts them: what
     the underline is asking is the reason the menu was opened. */
  if (params.misspelledWord) {
    for (const word of params.dictionarySuggestions || [])
      template.push({ label: word, click: () => contents.replaceMisspelling(word) });
    if (!(params.dictionarySuggestions || []).length)
      template.push({ label: 'No spelling suggestions', enabled: false });
    template.push({
      label: 'Add to dictionary',
      click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
  }

  if (params.isEditable) {
    rule();
    template.push(
      { role: 'undo', enabled: !!flags.canUndo },
      { role: 'redo', enabled: !!flags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: !!flags.canCut },
      { role: 'copy', enabled: !!flags.canCopy },
      { role: 'paste', enabled: !!flags.canPaste },
      /* WhatsApp's composer is a rich-text editor and a paste carries the
         formatting of wherever it came from. */
      { role: 'pasteAndMatchStyle', enabled: !!flags.canPaste },
      { role: 'delete', enabled: !!flags.canDelete },
      { role: 'selectAll' },
    );
  } else if (params.selectionText) {
    rule();
    template.push({ role: 'copy' }, { role: 'selectAll' });
  }

  /* A link, and an image, on the pages a chat opens in a window of its own --
     inside a conversation both of these belong to WhatsApp's own menu. The
     link is opened in the browser rather than here because that is what this
     client does with one everywhere else. */
  if (params.linkURL) {
    rule();
    template.push(
      { label: 'Open link in browser', click: () => shell.openExternal(params.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(params.linkURL) },
    );
  }
  if (params.mediaType === 'image') {
    rule();
    template.push({ label: 'Copy image', click: () => contents.copyImageAt(params.x, params.y) });
  }

  /* Last, and always: the devtools are a documented Ctrl+Shift+I in this
     client, and a menu that can point at the element is the other half of it. */
  rule();
  template.push({ label: 'Inspect', click: () => contents.inspectElement(params.x, params.y) });

  /* A native menu is drawn by the toolkit and never appears in a capturePage,
     so what it says is only ever readable from here. */
  debug.trace('menu: %s', template.map(item => item.label || item.role || '--').join(' / '));

  const window = BrowserWindow.fromWebContents(contents);
  if (window) Menu.buildFromTemplate(template).popup({ window: window });
};

const adoptPopup = popup => {
  popups.add(popup);
  popup.on('closed', () => {
    popups.delete(popup);
    debug.trace('popup: closed, %d left', popups.size);
  });
  popup.on('close', () => debug.trace('popup: asked to close'));

  const contents = popup.webContents;

  contents.on('context-menu', (event, params) => showContextMenu(contents, params));

  contents.on('did-finish-load', async () => {
    debug.trace('popup: loaded %s', contents.getURL());
    contents.setZoomFactor(Number(config.get('view.zoom')) || 1);
    const css = styleSheet();
    if (css) await contents.insertCSS(css, { cssOrigin: 'user' }).catch(() => {});
  });

  /* Whatever this window opens in turn is a link, not a call. */
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isWhatsApp(url)) return;
    event.preventDefault();
    openExternally(url);
  });

  contents.on('before-input-event', (event, input) => onPopupKey(popup, event, input));

  console.log('WhatsApp asked for a window of its own; %dx%d',
              popup.getBounds().width, popup.getBounds().height);
};

/* ------------------------------------------------------------------- keys */

const onKey = (event, input) => {
  if (input.type !== 'keyDown' || !win) return;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();

  if (ctrl && key === 'q') { event.preventDefault(); quit(); return; }
  if (ctrl && key === 'w') { event.preventDefault(); win.close(); return; }
  if (ctrl && key === 'r') {
    event.preventDefault();
    const activeWc = getActiveWebContents();
    if (activeWc) activeWc.reload();
    return;
  }
  if (ctrl && input.shift && key === 'i') {
    event.preventDefault();
    const activeWc = getActiveWebContents();
    if (activeWc) activeWc.toggleDevTools();
    return;
  }

  // Ctrl+1 through Ctrl+9 switches accounts
  if (ctrl && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
    const idx = parseInt(input.key, 10) - 1;
    const accounts = accountsMgr.getAccounts();
    if (idx >= 0 && idx < accounts.length) {
      event.preventDefault();
      switchToAccount(accounts[idx].id);
      return;
    }
  }

  // Ctrl+Alt+A opens Add Account dialog
  if (ctrl && input.alt && key === 'a') {
    event.preventDefault();
    openAddAccountWindow();
    return;
  }

  // Ctrl+Alt+S toggles sidebar collapse/expand
  if (ctrl && input.alt && key === 's') {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  const activeWc = getActiveWebContents();
  const zoom = activeWc ? activeWc.getZoomFactor() : 1;
  if (ctrl && (key === '+' || key === '=')) {
    event.preventDefault();
    const newZoom = Math.min(3, zoom + 0.1);
    config.set('view.zoom', newZoom);
    for (const [, item] of accountViews) {
      if (item.view && !item.view.webContents.isDestroyed()) {
        item.view.webContents.setZoomFactor(newZoom);
      }
    }
  } else if (ctrl && key === '-') {
    event.preventDefault();
    const newZoom = Math.max(0.3, zoom - 0.1);
    config.set('view.zoom', newZoom);
    for (const [, item] of accountViews) {
      if (item.view && !item.view.webContents.isDestroyed()) {
        item.view.webContents.setZoomFactor(newZoom);
      }
    }
  } else if (ctrl && key === '0') {
    event.preventDefault();
    config.set('view.zoom', 1);
    for (const [, item] of accountViews) {
      if (item.view && !item.view.webContents.isDestroyed()) {
        item.view.webContents.setZoomFactor(1);
      }
    }
  }
};

/* A call window answers to fewer keys than the client does, and reload is not
   among them: the call itself lives in the window that opened this one, so a
   popped-out call reloaded is an empty window with no way back to it. */
const onPopupKey = (popup, event, input) => {
  if (input.type !== 'keyDown' || popup.isDestroyed()) return;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();

  if (ctrl && key === 'q') { event.preventDefault(); quit(); return; }
  if (ctrl && key === 'w') { event.preventDefault(); popup.close(); return; }
  if (ctrl && input.shift && key === 'i') {
    event.preventDefault();
    popup.webContents.toggleDevTools();
  }
};

/* ---------------------------------------------------------- notifications */

/* The tone for a banner, whichever half of the client raised it.
 *
 * It used to be played only for the watcher's banners -- the window-in-front
 * half -- because WhatsApp Web plays a tone of its own for the notifications it
 * raises, and two sounds for one message is worse than none. What that left was
 * two different sounds for the same event: the desktop's tone with the window in
 * front, and WhatsApp's own, served from static.whatsapp.net, with the window in
 * the tray. A notification that does not sound like itself is the one thing a
 * notification must not be. So the page's tone is silenced instead (see the
 * sound section of src/page/inject.js) and this one is played for both. */
const playTone = () => {
  if (!config.get('notifications.sound')) return;
  if (!win || win.isDestroyed()) return;
  /* The desktop has the last word.
   *
   * A notification daemon reads the urgency and the do-not-disturb setting and
   * decides whether to put a banner on screen, and it decides whether to make a
   * sound the same way -- but only for the sound IT plays, from the hint on the
   * call. This tone is played by the client, through the page, and the daemon
   * knows nothing about it. So do-not-disturb silenced the banner and left the
   * sound, which is the opposite of what do-not-disturb is for. Asked here
   * instead, and the same question the shell asks itself. */
  if (!desktop.notificationsAllowed()) {
    console.log('the tone is not played: the desktop is not taking notifications');
    return;
  }
  if (!desktop.eventSoundsEnabled()) {
    console.log('the tone is not played: the desktop has its alert sounds off');
    return;
  }
  win.webContents.send('wa:play-tone', null);
};

/* ------------------------------------------------------------ withdrawals */

/* Every call this client is ringing for. A ringing banner is ongoing -- it
   names something still happening, so nothing about reading a chat takes it
   down -- and until now the only thing that did was the ringing stopping. A
   call answered by opening the window instead of by clicking the banner
   therefore left the banner in the notification centre for the rest of the
   session. Arriving at the client is dealing with the call, whichever chat is
   on screen, so it counts as an answer too. */
const ringingBanners = new Set();

/* A notification is an unread message made visible, so it comes down as soon as
   the message has been dealt with. Two things say that it has, and they are not
   the same thing:
 *
 *   the chat is the one on screen, in a window the user is looking at -- which
 *   is an answer, immediate and certain;
 *
 *   the chat has stopped being unread -- which is an inference, and one that
 *   arrives a beat late because WhatsApp draws the pill a beat after it moves
 *   the row. It also covers a message read on the phone.
 */

/* The banners for the conversation on screen, taken down at once.

   Deliberately without the ARRIVAL_SETTLE_MS guard below: that guard is there
   for a pill drawn late, and there is nothing late about the chat the user just
   clicked on. Opening a chat while its banner was still on screen used to leave
   the message sitting in the notification centre for good -- the guard refused
   the withdrawal, and the page reports the unread list only when it CHANGES, so
   nothing ever asked a second time. */
const withdrawOpen = () => {
  if (!banners || !openChat) return;
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible() || win.isMinimized() || !win.isFocused()) return;

  const closed = banners.closeKey(openChat);
  if (closed) console.log('withdrew %d notification(s) for %s: it is the chat on screen',
                          closed, openChat);
};

/* The banners for a chat that has stopped being unread. A request refused for
   being too young is not dropped -- nothing would ever ask again -- but deferred
   to the moment the guard is over and asked again then, because the chat may
   have gone unread once more in between. */
/* The ringing, taken down because the owner is here. Deliberately not keyed on
   the chat: the call is being dealt with in the client whether or not its
   conversation is the one on screen. */
const withdrawRinging = () => {
  if (!banners || !ringingBanners.size) return;
  for (const id of [...ringingBanners]) {
    ringingBanners.delete(id);
    if (banners.closeMessage(id)) console.log('withdrew the ringing: the client is open');
  }
};

const withdrawRead = key => {
  const waiting = withdrawing.get(key);
  if (waiting) { clearTimeout(waiting); withdrawing.delete(key); }
  if (!banners || unreadChatNames.has(key)) return;

  const closed = banners.closeKey(key, ARRIVAL_SETTLE_MS);
  if (closed) console.log('withdrew %d notification(s) for %s: it has been read', closed, key);

  const left = banners.guardRemaining(key, ARRIVAL_SETTLE_MS);
  if (left > 0) {
    console.log('holding %s for another %dms before withdrawing: the banner is new',
                key, Math.round(left));
    withdrawing.set(key, setTimeout(() => withdrawRead(key), left + 50));
  }
};

/* --------------------------------------------------- the store's own answers */

/*
 * Everything below reads WhatsApp's own state rather than a picture of it.
 * There is no age guard anywhere in it, and that absence is the point: a guard
 * belongs in front of an inference, and none of these is one. A chat whose
 * unread count WhatsApp just changed has been read; a message whose type
 * WhatsApp just rewrote to `revoked` has been taken back. The guards that used
 * to sit here -- ARRIVAL_SETTLE_MS, a 2.5s grace, a 3s sweep -- were each there
 * because the chat list answers late, and each of them was a second or more of
 * a notification sitting on screen for a message the user had already read on
 * their phone.
 */

/* A chat read down to `unread` messages.
 *
 * WhatsApp counts the messages still waiting, and the ones it is counting are
 * the last ones in the conversation -- so five unread becoming two means the
 * oldest three have been read, and it does not matter at all which device read
 * them. That is partial read handling, and it needs nothing from the read side
 * but a number. Zero takes the chat's banners with it. */
const storeRead = (chatId, unread) => {
  if (!banners || !chatId) return;
  const held = banners.countFor(chatId);
  if (!held) return;
  const closed = banners.trim(chatId, unread);
  if (!closed) return;
  console.log('withdrew %d notification(s) for %s: %s', closed,
              chatTitles.get(chatId) || chatId,
              unread ? unread + ' message(s) still unread' : 'it has been read');
};

/* The conversation on screen. An answer from WhatsApp, and one it gives whether
   or not the window is drawn -- which is what the old reading of aria-selected
   could not do, and why leaving a chat took a beat to register and swallowed the
   next message to land in it. */
const storeActive = chatId => {
  activeChatId = chatId || '';
  if (!banners || !activeChatId) return;
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible() || win.isMinimized() || !win.isFocused()) return;
  const closed = banners.trim(activeChatId, 0);
  if (closed) console.log('withdrew %d notification(s) for %s: it is the chat on screen',
                          closed, chatTitles.get(activeChatId) || activeChatId);
};

/* Everything still waiting, asked for outright rather than waited for. The
   events above are the whole story while the client is listening; this is for
   the spell where it was not -- a laptop out of suspend, a socket that dropped
   and came back -- where the only thing that can be trusted is the answer now. */
const storeUnread = map => {
  if (!banners || !map || typeof map !== 'object') return;
  for (const key of banners.keys()) storeRead(key, Number(map[key]) || 0);
};

/* Whether the store's banners are this client's to raise.
 *
 * Deliberately unlike bannersAreOurs: that one refuses while the window is away,
 * because WhatsApp Web raises its own notification then and dressing both would
 * be two banners for one message. The store has no such rival -- the shim
 * swallows WhatsApp's notification while the store is live -- so this path is
 * the one that runs in every window state, which is what makes a message id and
 * a chat id available for a message that arrived into the tray. */
const storeBannersAreOurs = () => {
  if (!storeLive || !banners) return false;
  if (!config.get('notifications.enabled')) return false;
  if (Date.now() - loadedAt < STARTUP_GRACE_MS) {
    console.log('notification skipped: the client is still syncing');
    return false;
  }
  return true;
};

/* Whether a banner is this client's to raise at all. While the window is away
   WhatsApp Web raises its own, which the page shim hands over here already
   dressed; the watcher has to stay out of that, or one message arrives twice. */
const bannersAreOurs = () => {
  if (!config.get('notifications.enabled')) return false;
  if (!win || win.isDestroyed() || !win.isVisible() || !win.isFocused()) return false;
  if (Date.now() - loadedAt < STARTUP_GRACE_MS) {
    console.log('notification skipped: the client is still syncing');
    return false;
  }
  return true;
};

/* The page is asked for the description at notification time rather than pushing
   it ahead of time. Pushing it on every title change raced the title itself: the
   count reached the app first and every banner read "You have a new message".
   The quarter second lets WhatsApp finish moving the chat to the top of the list
   before the row is read. */
const updateAggregateUnread = () => {
  let totalWaiting = 0;
  for (const [, it] of accountViews) {
    const w = it.unreadMessages === null ? (it.unreadChats || 0) : (it.unreadMessages || 0);
    totalWaiting += w;
  }
  if (tray) tray.setAttention(totalWaiting > 0);
  setBadge(totalWaiting);
  if (win && !win.isDestroyed()) {
    const activeItem = accountViews.get(activeAccountId);
    const title = activeItem && activeItem.title ? activeItem.title : TITLE;
    win.setTitle(title && title.trim() ? title : TITLE);
  }
};

const describeThenNotify = (targetAccountId = activeAccountId) => setTimeout(async () => {
  if (!win || win.isDestroyed()) return;
  const item = accountViews.get(targetAccountId);
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

  const acc = accountsMgr.getAccount(targetAccountId);
  const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

  const raised = banners.show({
    identity: (targetAccountId !== 'default' ? targetAccountId + SEP : '') + [chat, sender, message].join(SEP),
    key: (targetAccountId !== 'default' ? targetAccountId + SEP : '') + chat,
    title: bidi.paragraph(prefix + chat),
    body: bidi.line(sender, message),
    redacted: kindOf(message),
    icon: avatar,
    onClick: () => {
      if (targetAccountId !== activeAccountId) switchToAccount(targetAccountId);
      showWindow('a banner was clicked');
      if (item && !item.view.webContents.isDestroyed())
        item.view.webContents.send('wa:open-chat-request', { token, name: chat, preview: message });
    },
  });
  if (raised) playTone();
}, 250);

const onAccountTitle = (accId, title) => {
  const item = accountViews.get(accId);
  if (!item) return;
  item.title = title || '';

  let chats = 0;
  const m = /^\((\d+)\)/.exec(title || '');
  if (m) chats = parseInt(m[1], 10) || 1;

  if (!item.storeLive &&
      chats > (item.unreadChats || 0) &&
      Date.now() - lastArrivalAt > TITLE_FALLBACK_MS &&
      bannersAreOurs()) {
    describeThenNotify(accId);
  }
  item.unreadChats = chats;
  if (accId === activeAccountId) unreadChats = chats;

  if (item.storeLive) {
    updateAggregateUnread();
    return;
  }

  if (chats === 0) {
    item.unreadMessages = 0;
    if (accId === activeAccountId) unreadMessages = 0;
  }

  const waiting = item.unreadMessages === null ? chats : item.unreadMessages;
  accountsMgr.setUnreadCount(accId, waiting);
  notifySidebarState();
  updateAggregateUnread();
};

const onTitle = title => onAccountTitle(activeAccountId, title);

/* Drawn by the launcher, over the application's icon. On Linux this goes out on
   the Unity LauncherEntry interface, which GNOME reads through Dash to Dock and
   its relatives and which nothing at all reads on a plain GNOME -- so it is set
   and not depended upon, and the tray icon carries the same news for a desktop
   that does not draw badges. */
const setBadge = count => {
  const wanted = Math.max(0, Math.round(Number(count) || 0));
  if (wanted === badgeShown) return;
  badgeShown = wanted;
  try { app.badgeCount = wanted; } catch (e) { /* no launcher listening */ }
  console.log('badge: %d', wanted);
};

/* --------------------------------------------------------------- the app */

const quit = () => {
  quitting = true;
  app.quit();
};

const wireIpc = () => {
  ipcMain.on('wa:log', (event, message) => console.log('page: %s', message));

  ipcMain.handle('settings:get', () => {
    return {
      theme: config.get('view.theme') || 'system',
      autostart: autostart.isEnabled(),
      closeToTray: !!config.get('behaviour.close-to-tray'),
      minimizeToTray: !!config.get('behaviour.minimize-to-tray'),
      notifyEnabled: !!config.get('notifications.enabled'),
      notifySound: !!config.get('notifications.sound'),
      outgoingSound: !!config.get('notifications.outgoing-sound'),
      zoom: Number(config.get('view.zoom')) || 1.0,
      fontSize: Number(config.get('view.font-size')) || 16,
      /* The family the client draws the page in, so this window can be drawn in
         it too rather than in whatever Chromium picks for a plain page. */
      font: uiFont(),
      /* Everything the font section of that window draws itself from: what was
         chosen, what it falls back to when nothing was, and what is installed.
         The lists come with a bold and an italic flag per family, because a
         switch for a face the font has not got is a switch that does nothing --
         and one round trip here is cheaper than one per family the owner
         scrolls past. */
      fonts: {
        desktop: desktop.interfaceFont(),
        systemArabic: fonts.defaultFor('ar'),
        latin: {
          inherit: !!config.get('fonts.latin-inherit'),
          family: config.get('fonts.latin-family') || '',
          size: Number(config.get('fonts.latin-size')) || 100,
          bold: !!config.get('fonts.latin-bold'),
          italic: !!config.get('fonts.latin-italic'),
        },
        arabic: {
          inherit: !!config.get('fonts.arabic-inherit'),
          family: config.get('fonts.arabic-family') || '',
          size: Number(config.get('fonts.arabic-size')) || 100,
          bold: !!config.get('fonts.arabic-bold'),
          italic: !!config.get('fonts.arabic-italic'),
        },
        available: fonts.installed(),
      },
    };
  });

  ipcMain.handle('settings:set-theme', (_, theme) => {
    setTheme(theme);
    return true;
  });

  ipcMain.handle('settings:set-autostart', (_, enable) => {
    setAutostart(enable);
    return true;
  });

  ipcMain.handle('settings:set', (_, key, value) => changeSetting(key, value));

  /* Whichever window asked, rather than the settings window by name: the same
     preload is behind both of them, and a Fonts window that closed the settings
     instead would be the funniest bug in this file. */
  ipcMain.on('settings:close', event => {
    const asked = BrowserWindow.fromWebContents(event.sender);
    if (asked && !asked.isDestroyed()) asked.close();
  });

  /* The one thing a font change can ask for that a stylesheet cannot do -- see
     changeSetting. Relaunched rather than merely restarted so the new process
     inherits FONTCONFIG_FILE and reads the document that was just rewritten;
     the file is the same path, so the retry guard at the top of this file sees
     nothing to do and the client comes back once, not twice. */
  ipcMain.on('settings:restart', () => {
    console.log('restarting at the settings window\'s request');
    quitting = true;
    app.relaunch();
    app.quit();
  });

  /* What the About window draws itself from. The versions underneath are worth
     having here rather than only in a log: they are the first thing anybody
     asks for in a bug report, and they are the one thing on that window that can
     be selected and copied. */
  ipcMain.handle('about:get', () => {
    /* Opening this window is the moment somebody wants to know, so it asks --
       unless it was told minutes ago, in which case the answer it already has is
       the same answer and appears without a wait. */
    const checkNow = aboutShouldCheck || Date.now() - lastUpdateAt > UPDATE_FRESH_MS;
    aboutShouldCheck = false;
    return {
      name: TITLE,
      version: currentVersion(),
      /* The launcher's own icon, read from data/ next to this file -- the same
         file the desktop draws, rather than a copy drawn for this window. */
      icon: `../data/icons/128/apps/${APP_ID}.png`,
      license: manifest.license,
      author: String(manifest.author || '').replace(/\s*<[^>]*>/, ''),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      theme: config.get('view.theme') || 'system',
      font: uiFont(),
      update: lastUpdate,
      checkNow,
    };
  });

  ipcMain.handle('about:check-update', () => new Promise(resolve => checkForUpdates(resolve)));

  ipcMain.on('about:open', (_, where) => openSite(where));

  ipcMain.on('about:close', () => {
    if (aboutWin && !aboutWin.isDestroyed()) {
      aboutWin.close();
    }
  });

  /* The font stack the page actually asks for. fontconfig is read once per
     process, so a family learned here takes effect on the next start -- which
     is the price of not having to guess what WhatsApp will name its font next. */
  ipcMain.on('wa:font-stack', (event, stack) => {
    if (!forcingFont() || typeof stack !== 'string') return;
    if (stack === pageFontStack) return;
    pageFontStack = stack;
    /* Applied straight away rather than on the next start: an @font-face alias
       is a stylesheet, and a stylesheet can be inserted into a page that is
       already open. */
    applyStyle();
    fonts.learn(app.getPath('userData'), stack.split(','));
  });

  /* Wrapped rather than passed: ipcMain hands the event in as the first
     argument, and showWindow's first argument is what the log says the raise
     was for. */
  ipcMain.on('wa:focus-request', () => showWindow('the page asked for the focus'));

  /* The page could not find WhatsApp's own modules for opening a chat, so it is
     asked for the page WhatsApp serves for the purpose. A reload, and the last
     resort: it is what still works on the morning those module names change. */
  ipcMain.on('wa:link-unresolved', (event, chat) => {
    const phone = links.digitsOf(chat && chat.phone);
    if (!phone || !win || win.isDestroyed()) return;
    const query = 'phone=' + encodeURIComponent(phone) +
                  (pendingText ? '&text=' + encodeURIComponent(pendingText) : '');
    pendingText = '';
    console.log('loading WhatsApp\'s own send page for +%s', phone);
    win.loadURL('https://web.whatsapp.com/send?' + query).catch(() => {});
  });

  /* The dialog the page could not draw, on the page WhatsApp draws it on. This
     is the old behaviour entire, and it is reached only when the modal's module
     names have stopped answering -- a reload, which is why it is last. */
  ipcMain.on('wa:invite-unresolved', (event, invite) => {
    const code = links.inviteOf(invite && invite.code);
    if (!code || !win || win.isDestroyed()) return;
    console.log('loading WhatsApp\'s own invite page for %s', code);
    win.loadURL('https://web.whatsapp.com/accept?code=' + encodeURIComponent(code)).catch(() => {});
  });

  /* The composer is up and empty, so the message the link carried can go in.
     Not with execCommand from the page: an evaluated script has no user gesture
     behind it and WhatsApp's editor takes the call and stays empty -- measured,
     and the same finding the #type probe in debug.js is written around.
     insertText goes in through the path a keyboard uses, and only this process
     can call it. */
  ipcMain.on('wa:composer-ready', () => {
    if (!pendingText || !win || win.isDestroyed()) return;
    win.webContents.focus();
    win.webContents.insertText(pendingText);
    console.log('put the link\'s message in the composer (%d characters)', pendingText.length);
    pendingText = '';
  });

  /* The chat list watcher nudges us for every message it sees land, which is what
     makes a banner per message possible at all. The document title cannot do that
     job: its number counts unread CHATS, so the second and third message from one
     person leave "(1) WhatsApp" exactly as it was and nothing fires. *  ipcMain.on('wa:arrival', event => {
    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    if (item && item.storeLive) return;
    if (!bannersAreOurs()) return;
    lastArrivalAt = Date.now();
    describeThenNotify(accId);
  });

  /* A notification WhatsApp Web itself decided to raise, intercepted in the page
     and handed over with the sender's picture already fetched. The click goes
     back to the page, whose own handler opens the conversation. */
  ipcMain.on('wa:page-notification', (event, note) => {
    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    if (item && item.storeLive) return;
    if (!note || !config.get('notifications.enabled')) return;

    const { sender, message: said, mark } = readBody(note.body, note.group);
    const message = mediaFromWords(said) || said;

    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    const banner = banners.show({
      identity: (accId !== 'default' ? accId + SEP : '') + [note.chat || note.title, sender, message].join(SEP),
      key: (accId !== 'default' ? accId + SEP : '') + (note.chat || note.title),
      title: bidi.paragraph(prefix + pushName(note.title)),
      body: bidi.line(sender, message, mark),
      redacted: bidi.words(mark, kindOf(message)),
      icon: note.avatar,
      onClick: () => {
        if (accId !== activeAccountId) switchToAccount(accId);
        showWindow('a banner was clicked');
        if (item && !item.view.webContents.isDestroyed())
          item.view.webContents.send('wa:notification-clicked', note.id);
      },
    });
    if (banner) {
      pageBanners.set(note.id, banner);
      while (pageBanners.size > 256) pageBanners.delete(pageBanners.keys().next().value);
      console.log('raised [%s]: %s', acc ? acc.name : accId, mark + (mediaFromWords(said) || 'a message of words'));
      if (note.silent) console.log('the page asked for a silent notification; the tone is played anyway');
      playTone();
    }
  });

  ipcMain.on('wa:page-notification-close', (event, note) => {
    if (!note) return;
    const banner = pageBanners.get(note.id);
    pageBanners.delete(note.id);
    if (!banner) return;
    if (unreadChatNames.has(banner.key)) {
      console.log('WhatsApp closed its notification for %s but the chat still has ' +
                  'something unread; leaving the banner up', banner.key);
      return;
    }
    banner.dispose();
    console.log('withdrew a notification for %s: WhatsApp closed it and the chat is caught up',
                banner.key);
  });

  /* ------------------------------------------------ WhatsApp's own store */

  ipcMain.on('wa:store-ready', (event, state) => {
    const ready = !!(state && state.ready);
    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    if (item) item.storeLive = ready;
    if (accId === activeAccountId) storeLive = ready;
    if (!ready) {
      console.log('WhatsApp\'s store for [%s] is not answering; the chat list watcher is in charge', accId);
      return;
    }
    if (item) item.unreadChatNames = new Set();
    unreadChatNames = new Set();
    for (const timer of withdrawing.values()) clearTimeout(timer);
    withdrawing.clear();
  });

  ipcMain.on('wa:store-message', (event, note) => {
    if (!note || !note.chat || !note.title) return;
    if (!storeBannersAreOurs()) return;

    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    chatTitles.set(note.chat, note.title);
    if (chatTitles.size > 512) chatTitles.delete(chatTitles.keys().next().value);

    const mark = note.mark ? note.mark.trim() : '';
    const said = [mark, note.text].filter(Boolean).join(' ');
    const aimed = note.aimed ? String(note.aimed).trim() : '';
    const body = note.join === 'space' ? bidi.did(note.sender, said, aimed)
                                       : bidi.line(note.sender, said, aimed);
    const banner = banners.show({
      identity: (accId !== 'default' ? accId + SEP : '') + note.msg,
      msgId: (accId !== 'default' ? accId + SEP : '') + note.msg,
      key: (accId !== 'default' ? accId + SEP : '') + note.chat,
      title: bidi.paragraph(prefix + note.title),
      body,
      redacted: bidi.words(aimed, note.redacted || mark || 'New message'),
      icon: note.avatar,
      onClick: () => {
        if (accId !== activeAccountId) switchToAccount(accId);
        showWindow('a banner was clicked');
        if (item && !item.view.webContents.isDestroyed())
          item.view.webContents.send('wa:store-open', { chat: note.chat, name: note.title,
                                                  preview: note.text, msg: note.msg,
                                                  story: !!note.story });
      },
    });
    if (!banner) return;
    console.log('raised [%s]: %s in %s%s', acc ? acc.name : accId,
                note.why === 'reaction' ? 'a reaction' : mark || 'a message of words',
                note.title, note.mention ? ' (addressed to you)' : '');
    playTone();
  });

  ipcMain.on('wa:store-ringing', (event, note) => {
    if (!note || !note.chat || !note.title || !note.call) return;
    if (!storeBannersAreOurs()) return;

    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    const acc = accountsMgr.getAccount(accId);
    const prefix = (accountsMgr.getAccounts().length > 1 && acc) ? `[${acc.name}] ` : '';

    chatTitles.set(note.chat, note.title);

    const banner = banners.show({
      identity: 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call,
      msgId: 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call,
      key: (accId !== 'default' ? accId + SEP : '') + note.chat,
      ongoing: true,
      title: bidi.paragraph(prefix + note.title),
      body: bidi.line(note.sender, note.mark),
      redacted: note.mark,
      icon: note.avatar,
      onClick: () => {
        if (accId !== activeAccountId) switchToAccount(accId);
        showWindow('a ringing banner was clicked');
        if (item && !item.view.webContents.isDestroyed())
          item.view.webContents.send('wa:store-open', { chat: note.chat, name: note.title });
      },
    });
    if (!banner) return;
    ringingBanners.add('ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call);
    console.log('ringing [%s]: %s in %s', acc ? acc.name : accId, note.mark, note.title);
  });

  ipcMain.on('wa:store-ring-over', (event, note) => {
    if (!note || !note.call || !banners) return;
    const accId = getAccountIdByWebContents(event.sender);
    const ringKey = 'ring' + SEP + (accId !== 'default' ? accId + SEP : '') + note.call;
    ringingBanners.delete(ringKey);
    if (banners.closeMessage(ringKey))
      console.log('the telephone has stopped ringing in %s',
                  chatTitles.get(note.chat) || note.chat);
  });

  ipcMain.on('wa:store-open-arrival', () => {
    if (!storeBannersAreOurs()) return;
    console.log('a message in the chat on screen: nothing raised, and nothing played');
  });

  ipcMain.on('wa:store-read', (event, state) => {
    if (!state) return;
    storeRead(state.chat, Number(state.unread) || 0);
  });

  ipcMain.on('wa:store-active', (event, state) => {
    if (!state) return;
    storeActive(state.chat || '');
  });

  ipcMain.on('wa:store-unread', (event, map) => {
    storeUnread(map);
  });

  ipcMain.on('wa:store-gone', (event, state) => {
    if (!state || !state.msg || !banners) return;
    const closed = banners.closeMessage(state.msg);
    if (!closed) return;
    console.log('withdrew %d notification(s) in %s: %s', closed,
                chatTitles.get(state.chat) || state.chat || 'a chat',
                String(state.msg).startsWith('reaction') ? 'the reaction is gone'
                                                         : 'the message was deleted');
  });

  ipcMain.on('wa:store-count', (event, count) => {
    if (!count || typeof count.messages !== 'number') return;
    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    if (item) item.unreadMessages = count.messages;
    if (accId === activeAccountId) unreadMessages = count.messages;
    accountsMgr.setUnreadCount(accId, count.messages);
    notifySidebarState();
    updateAggregateUnread();
  });

  ipcMain.on('wa:open-chat', (event, name) => {
    if (storeLive) return;
    openChat = typeof name === 'string' ? name : '';
    withdrawOpen();
  });

  ipcMain.on('wa:unread-chats', (event, names) => {
    if (storeLive) return;
    if (!Array.isArray(names) || !banners) return;
    unreadChatNames = new Set(names);
    const held = banners.keys();
    if (held.length)
      console.log('unread: [%s]; banners still up for: [%s]', names.join(', '), held.join(', '));
    for (const key of new Set([...held, ...withdrawing.keys()])) withdrawRead(key);
  });

  ipcMain.on('wa:unread-count', (event, count) => {
    if (!count || typeof count.messages !== 'number') return;
    const accId = getAccountIdByWebContents(event.sender);
    const item = accountViews.get(accId);
    if (item && item.storeLive) return;
    if (item) item.unreadMessages = count.messages;
    if (accId === activeAccountId) unreadMessages = count.messages;
    accountsMgr.setUnreadCount(accId, count.messages);
    notifySidebarState();
    updateAggregateUnread();
  });

  /* ---------------------------------------------------- Sidebar & Multi-Account IPC */

  ipcMain.handle('sidebar:get-state', () => {
    return {
      accounts: accountsMgr.getAccounts(),
      activeId: activeAccountId,
      theme: config.get('view.theme') || 'system',
      collapsed: sidebarCollapsed,
    };
  });

  ipcMain.on('sidebar:switch-account', (event, id) => {
    switchToAccount(id);
  });

  ipcMain.handle('sidebar:add-account', async (event, data) => {
    const acc = accountsMgr.addAccount(data);
    createAccountView(acc);
    switchToAccount(acc.id);
    notifySidebarState();
    return acc;
  });

  ipcMain.handle('sidebar:update-account', async (event, id, updates) => {
    const acc = accountsMgr.updateAccount(id, updates);
    const item = accountViews.get(id);
    if (item) item.account = acc;
    notifySidebarState();
    return acc;
  });

  ipcMain.handle('sidebar:remove-account', async (event, id) => {
    if (id === 'default') return false;
    if (activeAccountId === id) switchToAccount('default');
    const item = accountViews.get(id);
    if (item) {
      if (win && !win.isDestroyed() && win.contentView) {
        win.contentView.removeChildView(item.view);
      }
      try { item.view.webContents.close(); } catch (e) {}
      accountViews.delete(id);
    }
    try {
      const ses = session.fromPartition('persist:account_' + id);
      await ses.clearStorageData();
    } catch (e) {}
    accountsMgr.removeAccount(id);
    updateLayout();
    notifySidebarState();
    updateAggregateUnread();
    return true;
  });

  ipcMain.on('sidebar:context-menu', (event, id) => {
    const acc = accountsMgr.getAccount(id);
    if (!acc) return;
    const menu = new Menu();
    menu.append(new MenuItem({ label: acc.name, enabled: false }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Switch to this account / الانتقال لهذا الحساب',
      click: () => switchToAccount(id),
    }));
    if (id !== 'default') {
      menu.append(new MenuItem({
        label: 'Remove Account / حذف الحساب',
        click: async () => {
          const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Cancel', 'Remove / حذف'],
            defaultId: 1,
            cancelId: 0,
            title: 'Remove Account / حذف الحساب',
            message: `Are you sure you want to remove account "${acc.name}"? This will log out this session.`,
          });
          if (response === 1) {
            if (activeAccountId === id) switchToAccount('default');
            const item = accountViews.get(id);
            if (item) {
              if (win && !win.isDestroyed() && win.contentView) {
                win.contentView.removeChildView(item.view);
              }
              try { item.view.webContents.close(); } catch (e) {}
              accountViews.delete(id);
            }
            try {
              const ses = session.fromPartition('persist:account_' + id);
              await ses.clearStorageData();
            } catch (e) {}
            accountsMgr.removeAccount(id);
            updateLayout();
            notifySidebarState();
            updateAggregateUnread();
          }
        },
      }));
    }
    menu.popup({ window: win });
  });

  ipcMain.on('sidebar:set-collapsed', (event, collapsed) => {
    sidebarCollapsed = !!collapsed;
    config.set('view.sidebar-collapsed', sidebarCollapsed);
    config.save();
    updateLayout();
    if (sidebarView && !sidebarView.webContents.isDestroyed()) {
      sidebarView.webContents.send('sidebar:collapsed-changed', sidebarCollapsed);
    }
  });

  ipcMain.on('sidebar:open-add-dialog', () => {
    openAddAccountWindow();
  });

  // Settings accounts IPC
  ipcMain.handle('accounts:get', () => accountsMgr.getAccounts());
  ipcMain.handle('accounts:get-active', () => activeAccountId);
  ipcMain.handle('accounts:switch', async (event, id) => {
    switchToAccount(id);
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    return true;
  });
  ipcMain.handle('accounts:add', async (event, data) => {
    const acc = accountsMgr.addAccount(data);
    createAccountView(acc);
    switchToAccount(acc.id);
    notifySidebarState();
    return acc;
  });
  ipcMain.handle('accounts:remove', async (event, id) => {
    if (id === 'default') return false;
    if (activeAccountId === id) switchToAccount('default');
    const item = accountViews.get(id);
    if (item) {
      if (win && !win.isDestroyed() && win.contentView) {
        win.contentView.removeChildView(item.view);
      }
      try { item.view.webContents.close(); } catch (e) {}
      accountViews.delete(id);
    }
    try {
      const ses = session.fromPartition('persist:account_' + id);
      await ses.clearStorageData();
    } catch (e) {}
    accountsMgr.removeAccount(id);
    updateLayout();
    notifySidebarState();
    updateAggregateUnread();
    return true;
  });
};

/* Where the chooser opens: the folder the last download was pointed at, and
   ~/Downloads until there has been one. Checked rather than trusted -- a folder
   remembered from a removable disk that is not mounted this time would open the
   dialog on nothing. */
const downloadStart = () => {
  const kept = String(config.get('media.download-dir') || '');
  try { if (kept && fs.statSync(kept).isDirectory()) return kept; } catch (e) {}
  return app.getPath('downloads');
};

const rememberDownloadDir = dir => {
  if (!dir || dir === config.get('media.download-dir')) return;
  config.set('media.download-dir', dir);
  config.save();
};

/* A download asks where it should go, every time.
 *
 * This used to drop every file in ~/Downloads without a word, on the reasoning
 * that a phone does the same. The owner asked for the chooser instead -- "لما
 * اعمل download لحاجه ... يقولي اختار الفولدر اللي عايز تعمل download فيه
 * وتيجي كل مره" -- and this is the half a phone gets wrong on a desktop: a
 * file saved somewhere you chose is filed, and a file in ~/Downloads is one
 * more thing to find later.
 *
 * The dialog is not raised here. Electron shows the desktop's own save dialog
 * for any download whose save path is left unset, so the work is to NOT set one
 * and to dress the dialog it puts up: the name WhatsApp sent, in the folder the
 * last one went to. Cancelling it cancels the download, which is Chromium's
 * behaviour and the right one -- there is nowhere to put the file.
 *
 * With the switch off it goes back to what it did: ~/Downloads, no dialog, and
 * a number on the end of a name that is already taken rather than a file
 * quietly written over. */
function wireDownloads(ses) {
  ses.on('will-download', (event, item) => {
    const name = item.getFilename();

    if (config.get('media.ask-where-to-save') !== false) {
      item.setSaveDialogOptions({ defaultPath: path.join(downloadStart(), name) });
      item.once('done', (e, state) => {
        /* Cancelled is the dialog waved away, and it is a normal answer here
           rather than a failure: nothing is saved, and the log says which of
           the two happened so a missing file is not a mystery. */
        if (state !== 'completed') { console.log('download %s: %s', state, name); return; }
        const saved = item.getSavePath();
        console.log('downloaded %s', saved);
        rememberDownloadDir(path.dirname(saved));
      });
      return;
    }

    const downloads = app.getPath('downloads');
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    let target = path.join(downloads, name);
    for (let n = 1; fs.existsSync(target); n++) target = path.join(downloads, `${stem} (${n})${ext}`);
    item.setSavePath(target);
    item.once('done', (e, state) => {
      if (state === 'completed') console.log('downloaded %s', target);
    });
  });
};

/* WhatsApp asks for notifications, for the microphone and camera when a call
   starts, and for the clipboard when something is pasted. Nothing else is
   granted: this window shows one site and has no address bar to explain a
   prompt from anywhere else. */
const ALLOWED_PERMISSIONS = new Set([
  'notifications', 'media', 'audioCapture', 'videoCapture',
  'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture',
  'speaker-selection', 'mediaKeySystem', 'idle-detection', 'window-management',
]);

function wirePermissions(ses) {
  /* The origin is checked as well as the permission, and the check is written to
     survive not being told one. Chromium hands over an empty requestingUrl for
     the media request a call starts with, and an earlier version of this read
     that as "not WhatsApp" and refused the camera -- which is why the check was
     taken out altogether. It is back, with isWhatsApp answering true for the
     empty, blob: and about: URLs that are this window's own. Without it, an
     <iframe> of somebody else's making asks for the microphone and is given
     it. */
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (contents && contents.getURL()) || '';
    callback(isWhatsApp(url) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((contents, permission, origin, details) =>
    isWhatsApp(origin || '') && ALLOWED_PERMISSIONS.has(permission));
  /* This one is not about the camera. It decides which USB, HID and serial
     devices a page may open, and WhatsApp Web asks for none of them -- so the
     answer is scoped to the one origin this window shows rather than left as a
     blanket yes to anything that finds its way into it. */
  ses.setDevicePermissionHandler(details =>
    isWhatsApp((details && details.origin) || ''));
}

/* Screen sharing during calls. WhatsApp Web calls getDisplayMedia() when the user
   presses the share-screen button in a call, and Electron does not forward that to
   the compositor on its own -- the page must ask the main process for a source, or
   the request silently goes nowhere. The entire screen is handed over without a
   picker: WhatsApp's own UI already tells the user what they are sharing, and a
   system dialog on top of that would be a speed bump. PipeWire is the path it takes
   on Wayland, and the WebRTCPipeWireCapturer flag in the switches above is what
   enables that. */
function wireScreenSharing(ses) {
  /* Electron will not forward getDisplayMedia anywhere without a handler, so the
     share-screen button in a call silently does nothing until one is set. What
     the handler must never do is fail to answer: a callback that is not called
     leaves the page waiting for ever, which looks exactly like a button that
     does nothing -- the very thing this is here to fix.

     useSystemPicker asks Chromium to run the platform's own chooser and skip
     this handler entirely where it can. That is the right answer wherever it is
     available, and the handler below is what happens where it is not. */
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    /* Wayland picks in the compositor, not here.
     *
     * desktopCapturer.getSources() on a Wayland session goes out to
     * xdg-desktop-portal and waits -- and measured on this session it never came
     * back, for screens and for windows alike, with an eight second ceiling on
     * the measurement. A handler built on it is a handler that never answers,
     * which is how "screen sharing was added" and screen sharing did not work.
     *
     * There is nothing to enumerate anyway. Under WebRTCPipeWireCapturer the
     * portal puts up its own chooser when the stream starts, and it is the only
     * thing on a Wayland session allowed to say what may be captured. So the
     * request is answered at once with the screen Chromium will hand to the
     * portal, and the user picks in the dialog the compositor draws. */
    if (onWayland) {
      console.log('screen sharing: handing the choice to the desktop portal');
      callback({ video: { id: 'screen:0:0', name: 'Entire screen' } });
      return;
    }

    /* X11, where enumeration is local and answers immediately. Windows as well
       as screens: WhatsApp's own button offers both, and a handler that only
       ever answers with a screen turns "share this window" into "share
       everything", which is a privacy bug rather than a missing feature. */
    try {
      const sources = await Promise.race([
        desktopCapturer.getSources({ types: ['screen', 'window'], fetchWindowIcons: false }),
        /* Belt and braces. Whatever else happens, this handler answers. */
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]);
      if (!sources) {
        console.warn('screen sharing: the desktop did not answer in time');
        callback({ video: null });
        return;
      }
      const source = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      if (!source) {
        console.warn('screen sharing: nothing to share -- no screen or window source');
        callback({ video: null });
        return;
      }
      console.log('screen sharing: handing over "%s"', source.name);
      /* No audio. `loopback` is the system-audio capture Electron implements on
         Windows and nowhere else; passing it here is at best ignored, and the
         microphone is already in the call. */
      callback({ video: source });
    } catch (err) {
      console.warn('screen sharing failed: %s', err.message);
      callback({ video: null });
    }
  }, { useSystemPicker: true });
}

/* WhatsApp Web keys the client it thinks it is talking to off the user agent, and
   the Electron one is not a browser it knows. A plain Chrome string is: the same
   page, the same features, and the device registers as Chrome on Linux rather
   than as something WhatsApp has never heard of. */
function chromeUserAgent() {
  const chrome = process.versions.chrome.split('.')[0];
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
         `Chrome/${chrome}.0.0.0 Safari/537.36`;
}

function configureSession(ses) {
  const ua = chromeUserAgent();
  ses.setUserAgent(ua);
  wireDownloads(ses);
  wirePermissions(ses);
  wireScreenSharing(ses);
  if (config.get('behaviour.spellcheck')) {
    try { ses.setSpellCheckerLanguages(['en-US']); } catch (e) {}
  }
}

app.on('second-instance', (event, argv) => {
  /* Where a whatsapp: link lands. xdg-open starts a second copy with the URL on
     its command line; the lock sends that copy home and its argv arrives here. */
  const link = links.inArgv(argv);
  if (link) { openLink(link, 'a link from the desktop'); return; }
  /* A whatsapp: URL this client cannot act on still raised the window and did
     nothing else, which reads from the outside as the link having been eaten --
     and for group invites it was exactly that, for a year. There is nowhere to
     send one, because this client holds the scheme and the browser would hand it
     straight back, so the verb goes in the log instead: the next report of a
     link that went nowhere then says which one. */
  for (const arg of argv) {
    const verb = links.unhandled(arg);
    if (verb) console.log('nothing here opens a whatsapp: "%s" link', verb);
  }
  /* A --hidden launch that finds one already running exits without raising the
     window: that is the login autostart arriving on top of a client the user
     started themselves. */
  if (!argv.includes('--hidden')) showWindow('a second copy was started');
});

/* macOS delivers the same thing as an event rather than as argv. Nothing here
   runs there yet, and one line costs less than the next person finding out. */
app.on('open-url', (event, url) => {
  const link = links.from(url);
  if (!link) return;
  event.preventDefault();
  openLink(link, 'a link from the desktop');
});

app.on('window-all-closed', () => {
  /* Nothing to do: the window hides rather than closes, and quitting is what
     Ctrl+Q and the tray's Quit are for. */
});

app.on('before-quit', () => {
  quitting = true;
  /* The tray keeps a gdbus monitor alive to notice a status icon host coming and
     going; nothing else would take it down. */
  if (tray) tray.destroy();
});

app.whenReady().then(() => {
  sweepAvatars();

  const ua = chromeUserAgent();
  app.userAgentFallback = ua;
  const ses = session.defaultSession;
  ses.setUserAgent(ua);
  wireDownloads(ses);
  wirePermissions(ses);
  wireScreenSharing(ses);

  if (config.get('behaviour.spellcheck')) {
    try { ses.setSpellCheckerLanguages(['en-US']); } catch (e) {}
  }

  const initialTheme = config.get('view.theme') || 'system';
  if (initialTheme === 'dark') {
    nativeTheme.themeSource = 'dark';
  } else if (initialTheme === 'light') {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
  }

  banners = new Banners({
    seconds: Number(config.get('notifications.banner-seconds')) || 12,
    appIcon,
    hidePreview: !!config.get('notifications.hide-preview'),
    /* Which messages have already been announced, so a restart does not put the
       whole unread backlog back on screen as though it had just arrived. */
    stateFile: path.join(app.getPath('userData'), 'announced.json'),
  });

  wireIpc();
  createWindow();

  /* The scheme, and the link that may have asked for this window in the first
     place. Both after createWindow, because the second one needs somewhere to
     put the chat. */
  console.log('whatsapp: links -> %s',
              links.claim(app, APP_ID, { enabled: config.get('links.claim-scheme') !== false }));
  const launchedFor = links.inArgv(process.argv);
  if (launchedFor) openLink(launchedFor, 'the link this client was started for');

  tray = new TrayIcon({
    normal: iconFile(24, `status/${APP_ID}-tray.png`),
    attention: iconFile(24, `status/${APP_ID}-tray-attention.png`),
    onToggle: toggleWindow,
    /* Shown and put away are separate here, rather than one toggle, because the
       menu decides which of the two it is offering when it opens and the click
       has to do what the word said -- not what has become true in the seconds
       the menu spent open. */
    onShow: () => showWindow('the tray'),
    onHide: hideWindow,
    /* Asked again as the menu opens, so the item cannot be caught wearing the
       wrong word because an event went missing. */
    getInFront: windowInFront,
    onQuit: quit,
    onSettings: () => openSettings(),
    /* The tray's own way to the fonts -- a window of their own, which is what
       the item says and what the owner asked for. */
    onFonts: () => openFonts(),
    onAbout: () => openAbout(),
    /* Read as the menu is drawn, so the item names a release the daily check
       found without anything having to push it there. */
    getUpdate: () => lastUpdate,
    title: TITLE,
    appId: APP_ID,
  });
  /* The tray is built after the window, so the events that would have told it
     where the window is have already been and gone. */
  tray.setInFront(windowInFront());

  /*
   * One quiet look for a newer version, and then one a day.
   *
   * Nothing is downloaded and nothing pops up: all this can do is put a version
   * on the tray's own item, where somebody who opens the menu will see it. A
   * client installed from a repository whose metadata has not been refreshed
   * otherwise has no way to know a release went out at all. Turn it off with
   * `check = false` under `[updates]` in the config file.
   *
   * Late, rather than at startup: the first seconds belong to the window and to
   * WhatsApp's own connection, and this question can wait for them.
   */
  if (config.get('updates.check') !== false) {
    setTimeout(() => checkForUpdates(), UPDATE_FIRST_MS);
    setInterval(() => checkForUpdates(), UPDATE_EVERY_MS);
  }

  debug.install(() => win, () => banners,
                { show: () => showWindow('the debug rig'), toggle: toggleWindow,
                  onScreen: windowOnScreen,
                  inFront: windowInFront, settings: openSettings, fonts: openFonts,
                  set: changeSetting,
                  about: openAbout, checkUpdate: checkForUpdates,
                  pretendVersion: version => { pretendVersion = version; },
                  lastUpdate: () => lastUpdate });

  /* Follow the desktop live: a theme switched from light to dark, or a font
     changed in Settings, should not need the client restarted. */
  desktop.watch(['color-scheme', 'font-name'], key => {
    if (key === 'color-scheme') {
      if ((config.get('view.theme') || 'system') === 'system') {
        nativeTheme.themeSource = desktop.prefersDark() ? 'dark' : 'light';
      }
    } else {
      applyStyle();
    }
  });
});
