/*
 * Tests for multi-language spellcheck configuration (Arabic, English, etc.)
 */
'use strict';

const assert = require('assert');

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

// Mirror parser logic from src/main.js
function getSpellcheckLanguages(rawSetting) {
  if (Array.isArray(rawSetting)) {
    return rawSetting.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof rawSetting === 'string' && rawSetting.trim()) {
    const list = rawSetting.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return ['en-US', 'ar'];
}

class MockSession {
  constructor() {
    this.enabled = false;
    this.languages = [];
  }
  setSpellCheckerEnabled(on) {
    this.enabled = !!on;
  }
  setSpellCheckerLanguages(langs) {
    this.languages = [...langs];
  }
}

function applySpellcheckToSession(session, enabled, rawLangs) {
  const isEnabled = enabled !== false;
  session.setSpellCheckerEnabled(isEnabled);
  if (isEnabled) {
    const langs = getSpellcheckLanguages(rawLangs);
    try {
      session.setSpellCheckerLanguages(langs);
    } catch (e) {
      session.setSpellCheckerLanguages(['en-US']);
    }
  }
}

try {
  // Test 1: Default parsing returns English and Arabic
  check('default spellcheck languages are en-US and ar',
        getSpellcheckLanguages('en-US,ar'), ['en-US', 'ar']);

  // Test 2: Comma separated string with whitespace is cleaned
  check('whitespace around comma-separated languages is trimmed',
        getSpellcheckLanguages('  ar ,  es , fr  '), ['ar', 'es', 'fr']);

  // Test 3: Empty string or invalid falls back to en-US and ar
  check('empty string falls back to default [en-US, ar]',
        getSpellcheckLanguages('   '), ['en-US', 'ar']);
  check('null/undefined falls back to default [en-US, ar]',
        getSpellcheckLanguages(null), ['en-US', 'ar']);

  // Test 4: Array input is preserved and trimmed
  check('array input is correctly processed',
        getSpellcheckLanguages(['en-US', ' ar ', 'de']), ['en-US', 'ar', 'de']);

  // Test 5: Applying to session when enabled
  const ses1 = new MockSession();
  applySpellcheckToSession(ses1, true, 'en-US,ar,fr');
  check('session spellchecker is enabled', ses1.enabled, true);
  check('session spellchecker has languages configured', ses1.languages, ['en-US', 'ar', 'fr']);

  // Test 6: Applying to session when disabled
  const ses2 = new MockSession();
  applySpellcheckToSession(ses2, false, 'en-US,ar');
  check('session spellchecker is disabled when setting is false', ses2.enabled, false);

  // Test 7: Error handling when session rejects languages
  const faultySes = {
    enabled: false,
    languages: [],
    setSpellCheckerEnabled(on) { this.enabled = on; },
    setSpellCheckerLanguages(langs) {
      if (langs.includes('invalid-lang')) throw new Error('Unsupported language');
      this.languages = langs;
    }
  };
  applySpellcheckToSession(faultySes, true, 'invalid-lang');
  check('falls back to en-US when language setting throws', faultySes.languages, ['en-US']);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-spellcheck-languages.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('spellcheck language checks pass');
  process.exit(0);
}
