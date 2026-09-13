/*
 * What a banner is allowed to say, and in whose name.
 *
 * Every check here is a line that went out on a real banner and should not
 * have. They are cheap to keep and they are the only place the wording is
 * pinned down: the rest of the notification path needs a desktop, a session and
 * somebody to send a message before it can be asked anything at all.
 */
'use strict';

const { kindOf, pushName, readBody, mediaFromWords, MARKS, REPLY_MARK,
        MENTION_MARK } =
  require('../src/wording.js');

let failures = 0;
const check = (label, got, want) => {
  if (got === want) { console.log('  ok   ' + label); return; }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

/* ------------------------------------------------------------- push names */

/* WhatsApp marks a name it read off the sender's own profile, rather than out
   of the user's contacts, with a leading tilde. It is a note to a reader who is
   looking at WhatsApp; on a banner it is a stray character in front of a
   person's name, and it was there in the screenshot that started this. */
for (const [scenario, input, want] of [
  ['a push-name marker with leading tilde is stripped', '~Ahmed', 'Ahmed'],
  ['leading tilde with space in push name is stripped', '~ Ahmed Salah', 'Ahmed Salah'],
  ['a name that merely contains a tilde keeps it', 'DJ ~Ahmed~', 'DJ ~Ahmed~'],
  ['null push name returns empty string', null, ''],
]) {
  check(scenario, pushName(input), want);
}

/* -------------------------------------------------------------- the split */

check('a group message splits sender and message body without mark',
      JSON.stringify(readBody('Ahmed: see you there')),
      JSON.stringify({ sender: 'Ahmed', message: 'see you there', mark: '' }));

check('a direct message body has empty sender and carries message',
      JSON.stringify(readBody('see you there')),
      JSON.stringify({ sender: '', message: 'see you there', mark: '' }));

/* The tilde again, this time where it actually appeared: in front of the name
   WhatsApp writes into the body of a group notification. */
check('group message body strips leading tilde from sender name',
      readBody('~Ahmed: تمام').sender, 'Ahmed');

/* A message with a colon in it is not a message from somebody called
   "Meeting". Only a short run in front of the first colon is read as a name,
   and a sentence is not a short run. */
check('a message containing a url colon preserves full message body',
      readBody('the link is https://example.com/x').message,
      'the link is https://example.com/x');

/* And when the page can say, it says. A direct chat has no sender in its body
   at all, so nothing is looked for -- which is the only way a one-word message
   ending in a colon comes out whole. */
check('when informed chat is direct, colon text is preserved as message with no sender',
      JSON.stringify(readBody('Ahmed: see you there', false)),
      JSON.stringify({ sender: '', message: 'Ahmed: see you there', mark: '' }));
check('when informed chat is group, long prefix before colon is treated as sender',
      readBody('the meeting is at 5 today: bring a laptop', true).sender,
      'the meeting is at 5 today');

check('undefined message body safely returns empty sender, message, and mark',
      JSON.stringify(readBody(undefined)),
      JSON.stringify({ sender: '', message: '', mark: '' }));

/* --------------------------------------------------------- what it is for */

/* WhatsApp prefixes the body when a message is aimed at the user in
   particular. Those words are not a name, and reading them as one is what put
   "Replied to you" on a banner in the place where the sender belongs -- with
   the actual sender pushed into the message, tilde and all. */
check('replied-to-you prefix extracts separate reply mark, cleaned sender, and message',
      JSON.stringify(readBody('Replied to you: ~Ahmed: جميل')),
      JSON.stringify({ sender: 'Ahmed', message: 'جميل', mark: REPLY_MARK }));

/* And it is WhatsApp's own words, put back down exactly as they were lifted.
   Two better ones were written here and taken out again: "الكلمه كمان نفسها
   بتاعه المنشن والريبلاي برضو فكك من بتاعتنا خليك في دي". */
check('reply mark uses exact WhatsApp punctuation and wording',
      REPLY_MARK, 'Replied to you:');
/* In words. It was an arrow, and a machine without the text form of U+21A9 in
   any of its fonts drew an empty box in the one place a banner explains why it
   is louder than the chat's own settings. */
check('reply mark contains standard ASCII text safe for all fonts',
      /^[\x20-\x7E]+$/.test(REPLY_MARK), true);

check('mentioned-you prefix extracts mention mark, sender, and message',
      JSON.stringify(readBody('Mentioned you: Ahmed: يا عبدالله')),
      JSON.stringify({ sender: 'Ahmed', message: 'يا عبدالله', mark: MENTION_MARK }));
check('mention mark uses exact WhatsApp wording',
      MENTION_MARK, 'Mentioned you:');

check('arabic replied-to-you prefix cleans sender in arabic interface',
      readBody('رد عليك: ~Ahmed: تمام').sender, 'Ahmed');

/* And none of that is said in a chat with one person in it. The mark picks a
   message out of a room; there is no room here, and the only person who could
   have replied is the one the banner is already titled with. The owner asked
   for it off -- "انا بكلم واحد يعني مش اكتر من واحد" -- so a direct chat keeps
   the words and loses the label. */
check('direct chat suppresses reply mark while preserving message content',
      JSON.stringify(readBody('Replied to you: تمام', false)),
      JSON.stringify({ sender: '', message: 'تمام', mark: '' }));
check('direct chat suppresses mention mark while preserving message content',
      JSON.stringify(readBody('Mentioned you: يا عبدالله', false)),
      JSON.stringify({ sender: '', message: 'يا عبدالله', mark: '' }));

/* A group is the case the mark exists for, and it is untouched. */
check('group chat retains reply mark when addressed to user',
      readBody('Replied to you: ~Ahmed: جميل', true).mark, REPLY_MARK);

/* A message that merely begins with those words is a message. The mark is only
   lifted when WhatsApp's own punctuation follows it. */
check('message starting with mark words but without colon keeps empty mark',
      readBody('Mentioned you in the meeting').mark, '');

/* -------------------------------------------------------- the media marks */

/* The words WhatsApp writes into a notification it raises itself, which is
   every notification raised while the window is not in front. They arrived bare
   -- "Sticker", and nothing to look at -- because only the chat-list watcher
   had this table. */
for (const [scenario, phrase, want] of [
  ['english sticker notification phrase maps to sticker mark', 'Sticker', MARKS.sticker],
  ['voice message phrase maps to ptt media mark', 'Voice message', MARKS.ptt],
  ['photo phrase maps to image media mark', 'Photo', MARKS.image],
  ['video note phrase maps to ptv media mark', 'Video note', MARKS.ptv],
  ['arabic sticker word maps to sticker mark', '\u0645\u0644\u0635\u0642', MARKS.sticker],
  ['album count phrase maps to album media mark', '4 photos', MARKS.album],
  ['message mentioning media word in sentence is treated as plain text', 'send me the photo', ''],
  ['empty input string returns empty media mark', '', ''],
]) {
  check(scenario, mediaFromWords(phrase), want);
}

/* ------------------------------------------------- previews kept off screen */

/* With previews hidden the banner still says what kind of thing arrived, and
   that is read back off the glyph the page put in front of it. */
for (const [scenario, input, want] of [
  ['hidden preview for sticker displays sticker mark', 'Mega: ' + MARKS.sticker, MARKS.sticker],
  ['hidden preview for voice note keeps ptt mark without duration', MARKS.ptt + ' (0:41)', MARKS.ptt],
  ['hidden preview for text message returns generic label', 'Ahmed: نتقابل بكرة الساعة ٥', 'New message'],
  ['hidden preview for empty string returns generic label', '', 'New message'],
]) {
  check(scenario, kindOf(input), want);
}

console.log(failures ? `\n${failures} failed` : '\nwording checks pass');
process.exit(failures ? 1 : 0);
