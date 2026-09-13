/*
 * Row clicking, contact links, group invites, and composer focusing.
 */
'use strict';

const { strip, titlesIn, nameOf, unreadCount, openRow, labelled, previewIn } = require('./rows.js');

const INVITE_SETTLE_MS = 1500;
const LINK_WAIT_MS = 60000;
const LINK_POLL_MS = 400;
const FOCUS_TRIES = 12;

const grab = name => {
  try {
    return (typeof window !== 'undefined' && typeof window.require === 'function')
      ? window.require(name)
      : null;
  } catch (err) {
    return null;
  }
};

const press = (element, target, win) => {
  if (!element) return;
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  target = target || element;
  const box = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  const where = {
    bubbles: true, cancelable: true, view: w, button: 0, buttons: 1,
    clientX: Math.round(box.left + box.width / 2),
    clientY: Math.round(box.top + box.height / 2),
  };
  const pointer = Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, where);
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const isPointer = type.indexOf('pointer') === 0;
    const Kind = isPointer && w.PointerEvent ? w.PointerEvent : (w.MouseEvent || Event);
    try {
      target.dispatchEvent(new Kind(type, isPointer ? pointer : where));
    } catch (err) { /* a kind this build does not construct; the rest still go */ }
  }
};

const pressRow = (row, win) => press(row, (row && row.querySelector ? row.querySelector('span[title]') : null) || row, win);

const findRow = (doc, name, preview) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const pane = d.querySelector('#pane-side');
  for (const row of (pane ? pane.querySelectorAll('[role="row"]') : [])) {
    const titles = titlesIn(row);
    if (strip(titles[0] && titles[0].getAttribute('title')) !== name) continue;
    if (preview && labelled(previewIn(row, titles), row) !== preview) continue;
    return row;
  }
  return null;
};

const lastOnScreen = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return '';
  const main = d.querySelector('#main');
  const rows = main ? main.querySelectorAll('[role="row"]') : [];
  const last = rows[rows.length - 1];
  return last ? strip(last.innerText) : '';
};

const isOpen = (doc, row, preview) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const open = openRow(d);
  if (!open) return false;

  if (unreadCount(row) > 0) return false;
  if (row === open) return true;

  const name = nameOf(row);
  if (!name || name !== nameOf(open)) return false;

  const text = strip(preview).replace(/…$/, '');
  return text.length >= 3 && lastOnScreen(d).indexOf(text) >= 0;
};

const focusComposer = (doc, tries, { send, log } = {}) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return;
  const logger = typeof log === 'function' ? log : () => {};
  const sender = typeof send === 'function' ? send : () => {};

  const box = d.querySelector('#main footer div[contenteditable="true"]');
  if (box && (box.innerText || '').trim()) {
    logger('left the message out: the composer already has a draft');
    return;
  }
  if (box) {
    if (typeof box.click === 'function') box.click();
    if (typeof box.focus === 'function') box.focus();
    if (d.activeElement === box) {
      sender('composer-ready', null);
      return;
    }
  }
  if (tries < FOCUS_TRIES) {
    setTimeout(() => focusComposer(d, tries + 1, { send, log }), 300);
    return;
  }
  logger('no composer to put the link\'s message in');
};

const openByNumber = (phone, wantsText, waitedFor, { doc, send, log, refreshOpen } = {}) => {
  const logger = typeof log === 'function' ? log : () => {};
  const sender = typeof send === 'function' ? send : () => {};
  const wf = grab('WAWebWidFactory');
  const action = grab('WAWebOpenChatWithContactAction');

  if (!wf || !action || typeof action.openChatWithContact !== 'function') {
    if (waitedFor < LINK_WAIT_MS) {
      setTimeout(() => openByNumber(phone, wantsText, waitedFor + LINK_POLL_MS, { doc, send, log, refreshOpen }),
                 LINK_POLL_MS);
      return;
    }
    logger('WhatsApp\'s modules never answered for +' + phone + '; asking for its own page');
    sender('link-unresolved', { phone: phone });
    return;
  }

  let wid;
  try {
    wid = wf.createUserWidOrThrow(phone);
  } catch (err) {
    logger('cannot open +' + phone + ': ' + err.message);
    return;
  }

  Promise.resolve(action.openChatWithContact(wid)).then(() => {
    logger('opened a chat with +' + phone);
    if (typeof refreshOpen === 'function') setTimeout(refreshOpen, 400);
    if (wantsText) setTimeout(() => focusComposer(doc, 0, { send, log }), 400);
  }).catch(err => logger('cannot open +' + phone + ': ' + err.message));
};

const openInvite = (code, waitedFor, retried, { doc, send, log } = {}) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const logger = typeof log === 'function' ? log : () => {};
  const sender = typeof send === 'function' ? send : () => {};

  const React = grab('react');
  const loadable = grab('WAWebGroupInviteLinkModalLoadable.react');
  const manager = (grab('WAWebModalManager') || {}).ModalManager;
  const Modal = loadable && loadable.WAWebGroupInviteLinkModalLoadable;

  if (!React || typeof React.createElement !== 'function' ||
      typeof Modal !== 'function' || !manager || typeof manager.open !== 'function' ||
      !d || !d.querySelector('#pane-side')) {
    if (waitedFor < LINK_WAIT_MS) {
      setTimeout(() => openInvite(code, waitedFor + LINK_POLL_MS, retried, { doc, send, log }), LINK_POLL_MS);
      return;
    }
    logger('WhatsApp\'s modules never answered for the invite; asking for its own page');
    sender('invite-unresolved', { code: code });
    return;
  }

  try {
    manager.open(React.createElement(Modal, { groupCode: code, source: 'invite_link' }),
                 { transition: 'modal-flow' });
    logger('put up the join dialog for a group invite');
  } catch (err) {
    logger('cannot show the invite dialog: ' + err.message);
    sender('invite-unresolved', { code: code });
    return;
  }

  setTimeout(() => {
    if (d.querySelector('[role="dialog"]')) return;
    if (retried) {
      logger('the join dialog did not arrive twice over; asking for WhatsApp\'s own page');
      sender('invite-unresolved', { code: code });
      return;
    }
    logger('the join dialog did not arrive; asking once more');
    openInvite(code, waitedFor, true, { doc, send, log });
  }, INVITE_SETTLE_MS);
};

module.exports = {
  INVITE_SETTLE_MS,
  LINK_WAIT_MS,
  LINK_POLL_MS,
  FOCUS_TRIES,
  grab,
  press,
  pressRow,
  findRow,
  lastOnScreen,
  isOpen,
  focusComposer,
  openByNumber,
  openInvite,
};
