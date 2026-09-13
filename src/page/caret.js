/*
 * Automatic composer caret restoration when focus falls to body.
 */
'use strict';

const COMPOSER = 'footer [contenteditable="true"]';
const OVER_ALL = '[role="dialog"], [role="alertdialog"]';

function setupCaretRestore({
  panelSelector,
  addEventListener: onEvent = (typeof addEventListener !== 'undefined' ? addEventListener : (typeof window !== 'undefined' ? window.addEventListener.bind(window) : () => {})),
  document: doc = (typeof document !== 'undefined' ? document : (typeof window !== 'undefined' ? window.document : null)),
} = {}) {
  let pointerIsDown = false;

  const caretBack = () => {
    if (!doc || !doc.hasFocus || !doc.hasFocus()) return;
    if (pointerIsDown) return;
    const where = doc.activeElement;
    if (where && where !== doc.body && where !== doc.documentElement) return;
    if (doc.querySelector(OVER_ALL)) return;
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    const picked = (win && win.getSelection) ? win.getSelection() : (doc.getSelection ? doc.getSelection() : null);
    if (picked && !picked.isCollapsed) return;
    const box = doc.querySelector(COMPOSER);
    if (!box || box.isContentEditable !== true) return;
    const rect = box.getBoundingClientRect ? box.getBoundingClientRect() : { height: 1, width: 1 };
    if (!(rect.height > 0 && rect.width > 0)) return;
    try { box.focus({ preventScroll: true }); } catch (err) {}
  };

  const caretSoon = () => {
    setTimeout(caretBack, 0);
    setTimeout(caretBack, 120);
    setTimeout(caretBack, 320);
  };

  if (typeof onEvent === 'function') {
    onEvent('focusout', event => {
      if (event && event.relatedTarget) return;
      caretSoon();
    }, true);

    onEvent('pointerdown', () => { pointerIsDown = true; }, true);
    onEvent('pointerup', () => { pointerIsDown = false; caretSoon(); }, true);
    onEvent('pointercancel', () => { pointerIsDown = false; }, true);

    if (panelSelector) {
      onEvent('animationstart', event => {
        const panel = event && event.target;
        if (panel && typeof panel.matches === 'function' && panel.matches(panelSelector)) caretSoon();
      }, true);
    }

    onEvent('focus', caretSoon);
  }

  return {
    caretBack,
    caretSoon,
  };
}

module.exports = {
  COMPOSER,
  OVER_ALL,
  setupCaretRestore,
};
