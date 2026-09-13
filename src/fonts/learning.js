/*
 * Font learning and known replacement lists.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* What WhatsApp Web's own stack names, plus the two generic faces fontconfig
   would otherwise answer with on a Linux desktop. Emoji families are absent on
   purpose: they are what the desktop font falls through to for the glyphs it
   does not have, and rebinding them would draw every emoji as a blank box. */
const REPLACED = [
  'Roboto Variable', 'Roboto', 'Roboto Flex',
  'Segoe UI', 'Segoe UI Variable', 'system-ui', '-apple-system',
  'BlinkMacSystemFont', 'Helvetica', 'Helvetica Neue', 'Arial',
  'Liberation Sans', 'DejaVu Sans', 'Cantarell', 'Adwaita Sans', 'Inter',
];

/* Emoji, and the faces a script the desktop font does not cover falls through
   to. Rebinding any of these would draw every emoji as a blank box and every
   Arabic word in the wrong script's glyphs. */
const NEVER = new Set([
  'noto color emoji', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol',
  'noto sans arabic', 'noto naskh arabic', 'emoji', 'monospace', 'serif',
  'cursive', 'fantasy', 'ui-monospace', 'ui-serif',
  /* Generics, which the <alias> at the bottom of the config already handles.
     Rewriting one as if it were a family name is how a config ends up telling
     fontconfig that sans-serif is literally called "sans-serif". */
  'sans-serif', 'inherit', 'initial', 'unset', 'revert',
]);

/* Families the page turned out to ask for that the list above does not cover.
   WhatsApp changes its font stack from time to time -- it currently leads with
   "Roboto Variable", which was not in any list written before it appeared -- so
   the page reports what it actually asks for and it is added here. fontconfig
   is read once per process, so a family learned now takes effect on the next
   start; there is no way to make that live, and it costs one launch. */
const learn = (dir, families) => {
  const file = path.join(dir, 'learned-fonts.json');
  let known = [];
  try { known = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }

  const wanted = families
    .map(name => name.trim().replace(/^["']|["']$/g, ''))
    .filter(name => name && !NEVER.has(name.toLowerCase()))
    .filter(name => !REPLACED.some(k => k.toLowerCase() === name.toLowerCase()))
    .filter(name => !known.some(k => k.toLowerCase() === name.toLowerCase()));

  if (!wanted.length) return [];
  known = [...known, ...wanted].slice(-32);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(known, null, 2));
  } catch (e) { /* the next start will learn it again */ }
  return wanted;
};

const learned = dir => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'learned-fonts.json'), 'utf8')); }
  catch (e) { return []; }
};

module.exports = {
  REPLACED,
  NEVER,
  learn,
  learned,
};
