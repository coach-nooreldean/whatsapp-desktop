/*
 * Row-level DOM reading, parsing, regex matching, and heuristics for WhatsApp chat lists.
 */
'use strict';

const wording = require('../../wording.js');

const OUTGOING_ICON = /^(wds-)?(ic-)?(msg-)?(status-)?(read|delivered|sent|check|dblcheck|clock|time)$/;
const OUTGOING_LABEL =
  /^(sent|delivered|read|pending|تم الإرسال|تم الارسال|تم التسليم|تمت القراءة|قيد الانتظار)$/i;
const SELF_SENDER = /^(you|أنت|انت|أنتَ|أنتِ)$/i;
const REACTION_PREVIEW = /\b(reacted|تفاعل)\b/i;
const MUTED_LABEL = /muted|مكتوم|كتم/i;
const MENTION_ICON  = /alternate-email|mention|reply|quoted|\bat-sign\b/i;
const MENTION_LABEL = /mention|منشن|إشارة|اشارة|رد على|replied to you/i;
const GROUP_ICON = /group|communit/i;
const UNREAD_LABEL = /unread|غير مقروء/i;

const TYPING_VERB    = 'typing|recording(?: audio)?';
const TYPING_VERB_AR = 'يكتب|يسجل';
const TYPING_END     = '\\s*(?:\\.{1,3}|…)?$';
const TYPING_PREVIEW = new RegExp([
  '^(?:' + TYPING_VERB + '|' + TYPING_VERB_AR + ')' + TYPING_END,
  '^[^:]{1,40}:\\s*(?:' + TYPING_VERB + '|' + TYPING_VERB_AR + ')' + TYPING_END,
  '^.{1,40}?\\s+(?:is|are)\\s+(?:' + TYPING_VERB + ')' + TYPING_END,
  '^.{1,40}?\\s+(?:' + TYPING_VERB_AR + ')' + TYPING_END,
].join('|'), 'i');

const STICKER = wording.STICKER;

const MEDIA_KINDS = [
  { icon: /sticker|ملصق/i,                         label: STICKER },
  { icon: /\bgif\b/i,                              label: '\u{1F39E}\uFE0F GIF' },
  { icon: /ptt|mic\b|headset|voice|رسالة صوتية/i,  label: '\u{1F3A4} Voice message' },
  { icon: /image|photo|camera|صورة/i,              label: '\u{1F4F7} Photo' },
  { icon: /videocam|video|فيديو/i,                label: '\u{1F3A5} Video' },
  { icon: /audio|music|أغنية|صوت/i,                label: '\u{1F3B5} Audio' },
  { icon: /poll|استطلاع/i,                         label: '\u{1F4CA} Poll' },
  { icon: /location|pin\b|موقع/i,                  label: '\u{1F4CD} Location' },
  { icon: /contact|vcard|جهة اتصال/i,              label: '\u{1F464} Contact' },
  { icon: /document|\bdoc\b|مستند|ملف/i,           label: '\u{1F4C4} Document' },
];

const FRESH_MS = 3 * 60 * 1000;

/* Chat names and message previews arrive wrapped in bidi control characters,
   which have to come off before anything is compared or displayed. */
