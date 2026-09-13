/*
 * Page-side notification tone decoding and WebAudio playback.
 */
'use strict';

function createTonePlayer({
  log = () => {},
  win = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global)),
} = {}) {
  let toneBuffer = null;
  let audio = null;

  const decodeTone = async payload => {
    if (!payload || !payload.data) return;
    try {
      const AudioCtx = (win && (win.AudioContext || win.webkitAudioContext)) ||
                       (typeof AudioContext !== 'undefined' ? AudioContext : null);
      if (!AudioCtx) {
        log('could not decode the tone: AudioContext unavailable');
        return;
      }
      audio = audio || new AudioCtx();
      const atobFn = (win && typeof win.atob === 'function')
        ? win.atob.bind(win)
        : (typeof atob === 'function' ? atob : s => Buffer.from(s, 'base64').toString('binary'));
      const binary = atobFn(payload.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      toneBuffer = await audio.decodeAudioData(bytes.buffer);
      log('tone ready (' + Math.round(toneBuffer.duration * 1000) + 'ms)');
    } catch (err) {
      log('could not decode the tone: ' + err.message);
    }
  };

  const playTone = async () => {
    if (!toneBuffer || !audio) return;
    try {
      if (audio.state === 'suspended') await audio.resume();
      const source = audio.createBufferSource();
      source.buffer = toneBuffer;
      source.connect(audio.destination);
      source.__waOurs = true;
      source.start();
    } catch (err) {
      log('could not play the tone: ' + err.message);
    }
  };

  return {
    decodeTone,
    playTone,
    get toneBuffer() {
      return toneBuffer;
    },
    hasTone: () => Boolean(toneBuffer),
  };
}

module.exports = {
  createTonePlayer,
};
