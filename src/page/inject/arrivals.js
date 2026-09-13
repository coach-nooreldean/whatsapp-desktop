/*
 * Message arrival transitions in the open conversation (bubble scaling pop and compositor glide).
 */
'use strict';

const { CONVERSATION_LIST, rowsInside, park, letGo, liftOf, PANEL_IN } = require('./composer-bar.js');

const ARRIVAL_GLIDE_MS = 260;
const ARRIVAL_POP_MS = 300;
const ARRIVAL_POP = 'cubic-bezier(0.34, 1.28, 0.64, 1)';
const ARRIVAL_POP_SCALE = 0.12;
const ARRIVAL_POP_TRAVEL = 64;
const ARRIVAL_SETTLE_MS = 400;
const ARRIVAL_PIN_SLACK = 3;
const ARRIVAL_ADOPT_MS = 600;
const POP_SCALE_VAR = '--whatsapp-desktop-pop';

const POP_KEYFRAMES = `@keyframes whatsapp-desktop-arrival {
  from { opacity: 0; transform: scale(var(${POP_SCALE_VAR}, 0.88)); }
  55%  { opacity: 1; }
  to   { opacity: 1; transform: none; }
}`;

const ARRIVAL_LOOK_MS = 60;
const ARRIVAL_HANDOVER_MS = 160;
const ARRIVAL_PENDING_MS = 60;

let popSheet = null;
const keyframesReady = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return false;
  if (popSheet && popSheet.isConnected) return true;
  const head = d.head || d.documentElement;
  if (!head) return false;
  popSheet = d.createElement('style');
  popSheet.textContent = POP_KEYFRAMES;
  head.appendChild(popSheet);
  return true;
};

let stillness = null;
const stillnessAsked = win => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  if (!stillness && typeof w.matchMedia === 'function') {
    try { stillness = w.matchMedia('(prefers-reduced-motion: reduce)'); }
    catch (err) { return false; }
  }
  return stillness ? stillness.matches : false;
};

const popTheBubble = (bubble, scroller, doc, win) => {
  if (!keyframesReady(doc)) return;
  const box = bubble.getBoundingClientRect();
  const room = scroller.getBoundingClientRect();
  if (!(box.width > 0)) return;
  if (box.bottom < room.top || box.top > room.bottom) return;

  const near = (room.right - box.right) <= (box.left - room.left) ? '100%' : '0%';
  const reach = Math.max(box.width, box.height, 1);
  const from = 1 - Math.min(ARRIVAL_POP_SCALE, ARRIVAL_POP_TRAVEL / reach);

  bubble.style.setProperty(POP_SCALE_VAR, from.toFixed(3));
  bubble.style.transformOrigin = near + ' 100%';
  bubble.style.animation = 'whatsapp-desktop-arrival ' + ARRIVAL_POP_MS + 'ms ' +
                           ARRIVAL_POP + ' both';

  let over = false;
  const done = event => {
    if (event && event.target !== bubble) return;
    if (over) return;
    over = true;
    bubble.removeEventListener('animationend', done);
    bubble.style.removeProperty(POP_SCALE_VAR);
    bubble.style.animation = '';
    bubble.style.transformOrigin = '';
  };
  bubble.addEventListener('animationend', done);
  setTimeout(done, ARRIVAL_POP_MS + 250);
};

const footerOver = scroller => {
  for (let where = scroller.parentElement; where; where = where.parentElement) {
    const foot = where.querySelector('footer');
    if (foot) return foot;
  }
  return null;
};

const replyBarOver = scroller => {
  const foot = footerOver(scroller);
  const panel = foot && foot.querySelector('[data-testid="popup_panel"]');
  return !!panel && panel.getBoundingClientRect().height > 0;
};

const replyBarLeaving = (scroller, barState) => {
  if (!barState || !barState.barLeaving || performance.now() - barState.barLeftAt > ARRIVAL_HANDOVER_MS) return false;
  const foot = footerOver(scroller);
  return !!foot && foot.contains(barState.barLeaving);
};

const listsOnPage = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return [];
  const out = [];
  for (const scroller of d.querySelectorAll(CONVERSATION_LIST)) {
    const list = rowsInside(scroller);
    if (list) out.push({ scroller: scroller, list: list });
  }
  return out;
};

