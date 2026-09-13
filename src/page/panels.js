/*
 * DOM panel inspectors, composer selectors, and emoji panel button locators.
 */
'use strict';

const PANEL_LABEL = /emoji|sticker|gif|رموز|ملصق|إيموجي|ايموجي/i;
const PANEL_ICON  = /smil|emoji|sticker|gif/i;

const emojiPanel = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const panel = d.querySelector('[role="application"]');
  if (!panel) return null;
  return panel.querySelector('[role="tab"]') || panel.querySelector('input') ? panel : null;
};

const composer = doc => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  return (
    d.querySelector('#main [contenteditable="true"]') ||
    d.querySelector('footer [contenteditable="true"]')
  );
};

const iconTitle = el => {
  if (!el) return '';
  const own = el.getAttribute('data-icon');
  if (own) return own;
  const inner = el.querySelector('[data-icon]');
  if (inner) return inner.getAttribute('data-icon') || '';
  const svg = el.querySelector('svg title');
  return svg ? svg.textContent || '' : '';
};

const deepestIn = el => {
  let node = el;
  while (node && node.firstElementChild) node = node.firstElementChild;
  return node;
};

const panelButton = (doc, strip = s => String(s || '').trim()) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const footer = d.querySelector('footer') || d;
  for (const el of footer.querySelectorAll('button, [role="button"]')) {
    const label = strip(el.getAttribute('aria-label'));
    if (PANEL_LABEL.test(label) || PANEL_ICON.test(iconTitle(el))) return el;
  }
  return null;
};

module.exports = {
  PANEL_LABEL,
  PANEL_ICON,
  emojiPanel,
  composer,
  iconTitle,
  deepestIn,
  panelButton,
};
