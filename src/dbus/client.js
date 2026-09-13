/*
 * Session bus connection, authentication handshake, and dispatch loop.
 */
'use strict';

const net = require('net');
const os = require('os');
const { TYPE, NO_REPLY_EXPECTED } = require('./constants.js');
const { encode, decode, getNextSerial } = require('./message.js');

/* Where the session bus is, in the one form every desktop sets. Anything other
   than a unix socket -- tcp, which nothing on a login session uses -- is left
   to the caller to fail on. */
const sessionAddress = () => {
  const addr = process.env.DBUS_SESSION_BUS_ADDRESS;
  if (addr) {
    for (const part of addr.split(';')) {
      const path = /^unix:(?:.*,)?path=([^,]+)/.exec(part);
      if (path) return path[1];
      const abstract = /^unix:(?:.*,)?abstract=([^,]+)/.exec(part);
      if (abstract) return '\0' + abstract[1];
    }
    return null;
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  return runtime ? `${runtime}/bus` : null;
};

class Bus {
  constructor(socket) {
    this.socket = socket;
    this.rest = Buffer.alloc(0);
    this.pending = new Map(); // serial -> callback
    this.objects = new Map(); // path -> { iface -> handlers }
    this.signalHandlers = [];
    this.name = null;

    socket.on('data', chunk => this.onData(chunk));
    socket.on('error', () => {});
  }

  /*
   * EXTERNAL is the mechanism a session bus grants to the user that owns it, and
   * the credentials travel with the socket rather than in the exchange -- the
   * uid written out here is only what the client claims to be. The leading NUL
   * is not part of any command; the protocol wants one byte on the wire before
   * the first word.
   */
  static connect(cb) {
    const path = sessionAddress();
    if (!path) { cb(new Error('no session bus address')); return; }

    let settled = false;
    const done = (err, bus) => { if (!settled) { settled = true; cb(err, bus); } };

    const socket = net.createConnection(path);
    socket.once('error', err => done(err));
    socket.once('connect', () => {
      const uid = Buffer.from(String(os.userInfo().uid), 'utf8').toString('hex');
      let greeting = '';

      const onGreeting = chunk => {
        greeting += chunk.toString('utf8');
        if (!greeting.includes('\r\n')) return;
        socket.removeListener('data', onGreeting);
        if (!/^OK /.test(greeting)) { done(new Error(`dbus: auth refused (${greeting.trim()})`)); return; }
        socket.write('BEGIN\r\n');

        const bus = new Bus(socket);
        bus.call({
          destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus',
          interface: 'org.freedesktop.DBus', member: 'Hello',
        }, (err, body) => {
          if (err) { done(err); return; }
          bus.name = body[0];
          done(null, bus);
        });
      };

      socket.on('data', onGreeting);
      socket.write('\0AUTH EXTERNAL ' + uid + '\r\n');
    });
  }

  onData(chunk) {
    this.rest = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk;
    for (;;) {
      let framed = null;
      try { framed = decode(this.rest); } catch (e) { this.rest = Buffer.alloc(0); return; }
      if (!framed) return;
      const [msg, used] = framed;
      this.rest = this.rest.slice(used);
      try { this.dispatch(msg); } catch (e) { /* one bad message is not the bus */ }
    }
  }

  dispatch(msg) {
    if (msg.type === TYPE.METHOD_RETURN || msg.type === TYPE.ERROR) {
      const cb = this.pending.get(msg.replySerial);
      if (!cb) return;
      this.pending.delete(msg.replySerial);
      if (msg.type === TYPE.ERROR) cb(new Error(msg.errorName || 'dbus error'), msg.body);
      else cb(null, msg.body);
      return;
    }

    if (msg.type === TYPE.SIGNAL) {
      for (const h of this.signalHandlers) h(msg);
      return;
    }

    if (msg.type === TYPE.METHOD_CALL) this.serve(msg);
  }

  /* An exported object answers, and anything it does not know about gets the
     error the spec asks for rather than silence -- a caller left waiting is
     worse than a caller told no. */
  serve(msg) {
    const reply = (signature, body) => {
      if (msg.flags & NO_REPLY_EXPECTED) return;
      this.send({
        type: TYPE.METHOD_RETURN, replySerial: msg.serial,
        destination: msg.sender, signature, body,
      });
    };
    const fail = (name, text) => {
      if (msg.flags & NO_REPLY_EXPECTED) return;
      this.send({
        type: TYPE.ERROR, replySerial: msg.serial, destination: msg.sender,
        errorName: name, signature: 's', body: [text],
      });
    };

    const object = this.objects.get(msg.path);
    const iface = object && object[msg.interface];
    const handler = iface && iface[msg.member];
    if (!handler) {
      fail('org.freedesktop.DBus.Error.UnknownMethod',
        `no ${msg.interface}.${msg.member} at ${msg.path}`);
      return;
    }
    try {
      handler(msg.body || [], reply, fail, msg);
    } catch (e) {
      fail('org.freedesktop.DBus.Error.Failed', e.message);
    }
  }

  send(msg) {
    const serial = getNextSerial();
    this.socket.write(encode(Object.assign({ serial }, msg)));
    return serial;
  }

  call(msg, cb) {
    const serial = getNextSerial();
    if (cb) this.pending.set(serial, cb);
    this.socket.write(encode(Object.assign({ type: TYPE.METHOD_CALL, serial }, msg)));
    return serial;
  }

  signal(msg) {
    this.send(Object.assign({ type: TYPE.SIGNAL }, msg));
  }

  export(path, interfaces) {
    const at = this.objects.get(path) || {};
    Object.assign(at, interfaces);
    this.objects.set(path, at);
  }

  onSignal(handler) { this.signalHandlers.push(handler); }

  addMatch(rule, cb) {
    this.call({
      destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus', member: 'AddMatch',
      signature: 's', body: [rule],
    }, cb || (() => {}));
  }

  requestName(name, cb) {
    /* 4 is DBUS_NAME_FLAG_DO_NOT_QUEUE: a second copy of this client should
       fail here rather than wait for the first one to exit. */
    this.call({
      destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus', member: 'RequestName',
      signature: 'su', body: [name, 4],
    }, cb);
  }

  close() {
    try { this.socket.destroy(); } catch (e) {}
  }
}

module.exports = {
  Bus,
  sessionAddress,
};
