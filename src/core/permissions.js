/*
 * Session permissions and device access security for WhatsApp Desktop.
 */
'use strict';

const ALLOWED_PERMISSIONS = new Set([
  'notifications', 'media', 'audioCapture', 'videoCapture',
  'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture',
  'speaker-selection', 'mediaKeySystem', 'idle-detection', 'window-management',
]);

function isWhatsApp(url) {
  if (!url) return true; // Chromium hands empty requestingUrl for media requests in calls
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'blob:' || parsed.protocol === 'about:') return true;
    return parsed.hostname === 'web.whatsapp.com' ||
           parsed.hostname.endsWith('.whatsapp.com') ||
           parsed.hostname.endsWith('.whatsapp.net');
  } catch (e) {
    return false;
  }
}

function chromeUserAgent(processVersions) {
  const versions = processVersions || (typeof process !== 'undefined' ? process.versions : null);
  const chromeVer = (versions && versions.chrome)
    ? versions.chrome.split('.')[0]
    : '134';
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
         `Chrome/${chromeVer}.0.0.0 Safari/537.36`;
}

function wirePermissions(ses) {
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (contents && contents.getURL()) || '';
    callback(isWhatsApp(url) && ALLOWED_PERMISSIONS.has(permission));
  });

  ses.setPermissionCheckHandler((contents, permission, origin) =>
    isWhatsApp(origin || '') && ALLOWED_PERMISSIONS.has(permission));

  ses.setDevicePermissionHandler(details =>
    isWhatsApp((details && details.origin) || ''));
}

module.exports = {
  ALLOWED_PERMISSIONS,
  isWhatsApp,
  chromeUserAgent,
  wirePermissions,
};
