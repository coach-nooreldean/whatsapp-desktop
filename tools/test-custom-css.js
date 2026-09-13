/*
 * Tests for custom user stylesheet support (src/config.js and CSS injection).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point XDG_CONFIG_HOME to an isolated temporary test directory
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-customcss-test-'));
process.env.XDG_CONFIG_HOME = testDir;

const { Config, CUSTOM_CSS_PATH } = require('../src/config.js');

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
  // Test 1: CUSTOM_CSS_PATH location within config directory
  check('CUSTOM_CSS_PATH is inside XDG_CONFIG_HOME',
        CUSTOM_CSS_PATH.startsWith(testDir), true);
  check('CUSTOM_CSS_PATH ends with custom.css',
        CUSTOM_CSS_PATH.endsWith('custom.css'), true);

  // Test 2: Default config has custom-css-enabled set to false
  const cfg = new Config();
  check('custom-css-enabled defaults to false',
        cfg.get('view.custom-css-enabled'), false);

  // Test 3: Setting custom-css-enabled to true
  cfg.set('view.custom-css-enabled', true);
  check('custom-css-enabled can be enabled',
        cfg.get('view.custom-css-enabled'), true);

  // Test 4: Creation and reading of custom CSS file
  const customRules = '/* User Custom Styles */\nbody { filter: contrast(1.05); }\n';
  fs.mkdirSync(path.dirname(CUSTOM_CSS_PATH), { recursive: true });
  fs.writeFileSync(CUSTOM_CSS_PATH, customRules, 'utf8');

  check('custom.css file exists after write', fs.existsSync(CUSTOM_CSS_PATH), true);
  const readRules = fs.readFileSync(CUSTOM_CSS_PATH, 'utf8');
  check('custom.css content matches', readRules, customRules);

  // Test 5: Simulated styleSheet generation with custom CSS enabled vs disabled
  const baseCss = 'body { font-size: 16px; }';
  function generateCss(enabled) {
    let css = baseCss;
    if (enabled && fs.existsSync(CUSTOM_CSS_PATH)) {
      try {
        const userCss = fs.readFileSync(CUSTOM_CSS_PATH, 'utf8');
        css += '\n/* --- User Custom CSS (~/.config/whatsapp-desktop/custom.css) --- */\n' + userCss;
      } catch (e) {}
    }
    return css;
  }

  const withCss = generateCss(true);
  check('generated CSS includes custom rules when enabled',
        withCss.includes('filter: contrast(1.05)'), true);

  const withoutCss = generateCss(false);
  check('generated CSS omits custom rules when disabled',
        withoutCss.includes('filter: contrast(1.05)'), false);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-custom-css.js:', err);
} finally {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('custom css checks pass');
}
