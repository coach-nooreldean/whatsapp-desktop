/*
 * Screen sharing handler for WhatsApp Desktop.
 *
 * Automatically delegates to xdg-desktop-portal via PipeWire on Wayland,
 * and falls back to desktopCapturer source selection on X11.
 */
'use strict';

const { desktopCapturer } = require('electron');

function wireScreenSharing(ses, onWayland) {
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    // Under Wayland, the desktop portal displays its own native system picker.
    if (onWayland) {
      callback({ video: { id: 'screen:0:0', name: 'Entire screen' } });
      return;
    }

    // X11: Enumerate windows and screens with a 5s safety ceiling.
    try {
      const sources = await Promise.race([
        desktopCapturer.getSources({ types: ['screen', 'window'], fetchWindowIcons: false }),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]);

      if (!sources || !sources.length) {
        callback({ video: null });
        return;
      }

      const source = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      callback({ video: source || null });
    } catch (err) {
      console.warn('screen sharing failed:', err.message);
      callback({ video: null });
    }
  }, { useSystemPicker: true });
}

module.exports = {
  wireScreenSharing,
};
