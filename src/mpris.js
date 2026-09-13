/*
 * MPRIS2 D-Bus Media Player service for WhatsApp Desktop.
 *
 * Implements:
 *   org.mpris.MediaPlayer2
 *   org.mpris.MediaPlayer2.Player
 *
 * Modularized into:
 *   - src/mpris/constants.js: Introspection XML strings, interface identifiers, and variant packagers
 *   - src/mpris/service.js: MprisService lifecycle and D-Bus properties dispatcher
 */
'use strict';

const {
  MPRIS_NAME,
  MPRIS_PATH,
  MPRIS_IFACE,
  PLAYER_IFACE,
  PROPS_IFACE,
  INTROSPECT_IFACE,
} = require('./mpris/constants.js');
const { MprisService } = require('./mpris/service.js');

module.exports = {
  MprisService,
  MPRIS_NAME,
  MPRIS_PATH,
  MPRIS_IFACE,
  PLAYER_IFACE,
  PROPS_IFACE,
  INTROSPECT_IFACE,
};
