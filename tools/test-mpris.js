/*
 * Tests for MPRIS2 Media Player D-Bus service (src/mpris.js).
 */
'use strict';

const assert = require('assert');
const { MprisService, MPRIS_NAME, MPRIS_PATH } = require('../src/mpris.js');

let failures = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log('  ok   ' + label);
    return;
  }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

try {
  let playPauseCalls = 0;
  let raiseCalls = 0;

  const player = new MprisService({
    onRaise: () => { raiseCalls++; },
    onPlayPause: () => { playPauseCalls++; },
  });

  check('mpris name constant', MPRIS_NAME, 'org.mpris.MediaPlayer2.whatsapp');
  check('mpris path constant', MPRIS_PATH, '/org/mpris/MediaPlayer2');

  // Root properties check
  const rootProps = player.rootProperties();
  const identityProp = rootProps.find(p => p[0] === 'Identity');
  check('root property Identity is WhatsApp', identityProp[1][1], 'WhatsApp');

  const canRaiseProp = rootProps.find(p => p[0] === 'CanRaise');
  check('root property CanRaise is true', canRaiseProp[1][1], true);

  // Player properties initial state
  const playerProps = player.playerProperties();
  const statusProp = playerProps.find(p => p[0] === 'PlaybackStatus');
  check('initial status is Stopped', statusProp[1][1], 'Stopped');

  // Update track
  player.updateTrack({
    title: 'Voice Note from Sarah',
    artist: 'Sarah',
    durationSec: 42,
    positionSec: 10,
    state: 'Playing',
  });

  const updatedProps = player.playerProperties();
  const updatedStatus = updatedProps.find(p => p[0] === 'PlaybackStatus');
  check('updated status is Playing', updatedStatus[1][1], 'Playing');

  const metaProp = updatedProps.find(p => p[0] === 'Metadata');
  const titleEntry = metaProp[1][1].find(m => m[0] === 'xesam:title');
  check('metadata title matches updated track', titleEntry[1][1], 'Voice Note from Sarah');

} catch (err) {
  failures++;
  console.error('Unexpected error in test-mpris.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('mpris checks pass');
}
