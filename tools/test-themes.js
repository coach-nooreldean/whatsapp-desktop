/*
 * Tests for Themes and Hyprland Color Detection (src/themes.js).
 */
'use strict';

const assert = require('assert');
const { THEMES, getWebThemeCss, detectHyprlandColors } = require('../src/themes.js');

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
  // Check theme definitions
  check('THEMES has dark', !!THEMES.dark, true);
  check('THEMES has light', !!THEMES.light, true);
  check('THEMES has oled', !!THEMES.oled, true);
  check('oled background is pure black #000000', THEMES.oled.bg, '#000000');
  check('THEMES has nord', !!THEMES.nord, true);
  check('THEMES has catppuccin', !!THEMES.catppuccin, true);

  // Check CSS generation for OLED
  const oledCss = getWebThemeCss('oled');
  check('OLED CSS overrides background to pure black', oledCss.includes('--bg-color: #000000 !important;'), true);
  check('OLED CSS colors message bubbles', oledCss.includes('.message-in .copyable-text'), true);

  // Check CSS generation with dynamic Hyprland accent
  const hyprCss = getWebThemeCss('oled', '#ff007f');
  check('CSS overrides primary accent to dynamic Hyprland color', hyprCss.includes('--primary: #ff007f !important;'), true);

  // Check standard themes return empty string without accent override
  check('dark returns empty string without hyprland accent', getWebThemeCss('dark'), '');

} catch (err) {
  failures++;
  console.error('Unexpected error in test-themes.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('theme checks pass');
}
