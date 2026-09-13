/*
 * MPRIS D-Bus media integration and web audio player controls.
 */
'use strict';

const { MprisService } = require('../mpris.js');

const MEDIA_SCRIPTS = {
  playPause: `(() => {
    const btn = document.querySelector('#main div[role="button"]:has(span[data-icon="audio-play"]), #main div[role="button"]:has(span[data-icon="audio-pause"]), div[data-testid="audio-player"] button');
    if (btn) btn.click();
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { if (a.paused) a.play().catch(() => {}); else a.pause(); });
  })()`,

  play: `(() => {
    const btn = document.querySelector('#main div[role="button"]:has(span[data-icon="audio-play"])');
    if (btn) btn.click();
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { if (a.paused) a.play().catch(() => {}); });
  })()`,

  pause: `(() => {
    const btn = document.querySelector('#main div[role="button"]:has(span[data-icon="audio-pause"])');
    if (btn) btn.click();
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { if (!a.paused) a.pause(); });
  })()`,

  stop: `(() => {
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { a.pause(); a.currentTime = 0; });
  })()`,
};

function executeMediaScript(viewMgr, scriptKey) {
  const activeItem = viewMgr.accountViews.get(viewMgr.activeAccountId);
  if (activeItem && activeItem.view && !activeItem.view.webContents.isDestroyed()) {
    activeItem.view.webContents.executeJavaScript(MEDIA_SCRIPTS[scriptKey]).catch(() => {});
  }
}

function setupMpris(options) {
  const { config, windowStateMgr, viewMgr, quit } = options;
  if (config.get('behaviour.mpris-enabled') === false) return null;

  try {
    const mprisService = new MprisService({
      onRaise: () => windowStateMgr.showWindow('mpris raise requested'),
      onQuit: () => quit(),
      onPlayPause: () => executeMediaScript(viewMgr, 'playPause'),
      onPlay: () => executeMediaScript(viewMgr, 'play'),
      onPause: () => executeMediaScript(viewMgr, 'pause'),
      onStop: () => executeMediaScript(viewMgr, 'stop'),
    });

    mprisService.start(err => {
      if (err) console.log('MPRIS service unavailable: %s', err.message);
      else console.log('MPRIS2 service exported on %s', mprisService.busName);
    });

    return mprisService;
  } catch (e) {
    console.warn('Could not initialize MPRIS: %s', e.message);
    return null;
  }
}

module.exports = {
  setupMpris,
  executeMediaScript,
  MEDIA_SCRIPTS,
};
