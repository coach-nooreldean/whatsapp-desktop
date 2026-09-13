/*
 * Watching for StatusNotifierWatcher on DBus to know when an SNI host is available.
 */
'use strict';

const { execFile, spawn } = require('child_process');

const WATCHER = 'org.kde.StatusNotifierWatcher';
const DBUS = ['--session', '--dest', 'org.freedesktop.DBus',
              '--object-path', '/org/freedesktop/DBus'];

/* Half a second between the name appearing and the icon registering into it.
   Nothing measured says a host answers late, but a registration lost in that gap
   would be silent and would last the whole session, and at login nobody sees the
   delay. */
const SETTLE_MS = 500;

const OWNER_CHANGED =
  new RegExp(`NameOwnerChanged \\('${WATCHER.replace(/\./g, '\\.')}', '[^']*', '([^']*)'\\)`);

/* Is a host listening right now? null means the question could not be asked --
   no gdbus on the system -- and the caller should go ahead and try anyway. */
const hostPresent = cb => {
  execFile('gdbus', ['call', ...DBUS, '--method', 'org.freedesktop.DBus.NameHasOwner', WATCHER],
    (err, stdout) => cb(err ? null : String(stdout).includes('true')));
};

/* gdbus ships with glib, which Electron already links, so this needs nothing
   installed. `monitor` prints one line per signal, and the bus driver's
   NameOwnerChanged carries (name, old owner, new owner). Calls back once, and
   stops watching. */
const waitForHost = onHost => {
  let done = false;
  let monitor = null;

  const stop = () => {
    if (!monitor) return;
    try {
      monitor.kill();
    } catch (err) {
      // Monitor process might have already exited
    }
    monitor = null;
  };

  const arrived = delay => {
    if (done) return;
    done = true;
    stop();
    console.log('tray: a status icon host is listening');
    setTimeout(onHost, delay);
  };

  try {
    monitor = spawn('gdbus', ['monitor', ...DBUS], { stdio: ['ignore', 'pipe', 'ignore'] });
    monitor.on('error', () => {});     // no gdbus: the check below says "try anyway"
    let rest = '';
    monitor.stdout.setEncoding('utf8');
    monitor.stdout.on('data', chunk => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      for (const line of lines) {
        const owner = OWNER_CHANGED.exec(line);
        if (owner && owner[1] !== '') arrived(SETTLE_MS);
      }
    });
  } catch (e) {
    monitor = null;
  }

  hostPresent(present => {
    /* The monitor can report a host arriving before this answer comes back, and
       the answer is the older of the two. */
    if (done) return;
    if (present === null || present) arrived(0);
    else console.log('tray: no status icon host yet; the icon appears when one arrives');
  });

  /* Nothing else would take the monitor down, and a leaked child outlives the
     client. */
  return stop;
};

module.exports = {
  hostPresent,
  waitForHost,
  WATCHER,
  SETTLE_MS,
};
