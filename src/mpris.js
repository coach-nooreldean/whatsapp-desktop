/*
 * MPRIS2 D-Bus Media Player service for WhatsApp Desktop.
 *
 * Implements:
 *   org.mpris.MediaPlayer2
 *   org.mpris.MediaPlayer2.Player
 *
 * Allows Linux desktop environments (GNOME, KDE, Hyprland/Waybar, playerctl)
 * and hardware multimedia keys to control voice notes and audio playback.
 */
'use strict';

const { Bus } = require('./dbus.js');

const MPRIS_NAME = 'org.mpris.MediaPlayer2.whatsapp';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_IFACE = 'org.mpris.MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';
const INTROSPECT_IFACE = 'org.freedesktop.DBus.Introspectable';

const vs = v => ['s', String(v || '')];
const vb = v => ['b', !!v];
const vd = v => ['d', Number(v) || 0.0];
const vx = v => ['x', BigInt(Math.max(0, Math.round(Number(v) || 0)))];
const vo = v => ['o', String(v || '/')];

const MPRIS_XML = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect">
      <arg name="data" direction="out" type="s"/>
    </method>
  </interface>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="property_name" direction="in" type="s"/>
      <arg name="value" direction="out" type="v"/>
    </method>
    <method name="GetAll">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="properties" direction="out" type="a{sv}"/>
    </method>
    <method name="Set">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="property_name" direction="in" type="s"/>
      <arg name="value" direction="in" type="v"/>
    </method>
    <signal name="PropertiesChanged">
      <arg name="interface_name" type="s"/>
      <arg name="changed_properties" type="a{sv}"/>
      <arg name="invalidated_properties" type="as"/>
    </signal>
  </interface>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek">
      <arg name="Offset" direction="in" type="x"/>
    </method>
    <method name="SetPosition">
      <arg name="TrackId" direction="in" type="o"/>
      <arg name="Position" direction="in" type="x"/>
    </method>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanControl" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
  </interface>