const strip = t => (t || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();

const titlesIn = row => [...row.querySelectorAll('span[title]')];

const nameOf = row => {
  if (!row) return '';
  const first = titlesIn(row)[0];
  const fromTitle = strip(first && first.getAttribute('title'));
  if (fromTitle) return fromTitle;
  const dirAuto = row.querySelector('span[dir="auto"], div[dir="auto"]');
  if (dirAuto && dirAuto.innerText) return strip(dirAuto.innerText.split('\n')[0]);
  return '';
};

const iconNames = el => {
  const names = [...el.querySelectorAll('[data-icon]')].map(i => i.getAttribute('data-icon') || '');
  for (const svg of el.querySelectorAll('svg')) {
    names.push(svg.getAttribute('title') || '');
    const inner = svg.querySelector('title');
    if (inner) names.push(inner.textContent || '');
  }
  return names;
};

const senderIn = row => {
  const lines = ((row && row.innerText) || '').split('\n').map(strip);
  const colon = lines.indexOf(':');
  return colon > 0 ? lines[colon - 1].replace(/^~\s*/, '') : '';
};

const isOutgoing = el => {
  if (!el) return false;
  if (iconNames(el).some(n => OUTGOING_ICON.test(n))) return true;
  if ([...el.querySelectorAll('[aria-label]')]
        .some(e => OUTGOING_LABEL.test(strip(e.getAttribute('aria-label'))))) return true;
  return SELF_SENDER.test(senderIn(el));
};

const isMuted = row => [...row.querySelectorAll('[aria-label]')]
    .some(e => MUTED_LABEL.test(e.getAttribute('aria-label') || ''));

const isMention = row => {
  if (!row) return false;
  if (iconNames(row).some(name => MENTION_ICON.test(name))) return true;
  return [...row.querySelectorAll('[aria-label]')]
    .some(e => MENTION_LABEL.test(e.getAttribute('aria-label') || ''));
};

const isGroupRow = row => {
  if (!row) return false;
  if (iconNames(row).some(name => GROUP_ICON.test(name))) return true;
  if (titlesIn(row).length >= 3) return true;
  const who = senderIn(row);
  return !!who && !SELF_SENDER.test(who);
};

const isSilenced = row => isMuted(row) && !isMention(row);

const unreadCount = row => {
  if (!row) return 0;
  for (const el of row.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label') || '';
    if (!UNREAD_LABEL.test(label)) continue;
    const digits = label.match(/\d+/);
    return digits ? parseInt(digits[0], 10) : 1;
  }
  for (const el of row.querySelectorAll('[data-icon]')) {
    const icon = el.getAttribute('data-icon') || '';
    if (/unread/i.test(icon)) {
      const digits = (el.innerText || el.getAttribute('aria-label') || '').match(/\d+/);
      return digits ? parseInt(digits[0], 10) : 1;
    }
  }
  return 0;
};

const isTyping = preview => TYPING_PREVIEW.test(preview || '');

const mediaLabel = row => {
  if (!row) return '';
  const icons = iconNames(row);
  for (const kind of MEDIA_KINDS)
    if (icons.some(name => kind.icon.test(name))) return kind.label;

  const text = strip((row.innerText || '').split('\n').find(line => strip(line)) || '');
  return wording.mediaFromWords(text);
};

const labelled = (preview, row) => {
  const said = strip(preview);
  if (!said) return said;
  const named = wording.mediaFromWords(said);
  if (named) return named;
  if (/^\d{1,2}:\d{2}$/.test(said)) {
    const kind = mediaLabel(row);
    return kind ? kind + ' (' + said + ')' : said;
  }
  return said;
};

const previewIn = (row, titles) => {
  const list = titles || titlesIn(row);
  if (list.length < 2) return '';
  const last = strip(list[list.length - 1].getAttribute('title'));
  return last === strip(list[0] && list[0].getAttribute('title')) ? '' : last;
};

const readRow = row => {
  const titles = titlesIn(row);
  const name = (titles[0] && strip(titles[0].getAttribute('title'))) || nameOf(row);
  let preview = labelled(previewIn(row, titles), row);

  if (!preview) preview = mediaLabel(row);

  return {
    name,
    preview: preview || '',
    badge:   unreadCount(row),
    when:    ((row.innerText || '').match(/\b\d{1,2}:\d{2}(?:\s*[AP]M)?\b/) || [''])[0],
  };
};

const freshness = when => {
  const m = /^(\d{1,2}):(\d{2})(?:\s*([AP])\.?M\.?)?$/i.exec(when || '');
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  if (m[3]) hour = (hour % 12) + (/p/i.test(m[3]) ? 12 : 0);

  const now = new Date();
  const stamp = new Date(now);
  stamp.setHours(hour, parseInt(m[2], 10), 0, 0);

  let age = now - stamp;
  if (age < -FRESH_MS) age += 24 * 60 * 60 * 1000;
  return age >= -FRESH_MS && age <= FRESH_MS;
};

const isArrival = (before, now) => {
  const changed = now.preview !== before.preview ||
                  now.when !== before.when ||
                  now.badge > before.badge;
  if (!changed) return false;

  const fresh = freshness(now.when);
  return fresh === null ? now.badge > before.badge : fresh;
};

const openRow = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.querySelector('#main')) return null;
  const pane = d.querySelector('#pane-side');
  const selected = pane && pane.querySelector('[aria-selected="true"]');
  return selected ? selected.closest('[role="row"]') : null;
};

module.exports = {
  OUTGOING_ICON,
  OUTGOING_LABEL,
  SELF_SENDER,
  REACTION_PREVIEW,
  MUTED_LABEL,
  MENTION_ICON,
  MENTION_LABEL,
  GROUP_ICON,
  UNREAD_LABEL,
  TYPING_PREVIEW,
  MEDIA_KINDS,
  FRESH_MS,
  strip,
  titlesIn,
  nameOf,
  iconNames,
  senderIn,
  isOutgoing,
  isMuted,
  isMention,
  isGroupRow,
  isSilenced,
  unreadCount,
  isTyping,
  mediaLabel,
  labelled,
  previewIn,
  readRow,
  freshness,
  isArrival,
  openRow,
};
