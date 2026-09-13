/*
 * WebGPU workaround for Linux / Wayland video calling pipelines.
 */
'use strict';

/* WebGPU on Linux/Wayland has a broken CreateExternalTexture implementation in
   Chromium for video streams (generating "Invalid ExternalTexture is invalid" and
   black video call frames). Disabling navigator.gpu forces WhatsApp to use its
   working WebGL / direct MediaStream pipeline. */
const fixVideo = () => {
  try {
    if (typeof window !== 'undefined' && window.Navigator && window.Navigator.prototype && 'gpu' in window.Navigator.prototype) {
      Object.defineProperty(window.Navigator.prototype, 'gpu', {
        get: () => undefined,
        configurable: true,
      });
    }
  } catch (e) {}
};

module.exports = {
  fixVideo,
};
