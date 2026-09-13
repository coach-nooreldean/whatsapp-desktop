/*
 * The user stylesheet coordinator and builder.
 *
 * Imposes layout improvements, Arabic descender fixes, and font aliasing without
 * expensive universal !important rules. Re-exports stack and fontFaces for
 * font diagnostic tools.
 */
'use strict';

const { ARABIC_CLIP, MESSAGE_BIDI } = require('./style/bidi-rules.js');
const {
  BUBBLE_MIN,
  CONVERSATION_SCROLL,
  ICON_FIT,
  DRAWER_MOTION,
  PANEL_MOUNT,
} = require('./style/rules.js');
const { stack, fontFaces } = require('./style/fonts.js');

/*
 * Every rule in this sheet is unconditional now, so nothing has to be written
 * back out to undo it -- which is what the second argument used to be for.
 */
const build = ({ fontSize }, before) => {
  const rules = [
    CONVERSATION_SCROLL,
    DRAWER_MOTION,
    PANEL_MOUNT,
    ARABIC_CLIP,
    MESSAGE_BIDI,
    BUBBLE_MIN,
    ICON_FIT,
  ];

  if (fontSize) rules.push(`html { font-size: ${fontSize}px !important; }`);

  return rules.join('\n');
};

module.exports = {
  build,
  stack,
  fontFaces,
};
