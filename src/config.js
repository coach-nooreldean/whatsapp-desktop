/*
 * The config file, kept in the same INI shape the GTK client used so the keys
 * are familiar and can be edited by hand. Everything in it is optional.
 *
 *   ~/.config/whatsapp-desktop/whatsapp-desktop.conf
 *
 * Modularized into:
 *   - src/config/defaults.js: Default schema dictionary and filesystem path constants
 *   - src/config/ini.js: INI parsing, type coercion, and text serialization
 */
'use strict';

const fs = require('fs');
const {
  CONFIG_DIR,
  CONFIG_PATH,
  CUSTOM_CSS_PATH,
  DEFAULTS,
} = require('./config/defaults.js');
const { parse, coerce, format } = require('./config/ini.js');

class Config {
  constructor() {
    this.values = { ...DEFAULTS };
    this.reload();
  }

  reload() {
    let text = '';
    try {
      text = fs.readFileSync(CONFIG_PATH, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('could not read %s: %s', CONFIG_PATH, err.message);
      }
      return;
    }
    const raw = parse(text);
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      if (raw[key] !== undefined) this.values[key] = coerce(raw[key], fallback);
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
  }

  save() {
    const text = format(this.values);
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(CONFIG_PATH, text);
    } catch (err) {
      console.warn('could not write %s: %s', CONFIG_PATH, err.message);
    }
  }
}

module.exports = {
  Config,
  CONFIG_PATH,
  CONFIG_DIR,
  CUSTOM_CSS_PATH,
  DEFAULTS,
  parse,
  coerce,
  format,
};
