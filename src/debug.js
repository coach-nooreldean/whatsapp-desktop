/*
 * Live debug session instrumentation and evaluation watcher.
 *
 * WHATSAPP_DEBUG_EVAL=/tmp/eval.js whatsapp-desktop
 *
 * Dispatches interactive commands (#snapshot, #scroll, #toggle, etc.) and
 * evaluates arbitrary JavaScript expressions directly in the main webContents.
 */
'use strict';

const fs = require('fs');
const { SNAPSHOT, handleCommand } = require('./debug/commands.js');

/* Running commentary, on only when the rig is. Window state changes are the
   thing worth narrating: they are what the tray reads, they arrive from the
   compositor rather than from this program, and on a bad day they do not
   arrive at all. */
const trace = (...args) => {
  if (!process.env.WHATSAPP_DEBUG_EVAL) return;
  const [first, ...rest] = args;
  console.log('%s ' + first, new Date().toISOString().slice(11, 23), ...rest);
};

const install = (getWindow, getBanners, actions = {}) => {
  const file = process.env.WHATSAPP_DEBUG_EVAL;
  if (!file) return;

  const run = async () => {
    let source = '';
    try { source = fs.readFileSync(file, 'utf8').trim(); } catch (e) { return; }
    if (!source) return;

    const win = getWindow();
    if (!win || win.isDestroyed()) return;

    const handled = await handleCommand({ source, win, getBanners, actions });
    if (handled) return;

    try {
      const result = await win.webContents.executeJavaScript(source, true);
      console.log('debug: %s', typeof result === 'string' ? result : JSON.stringify(result));
    } catch (e) {
      console.warn('debug: %s', e.message);
    }
  };

  try { fs.writeFileSync(file, fs.existsSync(file) ? fs.readFileSync(file) : ''); } catch (e) {}
  fs.watchFile(file, { interval: 300 }, (now, before) => {
    if (now.mtimeMs !== before.mtimeMs) run();
  });
  console.log('debug: watching %s', file);
};

module.exports = {
  install,
  trace,
  SNAPSHOT,
};
