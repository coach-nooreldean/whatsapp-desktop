/*
 * Smooth scrolling and Velocity animation interception for jumping to messages (pins, search, quotes).
 */
'use strict';

const { grab } = require('./navigation.js');
const { listsOnPage, stillnessAsked } = require('./arrivals.js');

const JUMP_WAIT_MS = 60000;
const JUMP_POLL_MS = 400;
const JUMP_HOLD_MS = 4000;
const JUMP_QUIET_MS = 350;
const JUMP_FAR_ROOMS = 3;
const JUMP_MS = 400;
const JUMP_EASE = [0.88, 0.64, 0.13, 0.99];
const JUMP_FRESH_MS = 1000;

const easedBy = (curve, u) => {
  if (!(u > 0)) return 0;
  if (u >= 1) return 1;
  const along = (a, b, t) => {
    const s = 1 - t;
    return 3 * s * s * t * a + 3 * s * t * t * b + t * t * t;
  };
  let low = 0;
  let high = 1;
  let t = u;
  for (let i = 0; i < 8; i++) {
    if (along(curve[0], curve[2], t) < u) low = t; else high = t;
    t = (low + high) / 2;
  }
  return along(curve[1], curve[3], t);
};

const restingPlace = (pos, room, row) => {
  if (pos === 'center') return Math.max(0, Math.round((room - row) / 2));
  if (pos === 'bottom') return Math.max(0, Math.round(room - row));
  return 0;
};

const callOffTheSettle = scroller => {
  try {
    const V = grab('velocity-animate');
    if (typeof V !== 'function' || !V.State || !Array.isArray(V.State.calls)) return;
    for (const call of V.State.calls) {
      if (!call || !call[2] || call[2].container !== scroller) continue;
      for (const tween of call[0] || [])
        if (tween && tween.scroll && tween.element) V(tween.element, 'stop');
    }
  } catch (err) {
    /* WhatsApp's animation library, on WhatsApp's own terms. */
  }
};

const rowOfJump = (doc, id) => {
  for (const where of listsOnPage(doc))
    for (const row of where.scroller.querySelectorAll('[data-id]')) {
      const value = row.getAttribute('data-id');
      if (value === id || value.endsWith('_' + id))
        return { scroller: where.scroller, row: row };
    }
  return null;
};

let landing = null;

const landTheJump = (id, pos, ms, curve, win, doc) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const d = doc || (typeof document !== 'undefined' ? document : null);

  if (landing) landing();

  const began = performance.now();
  let start = null;
  let grown = -1;
  let stillFrom = 0;
  let done = false;

  const letGo = () => {
    if (done) return;
    done = true;
    if (landing === letGo) landing = null;
    if (w.removeEventListener) {
      for (const name of ['wheel', 'pointerdown', 'keydown'])
        w.removeEventListener(name, letGo, true);
    }
  };
  landing = letGo;
  if (w.addEventListener) {
    for (const name of ['wheel', 'pointerdown', 'keydown'])
      w.addEventListener(name, letGo, true);
  }

  const step = () => {
    const now = performance.now();
    if (done || now - began > JUMP_HOLD_MS) return letGo();
    if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(step);

    const at = rowOfJump(d, id);
    if (!at) return;

    const room = at.scroller.clientHeight;
    const box = at.row.getBoundingClientRect();
    const rest = restingPlace(pos, room, box.height);

    const need = Math.round(box.top - at.scroller.getBoundingClientRect().top - rest);

    if (now - began <= ms) callOffTheSettle(at.scroller);
    if (start === null)
      start = Math.abs(need) > room * JUMP_FAR_ROOMS || stillnessAsked(w) ? 0 : need;

    const left = Math.round(start * (1 - easedBy(curve, (now - began) / ms)));
    const put = need - left;
    const was = at.scroller.scrollTop;
    if (put) at.scroller.scrollTop += put;

    if ((!put || at.scroller.scrollTop === was) && at.scroller.scrollHeight === grown) {
      if (!stillFrom) stillFrom = now;
      if (now - stillFrom > JUMP_QUIET_MS) letGo();
    } else {
      stillFrom = 0;
      grown = at.scroller.scrollHeight;
    }
  };
  if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(step);
};

const watchTheJumps = (win, doc, log, waitedFor = 0) => {
  const logger = typeof log === 'function' ? log : () => {};
  const module = grab('WAWebCmd');
  const Cmd = module && module.Cmd;
  if (!Cmd || typeof Cmd.on !== 'function') {
    if (waitedFor < JUMP_WAIT_MS)
      setTimeout(() => watchTheJumps(win, doc, log, waitedFor + JUMP_POLL_MS), JUMP_POLL_MS);
    else
      logger('WhatsApp never offered its command bus, so a jump to a message is left as it comes');
    return;
  }

  let wanted = null;
  let asked = 0;

  Cmd.on('open_chat', where => {
    const context = where && where.msgContext;
    const key = context && context.key;
    const id = key && key.id;
    if (typeof id !== 'string' || !id) return;
    wanted = id;
    asked = performance.now();
  });

  Cmd.on('scroll_to_focused_msg', (where, how) => {
    if (!wanted || !how || !how.animate) return;
    if (performance.now() - asked > JUMP_FRESH_MS) return;
    const id = wanted;
    wanted = null;
    landTheJump(id,
                how.pos || 'center',
                how.duration > 0 ? how.duration : JUMP_MS,
                Array.isArray(how.easing) && how.easing.length === 4 ? how.easing : JUMP_EASE,
                win, doc);
  });

  logger('a jump to a message lands where WhatsApp asks for it');
};

module.exports = {
  JUMP_WAIT_MS,
  JUMP_POLL_MS,
  JUMP_HOLD_MS,
  JUMP_QUIET_MS,
  JUMP_FAR_ROOMS,
  JUMP_MS,
  JUMP_EASE,
  JUMP_FRESH_MS,
  easedBy,
  restingPlace,
  callOffTheSettle,
  rowOfJump,
  landTheJump,
  watchTheJumps,
};
