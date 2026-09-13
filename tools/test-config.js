/*
 * Tests for configuration parsing and persistence (src/config.js).
 *
 * Verifies INI parsing, type coercion, fallback defaults, key resolution,
 * and safe serialization to disk in an isolated test environment.
 * Designed according to Test Guard rules.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point XDG_CONFIG_HOME to an isolated temporary test directory (Rule 9)
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-config-test-'));
process.env.XDG_CONFIG_HOME = testDir;

const { Config, CONFIG_PATH, CONFIG_DIR } = require('../src/config.js');

let failures = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log('  ok   ' + label);
    return;
  }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

try {
  /* -------------------------------------------------- initialization & defaults */

  const cfg = new Config();

  check('default theme is "system"', cfg.get('view.theme'), 'system');
  check('default font-size is 16', cfg.get('view.font-size'), 16);
  check('default zoom is 1.0', cfg.get('view.zoom'), 1.0);
  check('default close-to-tray is true', cfg.get('behaviour.close-to-tray'), true);
  check('default minimize-to-tray is false', cfg.get('behaviour.minimize-to-tray'), false);
  check('default notifications sound is true', cfg.get('notifications.sound'), true);
  check('default outgoing sound is false', cfg.get('notifications.outgoing-sound'), false);
  check('default links claim-scheme is true', cfg.get('links.claim-scheme'), true);
  check('default updates check is true', cfg.get('updates.check'), true);
  check('default sidebar-collapsed is false', cfg.get('view.sidebar-collapsed'), false);
  check('default custom-css-enabled is false', cfg.get('view.custom-css-enabled'), false);
  check('default global-enabled is true', cfg.get('shortcuts.global-enabled'), true);
  check('default global-toggle is Super+Alt+W', cfg.get('shortcuts.global-toggle'), 'Super+Alt+W');
  check('default global-mute is Super+Alt+M', cfg.get('shortcuts.global-mute'), 'Super+Alt+M');
  check('default spellcheck-languages is en-US,ar', cfg.get('behaviour.spellcheck-languages'), 'en-US,ar');
  check('default force-x11 is false', cfg.get('system.force-x11'), false);
  check('default hardware-acceleration is true', cfg.get('system.hardware-acceleration'), true);

  /* ----------------------------------------------------------------- get and set */

  cfg.set('view.theme', 'dark');
  check('set updates in-memory value for existing key', cfg.get('view.theme'), 'dark');

  cfg.set('view.zoom', 1.25);
  check('set updates numeric float value', cfg.get('view.zoom'), 1.25);

  /* ------------------------------------------------------------ disk persistence */

  cfg.save();
  check('config file is created on disk after save', fs.existsSync(CONFIG_PATH), true);

  const savedText = fs.readFileSync(CONFIG_PATH, 'utf8');
  check('saved file contains view section header', savedText.includes('[view]'), true);
  check('saved file contains serialized theme value', savedText.includes('theme = dark'), true);
  check('saved file contains serialized zoom level', savedText.includes('zoom = 1.25'), true);
  check('saved file contains links section with claim-scheme', savedText.includes('[links]'), true);
  check('saved file contains updates section with check flag', savedText.includes('[updates]'), true);
  check('saved file contains system section', savedText.includes('[system]'), true);
  check('saved file contains shortcuts section', savedText.includes('[shortcuts]'), true);

  /* --------------------------------------------------- reload & parsing variants */

  // Hand-edit the config file on disk to simulate user editing
  const customConfig = [
    '# Hand-edited test configuration',
    '; Semicolon comment line',
    '',
    '[view]',
    'theme = light',
    'font-size = 18',
    'zoom = 1.5',
    'custom-css-enabled = yes',
    '',
    '[behaviour]',
    'close-to-tray = no',
    'minimize-to-tray = yes',
    'spellcheck-languages = ar,fr',
    '',
    '[notifications]',
    'enabled = 0',
    'sound = 1',
    '',
    '[media]',
    'download-stickers = false',
    'ask-where-to-save = true',
    '',
    '[shortcuts]',
    'global-enabled = false',
    'global-toggle = Ctrl+Alt+W',
    'global-mute = Ctrl+Alt+M',
    '',
    '[system]',
    'force-x11 = true',
    'hardware-acceleration = no',
  ].join('\n');

  fs.writeFileSync(CONFIG_PATH, customConfig);

  const reloaded = new Config();

  for (const [scenario, key, want] of [
    ['theme parses string value "light"', 'view.theme', 'light'],
    ['font-size coerces integer "18" to number', 'view.font-size', 18],
    ['zoom coerces float "1.5" to number', 'view.zoom', 1.5],
    ['custom-css-enabled coerces "yes" to boolean true', 'view.custom-css-enabled', true],
    ['close-to-tray coerces "no" to boolean false', 'behaviour.close-to-tray', false],
    ['minimize-to-tray coerces "yes" to boolean true', 'behaviour.minimize-to-tray', true],
    ['spellcheck-languages parses comma-separated string', 'behaviour.spellcheck-languages', 'ar,fr'],
    ['notifications.enabled coerces "0" to boolean false', 'notifications.enabled', false],
    ['notifications.sound coerces "1" to boolean true', 'notifications.sound', true],
    ['download-stickers coerces "false" to boolean false', 'media.download-stickers', false],
    ['ask-where-to-save coerces "true" to boolean true', 'media.ask-where-to-save', true],
    ['shortcuts.global-enabled coerces "false" to boolean false', 'shortcuts.global-enabled', false],
    ['shortcuts.global-toggle parses custom key combo', 'shortcuts.global-toggle', 'Ctrl+Alt+W'],
    ['shortcuts.global-mute parses custom key combo', 'shortcuts.global-mute', 'Ctrl+Alt+M'],
    ['system.force-x11 coerces "true" to boolean true', 'system.force-x11', true],
    ['system.hardware-acceleration coerces "no" to boolean false', 'system.hardware-acceleration', false],
  ]) {
    check(scenario, reloaded.get(key), want);
  }

  /* ------------------------------------------- resilience to invalid inputs (Rule 4) */

  const invalidConfig = [
    '[view]',
    'font-size = not-a-number',
    'zoom = invalid-float',
  ].join('\n');

  fs.writeFileSync(CONFIG_PATH, invalidConfig);
  const fallbackCfg = new Config();

  check('invalid non-numeric font-size falls back to default 16',
        fallbackCfg.get('view.font-size'), 16);
  check('invalid non-numeric zoom falls back to default 1.0',
        fallbackCfg.get('view.zoom'), 1.0);

} finally {
  // Cleanup test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup error
  }
}

console.log(failures ? `\n${failures} failed` : '\nconfig checks pass');
process.exit(failures ? 1 : 0);
