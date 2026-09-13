/*
 * Chromium switches, platform detection, and startup environment for WhatsApp Desktop.
 */
'use strict';

const path = require('path');
const os = require('os');
const fonts = require('../fonts.js');
const desktop = require('../desktop.js');

const APP_ID = 'io.github.shehawey.whatsapp-desktop';
const TITLE = 'WhatsApp';

function handleCliArgs(app, pkg) {
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(`whatsapp-desktop ${pkg.version}`);
    app.exit(0);
  }

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: whatsapp-desktop [options]

Options:
  --hidden        Start minimized to the system tray
  -v, --version   Show version number
  -h, --help      Show this help message
`);
    app.exit(0);
  }
}

function initEnvironment(app) {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  app.setPath('userData', path.join(dataHome, 'whatsapp-desktop'));
  app.setName(TITLE);
  process.title = TITLE;

  if (process.platform === 'linux') {
    app.setDesktopName(APP_ID + '.desktop');
  }
}

function fontPrefs(config) {
  const desktopFamily = config.get('view.font') || desktop.interfaceFont();
  const script = name => (config.get(`fonts.${name}-inherit`) ? null : {
    family: config.get(`fonts.${name}-family`) || '',
    size: Number(config.get(`fonts.${name}-size`)) || 100,
    bold: !!config.get(`fonts.${name}-bold`),
    italic: !!config.get(`fonts.${name}-italic`),
  });
  const latin = script('latin');
  const arabic = script('arabic');
  return {
    inherit: !latin && !arabic,
    latin: latin ? { ...latin, family: latin.family || desktopFamily } : { family: desktopFamily },
    arabic,
  };
}

function chosenFonts(config) {
  return fonts.resolve(fontPrefs(config));
}

function uiFont(config) {
  return fontPrefs(config).latin.family;
}

function forcingFont(config) {
  return !!config.get('view.force-font') ||
    !config.get('fonts.latin-inherit') || !config.get('fonts.arabic-inherit');
}

function configureFonts(config, app) {
  if (!forcingFont(config)) return { file: null, changed: false };
  return fonts.configure(chosenFonts(config), app.getPath('userData'));
}

function initFontConfig(app, config) {
  const inheritedFontConfig = process.env.FONTCONFIG_FILE;
  const fontConfigFile = configureFonts(config, app).file;
  if (fontConfigFile) {
    process.env.FONTCONFIG_FILE = fontConfigFile;
    if (inheritedFontConfig !== fontConfigFile && !process.argv.includes('--font-retry')) {
      console.log('restarting once so Chromium reads %s', fontConfigFile);
      app.relaunch({ args: process.argv.slice(1).concat('--font-retry') });
      app.exit(0);
    }
  }
}

function initChromiumSwitches(app, config) {
  const chromiumFeatures = ['MemoryPurgeOnFreezeLimit', 'WebRTCPipeWireCapturer'];
  const forceX11 = config.get('system.force-x11') === true || process.argv.includes('--ozone-platform=x11');
  const onWayland = !forceX11 && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

  if (onWayland) {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    chromiumFeatures.push('WaylandWindowDecorations');
  }
  if (config.get('system.hardware-acceleration') !== false) {
    chromiumFeatures.push('VaapiVideoDecodeLinuxGL', 'VaapiVideoDecoder');
  }

  console.log('display server: %s%s', onWayland ? 'wayland, natively' : 'x11', forceX11 ? ' (forced)' : '');
  app.commandLine.appendSwitch('enable-features', chromiumFeatures.join(','));

  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-smooth-scrolling');
  app.commandLine.appendSwitch('disable-features', 'WebGPU');
  app.commandLine.appendSwitch('disable-webgpu');

  return { onWayland, forceX11 };
}

module.exports = {
  APP_ID,
  TITLE,
  handleCliArgs,
  initEnvironment,
  fontPrefs,
  chosenFonts,
  uiFont,
  forcingFont,
  configureFonts,
  initFontConfig,
  initChromiumSwitches,
};
