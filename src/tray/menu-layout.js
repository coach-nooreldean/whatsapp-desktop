/*
 * DBusMenu layout structure and property formatting for StatusNotifierItem.
 */
'use strict';

const { ID } = require('./sni-constants.js');

const vs = value => ['s', String(value)];
const vb = value => ['b', !!value];

const getItemProperties = (tray, id, wanted) => {
  const all = {
    [ID.TOGGLE]: [['label', vs(tray.toggleLabel())], ['enabled', vb(true)], ['visible', vb(true)]],
    [ID.SEP_1]: [['type', vs('separator')], ['visible', vb(true)]],
    [ID.SETTINGS]: [['label', vs('Settings…')], ['enabled', vb(true)], ['visible', vb(true)]],
    [ID.FONTS]: [['label', vs('Fonts…')], ['enabled', vb(true)], ['visible', vb(true)]],
    [ID.SEP_3]: [['type', vs('separator')], ['visible', vb(true)]],
    [ID.ABOUT]: [['label', vs(tray.aboutLabel())], ['enabled', vb(true)], ['visible', vb(true)]],
    [ID.SEP_2]: [['type', vs('separator')], ['visible', vb(true)]],
    [ID.QUIT]: [['label', vs('Quit')], ['enabled', vb(true)], ['visible', vb(true)]],
    [ID.ROOT]: [['children-display', vs('submenu')]],
  }[id] || [];

  if (!wanted || !wanted.length) return all;
  return all.filter(p => wanted.includes(p[0]));
};

const getMenuLayout = (tray, id, depth, wanted) => {
  const children = {
    [ID.ROOT]: [
      ID.TOGGLE,
      ID.SEP_1,
      ID.SETTINGS,
      ID.FONTS,
      ID.SEP_3,
      ID.ABOUT,
      ID.SEP_2,
      ID.QUIT,
    ],
  }[id] || [];

  const kids = depth === 0
    ? []
    : children.map(child => ['(ia{sv}av)', getMenuLayout(tray, child, depth < 0 ? -1 : depth - 1, wanted)]);

  return [id, getItemProperties(tray, id, wanted), kids];
};

const getMenuProperties = () => [
  ['Version', ['u', 3]],
  ['TextDirection', vs('ltr')],
  ['Status', vs('normal')],
  ['IconThemePath', ['as', []]],
];

module.exports = {
  vs,
  vb,
  getItemProperties,
  getMenuLayout,
  getMenuProperties,
};
