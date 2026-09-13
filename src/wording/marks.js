/*
 * Monochrome emoji marks and symbols for WhatsApp notifications.
 */
'use strict';

const TEXT = '︎';
const mono = character => character + TEXT;

const STICKER = mono('\u{1F49F}') + ' Sticker';

/* A call nobody answered, which is not a message and needs a mark of its own.
   Three of them: the phone names the two kinds separately -- a missed video call
   is a different thing to be owed than a missed voice call -- and the third is
   for a preview that says only that one was missed. */
const MISSED = {
  voice: mono('\u{1F4DE}') + ' Missed voice call',
  video: mono('\u{1F4F9}') + ' Missed video call',
  call:  mono('\u{1F4DE}') + ' Missed call',
};

/* And the same call while it is still ringing, which is a different thing to be
   told and is told in the present tense. */
const RINGING = {
  voice: mono('\u{1F4DE}') + ' Incoming voice call',
  video: mono('\u{1F4F9}') + ' Incoming video call',
  call:  mono('\u{1F4DE}') + ' Incoming call',
};

const MENTION_MARK = 'Mentioned you:';
const REPLY_MARK = 'Replied to you:';
const STATUS_MENTION_MARK = 'Mentioned you privately in their story';

/* The mark for each kind of message WhatsApp's own store names. */
const MARKS = {
  chat:                  '',
  sticker:               STICKER,
  image:                 mono('\u{1F4F7}') + ' Photo',
  video:                 mono('\u{1F3A5}') + ' Video',
  ptv:                   mono('\u{1F3A5}') + ' Video note',
  gif:                   mono('\u{1F39E}') + ' GIF',
  audio:                 mono('\u{1F3B5}') + ' Audio',
  ptt:                   mono('\u{1F3A4}') + ' Voice message',
  document:              mono('\u{1F4C4}') + ' Document',
  album:                 mono('\u{1F5BC}') + ' Album',
  location:              mono('\u{1F4CD}') + ' Location',
  live_location:         mono('\u{1F4CD}') + ' Live location',
  vcard:                 mono('\u{1F464}') + ' Contact',
  multi_vcard:           mono('\u{1F464}') + ' Contacts',
  poll_creation:         mono('\u{1F4CA}') + ' Poll',
  groups_v4_invite:      mono('\u{1F4E8}') + ' Group invite',
  payment:               mono('\u{1F4B3}') + ' Payment',
  order:                 mono('\u{1F6CD}') + ' Order',
  product:               mono('\u{1F6CD}') + ' Product',
  list:                  mono('\u{1F4CB}') + ' List',
  interactive:           '',
  buttons_response:      '',
  template_button_reply: '',
  list_response:         '',
};

module.exports = {
  TEXT,
  mono,
  STICKER,
  MISSED,
  RINGING,
  MENTION_MARK,
  REPLY_MARK,
  STATUS_MENTION_MARK,
  MARKS,
};
