/*
 * Text direction detection and paragraph marker decoration.
 */
'use strict';

const {
  RLM,
  LRM,
  PDI,
  flatten,
  RTL,
  LTR,
  OPENS,
} = require('./characters.js');

/*
 * The direction of the first character that has one, or null when the text is
 * all digits, punctuation and emoji. Deliberately first-strong and not "which
 * script is there more of".
 */
const directionOf = text => {
  const source = String(text == null ? '' : text);
  let inside = 0;
  for (const ch of source) {
    if (OPENS.test(ch)) {
      inside++;
      continue;
    }
    if (ch === PDI) {
      if (inside) inside--;
      continue;
    }
    if (inside) continue;
    if (RTL.test(ch)) return 'rtl';
    if (LTR.test(ch)) return 'ltr';
  }
  return null;
};

/*
 * Text, told which way it runs.
 * The mark goes at the head of the paragraph.
 */
const paragraph = (text, direction) => {
  const body = flatten(text);
  const way = direction || directionOf(body);
  return way ? (way === 'rtl' ? RLM : LRM) + body : body;
};

module.exports = {
  directionOf,
  paragraph,
};
