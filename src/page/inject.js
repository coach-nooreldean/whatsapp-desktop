/*
 * Page-side helpers, running in WhatsApp Web's own world from document-start.
 *
 * Coordinates notifications, focus/visibility tracking, audio and send tone
 * interception, right-hand drawer and reply bar animations, message transitions,
 * jump-to-message smooth scrolling, and WhatsApp store / media hooks.
 */
'use strict';

const wording = require('../wording.js');
const store = require('./store.js');
const media = require('./media.js');
const pictures = require('./pictures.js');
const { fixVideo } = require('./video.js');
const { setupCaretRestore } = require('./caret.js');
const { createTonePlayer } = require('./tone.js');
const panels = require('./panels.js');

const rows = require('./inject/rows.js');
const avatars = require('./inject/avatars.js');
const sounds = require('./inject/sounds.js');
const navigation = require('./inject/navigation.js');
const drawerEscape = require('./inject/drawer-escape.js');
const composerBar = require('./inject/composer-bar.js');
const arrivals = require('./inject/arrivals.js');
const jump = require('./inject/jump.js');
const notificationShim = require('./inject/notification-shim.js');
const watcherModule = require('./inject/watcher.js');

const SEP = watcherModule.SEP;
const INVITE_SETTLE_MS = 1500;

