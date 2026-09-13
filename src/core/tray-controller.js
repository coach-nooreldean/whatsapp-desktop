/*
 * System tray icon initialization and event binding.
 */
'use strict';

const { TrayIcon } = require('../tray.js');

function setupTray(options) {
  const {
    iconFile,
    APP_ID,
    TITLE,
    windowStateMgr,
    dialogMgr,
    quit,
    app,
  } = options;

  let tray = null;

  tray = new TrayIcon({
    normal: iconFile(24, `status/${APP_ID}-tray.png`),
    attention: iconFile(24, `status/${APP_ID}-tray-attention.png`),
    onToggle: () => windowStateMgr.toggleWindow(),
    onShow: () => windowStateMgr.showWindow('the tray'),
    onHide: () => windowStateMgr.hideWindow(),
    getInFront: () => windowStateMgr.windowInFront(),
    onQuit: quit,
    onSettings: () => dialogMgr.openSettings(),
    onFonts: () => dialogMgr.openFonts(),
    onAbout: () => dialogMgr.openAbout({ app, tray }),
    getUpdate: () => dialogMgr.lastUpdate,
    title: TITLE,
    appId: APP_ID,
  });

  windowStateMgr.setTray(tray);
  tray.setInFront(windowStateMgr.windowInFront());

  return tray;
}

module.exports = {
  setupTray,
};
