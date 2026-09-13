/*
 * D-Bus message framing, encoding, and decoding.
 */
'use strict';

const { LITTLE, BIG, FIELD } = require('./constants.js');
const { splitTypes } = require('./signatures.js');
const { Writer, marshalBody } = require('./writer.js');
const { Reader } = require('./reader.js');

let nextSerial = 1;

const encode = msg => {
  const body = marshalBody(msg.signature, msg.body || []);

  const fields = [];
  const add = (code, sig, value) => fields.push([code, [sig, value]]);
  if (msg.path) add(FIELD.PATH, 'o', msg.path);
  if (msg.interface) add(FIELD.INTERFACE, 's', msg.interface);
  if (msg.member) add(FIELD.MEMBER, 's', msg.member);
  if (msg.errorName) add(FIELD.ERROR_NAME, 's', msg.errorName);
  if (msg.replySerial !== undefined) add(FIELD.REPLY_SERIAL, 'u', msg.replySerial);
  if (msg.destination) add(FIELD.DESTINATION, 's', msg.destination);
  if (msg.signature) add(FIELD.SIGNATURE, 'g', msg.signature);

  const w = new Writer();
  w.byte(LITTLE);
  w.byte(msg.type);
  w.byte(msg.flags || 0);
  w.byte(1);
  w.uint32(body.length);
  w.uint32(msg.serial);
  w.array('a(yv)', fields);
  /* The body opens on eight whatever the header came to. */
  w.pad(8);
  return Buffer.concat([w.toBuffer(), body]);
};

/* Returns [message, bytesConsumed] or null when the buffer holds less than a
   whole message. */
const decode = buf => {
  if (buf.length < 16) return null;
  const little = buf.readUInt8(0) === LITTLE;
  if (!little && buf.readUInt8(0) !== BIG) throw new Error('dbus: bad endianness byte');

  const r = new Reader(buf, little, 1);
  const type = r.byte();
  const flags = r.byte();
  r.byte(); // protocol version
  const bodyLength = r.uint32();
  const serial = r.uint32();
  const fields = r.read('a(yv)');
  r.pad(8);
  const headerEnd = r.at;
  const total = headerEnd + bodyLength;
  if (buf.length < total) return null;

  const msg = { type, flags, serial };
  for (const [code, value] of fields) {
    if (code === FIELD.PATH) msg.path = value;
    else if (code === FIELD.INTERFACE) msg.interface = value;
    else if (code === FIELD.MEMBER) msg.member = value;
    else if (code === FIELD.ERROR_NAME) msg.errorName = value;
    else if (code === FIELD.REPLY_SERIAL) msg.replySerial = value;
    else if (code === FIELD.DESTINATION) msg.destination = value;
    else if (code === FIELD.SENDER) msg.sender = value;
    else if (code === FIELD.SIGNATURE) msg.signature = value;
  }

  msg.body = [];
  if (msg.signature) {
    const br = new Reader(buf.slice(headerEnd, total), little, 0);
    for (const t of splitTypes(msg.signature)) msg.body.push(br.read(t));
  }
  return [msg, total];
};

const getNextSerial = () => nextSerial++;

module.exports = {
  encode,
  decode,
  getNextSerial,
};
