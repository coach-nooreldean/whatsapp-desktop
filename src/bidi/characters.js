/*
 * Unicode Bidirectional markers, script ranges, and text flattening helpers.
 */
'use strict';

const RLM = '‏'; // right-to-left mark: states the paragraph direction
const LRM = '‎'; // left-to-right mark
const FSI = '⁨'; // first-strong isolate: "work this out on its own"
const PDI = '⁩'; // pop directional isolate

const BREAKS = /[\r\n\u2028\u2029]+/g;

/* Whatever it arrived as, on one line. WhatsApp writes a message's own newlines
   and this module used to write U+2029; both are the same thing here. */
const flatten = text => String(text == null ? '' : text).replace(BREAKS, ' ').trim();

/* Ranges that carry a direction. Hebrew and Arabic, including the presentation
   forms an Arabic keyboard can produce, and the Latin/Greek/Cyrillic block for
   the other side. */
const RTL = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿\u{10e60}-\u{10e7e}\u{1ee00}-\u{1eeff}]/u;
const LTR = /[A-Za-zÀ-ʸͰ-֏ऀ-῿Ⰰ-퟿豈-ﬗ]/u;

/* The characters that open an isolate, and the one that closes any of them. */
const OPENS = /[\u2066\u2067\u2068]/; /* LRI, RLI, FSI */

/* A name that must not decide the direction of the line it is printed on, and
   must not be reordered by it either. FSI lets the name run whichever way its
   own letters do; PDI ends that and hands the line back. */
const isolate = text => {
  const name = String(text == null ? '' : text);
  return name ? FSI + name + PDI : '';
};

module.exports = {
  RLM,
  LRM,
  FSI,
  PDI,
  BREAKS,
  flatten,
  RTL,
  LTR,
  OPENS,
  isolate,
};
