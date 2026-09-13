/*
 * Layout, animation, and element sizing CSS rules for WhatsApp Web.
 */
'use strict';

/*
 * How narrow a bubble is allowed to get, and why a received one needed telling.
 *
 * 4.9em floor states the width the ticks come to (68.6px at 14px message font).
 * Every short bubble in a conversation is then the same size whichever side it sits on.
 */
const BUBBLE_MIN = `
#main div.copyable-text[data-pre-plain-text] {
  min-width: 4.9em !important;
}`;

/*
 * WhatsApp's conversation scroller layer promotion.
 *
 * will-change: scroll-position and 3D transform promote conversation onto
 * compositor layer on Linux builds.
 */
const CONVERSATION_SCROLL = `
#main [data-testid="conversation-panel-messages"],
#main [data-tab="conversation-panel-messages"] {
  will-change: scroll-position;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}`;

/*
 * Placeholder avatar icon fit inside its container.
 */
const ICON_FIT = `
span[data-icon] > svg {
  max-width: 100%;
  max-height: 100%;
}`;

/*
 * Right-hand drawer animation instant layout.
 *
 * Makes entrance instant in CSS (1ms duration) so slideTheDrawer in inject.js
 * can drive smooth Web Animations slide on compositor.
 */
const DRAWER_MOTION = `
#app [data-testid="drawer-right"] {
  animation-duration: 1ms !important;
  animation-delay: 0s !important;
}`;

/*
 * Reply bar panel mount trigger.
 *
 * Raises animationstart on mount so inject.js can take over entrance/exit.
 */
const PANEL_MOUNT = `
footer [data-testid="popup_panel"] {
  animation: whatsapp-desktop-panel 1ms !important;
}
@keyframes whatsapp-desktop-panel { from { opacity: 1; } to { opacity: 1; } }`;

module.exports = {
  BUBBLE_MIN,
  CONVERSATION_SCROLL,
  ICON_FIT,
  DRAWER_MOTION,
  PANEL_MOUNT,
};
