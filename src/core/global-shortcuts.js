/*
 * System-wide global shortcuts (toggle window, mute call).
 */
'use strict';

function toggleCallMute(viewManager) {
  if (!viewManager) return;
  const item = viewManager.accountViews.get(viewManager.activeAccountId);
  if (item && item.view && !item.view.webContents.isDestroyed()) {
    item.view.webContents.send('wa:toggle-call-mute');
  }
}

function wireGlobalShortcuts({ config, globalShortcut, getMainWindow, showWindow, viewManager }) {
  try {
    globalShortcut.unregisterAll();
    if (config.get('shortcuts.global-enabled') === false) return;

    const toggleKey = config.get('shortcuts.global-toggle') || 'Super+Alt+W';
    if (toggleKey) {
      try {
        globalShortcut.register(toggleKey, () => {
          const win = getMainWindow();
          if (!win || win.isDestroyed()) return;
          if (win.isVisible() && win.isFocused()) {
            if (config.get('behaviour.close-to-tray')) {
              win.hide();
            } else {
              win.minimize();
            }
          } else {
            showWindow('global hotkey');
            win.focus();
          }
        });
      } catch (err) {
        console.warn('could not register global toggle shortcut %s: %s', toggleKey, err.message);
      }
    }

    const muteKey = config.get('shortcuts.global-mute') || 'Super+Alt+M';
    if (muteKey) {
      try {
        globalShortcut.register(muteKey, () => {
          toggleCallMute(viewManager);
        });
      } catch (err) {
        console.warn('could not register global call mute shortcut %s: %s', muteKey, err.message);
      }
    }
  } catch (err) {
    console.warn('could not wire global shortcuts: %s', err.message);
  }
}

module.exports = {
  toggleCallMute,
  wireGlobalShortcuts,
};
