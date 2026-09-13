/*
 * Command palette actions list and dynamic account item generator.
 */
'use strict';

const STATIC_ACTIONS = [
  {
    id: 'action:chat-search',
    title: 'Jump to Chat Search',
    description: 'Focus WhatsApp Web search input to find contacts or messages',
    category: 'Chat',
    shortcut: 'Ctrl+K /',
    icon: 'search',
  },
  {
    id: 'action:privacy',
    title: 'Toggle Privacy Shield',
    description: 'Instantly blur chat messages, previews, and media',
    category: 'Privacy',
    shortcut: 'Ctrl+Alt+P',
    icon: 'shield',
  },
  {
    id: 'action:lock',
    title: 'Lock WhatsApp',
    description: 'Lock application immediately with passcode',
    category: 'Security',
    shortcut: 'Ctrl+Alt+L',
    icon: 'lock',
  },
  {
    id: 'action:toggle-sidebar',
    title: 'Toggle Accounts Sidebar',
    description: 'Collapse or expand the vertical multi-account sidebar',
    category: 'Navigation',
    shortcut: 'Ctrl+Alt+S',
    icon: 'sidebar',
  },
  {
    id: 'action:settings',
    title: 'Open Settings',
    description: 'Configure appearance, privacy, notifications, and security',
    category: 'System',
    shortcut: 'Ctrl+,',
    icon: 'settings',
  },
  {
    id: 'action:fonts',
    title: 'Configure Fonts',
    description: 'Adjust typography for Arabic and Latin scripts',
    category: 'System',
    shortcut: '',
    icon: 'font',
  },
  {
    id: 'action:reload',
    title: 'Reload Active Account',
    description: 'Reload the active WhatsApp Web view',
    category: 'System',
    shortcut: 'Ctrl+R',
    icon: 'reload',
  },
  {
    id: 'action:clear-cache',
    title: 'Clear Disk & Media Cache',
    description: 'Free up disk space by purging cached media without logging out',
    category: 'Maintenance',
    shortcut: '',
    icon: 'trash',
  },
  {
    id: 'action:custom-css',
    title: 'Open custom.css in Editor',
    description: 'Customize WhatsApp Web styles in your default Linux text editor',
    category: 'Appearance',
    shortcut: '',
    icon: 'code',
  },
  {
    id: 'action:mute-call',
    title: 'Toggle Call Mute',
    description: 'Mute or unmute active WhatsApp voice/video call microphone',
    category: 'Calls',
    shortcut: 'Super+Alt+M',
    icon: 'mic',
  },
];

function buildPaletteActions(accountsMgr) {
  const list = [...STATIC_ACTIONS];

  if (accountsMgr) {
    const accounts = accountsMgr.getAccounts ? accountsMgr.getAccounts() : [];
    const activeId = accountsMgr.getActiveId ? accountsMgr.getActiveId() : null;
    accounts.forEach((acc, idx) => {
      const isActive = acc.id === activeId;
      const shortcut = idx < 9 ? `Ctrl+${idx + 1}` : '';
      list.push({
        id: `account:switch:${acc.id}`,
        title: `Switch to ${acc.name}${isActive ? ' (Active)' : ''}`,
        description: `Switch view to WhatsApp account #${idx + 1}`,
        category: 'Accounts',
        shortcut,
        color: acc.color,
        icon: 'user',
        isActive,
      });
    });
  }

  return list;
}

module.exports = {
  STATIC_ACTIONS,
  buildPaletteActions,
};
