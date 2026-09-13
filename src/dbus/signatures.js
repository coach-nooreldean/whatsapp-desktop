/*
 * D-Bus type signature parser and alignment utilities.
 */
'use strict';

const { ALIGN } = require('./constants.js');

/* One complete type from the front of a signature, so that the marshaller can
   walk a struct or an array element without counting brackets twice. */
const oneType = (sig, at) => {
  const c = sig[at];
  if (c === 'a') {
    const inner = oneType(sig, at + 1);
    return c + inner;
  }
  if (c === '(' || c === '{') {
    const close = c === '(' ? ')' : '}';
    let depth = 1;
    let end = at + 1;
    while (end < sig.length && depth > 0) {
      if (sig[end] === '(' || sig[end] === '{') depth++;
      else if (sig[end] === ')' || sig[end] === '}') depth--;
      if (depth === 0) break;
      end++;
    }
    return sig.slice(at, end + 1);
  }
  return c;
};

/* The types of a signature, side by side: "ia{sv}av" -> ["i","a{sv}","av"] */
const splitTypes = sig => {
  const out = [];
  let at = 0;
  while (at < sig.length) {
    const t = oneType(sig, at);
    out.push(t);
    at += t.length;
  }
  return out;
};

const alignOf = type => (ALIGN[type[0]] !== undefined ? ALIGN[type[0]] : 1);

module.exports = {
  oneType,
  splitTypes,
  alignOf,
};
