/*
 * Chat list observer, announcement and arrival queues, unread counters, and __waDescribeUnread.
 */
'use strict';

const {
  strip,
  nameOf,
  senderIn,
  isOutgoing,
  isSilenced,
  unreadCount,
  isTyping,
  readRow,
  freshness,
  isArrival,
  openRow,
  SELF_SENDER,
  REACTION_PREVIEW,
} = require('./rows.js');

const { findRow, isOpen } = require('./navigation.js');
const { rememberFace, avatarOf } = require('./avatars.js');

const SEP = '\u001f';
const ARRIVAL_TTL_MS = 30000;
const ANSWER_WINDOW_MS = 5000;
const SETTLE_MS = 2500;
const ANNOUNCED_TTL_MS = 10 * 60 * 1000;
const NAME_TTL_MS = 60 * 1000;
const GUESS_WINDOW_MS = 10 * 1000;
const REPEAT_MS = 2 * 60 * 1000;
const OPENABLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_MS = 3000;
const UNREAD_GRACE_MS = 2500;
const OFFSCREEN_MS = 60000;

const createWatcher = ({
  doc,
  win,
  send,
  log,
  storeLive,
  isFocused,
  chatFaces,
  avatars,
  btoaFn,
}) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const logger = typeof log === 'function' ? log : () => {};
  const sender = typeof send === 'function' ? send : () => {};
  const isStoreLive = typeof storeLive === 'function' ? storeLive : () => false;
  const getFocused = typeof isFocused === 'function' ? isFocused : () => false;

  let arrivals = [];
  const rowState = new WeakMap();
  const announced = new Map();
  const announcedNames = new Map();
  const lastAnnounced = new Map();
  const openable = new Map();
  const knownUnread = new Map();

  let nextToken = 1;
  let seeded = false;
  let seededAt = 0;
  let lastUnread = null;
  let lastCount = null;
  let lastOpen = null;
  let sweeping = false;
  let regrade = 0;
  let regradeAt = 0;

  const ping = () => { if (!isStoreLive()) sender('arrival', null); };

  const rememberOpenable = (row, name, preview) => {
    const token = String(nextToken++);
    openable.set(token, { row, name, preview, at: Date.now() });
    if (openable.size > 64) {
      const cutoff = Date.now() - OPENABLE_TTL_MS;
      for (const [key, held] of openable) if (held.at < cutoff) openable.delete(key);
      for (const key of openable.keys()) {
        if (openable.size <= 64) break;
        openable.delete(key);
      }
    }
    return token;
  };

  const sweepStamped = (map, ttl) => {
    const now = Date.now();
    if (map.size <= 128) return;
    for (const [key, value] of map) if (now - value.at > ttl) map.delete(key);
  };

  const sweep = (map, ttl) => {
    const now = Date.now();
    if (map.size > 128)
      for (const [key, at] of map) if (now - at > ttl) map.delete(key);
  };

  const readingKey = state => [state.name, state.preview, state.when].join(SEP);

  const wasAnnounced = state => {
    const now = Date.now();
    const said = announced.get(readingKey(state));
    const named = announcedNames.get(state.name);
    return (said !== undefined && now - said < ANNOUNCED_TTL_MS) ||
           (named !== undefined && now - named < NAME_TTL_MS);
  };

  const rememberAnnounced = state => {
    announced.set(readingKey(state), Date.now());
    sweep(announced, ANNOUNCED_TTL_MS);
  };

  const rememberName = name => {
    const wanted = strip(name);
    if (!wanted) return;
    announcedNames.set(wanted, Date.now());
    sweep(announcedNames, NAME_TTL_MS);
  };

  const sweepLater = () => {
    if (sweeping) return;
    sweeping = true;
    setTimeout(() => {
      sweeping = false;
      const pane = d ? d.querySelector('#pane-side') : null;
      if (!pane || !knownUnread.size) return;
      reportUnread(pane);
    }, SWEEP_MS);
  };

  const scanSoon = ms => {
    const when = Date.now() + ms;
    if (regrade && regradeAt <= when) return;
    if (regrade) clearTimeout(regrade);
    regradeAt = when;
    regrade = setTimeout(() => { regrade = 0; scanList(); }, ms);
  };

  const reportUnread = pane => {
    if (!pane) return;
    const now = Date.now();
    const currentUnread = new Set();
    const renderedNames = new Set();

    for (const row of pane.querySelectorAll('[role="row"]')) {
      const name = nameOf(row);
      if (!name) continue;
      renderedNames.add(name);
      const waiting = unreadCount(row);
      if (waiting > 0) {
        currentUnread.add(name);
        knownUnread.set(name, { at: now, count: waiting, silenced: isSilenced(row) });
      }
    }

    if (!renderedNames.size && !pane.querySelector('[role="row"]')) return;

    const names = [];
    let judgeIn = 0;
    const hold = until => {
      const left = Math.max(0, until - now);
      if (!judgeIn || left < judgeIn) judgeIn = left;
    };

    for (const [name, seen] of knownUnread.entries()) {
      if (currentUnread.has(name)) {
        names.push(name);
      } else if (renderedNames.has(name)) {
        const open = openRow(d);
        const isOpenChat = open && nameOf(open) === name && getFocused();
        if (!isOpenChat && (now - seen.at < UNREAD_GRACE_MS)) {
          names.push(name);
          hold(seen.at + UNREAD_GRACE_MS);
        } else {
          knownUnread.delete(name);
        }
      } else {
        if (now - seen.at < OFFSCREEN_MS) {
          names.push(name);
          hold(seen.at + OFFSCREEN_MS);
        } else {
          knownUnread.delete(name);
        }
      }
    }
    if (judgeIn) scanSoon(judgeIn + 100);
    if (knownUnread.size) sweepLater();

    const key = names.sort().join(SEP);
    if (key !== lastUnread) {
      lastUnread = key;
      if (!isStoreLive()) sender('unread-chats', names);
    }

    let messages = 0;
    let chats = 0;
    for (const name of names) {
      const seen = knownUnread.get(name);
      if (!seen || seen.silenced) continue;
      messages += seen.count || 1;
      chats++;
    }
    const counted = chats + SEP + messages;
    if (counted !== lastCount) {
      lastCount = counted;
      if (!isStoreLive()) sender('unread-count', { chats, messages });
    }
  };

  const reportOpen = () => {
    if (!d || !d.querySelector('#pane-side')) return;
    const row = openRow(d);
    const name = row ? nameOf(row) : '';
    if (name === lastOpen) return;
    lastOpen = name;
    if (!isStoreLive()) sender('open-chat', name);
  };

  const refreshOpen = () => { lastOpen = null; reportOpen(); };

  const scanList = () => {
    if (!d) return;
    const pane = d.querySelector('#pane-side');
    if (!pane) return;

    for (const row of pane.querySelectorAll('[role="row"]')) {
      const now = readRow(row);
      if (!now.name) continue;

      rememberFace(chatFaces, now.name, row);

      const before = rowState.get(row);

      if (isTyping(now.preview)) continue;
      if (!now.preview && before !== undefined) continue;

      const settled = seeded && Date.now() - seededAt >= SETTLE_MS;
      now.changedAt = !settled ? 0
                    : (before && before.preview === now.preview &&
                       before.when === now.when && before.badge === now.badge)
                    ? before.changedAt : Date.now();
      rowState.set(row, now);

      if (!seeded || before === undefined) continue;
      if (Date.now() - seededAt < SETTLE_MS) continue;

      const isReaction = REACTION_PREVIEW.test(now.preview);
      if (!isArrival(before, now)) {
        if (isReaction) logger('a reaction in "' + now.name + '" did not read as an arrival');
        continue;
      }
      if (isSilenced(row)) {
        if (isReaction) logger('a reaction in "' + now.name + '" is in a muted chat');
        continue;
      }
      if (isOutgoing(row) && !isReaction) continue;

      if (!getFocused()) {
        if (isReaction)
          logger('a reaction in "' + now.name + '" arrived with the window away; WhatsApp raises that one');
        continue;
      }

      if (isReaction) logger('a reaction in "' + now.name + '" is queued');
      arrivals.push({ row, name: now.name, preview: now.preview,
                      sender: senderIn(row), at: Date.now() });
      ping();
    }

    const cutoff = Date.now() - ARRIVAL_TTL_MS;
    arrivals = arrivals.filter(a => a.at > cutoff);
    if (arrivals.length > 16) arrivals = arrivals.slice(-16);
    if (!seeded) { seeded = true; seededAt = Date.now(); }

    reportUnread(pane);
    reportOpen();
  };

  const watchList = () => {
    if (!d) return;
    const pane = d.querySelector('#pane-side');
    if (!pane || pane.__waWatched) return;
    pane.__waWatched = true;

    scanList();
    let timer = 0;
    const MutationObserverImpl = w.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (MutationObserverImpl) {
      new MutationObserverImpl(() => {
        clearTimeout(timer);
        timer = setTimeout(scanList, 150);
      }).observe(pane, { childList: true, subtree: true, characterData: true,
                         attributes: true, attributeFilter: ['title', 'aria-selected'] });
    }
    logger('watching the chat list for arrivals');
  };

  const describeUnread = async () => {
    scanList();

    const cutoff = Date.now() - ARRIVAL_TTL_MS;
    arrivals = arrivals.filter(a => a.at > cutoff);

    let row = null, queued = null;
    while (arrivals.length && !row) {
      queued = arrivals.shift();
      if (Date.now() - queued.at > ANSWER_WINDOW_MS) { queued = null; continue; }
      row = (queued.row && queued.row.isConnected) ? queued.row : findRow(d, queued.name, queued.preview);
    }
    const fromQueue = !!row;

    if (row && isOpen(d, row, queued.preview)) return 'open';

    if (!row) {
      const pane = d ? d.querySelector('#pane-side') : null;
      for (const candidate of (pane ? pane.querySelectorAll('[role="row"]') : [])) {
        if (!unreadCount(candidate)) continue;
        if (isOpen(d, candidate, '') || isSilenced(candidate) || isOutgoing(candidate)) continue;

        const state = rowState.get(candidate);
        if (!state || isTyping(state.preview)) continue;
        if (!state.changedAt || Date.now() - state.changedAt > GUESS_WINDOW_MS) continue;
        if (freshness(state.when) !== true) continue;
        if (wasAnnounced(state)) continue;
        row = candidate;
        break;
      }
    }

    if (!row) return '';

    const state = readRow(row);
    const moved = isTyping(state.preview);
    const preview = !moved ? state.preview
                  : (fromQueue && !isTyping(queued.preview) ? queued.preview : '');
    if (!state.name || !preview) return '';

    const sender = moved ? (queued.sender || '') : senderIn(row);

    if (SELF_SENDER.test(sender)) {
      logger('not announced: "' + state.name + '" moved for a message of our own');
      return '';
    }

    const said = lastAnnounced.get(state.name);
    if (said && said.preview === preview && Date.now() - said.at < REPEAT_MS) {
      logger('not announced: "' + state.name + '" moved for the message already ' +
             'announced -- a thread reply, not a new message');
      return '';
    }
    lastAnnounced.set(state.name, { preview, at: Date.now() });
    sweepStamped(lastAnnounced, REPEAT_MS);

    rememberAnnounced({ name: state.name, preview: preview, when: state.when });
    if (preview !== state.preview) rememberAnnounced(state);

    const token = rememberOpenable(row, state.name, preview);
    return [state.name, sender, preview, await avatarOf(row, state.name, chatFaces, avatars, btoaFn), token].join(SEP);
  };

  const watcherState = () => JSON.stringify({
    focused: getFocused(),
    settled: seeded && Date.now() - seededAt >= SETTLE_MS,
    open: (() => { const row = openRow(d); return row ? nameOf(row) : null; })(),
    queued: arrivals.map(a => ({ name: a.name, preview: a.preview, age: Date.now() - a.at })),
  });

  const clearArrivals = () => {
    arrivals = [];
  };

  return {
    scanList,
    reportUnread,
    reportOpen,
    refreshOpen,
    watchList,
    describeUnread,
    watcherState,
    rememberName,
    rememberAnnounced,
    rememberOpenable,
    clearArrivals,
    openable,
    getArrivals: () => arrivals,
  };
};

module.exports = {
  SEP,
  ARRIVAL_TTL_MS,
  ANSWER_WINDOW_MS,
  SETTLE_MS,
  ANNOUNCED_TTL_MS,
  NAME_TTL_MS,
  GUESS_WINDOW_MS,
  REPEAT_MS,
  OPENABLE_TTL_MS,
  SWEEP_MS,
  UNREAD_GRACE_MS,
  OFFSCREEN_MS,
  createWatcher,
};
