/*
 * Right-hand drawer sliding animation and Escape key navigation for panels, menus, and conversations.
 */
'use strict';

const { strip } = require('./rows.js');
const { press } = require('./navigation.js');
const panels = require('../panels.js');

const DRAWER = '[data-testid="drawer-right"]';
const SLIDE_MS = 200;

const ANSWERED_MS = 60;
const WATCH_MS = 8;
const DRIFT = 8;

const OPEN_LAYER = '[role="menu"], [role="listbox"], [role="application"]';
const SELECTING = 'input[type="checkbox"]';
const CANCELLABLE = /close|cancel/i;
const CLOSE_LABEL = /^(close chat|إغلاق الدردشة|إغلاق المحادثة)$/i;

const slideOffset = (panel, width) => {
  const box = panel.getBoundingClientRect();
  if (!(box.width > 0)) return 0;
  const middle = (box.left + box.right) / 2;
  const w = typeof width === 'number' ? width : (typeof innerWidth !== 'undefined' ? innerWidth : 800);
  return Math.round(middle > w / 2 ? box.width : -box.width);
};

const slideTheDrawer = win => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  if (typeof w.addEventListener !== 'function') return;

  let drawerSlide = null;

  w.addEventListener('animationstart', event => {
    const panel = event.target;
    if (!panel || !panel.matches || !panel.matches(DRAWER)) return;
    if (typeof panel.animate !== 'function') return;

    let tries = 3;
    const start = () => {
      let offset = 0;
      try { offset = slideOffset(panel, w.innerWidth); } catch (err) { return; }
      if (!offset) {
        if (--tries > 0 && typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(start);
        return;
      }
      try {
        if (drawerSlide) drawerSlide.cancel();
        drawerSlide = panel.animate(
          [{ transform: 'translate3d(' + offset + 'px, 0, 0)', opacity: 0 },
           { transform: 'none', opacity: 1 }],
          { duration: SLIDE_MS, easing: 'cubic-bezier(0.16, 0.84, 0.44, 1)' });
      } catch (err) { /* an older engine: the drawer simply appears */ }
    };
    if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(start);
  }, true);
};

const chatListCovered = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return false;
  const pane = d.querySelector('#pane-side');
  if (!pane) return false;
  const box = pane.getBoundingClientRect();
  if (!box.width || !box.height) return false;
  if (typeof d.elementFromPoint !== 'function') return false;
  const on = d.elementFromPoint(Math.round(box.left + box.width / 2),
                                Math.round(box.top + box.height / 2));
  return !!on && !pane.contains(on);
};

const somethingElseIsUp = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return false;
  const main = d.querySelector('#main');
  if (!main) return true;
  if (d.querySelector(OPEN_LAYER)) return true;
  if (main.querySelector(SELECTING)) return true;
  for (const dialog of d.querySelectorAll('#app [role="dialog"]'))
    if (!main.contains(dialog)) return true;
  const footer = main.querySelector('footer');
  if (footer) {
    for (const title of footer.querySelectorAll('svg title'))
      if (CANCELLABLE.test(strip(title.textContent))) return true;
  }
  return chatListCovered(d);
};

const layers = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return { menus: 0, dialogs: 0, panels: 0, nodes: 0 };
  const app = d.querySelector('#app') || d.body;
  return {
    menus: d.querySelectorAll('[role="menu"]').length,
    dialogs: d.querySelectorAll('[role="dialog"]').length,
    panels: d.querySelectorAll('[role="application"]').length,
    nodes: app ? app.querySelectorAll('*').length : 0,
  };
};

const same = (a, b) => a.menus === b.menus && a.dialogs === b.dialogs &&
                       a.panels === b.panels && Math.abs(a.nodes - b.nodes) <= DRIFT;

const closeItem = (doc, log) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const logger = typeof log === 'function' ? log : () => {};
  const items = [...d.querySelectorAll('[role="menuitem"]')];
  const byIcon = items.filter(item => {
    const title = item.querySelector('svg title');
    return title && strip(title.textContent) === 'ic-cancel';
  });
  if (byIcon.length === 1) return byIcon[0];
  if (byIcon.length > 1) {
    logger('the conversation menu draws ' + byIcon.length + ' items that could close it; none pressed');
    return null;
  }
  return items.find(item => CLOSE_LABEL.test(strip(item.getAttribute('aria-label')))) || null;
};

