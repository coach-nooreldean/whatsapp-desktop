/*
 * Binary Writer for D-Bus message marshalling.
 */
'use strict';

const { oneType, splitTypes, alignOf } = require('./signatures.js');

class Writer {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  /* Alignment is measured from the start of the message. The body is written on
     its own here, which is sound because a body always begins on eight. */
  pad(to) {
    const short = (to - (this.length % to)) % to;
    if (short) this.raw(Buffer.alloc(short));
  }

  raw(buf) {
    this.chunks.push(buf);
    this.length += buf.length;
  }

  byte(v) { this.raw(Buffer.from([v & 0xff])); }

  uint16(v) { this.pad(2); const b = Buffer.alloc(2); b.writeUInt16LE(v); this.raw(b); }
  int16(v) { this.pad(2); const b = Buffer.alloc(2); b.writeInt16LE(v); this.raw(b); }
  uint32(v) { this.pad(4); const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.raw(b); }
  int32(v) { this.pad(4); const b = Buffer.alloc(4); b.writeInt32LE(v | 0); this.raw(b); }
  uint64(v) { this.pad(8); const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.raw(b); }
  int64(v) { this.pad(8); const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); this.raw(b); }
  double(v) { this.pad(8); const b = Buffer.alloc(8); b.writeDoubleLE(v); this.raw(b); }

  /* Strings and object paths carry a four byte length; signatures carry one
     byte, which is why they are the only type that never needs padding. */
  string(v) {
    const b = Buffer.from(String(v), 'utf8');
    this.uint32(b.length);
    this.raw(b);
    this.byte(0);
  }

  signature(v) {
    const b = Buffer.from(String(v), 'utf8');
    this.byte(b.length);
    this.raw(b);
    this.byte(0);
  }

  write(type, value) {
    switch (type[0]) {
      case 'y': return this.byte(value);
      case 'b': return this.uint32(value ? 1 : 0);
      case 'n': return this.int16(value);
      case 'q': return this.uint16(value);
      case 'i': return this.int32(value);
      case 'u': return this.uint32(value);
      case 'x': return this.int64(value);
      case 't': return this.uint64(value);
      case 'd': return this.double(value);
      case 's': case 'o': return this.string(value);
      case 'g': return this.signature(value);
      case 'v': return this.variant(value);
      case 'a': return this.array(type, value);
      case '(': return this.struct(type, value);
      case '{': return this.struct(type, value);
      default: throw new Error(`dbus: cannot write type '${type}'`);
    }
  }

  /* A variant is its own signature followed by its value: [signature, value]. */
  variant(pair) {
    const [sig, value] = pair;
    this.signature(sig);
    this.write(oneType(sig, 0), value);
  }

  /*
   * An array is a byte count, then its elements -- and the count does not
   * include the padding that gets the first element onto its own alignment.
   * That padding is why the length has to be patched in afterwards rather than
   * measured first: where the elements begin depends on where the array begins.
   */
  array(type, values) {
    const element = type.slice(1);
    this.pad(4);
    const lengthAt = this.length;
    this.raw(Buffer.alloc(4));                    // patched below
    this.pad(alignOf(element));
    const from = this.length;
    for (const v of values || []) this.write(element, v);
    const bytes = this.length - from;
    /* The placeholder is its own chunk, so it can be rewritten in place. */
    let seen = 0;
    for (const chunk of this.chunks) {
      if (seen === lengthAt && chunk.length === 4) { chunk.writeUInt32LE(bytes >>> 0); break; }
      seen += chunk.length;
    }
  }

  struct(type, values) {
    const inner = type.slice(1, -1);
    const types = splitTypes(inner);
    this.pad(8);
    types.forEach((t, i) => this.write(t, values[i]));
  }

  toBuffer() { return Buffer.concat(this.chunks, this.length); }
}

/* Marshal a body on its own. A body always starts eight-aligned, so writing it
   from zero gives the same layout it will have in the message. */
const marshalBody = (signature, values) => {
  if (!signature) return Buffer.alloc(0);
  const w = new Writer();
  splitTypes(signature).forEach((t, i) => w.write(t, values[i]));
  return w.toBuffer();
};

module.exports = {
  Writer,
  marshalBody,
};