const start = ({ send, on }) => {
  const win = typeof window !== 'undefined' ? window : globalThis;
  const doc = typeof document !== 'undefined' ? document : null;
  const log = message => send('log', String(message));

  fixVideo();

  /* ------------------------------------------------------------------ focus */
  let focused = false;
  let onScreen = true;

  let waStore = null;
  let waMedia = null;
  let waPictures = null;
  const storeLive = () => !!(waStore && waStore.ready);

  /* ------------------------------------------------------------- visibility */
  try {
    Object.defineProperty(doc, 'visibilityState', {
      get: () => (onScreen ? 'visible' : 'hidden'),
      configurable: true,
    });
    Object.defineProperty(doc, 'hidden', {
      get: () => !onScreen,
      configurable: true,
    });
  } catch (e) {}

  on('on-screen', state => {
    state = !!state;
    if (state === onScreen) return;
    onScreen = state;
    if (doc && typeof doc.dispatchEvent === 'function') {
      const Evt = win.Event || Event;
      doc.dispatchEvent(new Evt('visibilitychange'));
    }
  });

  /* ------------------------------------------------------------------- tone */
  const tonePlayer = createTonePlayer({ log, win });
  const decodeTone = tonePlayer.decodeTone;
  const playTone = tonePlayer.playTone;

  on('tone', decodeTone);
  on('play-tone', playTone);

  /* ------------------------------------------------- sounds and send tracking */
  const soundManager = sounds.createSoundManager({ win, log, hasTone: tonePlayer.hasTone });
  soundManager.watchForSends();
  soundManager.interceptSounds();

  /* ------------------------------------------------- avatar and watcher state */
  const chatFaces = new Map();
  const avatarsMap = new Map();
  const btoaFn = typeof atob === 'function' ? atob : (typeof win.atob === 'function' ? win.atob : null);

  const watcher = watcherModule.createWatcher({
    doc,
    win,
    send,
    log,
    storeLive,
    isFocused: () => focused,
    chatFaces,
    avatars: avatarsMap,
    btoaFn,
  });

  on('focus', state => {
    state = !!state;
    if (state === focused) return;
    focused = state;
    if (waStore) waStore.setFocus(focused);
    if (!focused) watcher.clearArrivals();
    else watcher.refreshOpen();
  });

  /* ------------------------------------------------- drawer, composer and jumps */
  drawerEscape.slideTheDrawer(win);
  const sharedBarState = composerBar.setupComposerBar(win, doc);
  arrivals.setupArrivals(win, doc, sharedBarState);
  jump.watchTheJumps(win, doc, log);
  setupCaretRestore({
    panelSelector: composerBar.PANEL,
    addEventListener: win.addEventListener ? win.addEventListener.bind(win) : () => {},
    document: doc,
  });
  drawerEscape.setupEscapeHandler(win, doc, log);

  /* --------------------------------------------------- exposed watcher globals */
  win.__waDescribeUnread = watcher.describeUnread;
  win.__waWatcherState = watcher.watcherState;

  setInterval(watcher.watchList, 4000);
  if (win.addEventListener) win.addEventListener('load', watcher.watchList);

  /* -------------------------------------------------------- navigation requests */
  on('open-chat-request', request => {
    const wanted = typeof request === 'string' ? { name: request } : (request || {});
    const held = wanted.token ? watcher.openable.get(wanted.token) : null;
    const name = wanted.name || (held && held.name) || '';
    const preview = wanted.preview || (held && held.preview) || '';

    const row = (held && held.row && held.row.isConnected ? held.row : null) ||
                navigation.findRow(doc, name, preview) ||
                avatars.rowFor(doc, name);
    if (!row) { log('cannot open "' + name + '": no row for it in the rendered list'); return; }
    if (wanted.token) watcher.openable.delete(wanted.token);
    navigation.pressRow(row, win);
    setTimeout(watcher.refreshOpen, 400);
  });

  on('mark-chat-read-request', request => {
    const wanted = typeof request === 'string' ? { name: request } : (request || {});
    const held = wanted.token ? watcher.openable.get(wanted.token) : null;
    const name = wanted.name || (held && held.name) || '';
    const preview = wanted.preview || (held && held.preview) || '';

    if (waStore && typeof waStore.markRead === 'function' && wanted.chat) {
      if (waStore.markRead(wanted.chat)) return;
    }

    const row = (held && held.row && held.row.isConnected ? held.row : null) ||
                navigation.findRow(doc, name, preview) ||
                avatars.rowFor(doc, name);
    if (!row) { log('cannot mark read for "' + name + '": no row for it in list'); return; }
    if (wanted.token) watcher.openable.delete(wanted.token);
    navigation.pressRow(row, win);
    setTimeout(watcher.refreshOpen, 400);
  });

  on('reply-chat-request', request => {
    const wanted = typeof request === 'string' ? { name: request } : (request || {});
    const replyText = wanted.text || '';
    if (!replyText) return;
    const held = wanted.token ? watcher.openable.get(wanted.token) : null;
    const name = wanted.name || (held && held.name) || '';
    const preview = wanted.preview || (held && held.preview) || '';

    const row = (held && held.row && held.row.isConnected ? held.row : null) ||
                navigation.findRow(doc, name, preview) ||
                avatars.rowFor(doc, name);
    if (row) {
      if (wanted.token) watcher.openable.delete(wanted.token);
      navigation.pressRow(row, win);
      setTimeout(() => {
        const composer = doc ? doc.querySelector('footer [contenteditable="true"]') : null;
        if (composer) {
          composer.focus();
          doc.execCommand('insertText', false, replyText);
          setTimeout(() => {
            const sendBtn = doc.querySelector('footer button [data-icon="send"], footer [data-icon="send"]') ||
                            doc.querySelector('footer span[data-icon="send"]');
            if (sendBtn) {
              const btn = sendBtn.closest('button') || sendBtn;
              btn.click();
            } else {
              const KeyEvt = win.KeyboardEvent || KeyboardEvent;
              composer.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          }, 150);
        }
      }, 400);
    }
  });

  on('toggle-call-mute', () => {
    const micBtn = doc ? doc.querySelector('button[aria-label*="mute" i], button[aria-label*="mic" i], button[aria-label*="كتم" i], span[data-icon="mic-off"], span[data-icon="mic"]') : null;
    if (micBtn) {
      const btn = micBtn.closest('button') || micBtn;
      btn.click();
      log('call microphone mute toggled');
    }
  });

  on('open-link', chat => {
    const phone = chat && chat.phone;
    if (!phone) return;
    navigation.openByNumber(String(phone), !!(chat && chat.wantsText), 0, {
      doc, send, log, refreshOpen: watcher.refreshOpen,
    });
  });

  on('open-invite', invite => {
    const code = invite && invite.code;
    if (!code) return;
    navigation.openInvite(String(code), 0, false, { doc, send, log });
  });

  /* ------------------------------------------------------------ store events */
  on('store-open', request => {
    if (request && request.story && waStore) {
      const opened = waStore.openStory(request.msg);
      if (opened === 'story') { log('opened the story the mention was posted on'); return; }
      if (opened === 'list') {
        log('the story is no longer in the collection; opened the updates panel instead');
        return;
      }
      log('could not open the story; falling back to the chat it arrived in');
    }

    const chatId = request && request.chat;
    if (chatId && waStore && waStore.open(chatId)) {
      setTimeout(() => { if (waStore) send('store-active', { chat: waStore.activeChat() }); }, 300);
      return;
    }
    if (request && request.name) {
      log('opening "' + request.name + '" by name: the store could not place ' + chatId);
      const row = navigation.findRow(doc, request.name, request.preview) || avatars.rowFor(doc, request.name);
      if (row) navigation.pressRow(row, win);
    }
  });

  on('store-mark-read', request => {
    const chatId = request && request.chat;
    if (chatId && waStore && typeof waStore.markRead === 'function') {
      if (waStore.markRead(chatId)) return;
    }
    if (request && request.name) {
      const row = navigation.findRow(doc, request.name, request.preview) || avatars.rowFor(doc, request.name);
      if (row) navigation.pressRow(row, win);
    }
  });

  on('store-reply', request => {
    const chatId = request && request.chat;
    const replyText = request && request.text;
    if (!replyText) return;
    if (chatId && waStore && waStore.open && waStore.open(chatId)) {
      setTimeout(() => {
        const composer = doc ? doc.querySelector('footer [contenteditable="true"]') : null;
        if (composer) {
          composer.focus();
          doc.execCommand('insertText', false, replyText);
          setTimeout(() => {
            const sendBtn = doc.querySelector('footer button [data-icon="send"], footer [data-icon="send"]') ||
                            doc.querySelector('footer span[data-icon="send"]');
            if (sendBtn) {
              const btn = sendBtn.closest('button') || sendBtn;
              btn.click();
            } else {
              const KeyEvt = win.KeyboardEvent || KeyboardEvent;
              composer.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          }, 150);
        }
      }, 400);
      return;
    }
    if (request && request.name) {
      const row = navigation.findRow(doc, request.name, request.preview) || avatars.rowFor(doc, request.name);
      if (row) {
        navigation.pressRow(row, win);
        setTimeout(() => {
          const composer = doc ? doc.querySelector('footer [contenteditable="true"]') : null;
          if (composer) {
            composer.focus();
            doc.execCommand('insertText', false, replyText);
            setTimeout(() => {
              const sendBtn = doc.querySelector('footer button [data-icon="send"], footer [data-icon="send"]') ||
                              doc.querySelector('footer span[data-icon="send"]');
              if (sendBtn) {
                const btn = sendBtn.closest('button') || sendBtn;
                btn.click();
              } else {
                const KeyEvt = win.KeyboardEvent || KeyboardEvent;
                composer.dispatchEvent(new KeyEvt('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              }
            }, 150);
          }
        }, 400);
      }
    }
  });

  /* ------------------------------------------------------------- configuration */
  on('config', config => {
    if (config && config.notifications) {
      notificationShim.installNotificationShim({
        win,
        send,
        log,
        storeLive,
        chatNameFor: name => avatars.chatNameFor(doc, chatFaces, name),
        chatKindFor: name => avatars.chatKindFor(doc, chatFaces, name),
        avatarFor: name => avatars.avatarFor(name, doc, chatFaces, avatarsMap, watcher.rememberName, btoaFn),
        rememberName: watcher.rememberName,
        fetchAvatar: src => avatars.fetchAvatar(avatarsMap, src, btoaFn),
        withTimeout: avatars.withTimeout,
        on,
      });
    }

    if (!waStore) {
      waStore = store.start({
        send, log,
        fetchAvatar: url => avatars.withTimeout(avatars.fetchAvatar(avatarsMap, url, btoaFn)),
        faceFor: name => avatars.avatarFor(name, doc, chatFaces, avatarsMap, watcher.rememberName, btoaFn),
      });
      waStore.setFocus(focused);
    }

    if (!waMedia && config && config.downloadStickers !== false) {
      waMedia = media.start({ log });
    }

    if (!waPictures) {
      waPictures = pictures.start({
        log,
        grab: name => navigation.grab(name),
      });
    }

    soundManager.updateConfig(config);
    log('ready on ' + (win.location ? win.location.host : 'web.whatsapp.com'));

    const report = () => {
      try {
        send('font-stack', win.getComputedStyle(doc.body).fontFamily || '');
      } catch (err) { /* the body is not there yet */ }
    };
    if (doc && doc.body) report();
    else if (win.addEventListener) win.addEventListener('DOMContentLoaded', report, { once: true });
  });
};

module.exports = { start, fixVideo, SEP, INVITE_SETTLE_MS };
