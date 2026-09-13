/*
 * Which way a notification reads.
 *
 * Stated outright with a mark at the head of the paragraph, and everything
 * that has a direction of its own is wrapped in FSI..PDI.
 *
 * Modularized into:
 *   - src/bidi/characters.js: Unicode bidirectional marks, regexes, and isolate wrappers
 *   - src/bidi/detector.js: Direction detection and paragraph decoration
 */
'use strict';

const {
  RLM,
  LRM,
  FSI,
  PDI,
  BREAKS,
  flatten,
  isolate,
} = require('./bidi/characters.js');

const {
  directionOf,
  paragraph,
} = require('./bidi/detector.js');

/*
 * The sender, in front of what they said, and always at the left margin.
 */
const lead = (sender, message, joiner, mark) => {
  const text = flatten(message);
  const who = String(sender == null ? '' : sender).trim();
  const opener = flatten(mark);
  const head = opener ? opener + ' ' : '';

  if (!who) return head ? paragraph(head + isolate(text), 'ltr') : paragraph(text);
  return paragraph(head + isolate(who) + joiner + isolate(text), 'ltr');
};

/* What somebody said, which a colon is the right punctuation for. */
const line = (sender, message, mark) => lead(sender, message, ': ', mark);

/* What somebody DID -- "Mega reacted 😂 to: ..." -- which this client is
   describing rather than quoting. */
const did = (sender, message, mark) => lead(sender, message, ' ', mark);

/* Plain words, run together on the one line a banner has. */
const words = (...parts) => parts
  .map(part => flatten(part))
  .filter(Boolean)
  .join(' ');

module.exports = {
  directionOf,
  paragraph,
  isolate,
  line,
  did,
  words,
  flatten,
  RLM,
  LRM,
  FSI,
  PDI,
  BREAKS,
};
