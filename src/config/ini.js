/*
 * Lightweight INI parser, serializer, and value coercer.
 */
'use strict';

/* A deliberately small INI reader: sections, key = value, # and ; comments.
   Nothing here is worth a dependency, and a parser that silently accepts a
   half-written file is what a hand-edited config needs. */
const parse = text => {
  const out = {};
  let section = '';
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#' || line[0] === ';') continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    out[(section ? section + '.' : '') + key] = value;
  }
  return out;
};

const coerce = (value, fallback) => {
  if (typeof fallback === 'boolean') return /^(1|true|yes|on)$/i.test(value);
  if (typeof fallback === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return value;
};

const format = values => {
  return [
    '# whatsapp-desktop -- every key is optional; delete one to get the default back.',
    '',
    '[view]',
    '# Theme mode: system (follow desktop), dark, or light.',
    `theme = ${values['view.theme'] || 'system'}`,
    '# Family for everything the client draws. Empty follows the desktop font.',
    `font = ${values['view.font']}`,
    '# Root font size in pixels. WhatsApp sizes in rem, so this scales the client.',
    `font-size = ${values['view.font-size']}`,
    `zoom = ${Number(values['view.zoom']).toFixed(2)}`,
    '# Draw the whole page in one family, the way a browser told to ignore page fonts does.',
    `force-font = ${values['view.force-font']}`,
    '# Whether the multi-account sidebar switcher starts collapsed.',
    `sidebar-collapsed = ${values['view.sidebar-collapsed']}`,
    '# Whether user custom CSS (~/.config/whatsapp-desktop/custom.css) is applied.',
    `custom-css-enabled = ${values['view.custom-css-enabled']}`,
    '',
    '[fonts]',
    '# One switch per script. On: that script is drawn in the desktop font,',
    '# exactly as this client always drew it, and the keys under it are',
    '# ignored -- so a choice is still here to come back to. Off: it is drawn',
    '# in what was chosen for it. The two are separate on purpose: an Arabic',
    '# face of your own does not oblige you to pick a Latin one.',
    `latin-inherit = ${values['fonts.latin-inherit']}`,
    '# The family for Latin text. Empty follows the desktop font.',
    `latin-family = ${values['fonts.latin-family']}`,
    '# Its size, as a percentage of the size that family is drawn at.',
    `latin-size = ${Math.round(Number(values['fonts.latin-size']) || 100)}`,
    "# Draw Latin in the family's own bold or italic face. A family that ships",
    '# neither cannot be made to have one: nothing is synthesised here.',
    `latin-bold = ${values['fonts.latin-bold']}`,
    `latin-italic = ${values['fonts.latin-italic']}`,
    '# And the same for Arabic. Empty family: whatever the system already draws',
    '# Arabic in, which is what a size on its own needs to hang on.',
    `arabic-inherit = ${values['fonts.arabic-inherit']}`,
    `arabic-family = ${values['fonts.arabic-family']}`,
    `arabic-size = ${Math.round(Number(values['fonts.arabic-size']) || 100)}`,
    `arabic-bold = ${values['fonts.arabic-bold']}`,
    `arabic-italic = ${values['fonts.arabic-italic']}`,
    '',
    '[window]',
    `width = ${Math.round(values['window.width'])}`,
    `height = ${Math.round(values['window.height'])}`,
    '',
    '[behaviour]',
    '# Closing the window leaves the client running in the tray.',
    `close-to-tray = ${values['behaviour.close-to-tray']}`,
    '# Minimising does the same. Off by default: minimise is not close.',
    `minimize-to-tray = ${values['behaviour.minimize-to-tray']}`,
    `spellcheck = ${values['behaviour.spellcheck']}`,
    `spellcheck-languages = ${values['behaviour.spellcheck-languages'] || 'en-US,ar'}`,
    '# How the window is brought to the front when a banner is clicked, a link',
    '# is followed, or the tray is asked. auto: worked out from the session and',
    '# corrected once from what the window actually did. activate: ask the',
    '# compositor for it, which X11 always honours. remap: take the window down',
    '# and open it again, which is the only way up on some Wayland compositors.',
    `raise = ${values['behaviour.raise'] || 'auto'}`,
    '',
    '[shortcuts]',
    '# Enable global system-wide shortcuts (even when WhatsApp is in background).',
    `global-enabled = ${values['shortcuts.global-enabled']}`,
    '# Global shortcut to summon or hide WhatsApp window.',
    `global-toggle = ${values['shortcuts.global-toggle'] || 'Super+Alt+W'}`,
    '# Global shortcut to mute or unmute active WhatsApp call.',
    `global-mute = ${values['shortcuts.global-mute'] || 'Super+Alt+M'}`,
    '',
    '[system]',
    '# Force X11 / XWayland fallback mode even on Wayland sessions.',
    `force-x11 = ${values['system.force-x11']}`,
    '# Enable VA-API hardware video decode acceleration on Linux.',
    `hardware-acceleration = ${values['system.hardware-acceleration']}`,
    '',
    '[notifications]',
    `enabled = ${values['notifications.enabled']}`,
    '# A tone for the banners this client raises itself. WhatsApp plays its own',
    '# for the ones it raises, and two sounds for one message is worse than none.',
    `sound = ${values['notifications.sound']}`,
    '# WhatsApp plays a tone of its own when a message of yours goes out. Off',
    '# here: the message is already on screen, with a tick under it, in the',
    '# window you are looking at.',
    `outgoing-sound = ${values['notifications.outgoing-sound']}`,
    '# WhatsApp also plays one for a message arriving while the window is away,',
    '# and that is the only moment it announces anything itself. Off here, so',
    '# that a message sounds the same whether the window is in front or in the',
    '# tray: the client plays the desktop tone for both. Turn it on to hear',
    "# WhatsApp's own tone instead -- and then the window in front stays silent,",
    '# because that is the half WhatsApp does not announce.',
    `whatsapp-sound = ${values['notifications.whatsapp-sound']}`,
    '# Seconds before a banner is taken down and filed silently. GNOME parks a',
    '# banner under an idle pointer for ever, and one parked banner swallows',
    '# every message behind it.',
    `banner-seconds = ${values['notifications.banner-seconds']}`,
    '# Keep the message itself off the screen: a banner then says which chat it',
    '# came from and what kind of thing arrived, and nothing of what was said.',
    `hide-preview = ${values['notifications.hide-preview']}`,
    '',
    '[media]',
    '# WhatsApp counts a sticker as a photo for auto-download, so turning photos',
    '# off leaves every sticker as a blank space with no way to fetch it. The',
    '# phone always fetches stickers; so does this, unless it is turned off here.',
    `download-stickers = ${values['media.download-stickers']}`,
    "# A voice note that is only paused leaves its card in the desktop's",
    '# notification centre until the note has played out -- Chromium keeps the',
    '# media session for a paused player, and the shell shows every session it',
    '# can see. On, the card goes down with the pause and comes back when the',
    '# note does. Turn it off to keep a paused note on the shell, where its',
    '# play button can start it again.',
    `hide-controls-when-paused = ${values['media.hide-controls-when-paused']}`,
    '# Every download asks where to put it. Off, and they land in ~/Downloads',
    '# the way a phone does it, with a number on the end of a name already taken.',
    `ask-where-to-save = ${values['media.ask-where-to-save']}`,
    '# The folder the last download was pointed at, so the chooser opens there.',
    `download-dir = ${values['media.download-dir'] || ''}`,
    '',
    '[links]',
    '# Register as default scheme handler for whatsapp:// links.',
    `claim-scheme = ${values['links.claim-scheme']}`,
    '',
    '[updates]',
    '# Check GitHub daily for client updates.',
    `check = ${values['updates.check']}`,
    '',
  ].join('\n');
};

module.exports = {
  parse,
  coerce,
  format,
};
