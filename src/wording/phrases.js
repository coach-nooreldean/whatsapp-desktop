/*
 * Multilingual phrase detection and preview body extraction.
 */
'use strict';

const {
  mono,
  STICKER,
  MISSED,
  REPLY_MARK,
  MENTION_MARK,
} = require('./marks.js');

const MEDIA_WORDS = [
  { text: /^(sticker|ملصق)$/i,                            label: STICKER },
  { text: /^(gif)$/i,                                     label: mono('\u{1F39E}') + ' GIF' },
  { text: /^(voice message|رسالة صوتية)$/i,               label: mono('\u{1F3A4}') + ' Voice message' },
  { text: /^(photo|image|صورة)$/i,                        label: mono('\u{1F4F7}') + ' Photo' },
  { text: /^(video note|ملاحظة فيديو)$/i,                 label: mono('\u{1F3A5}') + ' Video note' },
  { text: /^(video|فيديو)$/i,                             label: mono('\u{1F3A5}') + ' Video' },
  { text: /^(audio|أغنية|ملف صوتي)$/i,                    label: mono('\u{1F3B5}') + ' Audio' },
  { text: /^(poll|استطلاع)$/i,                             label: mono('\u{1F4CA}') + ' Poll' },
  { text: /^(location|live location|موقع)$/i,             label: mono('\u{1F4CD}') + ' Location' },
  { text: /^(contact|جهة اتصال)$/i,                       label: mono('\u{1F464}') + ' Contact' },
  { text: /^(document|مستند)$/i,                          label: mono('\u{1F4C4}') + ' Document' },
  { text: /^(\d+\s*(photos|videos|صور|مقاطع))$/i,         label: mono('\u{1F5BC}') + ' Album' },
  { text: /^(missed voice call|مكالمة صوتية فائتة)$/i,     label: MISSED.voice },
  { text: /^(missed video call|مكالمة فيديو فائتة)$/i,     label: MISSED.video },
  { text: /^(missed call|مكالمة فائتة)$/i,                 label: MISSED.call },
  { text: /^(this message was deleted|تم حذف هذه الرسالة)$/i, label: mono('\u{1F6AB}') + ' Deleted message' },
];

const mediaFromWords = text => {
  const said = String(text == null ? '' : text).trim();
  if (!said) return '';
  for (const kind of MEDIA_WORDS) if (kind.text.test(said)) return kind.label;
  return '';
};

const KIND = /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0E}\u{FE0F}]+\s*[A-Za-z ]+)/u;
const kindOf = message => {
  const body = String(message || '');
  const found = KIND.exec(body) || KIND.exec(body.replace(/^[^:]{1,40}:\s*/, ''));
  return found ? found[1].trim() : 'New message';
};

const pushName = name => String(name == null ? '' : name).replace(/^~\s*/, '').trim();

const AIMED_AT_US = [
  { text: /^(?:replied to you|رد عليك)\s*[:\u061b\u003a]\s*/i, mark: REPLY_MARK },
  { text: /^(?:mentioned you|ذكرك)\s*[:\u061b\u003a]\s*/i,     mark: MENTION_MARK },
];

const NAME_WORDS = 4;
const NAME_CHARS = 40;
const nameLike = (candidate, rest) => {
  if (rest.startsWith('/')) return false;
  if (candidate.length > NAME_CHARS) return false;
  return candidate.trim().split(/\s+/).length <= NAME_WORDS;
};

const readBody = (raw, group) => {
  let rest = String(raw == null ? '' : raw);
  let mark = '';
  for (const aimed of AIMED_AT_US) {
    const found = aimed.text.exec(rest);
    if (!found) continue;
    mark = aimed.mark;
    rest = rest.slice(found[0].length);
    break;
  }

  if (group === false) return { sender: '', message: rest, mark: '' };

  const split = /^([^:\n]{1,60}):\s*([\s\S]+)$/.exec(rest);
  if (!split) return { sender: '', message: rest, mark };
  if (group !== true && !nameLike(split[1], split[2])) {
    return { sender: '', message: rest, mark };
  }
  return { sender: pushName(split[1]), message: split[2], mark };
};

module.exports = {
  MEDIA_WORDS,
  AIMED_AT_US,
  NAME_WORDS,
  NAME_CHARS,
  mediaFromWords,
  kindOf,
  pushName,
  nameLike,
  readBody,
};
