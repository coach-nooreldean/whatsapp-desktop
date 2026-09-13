/*
 * Electron session security, downloads, permissions, spellcheck, and cache maintenance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { isWhatsApp, chromeUserAgent, wirePermissions } = require('./permissions.js');
const { wireScreenSharing } = require('./screen.js');

function downloadStart(config, app) {
  const kept = String(config.get('media.download-dir') || '');
  if (kept) {
    try {
      if (fs.existsSync(kept) && fs.statSync(kept).isDirectory()) return kept;
    } catch (err) {
      console.warn('Could not verify download directory %s: %s', kept, err.message);
    }
  }
  return app.getPath('downloads');
}

function rememberDownloadDir(dir, config) {
  if (!dir || dir === config.get('media.download-dir')) return;
  config.set('media.download-dir', dir);
  config.save();
}

function wireDownloads(ses, config, app) {
  ses.on('will-download', (event, item) => {
    const name = item.getFilename();

    if (config.get('media.ask-where-to-save') !== false) {
      item.setSaveDialogOptions({ defaultPath: path.join(downloadStart(config, app), name) });
      item.once('done', (e, state) => {
        if (state !== 'completed') { console.log('download %s: %s', state, name); return; }
        const saved = item.getSavePath();
        console.log('downloaded %s', saved);
        rememberDownloadDir(path.dirname(saved), config);
      });
      return;
    }

    const downloads = app.getPath('downloads');
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    let target = path.join(downloads, name);
    for (let n = 1; fs.existsSync(target); n++) target = path.join(downloads, `${stem} (${n})${ext}`);
    item.setSavePath(target);
    item.once('done', (e, state) => {
      if (state === 'completed') console.log('downloaded %s', target);
    });
  });
}

function getSpellcheckLanguages(config) {
  const raw = config.get('behaviour.spellcheck-languages') || 'en-US,ar';
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function applySpellcheckToSession(ses, config) {
  if (!ses) return;
  const enabled = config.get('behaviour.spellcheck') !== false;
  const langs = getSpellcheckLanguages(config);
  try {
    if (typeof ses.setSpellCheckerEnabled === 'function') {
      ses.setSpellCheckerEnabled(enabled);
    }
    if (enabled && langs.length) {
      try {
        ses.setSpellCheckerLanguages(langs);
      } catch (e) {
        ses.setSpellCheckerLanguages(['en-US']);
      }
    } else {
      ses.setSpellCheckerLanguages([]);
    }
  } catch (err) {
    console.warn('Could not set spellchecker languages: %s', err.message);
  }
}

function configureSession(ses, { config, app, onWayland = false }) {
  const ua = chromeUserAgent();
  ses.setUserAgent(ua);
  wireDownloads(ses, config, app);
  wirePermissions(ses);
  wireScreenSharing(ses, onWayland);
  applySpellcheckToSession(ses, config);
}

async function clearAllCaches(accountViews) {
  let cleared = 0;
  if (!accountViews) return { ok: true, cleared };
  for (const { view } of accountViews.values()) {
    if (view && view.webContents && view.webContents.session) {
      try {
        await view.webContents.session.clearCache();
        await view.webContents.session.clearCodeCaches({});
        cleared++;
      } catch (e) {}
    }
  }
  return { ok: true, cleared };
}

async function getCacheSize(accountViews) {
  let totalBytes = 0;
  if (!accountViews) return totalBytes;
  for (const { view } of accountViews.values()) {
    if (view && view.webContents && view.webContents.session) {
      try {
        totalBytes += await view.webContents.session.getCacheSize();
      } catch (e) {}
    }
  }
  return totalBytes;
}

module.exports = {
  downloadStart,
  rememberDownloadDir,
  wireDownloads,
  getSpellcheckLanguages,
  applySpellcheckToSession,
  configureSession,
  clearAllCaches,
  getCacheSize,
};
