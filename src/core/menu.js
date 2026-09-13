/*
 * Native context menu builder for WhatsApp Desktop.
 */
'use strict';

const { Menu, BrowserWindow, shell, clipboard } = require('electron');

const buildContextMenuTemplate = (contents, params) => {
  const flags = params.editFlags || {};
  const template = [];
  const rule = () => { if (template.length) template.push({ type: 'separator' }); };

  if (params.misspelledWord) {
    for (const word of params.dictionarySuggestions || [])
      template.push({ label: word, click: () => contents.replaceMisspelling(word) });
    if (!(params.dictionarySuggestions || []).length)
      template.push({ label: 'No spelling suggestions', enabled: false });
    template.push({
      label: 'Add to dictionary',
      click: () => contents.session && contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
  }

  if (params.isEditable) {
    rule();
    template.push(
      { role: 'undo', enabled: !!flags.canUndo },
      { role: 'redo', enabled: !!flags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: !!flags.canCut },
      { role: 'copy', enabled: !!flags.canCopy },
      { role: 'paste', enabled: !!flags.canPaste },
      { role: 'pasteAndMatchStyle', enabled: !!flags.canPaste },
      { role: 'delete', enabled: !!flags.canDelete },
      { role: 'selectAll' },
    );
  } else if (params.selectionText) {
    rule();
    template.push({ role: 'copy' }, { role: 'selectAll' });
  }

  if (params.linkURL) {
    rule();
    template.push(
      { label: 'Open link in browser', click: () => shell.openExternal(params.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(params.linkURL) },
    );
  }
  if (params.mediaType === 'image') {
    rule();
    template.push({ label: 'Copy image', click: () => contents.copyImageAt(params.x, params.y) });
  }

  rule();
  template.push({ label: 'Inspect', click: () => contents.inspectElement(params.x, params.y) });

  return template;
};

const showContextMenu = (contents, params, trace = null) => {
  const template = buildContextMenuTemplate(contents, params);
  if (typeof trace === 'function') {
    trace('menu: %s', template.map(item => item.label || item.role || '--').join(' / '));
  }
  const window = BrowserWindow.fromWebContents(contents);
  if (window) Menu.buildFromTemplate(template).popup({ window });
};

module.exports = {
  buildContextMenuTemplate,
  showContextMenu,
};
