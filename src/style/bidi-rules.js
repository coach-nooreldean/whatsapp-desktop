/*
 * Arabic descender clipping and bidirectional text rules for WhatsApp Web.
 */
'use strict';

/* Arabic descenders against WhatsApp's line boxes.
 *
 * WhatsApp draws its list rows and its bubbles into boxes it clips with
 * overflow:hidden, sized for Latin. The bowl of a final ن or ي hangs further
 * below the baseline than that leaves room for, so the tails were shorn off and
 * "يعني" could read as "يعن ،".
 *
 * The fix is a wider CLIP, never a taller line. Padding grows the box that
 * overflow:hidden cuts against and a negative margin hands the space straight
 * back, so every row keeps the height WhatsApp Web gave it. Raising line-height
 * instead does fix the tails, and it moves every Arabic line off the rhythm the
 * page was designed on -- and in a bubble it lands on a span inside a div pinned
 * at 19px, which shears five pixels off every line. That version shipped once
 * from the GTK client and came straight back out.
 *
 * There is no switch for this. It was one for a while, and a switch for
 * "should the letters have their tails" is not a preference -- an owner who
 * turns it off gets a bug back, and one who never finds it reads shorn Arabic
 * for ever. The same goes for MESSAGE_BIDI below.
 */
const ARABIC_CLIP = `
/* The clipping box in a bubble is the div directly under .copyable-text. */
#main div.copyable-text:not([contenteditable]) > div {
  padding-bottom: 0.2em !important;
  margin-bottom: -0.2em !important;
}
/* The chat list is deliberately NOT touched. WebKit sized a line box from the
   primary font alone, so Arabic arriving as a fallback was measured against a
   face that has none of it and fell outside the box; Chromium measures the line
   against every font actually used in it, so the rows size themselves. If Arabic
   ever does get shorn in the list here, the rule that belongs is this same clip
   widening on "#pane-side div:has(> span[title])" -- never a line-height, which
   in the GTK client shifted every Arabic line off the page's own rhythm. */

/* The composer clips the same way. A taller line box here is a trap: WhatsApp
   already sets 1.47em on it, and one pixel of overflow makes the box scrollable,
   so every keystroke scrolled the caret back into view and the text twitched. */
[contenteditable="true"] {
  padding-bottom: 0.35em !important;
  margin-bottom: -0.35em !important;
}`;

/*
 * Which way each line of a message reads, and which margin it sits against.
 *
 * All of this was measured on the live client, on the very messages that were
 * reported. Guessing at it produced three wrong fixes in a row, so the shape of
 * a message body is written down here in full:
 *
 *   div.copyable-text                       -- the message body
 *     div                                   -- direction ltr, text-align start
 *       span.selectable-text[dir=ltr|rtl]   -- INLINE, unicode-bidi isolate,
 *         span   "first line\\n"            white-space pre-wrap. WhatsApp
 *         span   "\\n"                      splits the text at every newline and
 *         span[dir=rtl] "…\\n"              gives each piece a span of its own.
 *         span   "last line, no newline"    Those pieces are display:block --
 *       span[aria-hidden] "6:03 PM"         except the last, which stays inline.
 *
 * A PICTURE'S CAPTION is the same body in a different place, and that is why
 * the rules below are not scoped to #main and not scoped to div.copyable-text
 * either. Measured on the live client, in the conversation and in the viewer
 * that opens when the picture is clicked:
 *
 *   div                                     -- plain, direction ltr
 *     span.selectable-text.copyable-text     -- INLINE, isolate, pre-wrap
 *       span "first line\n" ...              the same line spans as above
 *
 * The class that says "this is a message body" is on the SPAN here and there is
 * no div.copyable-text immediately above it -- the bubble's is three divs up,
 * and the media viewer is mounted outside #main altogether. So the selector
 * that fixed a bubble reached neither of them, and an Arabic caption wrapped
 * the wrong way round in both.
 */
const BODY = 'div:not([contenteditable]) > span.selectable-text.copyable-text';

const MESSAGE_BIDI = `
/* The body of a message: a box of its own, aligned to the start of the
   direction WhatsApp worked out for it. */
${BODY} {
  display: block !important;
  unicode-bidi: isolate !important;
  text-align: start !important;
}
/* Each line in it: its own direction, from its own first strong character, and
   the start margin of that direction. Arabic right, English left, whatever
   either of them happens to begin with. */
${BODY} > span,
${BODY} ul,
${BODY} li {
  unicode-bidi: plaintext !important;
  text-align: start !important;
}
/* A bulleted list, and the side its bullets need room on. */
${BODY} ul:has(> li:dir(rtl)) {
  direction: rtl !important;
}
${BODY} li:dir(rtl) {
  padding-left: 0 !important;
  padding-right: 12px !important;
}
/* And the gap between a bullet and its words. */
${BODY} li::before {
  margin-right: 0 !important;
  margin-inline-end: 4px !important;
}
/* The quoted message above a reply. */
${BODY}.quoted-mention:not(:only-child) {
  display: inline !important;
}
/* A community thread. */
[data-testid="comment-row"] span[data-testid="selectable-text"] {
  display: block !important;
  unicode-bidi: plaintext !important;
  text-align: start !important;
}
/* Every list of names, which is a column and is drawn the way the interface is. */
#pane-side span[title][dir],
[data-testid^="cell-frame-"] span[title][dir],
[data-testid^="cell-frame-"] span[title][dir].selectable-text,
[data-testid="cell-frame-title"] span[dir],
[data-testid="cell-frame-label"] span[dir],
[data-testid="drawer-right"] span.selectable-text.copyable-text:not(
  [data-testid="msg-container"] *, [data-testid^="cell-frame-"] *) {
  text-align: left !important;
}
#pane-side:dir(rtl) span[title][dir],
[data-testid^="cell-frame-"]:dir(rtl) span[title][dir],
[data-testid^="cell-frame-"]:dir(rtl) span[title][dir].selectable-text,
[data-testid="cell-frame-title"]:dir(rtl) span[dir],
[data-testid="cell-frame-label"]:dir(rtl) span[dir],
[data-testid="drawer-right"]:dir(rtl) span.selectable-text.copyable-text:not(
  [data-testid="msg-container"] *, [data-testid^="cell-frame-"] *) {
  text-align: right !important;
}`;

module.exports = {
  ARABIC_CLIP,
  BODY,
  MESSAGE_BIDI,
};
