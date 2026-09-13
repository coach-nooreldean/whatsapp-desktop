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
  check('THEMES has dracula', !!THEMES.dracula, true);
  check('dracula background is #282a36', THEMES.dracula.bg, '#282a36');
  check('dracula accent is #bd93f9', THEMES.dracula.accent, '#bd93f9');
  check('THEMES has tokyonight', !!THEMES.tokyonight, true);
  check('tokyonight background is #1a1b26', THEMES.tokyonight.bg, '#1a1b26');
  check('tokyonight accent is #7aa2f7', THEMES.tokyonight.accent, '#7aa2f7');

  // Check CSS generation for Dracula
  const draculaCss = getWebThemeCss('dracula');
  check('Dracula CSS overrides background', draculaCss.includes('--bg-color: #282a36 !important;'), true);

  // Check CSS generation for Tokyo Night
  const tokyoCss = getWebThemeCss('tokyonight');
  check('Tokyo Night CSS overrides background', tokyoCss.includes('--bg-color: #1a1b26 !important;'), true);

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
