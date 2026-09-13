/*
 * D-Bus wire protocol constants and alignment tables.
 */
'use strict';

const LITTLE = 0x6c;
const BIG = 0x42;

const TYPE = {
  METHOD_CALL: 1,
  METHOD_RETURN: 2,
  ERROR: 3,
  SIGNAL: 4,
};

const NO_REPLY_EXPECTED = 1;

/* Header field codes, in the order the spec numbers them. */
const FIELD = {
  PATH: 1,
  INTERFACE: 2,
  MEMBER: 3,
  ERROR_NAME: 4,
  REPLY_SERIAL: 5,
  DESTINATION: 6,
  SENDER: 7,
  SIGNATURE: 8,
  UNIX_FDS: 9,
};

/* How far into the message each type has to start. Everything else follows from
   this table and from the rule that a struct opens on eight. */
const ALIGN = {
  y: 1, b: 4, n: 2, q: 2, i: 4, u: 4, x: 8, t: 8, d: 8,
  s: 4, o: 4, g: 1, a: 4, v: 1, '(': 8, '{': 8,
};

module.exports = {
  LITTLE,
  BIG,
  TYPE,
  NO_REPLY_EXPECTED,
  FIELD,
  ALIGN,
};