</node>`;

class MprisService {
  constructor({ onRaise, onQuit, onPlayPause, onPlay, onPause, onStop, onSeek, onNext, onPrevious }) {
    this.handlers = {
      onRaise, onQuit, onPlayPause, onPlay, onPause, onStop, onSeek, onNext, onPrevious
    };

    this.bus = null;
    this.busName = null;
    this.playbackStatus = 'Stopped'; // 'Playing' | 'Paused' | 'Stopped'
    this.title = 'WhatsApp Voice Message';
    this.artist = 'WhatsApp';
    this.durationSec = 0;
    this.positionSec = 0;
    this.rate = 1.0;
    this.volume = 1.0;
  }

  start(cb) {
    Bus.connect((err, bus) => {
      if (err) { if (cb) cb(err); return; }
      this.bus = bus;
      this.busName = MPRIS_NAME;

      bus.requestName(this.busName, nameErr => {
        if (nameErr) {
          // If already taken, try PID-suffixed name
          this.busName = `${MPRIS_NAME}.instance${process.pid}`;
          bus.requestName(this.busName, err2 => {
            if (err2) { if (cb) cb(err2); return; }
            this.exportService();
            if (cb) cb(null);
          });
          return;
        }
        this.exportService();
        if (cb) cb(null);
      });
    });
  }

  rootProperties() {
    return [
      ['CanQuit', vb(true)],
      ['CanRaise', vb(true)],
      ['HasTrackList', vb(false)],
      ['Identity', vs('WhatsApp')],
      ['DesktopEntry', vs('io.github.shehawey.whatsapp-desktop')],
      ['SupportedUriSchemes', ['as', []]],
      ['SupportedMimeTypes', ['as', []]],
    ];
  }

  playerProperties() {
    const metaEntries = [
      ['mpris:trackid', vo('/org/mpris/MediaPlayer2/Track/current')],
      ['xesam:title', vs(this.title)],
      ['xesam:artist', ['as', [this.artist]]],
      ['xesam:album', vs('WhatsApp Voice Note')],
      ['mpris:length', vx(this.durationSec * 1000000)],
    ];

    return [
      ['PlaybackStatus', vs(this.playbackStatus)],
      ['LoopStatus', vs('None')],
      ['Rate', vd(this.rate)],
      ['Metadata', ['a{sv}', metaEntries]],
      ['Volume', vd(this.volume)],
      ['Position', vx(this.positionSec * 1000000)],
      ['MinimumRate', vd(1.0)],
      ['MaximumRate', vd(2.5)],
      ['CanControl', vb(true)],
      ['CanPlay', vb(true)],
      ['CanPause', vb(true)],
      ['CanSeek', vb(true)],
      ['CanGoNext', vb(false)],
      ['CanGoPrevious', vb(true)], // Rewind
    ];
  }

  exportService() {
    if (!this.bus) return;

    this.bus.export(MPRIS_PATH, {
      [MPRIS_IFACE]: {
        Raise: (args, reply) => {
          if (this.handlers.onRaise) this.handlers.onRaise();
          reply();
        },
        Quit: (args, reply) => {
          if (this.handlers.onQuit) this.handlers.onQuit();
          reply();
        },
      },
      [PLAYER_IFACE]: {
        Next: (args, reply) => {
          if (this.handlers.onNext) this.handlers.onNext();
          reply();
        },
        Previous: (args, reply) => {
          if (this.handlers.onPrevious) this.handlers.onPrevious();
          reply();
        },
        Pause: (args, reply) => {
          if (this.handlers.onPause) this.handlers.onPause();
          this.setPlaybackStatus('Paused');
          reply();
        },
        PlayPause: (args, reply) => {
          if (this.handlers.onPlayPause) this.handlers.onPlayPause();
          this.setPlaybackStatus(this.playbackStatus === 'Playing' ? 'Paused' : 'Playing');
          reply();
        },
        Stop: (args, reply) => {
          if (this.handlers.onStop) this.handlers.onStop();
          this.setPlaybackStatus('Stopped');
          reply();
        },
        Play: (args, reply) => {
          if (this.handlers.onPlay) this.handlers.onPlay();
          this.setPlaybackStatus('Playing');
          reply();
        },
        Seek: ([offsetMicro], reply) => {
          const offsetSec = Number(offsetMicro) / 1000000;
          if (this.handlers.onSeek) this.handlers.onSeek(offsetSec);
          reply();
        },
        SetPosition: ([, posMicro], reply) => {
          const posSec = Number(posMicro) / 1000000;
          if (this.handlers.onSeek) this.handlers.onSeek(posSec - this.positionSec);
          reply();
        },
      },
      [PROPS_IFACE]: {
        Get: ([iface, name], reply, fail) => {
          let props = [];
          if (iface === MPRIS_IFACE) props = this.rootProperties();
          else if (iface === PLAYER_IFACE) props = this.playerProperties();
          else { fail('org.freedesktop.DBus.Error.InvalidArgs', `unknown interface ${iface}`); return; }

          const found = props.find(p => p[0] === name);
          if (!found) { fail('org.freedesktop.DBus.Error.InvalidArgs', `no property ${name}`); return; }
          reply('v', [found[1]]);
        },
        GetAll: ([iface], reply) => {
          if (iface === MPRIS_IFACE) reply('a{sv}', [this.rootProperties()]);
          else if (iface === PLAYER_IFACE) reply('a{sv}', [this.playerProperties()]);
          else reply('a{sv}', [[]]);
        },
        Set: (args, reply) => reply(),
      },
      [INTROSPECT_IFACE]: {
        Introspect: (args, reply) => reply('s', [MPRIS_XML]),
      },
    });
  }

  updateTrack({ title, artist, durationSec, positionSec, state }) {
    if (title) this.title = title;
    if (artist) this.artist = artist;
    if (typeof durationSec === 'number') this.durationSec = durationSec;
    if (typeof positionSec === 'number') this.positionSec = positionSec;
    if (state) this.playbackStatus = state;
    this.notifyPropertiesChanged();
  }

  setPlaybackStatus(status) {
    if (this.playbackStatus === status) return;
    this.playbackStatus = status;
    this.notifyPropertiesChanged();
  }

  notifyPropertiesChanged() {
    if (!this.bus) return;
    const changed = [
      ['PlaybackStatus', vs(this.playbackStatus)],
      ['Position', vx(this.positionSec * 1000000)],
    ];
    try {
      this.bus.signal(MPRIS_PATH, PROPS_IFACE, 'PropertiesChanged',
        'sa{sv}as', [PLAYER_IFACE, changed, []]);
    } catch (e) {
      // Ignored if bus is tearing down
    }
  }

  destroy() {
    if (this.bus) {
      try { this.bus.close(); } catch (e) {}
      this.bus = null;
    }
  }
}

module.exports = {
  MprisService,
  MPRIS_NAME,
  MPRIS_PATH,
};
