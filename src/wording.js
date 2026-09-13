/*
 * The sticker's glyph, marks, phrase detection, and message wording.
 *
 * Modularized into:
 *   - src/wording/marks.js: Monochrome emoji presentation marks and glyph definitions
 *   - src/wording/phrases.js: Multilingual phrase regexes and preview parsing
 */
'use strict';

const {
  TEXT,
  mono,
  STICKER,
  MISSED,
  RINGING,
  MENTION_MARK,
  REPLY_MARK,
  STATUS_MENTION_MARK,
  MARKS,
} = require('./wording/marks.js');

const {
  MEDIA_WORDS,
  AIMED_AT_US,
  NAME_WORDS,
  NAME_CHARS,
  mediaFromWords,
  kindOf,
  pushName,
  nameLike,
  readBody,
} = require('./wording/phrases.js');

module.exports = {
  kindOf,
  pushName,
  readBody,
  mediaFromWords,
  STICKER,
  MISSED,
  RINGING,
  MARKS,
  MENTION_MARK,
  REPLY_MARK,
  STATUS_MENTION_MARK,
  TEXT,
  mono,
  MEDIA_WORDS,
  AIMED_AT_US,
  NAME_WORDS,
  NAME_CHARS,
  nameLike,
};
