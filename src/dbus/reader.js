/*
 * Binary Reader for D-Bus message unmarshalling.
 */
'use strict';

const { oneType, splitTypes, alignOf } = require('./signatures.js');

class Reader {
  constructor(buf, little = true, at = 0) {
    this.buf = buf;
    this.little = little;
    this.at = at;
  }

  pad(to) { this.at += (to - (this.at % to)) % to; }

  byte() { return this.buf.readUInt8(this.at++); }

  uint16() {
    this.pad(2);
    const v = this.little ? this.buf.readUInt16LE(this.at) : this.buf.readUInt16BE(this.at);
    this.at += 2;
    return v;
  }

  int16() {
    this.pad(2);
    const v = this.little ? this.buf.readInt16LE(this.at) : this.buf.readInt16BE(this.at);
    this.at += 2;
    return v;
  }

  uint32() {
    this.pad(4);
    const v = this.little ? this.buf.readUInt32LE(this.at) : this.buf.readUInt32BE(this.at);
    this.at += 4;
    return v;
  }

  int32() {
    this.pad(4);
    const v = this.little ? this.buf.readInt32LE(this.at) : this.buf.readInt32BE(this.at);
    this.at += 4;
    return v;
  }

  uint64() {
    this.pad(8);
    const v = this.little ? this.buf.readBigUInt64LE(this.at) : this.buf.readBigUInt64BE(this.at);
    this.at += 8;
    return Number(v);
  }

  int64() {
    this.pad(8);
    const v = this.little ? this.buf.readBigInt64LE(this.at) : this.buf.readBigInt64BE(this.at);
    this.at += 8;
    return Number(v);
  }

  double() {
    this.pad(8);
    const v = this.little ? this.buf.readDoubleLE(this.at) : this.buf.readDoubleBE(this.at);
    this.at += 8;
    return v;
  }

  string() {
    const len = this.uint32();
    const s = this.buf.toString('utf8', this.at, this.at + len);
    this.at += len + 1;
    return s;
  }

  signatureString() {
    const len = this.byte();
    const s = this.buf.toString('utf8', this.at, this.at + len);
    this.at += len + 1;
    return s;
  }

  read(type) {
    switch (type[0]) {
      case 'y': return this.byte();
      case 'b': return this.uint32() !== 0;
      case 'n': return this.int16();
      case 'q': return this.uint16();
      case 'i': return this.int32();
      case 'u': return this.uint32();
      case 'x': return this.int64();
      case 't': return this.uint64();
      case 'd': return this.double();
      case 's': case 'o': return this.string();
      case 'g': return this.signatureString();
      case 'v': {
        const sig = this.signatureString();
        return this.read(oneType(sig, 0));
      }
      case 'a': {
        const element = type.slice(1);
        const bytes = this.uint32();
        this.pad(alignOf(element));
        const end = this.at + bytes;
        const out = [];
        while (this.at < end) out.push(this.read(element));
        this.at = end;
        return out;
      }
      case '(': case '{': {
        const types = splitTypes(type.slice(1, -1));
        this.pad(8);
        return types.map(t => this.read(t));
      }
      default: throw new Error(`dbus: cannot read type '${type}'`);
    }
  }
}

module.exports = {
  Reader,
};
