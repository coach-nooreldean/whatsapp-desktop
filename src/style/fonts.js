/*
 * Font stack definitions, unicode-range mapping, and @font-face rule synthesis.
 */
'use strict';

const FALLBACKS = [
  'system-ui',
  '"Noto Sans Arabic"',
  '"Noto Color Emoji"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  'sans-serif',
];

const quote = family => `"${String(family).replace(/"/g, '')}"`;

/* `lead` is put in front and dropped from the tail, so naming the Arabic face
   first for right-to-left text does not leave it named twice. */
const stack = (family, lead) => {
  const wanted = [quote(family), ...FALLBACKS];
  const list = lead ? [quote(lead), ...wanted.filter(f => f !== quote(lead))] : wanted;
  return list.join(', ');
};

const GENERIC = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji',
  'fangsong', 'inherit', 'initial', 'unset', 'revert',
]);

/* Left alone: these are what a script or a symbol the desktop font does not
   cover falls through to, and aliasing them draws blank boxes. */
const KEEP = /emoji|symbol|arabic|hebrew|thai|devanagari|cjk|noto sans (?!$)/i;

const ARABIC_RANGE = [
  'U+060C-06FF',          /* Arabic, from the comma */
  'U+0750-077F',          /* Arabic Supplement */
  'U+0870-08FF',          /* Arabic Extended-A and -B */
  'U+FB50-FDFF',          /* Presentation Forms-A */
  'U+FE70-FEFF',          /* Presentation Forms-B */
  'U+10E60-10E7E',        /* Rumi numerals */
  'U+1EE00-1EEFF',        /* Arabic Mathematical Alphabetic Symbols */
].join(', ');

const UI_FAMILY = 'WhatsApp Desktop';

const local = names => names.map(name => `local("${String(name).replace(/"/g, '')}")`).join(', ');

const face = (family, src, { italic, range, size }) => `@font-face {
  font-family: "${family.replace(/"/g, '')}";
  src: ${local(src)};
  font-weight: 1 1000;
  font-style: ${italic ? 'italic' : 'normal'};${range ? `\n  unicode-range: ${range};` : ''}${size ? `\n  size-adjust: ${size}%;` : ''}
}`;

const facesFor = (name, script, range) => [
  face(name, script.normal, { italic: false, range, size: script.size }),
  face(name, script.italic, { italic: true, range, size: script.size }),
];

const fontFaces = (stack, chosen) => {
  if (!chosen || !chosen.latin) return '';

  const wanted = String(stack || '').split(',')
    .map(name => name.trim().replace(/^["']|["']$/g, ''))
    .filter(name => name && !GENERIC.has(name.toLowerCase()) && !KEEP.test(name))
    .filter(name => name.toLowerCase() !== chosen.latin.family.toLowerCase());

  const names = [...new Set(wanted)];
  if (!chosen.inherit) names.push(UI_FAMILY);
  if (!names.length) return '';

  const rules = names.flatMap(name => [
    ...facesFor(name, chosen.latin, ''),
    ...(chosen.arabic ? facesFor(name, chosen.arabic, ARABIC_RANGE) : []),
  ]);

  const belt = chosen.inherit ? '' : `
html {
  font-family: "${UI_FAMILY}", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
}`;

  return rules.join('\n') + belt;
};

module.exports = {
  FALLBACKS,
  GENERIC,
  KEEP,
  ARABIC_RANGE,
  UI_FAMILY,
  quote,
  stack,
  local,
  face,
  facesFor,
  fontFaces,
};
