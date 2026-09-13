/*
 * Smooth motion for the reply bar over the composer, coordinated with conversation scrolling.
 */
'use strict';

const PANEL = 'footer [data-testid="popup_panel"]';
const PANEL_IN_MS = 220;
const PANEL_OUT_MS = 90;
const PANEL_BACK_MS = 200;
const PANEL_REVEAL_MS = 150;
const PANEL_WATCH_MS = 450;
const PANEL_IN = 'cubic-bezier(0.16, 0.84, 0.44, 1)';
const PANEL_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
const PANEL_SETTLE_MS = 1200;
const ARRIVAL_HANDOVER_MS = 160;

const CONVERSATION_LIST = '[data-testid="conversation-panel-messages"]';

const barHeight = panel => {
  const inside = panel.firstElementChild;
  if (!inside) return 0;
  const style = getComputedStyle(inside);
  return Math.round(inside.getBoundingClientRect().height +
    (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
};

const rowsInside = scroller =>
  [...scroller.children].find(kid => kid.querySelector('[role="row"]')) || null;

const roomBehind = panel => {
  for (let where = panel.parentElement; where; where = where.parentElement) {
    const scroller = where.querySelector(CONVERSATION_LIST);
    if (scroller) return { scroller: scroller, list: rowsInside(scroller) };
  }
  return null;
};

let moves = 0;
const claim = element => (element.__waMove = ++moves);

const park = (element, at, dim) => {
  claim(element);
  element.style.transition = 'none';
  element.style.transform = 'translateY(' + at + 'px)';
  if (dim) element.style.opacity = '0';
};

const letGo = (element, ms, easing, dim) => {
  void element.offsetHeight;
  element.style.transition = 'transform ' + ms + 'ms ' + easing +
    (dim ? ', opacity ' + Math.round(ms * 0.6) + 'ms linear' : '');
  element.style.transform = '';
  if (dim) element.style.opacity = '';
  const mine = claim(element);
  setTimeout(() => { if (element.__waMove === mine) element.style.transition = ''; },
             ms + 90);
};

const liftOf = element => {
  const shape = getComputedStyle(element).transform;
  if (!shape || shape.indexOf('(') < 0) return 0;
  const numbers = shape.slice(shape.indexOf('(') + 1, -1).split(',').map(parseFloat);
  if (numbers.length === 6) return numbers[5] || 0;
  if (numbers.length === 16) return numbers[13] || 0;
  return 0;
};

const followTheRoom = (panel, ms, andThen) => {
  const room = roomBehind(panel);
  let watch = null;
  let over = false;
  let told = false;
  let began = 0;
  const tell = () => { if (told) return; told = true; if (andThen) andThen(); };
  const stop = () => { over = true; if (watch) { watch.disconnect(); watch = null; } };
  const w = (typeof window !== 'undefined' ? window : globalThis);
  const ResizeObserverImpl = w.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
  if (room && room.list && typeof ResizeObserverImpl === 'function') {
    let was = room.scroller.clientHeight;
    const wasTop = room.list.getBoundingClientRect().top - liftOf(room.list);
    try {
      watch = new ResizeObserverImpl(() => {
        const now = room.scroller.clientHeight;
        const delta = now - was;
        was = now;
        if (over || !delta) return;
        const lift = liftOf(room.list);
        const shift = began ? -delta
                            : Math.round(room.list.getBoundingClientRect().top - lift - wasTop);
        const left = began ? Math.max(90, ms - Math.round(performance.now() - began)) : ms;
        if (!began) began = performance.now();
        tell();
        if (!shift) return;
        park(room.list, lift - shift);
        letGo(room.list, left, PANEL_IN);
      });
      watch.observe(room.scroller);
    } catch (err) { watch = null; }
  }
  setTimeout(tell, PANEL_REVEAL_MS);
  setTimeout(stop, PANEL_WATCH_MS);
  return { stop: stop };
};

const setupComposerBar = (win, doc, sharedBarState) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  if (!w.addEventListener) return;

  const barState = sharedBarState || { barLeftAt: 0, barLeaving: null };

  w.addEventListener('animationstart', event => {
    const panel = event.target;
    if (!panel || !panel.matches || !panel.matches(PANEL)) return;
    if (typeof panel.animate !== 'function') return;

    const inside = panel.firstElementChild;
    if (!inside) return;

    let height = 0;
    try { height = barHeight(panel); } catch (err) { return; }
    if (!height) return;

    let hold = null;
    const holdAt = to => {
      try {
        const next = panel.animate([{ maxHeight: to, transform: 'none' }],
                                   { duration: 1, fill: 'forwards' });
        if (hold) hold.cancel();
        hold = next;
        return true;
      } catch (err) { return false; }
    };

    park(inside, height, true);
    if (!holdAt(height + 'px')) {
      inside.style.transition = '';
      inside.style.transform = '';
      inside.style.opacity = '';
      return;
    }

    let follow = followTheRoom(panel, PANEL_IN_MS,
                               () => letGo(inside, PANEL_IN_MS, PANEL_IN, true));

    let timer = 0;
    let watch = null;
    let last = 0;

    const release = () => {
      clearTimeout(timer);
      if (hold) { hold.cancel(); hold = null; }
    };

    const shut = () => {
      barState.barLeftAt = performance.now();
      barState.barLeaving = panel;
      setTimeout(() => { if (barState.barLeaving === panel) barState.barLeaving = null; },
                 ARRIVAL_HANDOVER_MS);
      clearTimeout(timer);
      if (watch) { watch.disconnect(); watch = null; }
      follow.stop();
      const from = Math.round(panel.getBoundingClientRect().height) || height;
      holdAt(from + 'px');

      inside.style.transition = 'transform ' + PANEL_OUT_MS + 'ms ' + PANEL_OUT +
        ', opacity ' + Math.round(PANEL_OUT_MS * 0.7) + 'ms linear';
      inside.style.transform = 'translateY(' + Math.round(from / 4) + 'px)';
      inside.style.opacity = '0';

      setTimeout(() => {
        follow = followTheRoom(panel, PANEL_BACK_MS, null);
        holdAt('0px');
      }, PANEL_OUT_MS);
    };

    timer = setTimeout(() => holdAt('none'), PANEL_SETTLE_MS);
    const MutationObserverImpl = w.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (MutationObserverImpl) {
      watch = new MutationObserverImpl(() => {
        const now = parseFloat(panel.style.maxHeight) || 0;
        if (now < last) { shut(); return; }
        last = now;
        if (hold && now >= height &&
            /translateY\(0(?:px)?\)/.test(panel.style.transform || '')) release();
      });
      watch.observe(panel, { attributes: true, attributeFilter: ['style'] });
    }
  }, true);

  return barState;
};

module.exports = {
  PANEL,
  PANEL_IN_MS,
  PANEL_OUT_MS,
  PANEL_BACK_MS,
  PANEL_REVEAL_MS,
  PANEL_WATCH_MS,
  PANEL_IN,
  PANEL_OUT,
  PANEL_SETTLE_MS,
  CONVERSATION_LIST,
  barHeight,
  rowsInside,
  roomBehind,
  park,
  letGo,
  liftOf,
  followTheRoom,
  setupComposerBar,
};
