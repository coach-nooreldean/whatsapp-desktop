/*
 * Convert Electron nativeImage to StatusNotifierItem ARGB32 network byte order pixmap.
 */
'use strict';

/*
 * An icon as the protocol wants it: width, height, and ARGB32 in network byte
 * order. Electron hands over BGRA, so the channels are re-ordered rather than
 * re-encoded -- no PNG decoder here, and no icon theme lookup either, because a
 * pixmap is the one form every host renders without being told where to look.
 */
const pixmap = image => {
  if (!image || image.isEmpty()) return [];
  const { width, height } = image.getSize();
  const bgra = image.toBitmap();
  const argb = Buffer.alloc(bgra.length);
  for (let at = 0; at < bgra.length; at += 4) {
    argb[at] = bgra[at + 3]; // A
    argb[at + 1] = bgra[at + 2]; // R
    argb[at + 2] = bgra[at + 1]; // G
    argb[at + 3] = bgra[at]; // B
  }
  return [[width, height, Array.from(argb)]];
};

module.exports = {
  pixmap,
};
