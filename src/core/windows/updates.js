/*
 * Update check coordinator and external links for auxiliary windows.
 */
'use strict';

const { shell } = require('electron');
const updates = require('../../update.js');

const SITES = {
  site: updates.SITE,
  update: `${updates.SITE}#update`,
  source: `https://github.com/${updates.REPO}`,
};

const UPDATE_FRESH_MS = 10 * 60 * 1000;

class UpdateController {
  constructor() {
    this.lastUpdate = null;
    this.lastUpdateAt = 0;
    this.checking = false;
    this.waitingOnCheck = [];
    this.pretendVersion = null;
    this.aboutShouldCheck = false;
  }

  getCurrentVersion(app) {
    return this.pretendVersion || (app && typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0');
  }

  setPretendVersion(version) {
    this.pretendVersion = version;
  }

  checkForUpdates(app, tray, done, getAboutWin) {
    if (done) this.waitingOnCheck.push(done);
    if (this.checking) return;
    this.checking = true;

    updates.check(this.getCurrentVersion(app), (err, found) => {
      this.checking = false;
      this.lastUpdate = err ? { current: this.getCurrentVersion(app), error: err.message } : found;
      this.lastUpdateAt = Date.now();
      console.log('update: %s', err ? `could not ask (${err.message})`
        : found.newer ? `${found.latest} is out, and this is ${found.current}`
        : `${found.current} is the latest release`);

      if (tray) tray.refreshUpdate();
      const aboutWin = getAboutWin ? getAboutWin() : null;
      if (aboutWin && !aboutWin.isDestroyed()) {
        aboutWin.webContents.send('about:changed', { update: this.lastUpdate });
      }

      for (const waiting of this.waitingOnCheck.splice(0)) waiting(this.lastUpdate);
    });
  }

  openSite(where) {
    const url = SITES[where] || SITES.site;
    console.log('opening %s', url);
    shell.openExternal(url).catch(e => console.warn('could not open %s: %s', url, e.message));
  }
}

module.exports = {
  UpdateController,
  SITES,
  UPDATE_FRESH_MS,
};
