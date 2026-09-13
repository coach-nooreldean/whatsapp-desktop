/*
 * Debug command dispatchers for window control, input simulation, notifications, and snapshots.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { runScrollProbe, runGcProbe, runListenersProbe } = require('./profiler.js');

const SNAPSHOT = path.join(os.tmpdir(), 'whatsapp-desktop-snapshot.png');

async function handleCommand({ source, win, getBanners, actions }) {
  if (source === '#scroll' || source.startsWith('#scroll ')) {
    await runScrollProbe(win, source);
    return true;
  }

  if (source.startsWith('#zoom')) {
    const level = Number(source.split(/\s+/)[1]) || 1;
    win.webContents.setZoomFactor(level);
    console.log('debug: zoom %s', win.webContents.getZoomFactor());
    return true;
  }

  if (source.startsWith('#css-') && source !== '#css-off') {
    const style = require('../style.js');
    const family = require('../desktop.js').interfaceFont();
    const which = source.slice(5);
    const pieces = {
      font: `* { font-family: ${style.stack(family)} !important; }`,
      size: 'html { font-size: 16px !important; }',
      full: `* { font-family: ${style.stack(family)} !important; }\nhtml { font-size: 16px !important; }`,
      shipped: style.build({ fontSize: 16 }),
    };
    await require('../main-css.js').set(pieces[which] || '');
    console.log('debug: stylesheet -> %s', which);
    return true;
  }

  if (source === '#css-off') {
    const removed = await require('../main-css.js').drop();
    console.log('debug: user stylesheet %s', removed ? 'removed' : 'was not applied');
    return true;
  }

  if (source === '#esc' || source.startsWith('#key ')) {
    const key = source === '#esc' ? 'Escape' : source.slice(5).trim();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    win.webContents.sendInputEvent({ type: 'char', keyCode: key });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    console.log('debug: sent %s as a real key', key);
    return true;
  }

  if (source.startsWith('#type ')) {
    win.webContents.focus();
    win.webContents.insertText(source.slice(6));
    console.log('debug: typed %d character(s)', source.length - 6);
    return true;
  }

  if (/^#(click|right)\b/.test(source)) {
    const button = source.startsWith('#right') ? 'right' : 'left';
    const [x, y] = source.replace(/^#\w+/, '').trim().split(/\s+/).map(Number);
    const size = win.getContentSize();
    const at = { x: Number.isFinite(x) ? x : Math.round(size[0] / 2),
                 y: Number.isFinite(y) ? y : Math.round(size[1] / 2) };
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseMove', ...at });
    win.webContents.sendInputEvent({ type: 'mouseDown', ...at, button, clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', ...at, button, clickCount: 1 });
    console.log('debug: %s-clicked at %d,%d', button, at.x, at.y);
    return true;
  }

  if (source === '#notify' || source.startsWith('#notify ')) {
    const banners = getBanners && getBanners();
    if (!banners) { console.log('debug: no banners to raise'); return true; }
    const bidi = require('../bidi.js');
    const wording = require('../wording.js');
    const kinds = [
      ['\u{1F49F} Sticker', ''],
      ['\u{1F4F7} Photo', ''],
      ['\u{1F3A5} Video', ''],
      ['\u{1F3A4} Voice message (0:12)', ''],
      ['\u{1F39E}\uFE0F GIF', ''],
      ['\u{1F4C4} Document', ''],
      ['\u{1F4CD} Location', ''],
      ['\u{1F5BC}\uFE0F Album', ''],
      ['\u0631\u0633\u0627\u0644\u0629 \u0639\u0631\u0628\u064A \u0637\u0648\u064A\u0644\u0629 ' +
       '\u0639\u0634\u0627\u0646 \u0646\u0634\u0648\u0641 \u0627\u0644\u0633\u0637\u0631 ' +
       '\u0627\u0644\u062A\u0627\u0646\u064A \u0628\u064A\u0628\u062F\u0623 \u0645\u0646 ' +
       '\u0641\u064A\u0646', ''],
      ['\u062A\u0645\u0627\u0645 \u064A\u0627 \u0645\u0639\u0644\u0645', wording.REPLY_MARK],
      ['We are hiring / IT\n' +
       '\u062A\u0628\u062D\u062B \u0633\u0644\u0633\u0644\u0647 \u0645\u0637\u0627\u0639\u0645 ' +
       '\u0639\u0646 \u0645\u0647\u0646\u062F\u0633 IT\n' +
       '\u0631\u0648\u0627\u062A\u0628 \u0645\u062C\u0632\u064A\u0647', ''],
    ];
    let n = 0;
    for (const [message, mark] of kinds) {
      banners.show({
        identity: 'debug' + Date.now() + (n++),
        key: '__debug__',
        title: bidi.paragraph('WhatsApp \u2014 test'),
        body: bidi.line('Ahmed', message, mark),
      });
    }
    console.log('debug: raised %d banners, one per kind', n);
    return true;
  }

  if (source === '#ring' || source.startsWith('#ring ')) {
    const banners = getBanners && getBanners();
    if (!banners) { console.log('debug: no banners to raise'); return true; }
    const bidi = require('../bidi.js');
    const wording = require('../wording.js');
    const mark = wording.RINGING.voice;
    const seconds = Math.max(3, Number(source.slice(5).trim()) || 25);
    banners.show({
      identity: 'debug-ring' + Date.now(), msgId: 'debug-ring', key: '__ring__',
      ongoing: true, title: bidi.paragraph('Mega'), body: bidi.line('', mark),
    });
    console.log('debug: ringing; two messages behind it, and it stops in %ds', seconds);

    const held = [
      { who: 'Ahmed', key: '__held__',
        said: '\u0627\u0648\u0644 \u0631\u0633\u0627\u0644\u0629 \u0648\u0642\u062A \u0627\u0644\u0631\u0646\u064A\u0646' },
      { who: 'Mega', key: '__ring__',
        said: '\u0631\u0633\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0644\u064A \u0628\u064A\u0631\u0646 \u0646\u0641\u0633\u0647' },
    ];
    let n = 0;
    for (const one of held) {
      const at = ++n;
      setTimeout(() => banners.show({
        identity: 'debug-held' + Date.now() + at, msgId: 'debug-held' + at,
        key: one.key, title: bidi.paragraph(one.who),
        body: bidi.line(one.who, one.said),
      }), at * 1000);
    }
    setTimeout(() => {
      console.log('debug: %d ringing banner(s) taken down', banners.closeMessage('debug-ring'));
      banners.show({
        identity: 'debug-missed' + Date.now(), msgId: 'debug-missed', key: '__ring__',
        title: bidi.paragraph('Mega'), body: bidi.line('', wording.MISSED.voice),
      });
      console.log('debug: and the missed call in its place');
    }, seconds * 1000);
    return true;
  }

  if (source === '#gc') {
    await runGcProbe(win);
    return true;
  }

  if (source === '#listeners' || source.startsWith('#listeners ')) {
    await runListenersProbe(win, source);
    return true;
  }

  if (source === '#esc-outside') {
    await win.webContents.executeJavaScript(
      '(() => { const b = document.querySelector(\'[contenteditable="true"]\');' +
      ' if (b) b.blur(); const p = document.querySelector("#pane-side");' +
      ' if (p) { p.setAttribute("tabindex", "-1"); p.focus(); }' +
      ' return document.activeElement && document.activeElement.id; })()', true);
    for (const type of ['keyDown', 'char', 'keyUp'])
      win.webContents.sendInputEvent({ type, keyCode: 'Escape' });
    console.log('debug: sent Escape with the caret out of the composer');
    return true;
  }

  if (source.startsWith('#open ')) {
    win.webContents.send('wa:open-chat-request', { name: source.slice(6).trim() });
    console.log('debug: asked the page to open a conversation');
    return true;
  }

  if (source.startsWith('#story ')) {
    win.webContents.send('wa:store-open',
                         { chat: 'status@broadcast', story: true, msg: source.slice(7).trim() });
    console.log('debug: asked the page to open a story');
    return true;
  }

  if (source === '#tone') {
    win.webContents.send('wa:play-tone', null);
    console.log('debug: tone requested');
    return true;
  }

  if (source === '#screens' || source.startsWith('#screens ')) {
    const { desktopCapturer } = require('electron');
    const types = source.length > 8 ? source.slice(9).trim().split(/\s+/) : ['screen', 'window'];
    try {
      const sources = await Promise.race([
        desktopCapturer.getSources({ types, fetchWindowIcons: false }),
        new Promise(resolve => setTimeout(() => resolve('timed out after 8s'), 8000)),
      ]);
      console.log('debug: [%s] %s', types.join(','), typeof sources === 'string' ? sources :
        JSON.stringify(sources.map(s => ({ id: s.id, name: s.name }))));
    } catch (e) {
      console.warn('debug: screen sources failed: %s', e.message);
    }
    return true;
  }

  if (source === '#gpu') {
    const { app } = require('electron');
    console.log('debug: %s', JSON.stringify(app.getGPUFeatureStatus()));
    return true;
  }

  if (source === '#quit') {
    console.log('debug: quitting');
    const { app } = require('electron');
    app.quit();
    return true;
  }

  if (source === '#minimize') {
    win.minimize();
    await new Promise(resolve => setTimeout(resolve, 900));
    console.log('debug: minimized -> %s', JSON.stringify({
      visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized() }));
    return true;
  }

  if (source === '#focus') {
    win.focus();
    await new Promise(resolve => setTimeout(resolve, 1200));
    console.log('debug: focus -> %s', JSON.stringify({
      visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized() }));
    return true;
  }

  if (source === '#unfocus') {
    win.show(); win.blur();
    console.log('debug: shown and blurred');
    return true;
  }

  if (source.startsWith('#set ')) {
    const [key, ...rest] = source.slice(5).trim().split(/\s+/);
    const raw = rest.join(' ');
    const value = /^(true|false)$/i.test(raw) ? /^true$/i.test(raw)
      : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    if (!actions.set) { console.log('debug: nothing here can change a setting'); return true; }
    actions.set(key, value);
    console.log('debug: %s = %s (%s)', key, JSON.stringify(value), typeof value);
    return true;
  }

  if (source === '#settings') {
    if (!actions.settings) { console.log('debug: no settings window to open'); return true; }
    const panel = actions.settings();
    await new Promise(resolve => setTimeout(resolve, 600));
    console.log('debug: settings %s', panel && !panel.isDestroyed()
      ? JSON.stringify(panel.getBounds()) : 'did not open');
    return true;
  }

  if (source === '#fonts') {
    if (!actions.fonts) { console.log('debug: no fonts window to open'); return true; }
    const panel = actions.fonts();
    await new Promise(resolve => setTimeout(resolve, 600));
    console.log('debug: fonts %s', panel && !panel.isDestroyed()
      ? JSON.stringify(panel.getBounds()) : 'did not open');
    return true;
  }

  if (source === '#about' || source.startsWith('#about ')) {
    if (!actions.about) { console.log('debug: no about window to open'); return true; }
    const checkNow = source.slice('#about'.length).trim() === 'check';
    const panel = actions.about({ checkNow });
    await new Promise(resolve => setTimeout(resolve, checkNow ? 2500 : 600));
    console.log('debug: about %s', panel && !panel.isDestroyed()
      ? JSON.stringify(panel.getBounds()) : 'did not open');
    if (actions.lastUpdate) console.log('debug: update %s', JSON.stringify(actions.lastUpdate()));
    return true;
  }

  if (source === '#update' || source.startsWith('#update ')) {
    if (!actions.checkUpdate) { console.log('debug: nothing here checks for updates'); return true; }
    const pretend = source.slice('#update'.length).trim();
    if (pretend && actions.pretendVersion) {
      const asked = /^(off|reset|real)$/.test(pretend) ? null : pretend;
      actions.pretendVersion(asked);
      console.log('debug: asking as though this were %s', asked || 'itself');
    }
    const found = await new Promise(resolve => actions.checkUpdate(resolve));
    console.log('debug: update %s', JSON.stringify(found));
    return true;
  }

  if (source === '#hide') { win.hide(); console.log('debug: hidden'); return true; }

  if (source === '#show') {
    if (actions.show) actions.show(); else { win.show(); win.focus(); }
    await new Promise(resolve => setTimeout(resolve, 900));
    console.log('debug: shown -> %s', JSON.stringify({
      visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized() }));
    return true;
  }

  if (source === '#toggle') {
    if (!actions.toggle) { console.log('debug: nothing here to toggle'); return true; }
    const before = actions.inFront ? actions.inFront() : null;
    actions.toggle();
    await new Promise(resolve => setTimeout(resolve, 900));
    console.log('debug: toggle from %s -> %s',
      before === null ? 'unknown' : before ? 'in front' : 'away',
      JSON.stringify({ visible: win.isVisible(), focused: win.isFocused(),
        minimized: win.isMinimized(),
        onScreen: actions.onScreen ? actions.onScreen() : null,
        inFront: actions.inFront ? actions.inFront() : null }));
    return true;
  }

  if (source === '#state') {
    console.log('debug: %s', JSON.stringify({
      visible: win.isVisible(), focused: win.isFocused(),
      minimized: win.isMinimized(), zoom: win.webContents.getZoomFactor(),
      onScreen: actions.onScreen ? actions.onScreen() : null,
      inFront: actions.inFront ? actions.inFront() : null,
    }));
    return true;
  }

  if (source === '#snapshot' || source.startsWith('#snapshot ')) {
    const which = source.slice('#snapshot'.length).trim();
    const open = { about: actions.about, settings: actions.settings,
                   fonts: actions.fonts }[which];
    if (which && !open) { console.log('debug: nothing here draws a %s window', which); return true; }
    const target = open ? open() : win;
    if (!target || target.isDestroyed()) {
      console.log('debug: no %s window to photograph', which || 'main');
      return true;
    }
    if (open) await new Promise(resolve => setTimeout(resolve, 700));
    const file = which ? SNAPSHOT.replace(/\.png$/, `-${which}.png`) : SNAPSHOT;
    try {
      const image = await target.webContents.capturePage();
      fs.writeFileSync(file, image.toPNG());
      console.log('debug: wrote %s', file);
    } catch (e) {
      console.warn('debug: could not take a snapshot: %s', e.message);
    }
    return true;
  }

  return false;
}

module.exports = {
  SNAPSHOT,
  handleCommand,
};
