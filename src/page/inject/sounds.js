/*
 * Audio interception, page sound muting, send tone detection, and MPRIS playback cleanup.
 */
'use strict';

const { strip } = require('./rows.js');

const SEND_TONE_MS = 1500;
const RINGING_S = 6;
const USER_MEDIA = /^blob:|mmg\.whatsapp\.net|pps\.whatsapp\.net|media[\w-]*\.cdn\.whatsapp\.net/i;

const RESTORE_WAIT_MS = 2000;
const END_SLACK = 0.05;

const SEND_ICON  = /send/i;
const SEND_LABEL = /^(send|إرسال|ارسال)\b/i;

const isSendClick = target => {
  if (!target || !target.closest) return false;
  const icon = target.closest('[data-icon]');
  if (icon && SEND_ICON.test(icon.getAttribute('data-icon') || '')) return true;
  const labelled = target.closest('[aria-label]');
  return !!labelled && SEND_LABEL.test(strip(labelled.getAttribute('aria-label')));
};

const createSoundManager = ({ win, log, hasTone = () => false }) => {
  const w = win || (typeof window !== 'undefined' ? window : globalThis);
  const listen = (typeof w.addEventListener === 'function' ? w.addEventListener.bind(w) : () => {});
  const logger = typeof log === 'function' ? log : () => {};

  let sentAt = 0;
  let muteSendTone = false;
  let mutePageTone = false;
  let hideControlsWhenPaused = true;
  let mutedSend = false;
  let mutedArrival = false;

  const restoring = new WeakMap();

  const noteSend = () => { sentAt = Date.now(); };

  const watchForSends = () => {
    listen('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey) return;
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target;
      if (target && target.closest && target.closest('[contenteditable="true"]')) noteSend();
    }, true);
    listen('pointerdown', event => {
      if (isSendClick(event.target)) noteSend();
    }, true);
  };

  const conversationAudio = el => {
    if (!el || el.tagName !== 'AUDIO') return false;
    if (el.srcObject || el.loop === true) return false;
    return USER_MEDIA.test(el.currentSrc || el.src || '');
  };

  const recycle = el => {
    if (restoring.has(el)) return;
    const url = el.getAttribute('src') || el.src;
    if (!url) return;
    const at = el.currentTime;

    const back = new Promise(resolve => {
      const settle = () => {
        clearTimeout(timer);
        el.removeEventListener('loadedmetadata', settle);
        if (at > 0 && isFinite(at)) { try { el.currentTime = at; } catch (e) {} }
        restoring.delete(el);
        resolve();
      };
      const timer = setTimeout(settle, RESTORE_WAIT_MS);
      el.addEventListener('loadedmetadata', settle);
      el.removeAttribute('src');
      el.load();
      el.setAttribute('src', url);
      el.load();
    });

    restoring.set(el, back);
  };

  const atEnd = el => {
    if (el.ended === true) return true;
    const at = el.currentTime, length = el.duration;
    return typeof length === 'number' && isFinite(length) && length > 0 &&
           typeof at === 'number' && length - at <= END_SLACK;
  };

  const watchPlayback = el => {
    if (el.__waWatched) return;
    el.__waWatched = true;
    el.addEventListener('pause', () => {
      if (!hideControlsWhenPaused || atEnd(el)) return;
      if (conversationAudio(el)) recycle(el);
    });
  };

  const lengthOf = source => {
    const seconds = source && source.buffer ? source.buffer.duration
                  : source ? source.duration : 0;
    return typeof seconds === 'number' && isFinite(seconds) ? seconds : 0;
  };

  const muted = source => {
    if (!source) return false;
    if ((typeof w.HTMLVideoElement !== 'undefined' && source instanceof w.HTMLVideoElement) ||
        (source.tagName && source.tagName.toUpperCase() === 'VIDEO')) return false;
    if (source.srcObject) return false;
    if (source.closest && (source.closest('#main') || source.closest('[role="dialog"]') || source.closest('[data-testid*="call"]') || source.closest('[class*="call"]'))) return false;
    if (source.loop === true || lengthOf(source) > RINGING_S) return false;

    const src = source.currentSrc || source.src || '';
    if (USER_MEDIA.test(src)) return false;

    if (Date.now() - sentAt <= SEND_TONE_MS) {
      if (!muteSendTone) return false;
      if (!mutedSend) { mutedSend = true; logger('muting the tone WhatsApp plays for a message going out'); }
      return true;
    }

    if (!mutePageTone || !hasTone()) return false;
    if (!mutedArrival) { mutedArrival = true; logger('muting the tone WhatsApp plays for a message arriving'); }
    return true;
  };

  const interceptSounds = () => {
    if (w.HTMLMediaElement) {
      const play = w.HTMLMediaElement.prototype.play;
      w.HTMLMediaElement.prototype.play = function (...args) {
        const back = restoring.get(this);
        if (back) return back.then(() => play.apply(this, args));
        if (muted(this)) return Promise.resolve();
        watchPlayback(this);
        return play.apply(this, args);
      };
    }

    if (w.AudioBufferSourceNode) {
      const start = w.AudioBufferSourceNode.prototype.start;
      w.AudioBufferSourceNode.prototype.start = function (...args) {
        if (!this.__waOurs && muted(this)) return;
        return start.apply(this, args);
      };
    }
  };

  const updateConfig = config => {
    if (!config) return;
    muteSendTone = !!config.muteSendTone;
    mutePageTone = !!config.mutePageTone;
    hideControlsWhenPaused = !(config.hideControlsWhenPaused === false);
  };

  return {
    watchForSends,
    interceptSounds,
    noteSend,
    updateConfig,
    recycle,
    conversationAudio,
    atEnd,
    isSendClick,
    getSentAt: () => sentAt,
  };
};

module.exports = {
  SEND_TONE_MS,
  RINGING_S,
  USER_MEDIA,
  RESTORE_WAIT_MS,
  END_SLACK,
  SEND_ICON,
  SEND_LABEL,
  isSendClick,
  createSoundManager,
};
