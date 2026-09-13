/*
 * A session bus client, written here rather than installed.
 *
 * Modularized into:
 *   - src/dbus/constants.js: Wire protocol constants, alignment tables, and field codes
 *   - src/dbus/signatures.js: Type signature parsing and bracket counting
 *   - src/dbus/writer.js: Binary buffer Writer and body marshalling
 *   - src/dbus/reader.js: Binary buffer Reader and value unmarshalling
 *   - src/dbus/message.js: Message encoding, decoding, and framing
 *   - src/dbus/client.js: Bus class, socket management, and authentication handshake
 */
'use strict';

const { TYPE, NO_REPLY_EXPECTED, FIELD, ALIGN, LITTLE, BIG } = require('./dbus/constants.js');
const { oneType, splitTypes, alignOf } = require('./dbus/signatures.js');
const { Writer, marshalBody } = require('./dbus/writer.js');
const { Reader } = require('./dbus/reader.js');
const { encode, decode } = require('./dbus/message.js');
const { Bus, sessionAddress } = require('./dbus/client.js');

module.exports = {
  Bus,
  TYPE,
  marshalBody,
  splitTypes,
  oneType,
  NO_REPLY_EXPECTED,
  FIELD,
  ALIGN,
  LITTLE,
  BIG,
  Writer,
  Reader,
  encode,
  decode,
  sessionAddress,
};