const setupArrivals = (win, doc, barState) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!w || !d) return () => {};

  const watched = [];

  const adoptArrivals = (scroller, list) => {
    const since = performance.now();
    let marks = [];
    let scrolledFrom = 0;

    const marksOn = lift => {
      const rows = list.querySelectorAll('[role="row"]');
      marks = [];
      for (const back of [1, 2, 4, 8]) {
        const row = rows[rows.length - back];
        if (row) marks.push({ row: row, top: row.getBoundingClientRect().top - lift });
      }
      scrolledFrom = scroller.scrollTop;
    };

    const travelled = lift => {
      for (const mark of marks) {
        if (!mark.row.isConnected) continue;
        return Math.round(mark.top - (mark.row.getBoundingClientRect().top - lift));
      }
      return null;
    };

    try { marksOn(0); } catch (err) { return; }

    list.style.willChange = 'transform';

    const shown = new Set();
    const nameOfRow = row => {
      const tag = row.querySelector('[data-id]');
      return tag ? tag.getAttribute('data-id') : '';
    };

    let pending = [];

    const MutationObserverImpl = w.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    const watch = MutationObserverImpl ? new MutationObserverImpl(records => {
      if (performance.now() - since < ARRIVAL_SETTLE_MS) return;
      if (stillnessAsked(w)) return;

      let any = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 &&
              (node.matches('[role="row"]') || node.querySelector('[role="row"]'))) {
            any = true;
            break;
          }
        }
        if (any) break;
      }
      if (!any) return;

      const rows = list.querySelectorAll('[role="row"]');
      const last = rows[rows.length - 1];
      if (!last) return;

      let landed = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && (node === last || node.contains(last))) {
            landed = true;
            break;
          }
        }
        if (landed) break;
      }
      if (!landed) return;

      const name = nameOfRow(last);
      if (name) {
        if (shown.has(name)) return;
        shown.add(name);
        if (shown.size > 400) { shown.clear(); shown.add(name); }
      }

      if (d.visibilityState !== 'visible') return;

      pending.push({ row: last, at: performance.now() });
      if (pending.length > 8) pending.shift();
      backstop();
    }) : null;

    const answer = (lift, seen, scrolled) => {
      const rows = pending;
      pending = [];
      const now = performance.now();
      const landed = [];
      for (const one of rows) {
        if (one.row.isConnected && now - one.at <= ARRIVAL_PENDING_MS) landed.push(one);
      }
      if (!landed.length) return;

      let cost = 0;
      for (const one of landed) cost += Math.round(one.row.getBoundingClientRect().height);

      let moved = seen === null ? scrolled : seen;
      if (!(moved > 0) && scrolled > 0) moved = scrolled;
      if (cost > 0 && moved > cost) moved = cost;

      const pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
                     ARRIVAL_PIN_SLACK;

      if (pinned && moved > 0 && moved < scroller.clientHeight) {
        park(list, lift + moved);
        if (replyBarOver(scroller)) {
          const mine = list.__waMove;
          const go = () => {
            if (list.__waMove !== mine) return;
            letGo(list, ARRIVAL_GLIDE_MS, PANEL_IN);
          };
          setTimeout(() => {
            if (list.__waMove !== mine) return;
            if (replyBarLeaving(scroller, barState)) setTimeout(go, ARRIVAL_HANDOVER_MS);
            else go();
          }, ARRIVAL_LOOK_MS);
        } else {
          letGo(list, ARRIVAL_GLIDE_MS, PANEL_IN);
        }
      }

      for (const one of landed) {
        const bubble = one.row.querySelector('[data-testid="msg-container"]');
        if (bubble) popTheBubble(bubble, scroller, d, w);
      }
    };

    const settled = () => {
      const lift = liftOf(list);
      const seen = travelled(lift);
      const scrolled = Math.round(scroller.scrollTop - scrolledFrom);
      marksOn(lift);
      answer(lift, seen, scrolled);
    };

    let armed = false;
    const backstop = () => {
      if (armed) return;
      armed = true;
      w.requestAnimationFrame(() => w.requestAnimationFrame(() => {
        armed = false;
        if (pending.length) settled();
      }));
    };

    let room = null;
    const ResizeObserverImpl = w.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
    if (typeof ResizeObserverImpl === 'function') {
      try {
        room = new ResizeObserverImpl(settled);
        room.observe(list);
        room.observe(scroller);
      } catch (err) { room = null; }
    }

    if (watch) watch.observe(list, { childList: true, subtree: true });
    watched.push({ list: list, watch: watch, room: room });
  };

  const smoothTheArrivals = () => {
    for (let i = watched.length - 1; i >= 0; i--) {
      if (watched[i].list.isConnected) continue;
      watched[i].watch.disconnect();
      if (watched[i].room) watched[i].room.disconnect();
      watched.splice(i, 1);
    }
    for (const where of listsOnPage(d)) {
      if (where.list.__waArrivals) continue;
      where.list.__waArrivals = true;
      keyframesReady(d);
      adoptArrivals(where.scroller, where.list);
    }
  };

  const timer = setInterval(smoothTheArrivals, ARRIVAL_ADOPT_MS);
  smoothTheArrivals();

  return () => clearInterval(timer);
};

module.exports = {
  ARRIVAL_GLIDE_MS,
  ARRIVAL_POP_MS,
  ARRIVAL_POP,
  ARRIVAL_POP_SCALE,
  ARRIVAL_POP_TRAVEL,
  ARRIVAL_SETTLE_MS,
  ARRIVAL_PIN_SLACK,
  ARRIVAL_ADOPT_MS,
  POP_SCALE_VAR,
  POP_KEYFRAMES,
  keyframesReady,
  stillnessAsked,
  popTheBubble,
  footerOver,
  replyBarOver,
  replyBarLeaving,
  listsOnPage,
  setupArrivals,
};
