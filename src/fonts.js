/*
 * Font configuration coordinator for WhatsApp Desktop.
 *
 * Decomposed into:
 *   - src/fonts/catalogue.js: fontconfig queries (fc-list, fc-match, face picking)
 *   - src/fonts/document.js: fontconfig XML document generation
 *   - src/fonts/learning.js: runtime learned font persistence and replacement tables
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pick, installed, defaultFor } = require('./fonts/catalogue.js');
const { document_ } = require('./fonts/document.js');
const { learn, learned, REPLACED } = require('./fonts/learning.js');

/*
 * The whole font choice, resolved from what the config says into what the
 * stylesheet and the fontconfig document can be written from: a family per
 * script, the face to name for upright text, the face to name for italic text,
 * and a size for each.
 *
 * A script whose switch is still on arrives here as nothing at all -- `arabic`
 * null, `latin` carrying no more than the desktop's own family -- so a client
 * that has been asked for neither answers exactly what it answered before any
 * of this existed: one family, no size, no weight, no second script. `inherit`
 * says that both of them are in that state, which is the one thing the
 * stylesheet still wants to know as a whole: it is what keeps the rule for
 * unnamed text out of a sheet nobody asked for.
 */
const resolve = prefs => {
  const one = (want, fallbackFamily) => {
    const family = (want && want.family) || fallbackFamily || '';
    if (!family) return null;
    const wants = { bold: !!(want && want.bold), italic: !!(want && want.italic) };
    const size = Math.round(Number(want && want.size) || 100);
    /* The catalogue is only read when a particular FACE has been asked for.
       Naming the family is enough for everything else, and it is what this
       client named before any of this existed -- so a client running on the
       desktop font starts without a single fc-list behind it. Measured: the
       scan is 56ms, which is 56ms nobody who never opened the font settings
       should be paying at every launch. */
    const upright = wants.bold || wants.italic ? pick(family, wants) : null;
    const slanted = wants.bold || wants.italic
      ? pick(family, { bold: wants.bold, italic: true }) : null;
    return {
      family,
      /* Nothing at all at 100 per cent, so the sheet a client that was never
         asked for a size carries is the sheet it always carried. */
      size: size > 0 && size !== 100 ? size : 0,
      /* `local()` takes a full font name or a PostScript name, and which of
         the two a build resolves is not worth guessing at: both are named, in
         that order, and the first one the machine knows wins. */
      normal: upright && upright.names.length ? upright.names : [family],
      italic: slanted && slanted.names.length ? slanted.names : [family],
      /* What was asked for and could not be given, so a caller can say so. */
      wantedBold: wants.bold,
      wantedItalic: wants.italic,
      hasBold: !!(upright && upright.bold),
      hasItalic: !!(slanted && slanted.italic),
    };
  };

  return {
    inherit: !prefs || !!prefs.inherit,
    latin: one(prefs && prefs.latin, ''),
    /* No Arabic block at all until Arabic has been asked for. Its family may
       still be empty then -- a size on its own needs a face to sit on, and the
       system's own answer for Arabic is what it sits on. */
    arabic: prefs && prefs.arabic ? one(prefs.arabic, defaultFor('ar')) : null,
  };
};

/*
 * Writes the config and answers with its path and whether it CHANGED -- which
 * is the whole of "does this need a restart". fontconfig is read once, early,
 * by every process that draws text, so a document that is different from the
 * one Chromium read at startup is a difference that only a restart can apply.
 * Everything else the font settings do is a stylesheet, and a stylesheet goes
 * into a page that is already open.
 *
 * `file` is null when it could not be written -- in which case the caller
 * simply does not set FONTCONFIG_FILE and the page is drawn in WhatsApp's own
 * fonts, which is a cosmetic loss and nothing worse.
 */
const configure = (resolved, dir) => {
  const wanted = document_(resolved, learned(dir));
  if (!wanted) return { file: null, changed: false };
  const file = path.join(dir, 'fonts.conf');
  try {
    fs.mkdirSync(dir, { recursive: true });
    /* Rewritten only when it changed: fontconfig caches per file, and touching
       it on every start would throw that cache away for nothing. */
    let current = '';
    try { current = fs.readFileSync(file, 'utf8'); } catch (e) { /* first run */ }
    if (current === wanted) return { file, changed: false };
    fs.writeFileSync(file, wanted);
    return { file, changed: true };
  } catch (e) {
    console.warn('could not write %s: %s', file, e.message);
    return { file: null, changed: false };
  }
};

module.exports = {
  configure,
  learn,
  resolve,
  installed,
  defaultFor,
  REPLACED,
};