const hideMenus = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return () => {};
  const style = d.createElement('style');
  style.textContent = '[role="menu"] { opacity: 0 !important; }';
  (d.head || d.documentElement).appendChild(style);
  let dropped = false;
  const drop = () => { if (dropped) return; dropped = true; try { style.remove(); } catch (err) {} };
  setTimeout(drop, 1500);
  return drop;
};

const menuButton = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const header = d.querySelector('#main header');
  if (!header) return null;
  for (const el of header.querySelectorAll('button, [role="button"]'))
    if (el.getAttribute('aria-haspopup') === 'menu') return el;
  return null;
};

const closeByCommand = () => {
  try {
    const module = typeof window !== 'undefined' && typeof window.require === 'function' && window.require('WAWebCmd');
    const Cmd = module && module.Cmd;
    if (!Cmd || typeof Cmd.closeActiveChat !== 'function') return false;
    Cmd.closeActiveChat();
    return true;
  } catch (err) {
    return false;
  }
};

const gone = async (doc, ms) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const until = Date.now() + ms;
  while (d && d.querySelector('#main') && Date.now() < until) await new Promise(r => setTimeout(r, 4));
  return !(d && d.querySelector('#main'));
};

const closeConversation = async (doc, win, log) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const logger = typeof log === 'function' ? log : () => {};

  if (closeByCommand() && await gone(d, 200)) {
    logger('Escape closed nothing, so the conversation was closed by WhatsApp\'s own command');
    return;
  }

  const button = menuButton(d);
  if (!button) { logger('Escape closed nothing and the conversation menu cannot be found'); return; }

  const show = hideMenus(d);
  try {
    press(button, panels.deepestIn(button), win);
    let menu = null;
    const until = Date.now() + 500;
    while (!menu && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 2));
      menu = d.querySelector('[role="menu"]');
    }
    if (!menu) { logger('Escape closed nothing and the conversation menu did not open'); return; }

    const item = closeItem(d, log);
    if (!item) { logger('Escape closed nothing and the menu has no "close chat" in it'); return; }

    press(item, panels.deepestIn(item), win);
    logger('Escape closed nothing, so the conversation was closed from its own menu');
  } finally {
    show();
  }
};

const setupEscapeHandler = (win, doc, log) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!w.addEventListener || !d) return;
  const logger = typeof log === 'function' ? log : () => {};

  let closing = false;
  const conversation = () => d.querySelector('#main');

  w.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!panels.emojiPanel(d)) {
      if (closing || !conversation()) return;
      if (somethingElseIsUp(d)) return;

      const before = layers(d);
      const until = Date.now() + ANSWERED_MS;
      const watch = () => {
        if (closing || !conversation() || !same(layers(d), before)) return;
        if (Date.now() < until) { setTimeout(watch, WATCH_MS); return; }
        closing = true;
        closeConversation(d, w, logger)
          .catch(err => logger('could not close the conversation: ' + err.message))
          .then(() => { closing = false; });
      };
      setTimeout(watch, WATCH_MS);
      return;
    }

    const button = panels.panelButton(d, strip);
    if (!button) { logger('the emoji panel is open and its button cannot be found'); return; }

    event.preventDefault();
    event.stopPropagation();
    press(button, panels.deepestIn(button), w);
    const box = panels.composer(d);
    if (box) { try { box.focus(); } catch (err) {} }
  }, true);
};

module.exports = {
  DRAWER,
  SLIDE_MS,
  ANSWERED_MS,
  WATCH_MS,
  DRIFT,
  OPEN_LAYER,
  SELECTING,
  CANCELLABLE,
  CLOSE_LABEL,
  slideOffset,
  slideTheDrawer,
  chatListCovered,
  somethingElseIsUp,
  layers,
  same,
  closeItem,
  hideMenus,
  menuButton,
  closeByCommand,
  closeConversation,
  setupEscapeHandler,
};
