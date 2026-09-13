/*
 * Avatar image file caching on disk for desktop notifications.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AVATAR_PREFIX = 'whatsapp-desktop-avatar-';
const runtimeDir = () => process.env.XDG_RUNTIME_DIR || os.tmpdir();

/* Writes the picture out and answers with its path, or null. Named from the
   bytes, so the same face is written once and never rewritten under a banner. */
const avatarPath = base64 => {
  if (!base64) return null;
  let bytes;
  try { bytes = Buffer.from(base64, 'base64'); } catch (e) { return null; }
  if (!bytes.length) return null;

  const digest = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const file = path.join(runtimeDir(), AVATAR_PREFIX + digest);
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
    return file;
  } catch (e) {
    return null;
  }
};

/* The pictures of a whole session add up and nothing else ever deletes them: a
   notification may still be pointing at one, so they cannot be cleaned up while
   the client runs. Startup is the safe moment -- whatever is on screen then
   belongs to a client that is no longer running. */
const sweepAvatars = () => {
  let names = [];
  try {
    names = fs.readdirSync(runtimeDir());
  } catch (err) {
    return;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(AVATAR_PREFIX)) continue;
    try {
      fs.unlinkSync(path.join(runtimeDir(), name));
      removed++;
    } catch (err) {
      // File may have been removed concurrently
    }
  }
  if (removed) console.log('cleared %d notification picture(s) from the last session', removed);
};

module.exports = {
  AVATAR_PREFIX,
  runtimeDir,
  avatarPath,
  sweepAvatars,
};
