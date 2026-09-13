/*
 * Avatar fetching, base64 conversion, caching, and chat face tracking.
 */
'use strict';

const { strip, nameOf, isGroupRow } = require('./rows.js');

const AVATAR_MAX_BYTES = 200000;
const AVATAR_TIMEOUT_MS = 1200;
const FACES_TTL_MS = 12 * 60 * 60 * 1000;
const FACES_MAX = 256;

const bytesToBase64 = (bytes, btoaFn) => {
  const btoaImpl = btoaFn || (typeof btoa === 'function' ? btoa : text => Buffer.from(text, 'binary').toString('base64'));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoaImpl(binary);
};

const faceUrlIn = row => {
  for (const img of (row ? row.querySelectorAll('img') : [])) {
    const src = img.src || '';
    if (!/^https?:|^blob:/.test(src)) continue;
    if (img.naturalWidth && img.naturalWidth < 16) continue;
    return src;
  }
  return '';
};

const rememberFace = (chatFaces, name, row) => {
  if (!name || !chatFaces) return;
  const url = faceUrlIn(row);
  const before = chatFaces.get(name);
  chatFaces.set(name, {
    url: url || (before && before.url) || '',
    group: isGroupRow(row),
    at: Date.now(),
  });
  if (chatFaces.size > FACES_MAX) {
    const cutoff = Date.now() - FACES_TTL_MS;
    for (const [key, seen] of chatFaces) if (seen.at < cutoff) chatFaces.delete(key);
    for (const key of chatFaces.keys()) {
      if (chatFaces.size <= FACES_MAX) break;
      chatFaces.delete(key);
    }
  }
};

const fetchAvatar = async (avatars, src, btoaFn) => {
  if (avatars.has(src)) return avatars.get(src);

  let encoded = '';
  try {
    const response = await fetch(src);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length && bytes.length <= AVATAR_MAX_BYTES) encoded = bytesToBase64(bytes, btoaFn);
    }
  } catch (e) { /* offline, or the URL expired: the app icon will do */ }

  if (avatars.size > 64) avatars.clear();
  avatars.set(src, encoded);
  return encoded;
};

const withTimeout = (promise, ms = AVATAR_TIMEOUT_MS) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(() => resolve(''), ms)),
]);

const rowFor = (doc, name) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const wanted = strip(name);
  if (!wanted) return null;

  const pane = d.querySelector('#pane-side');
  const rows = [...(pane ? pane.querySelectorAll('[role="row"]') : [])];
  const exact = rows.find(row => nameOf(row) === wanted);
  if (exact) return exact;

  return rows.find(row => {
    const rowName = nameOf(row);
    return rowName.length > 2 &&
           (wanted.indexOf(rowName) >= 0 || rowName.indexOf(wanted) >= 0);
  }) || null;
};

const chatNameFor = (doc, chatFaces, name) => {
  const wanted = strip(name);
  if (!wanted) return '';

  const row = rowFor(doc, wanted);
  if (row) return nameOf(row);

  if (chatFaces && chatFaces.has(wanted)) return wanted;
  if (chatFaces) {
    for (const known of chatFaces.keys())
      if (known.length > 2 && (wanted.indexOf(known) >= 0 || known.indexOf(wanted) >= 0))
        return known;
  }
  return '';
};

const chatKindFor = (doc, chatFaces, name) => {
  const row = rowFor(doc, strip(name));
  if (row) return isGroupRow(row);
  const known = chatFaces ? chatFaces.get(chatNameFor(doc, chatFaces, name)) : null;
  return known && known.group ? true : null;
};

const avatarOf = async (row, name, chatFaces, avatars, btoaFn) => {
  const url = faceUrlIn(row) ||
              ((chatFaces && chatFaces.get(strip(name) || nameOf(row))) || {}).url || '';
  if (!url) return '';
  return withTimeout(fetchAvatar(avatars, url, btoaFn));
};

const avatarFor = async (name, doc, chatFaces, avatars, rememberName, btoaFn) => {
  const wanted = strip(name);
  if (!wanted) return '';
  if (typeof rememberName === 'function') rememberName(wanted);

  const match = rowFor(doc, wanted);
  if (match) return avatarOf(match, wanted, chatFaces, avatars, btoaFn);

  const remembered = chatFaces ? chatFaces.get(chatNameFor(doc, chatFaces, wanted) || wanted) : null;
  return remembered ? withTimeout(fetchAvatar(avatars, remembered.url, btoaFn)) : '';
};

module.exports = {
  AVATAR_MAX_BYTES,
  AVATAR_TIMEOUT_MS,
  FACES_TTL_MS,
  FACES_MAX,
  bytesToBase64,
  faceUrlIn,
  rememberFace,
  fetchAvatar,
  withTimeout,
  rowFor,
  chatNameFor,
  chatKindFor,
  avatarOf,
  avatarFor,
};
