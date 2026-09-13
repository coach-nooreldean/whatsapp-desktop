'use strict';

/*
 * What counts as a link to a chat, and -- more to the point -- what does not.
 * A false positive here means a link the owner clicked went to this client
 * instead of the page it was addressed to, and there is no way back from that
 * inside a window with no address bar.
 */

const assert = require('assert');
const links = require('../src/links.js');

const ok = [];
const check = (what, fn) => {
  try { fn(); ok.push(what); }
  catch (e) { console.error('  FAIL ' + what + '\n    ' + e.message); process.exitCode = 1; }
};

/* ------------------------------------------------- the scheme, as browsers send it */

check('whatsapp send scheme parses phone and empty message', () => {
  assert.deepStrictEqual(links.from('whatsapp://send?phone=201501899476'),
                         { phone: '201501899476', text: '' });
});

check('whatsapp send scheme with trailing slash parses phone and message', () => {
  assert.deepStrictEqual(links.from('whatsapp://send/?phone=201501899476&text=hi'),
                         { phone: '201501899476', text: 'hi' });
});

check('encoded URI components in scheme query string are properly decoded', () => {
  assert.strictEqual(links.from('whatsapp://send?phone=201501899476&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7').text,
                     'مرحبا');
});

check('a verb this client cannot perform is not answered', () => {
  assert.strictEqual(links.from('whatsapp://call?phone=201501899476'), null);
  assert.strictEqual(links.from('whatsapp://settings'), null);
});

/* ------------------------------------------------------------ group invites */

check('whatsapp chat scheme with or without trailing slash extracts invite code', () => {
  /* Read off the live chat.whatsapp.com page, not guessed:
     ["WhatsAppApiOpenUrl","open_custom_url",[],[{"url":"whatsapp:\/\/chat\/?code=…"}]] */
  assert.deepStrictEqual(links.from('whatsapp://chat/?code=IZ4FM0ZHJRN7hMFsxlQTcx'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
  assert.deepStrictEqual(links.from('whatsapp://chat?code=IZ4FM0ZHJRN7hMFsxlQTcx'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
});

check('group invite link with tracking query params extracts invite code', () => {
  assert.deepStrictEqual(links.from('https://chat.whatsapp.com/IZ4FM0ZHJRN7hMFsxlQTcx'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
  assert.deepStrictEqual(links.from('https://chat.whatsapp.com/IZ4FM0ZHJRN7hMFsxlQTcx?s=cl&p=a&mlu=4&ilr=4'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
});

check('legacy invite path and trailing slash both extract invite code', () => {
  assert.deepStrictEqual(links.from('https://chat.whatsapp.com/invite/IZ4FM0ZHJRN7hMFsxlQTcx'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
  assert.deepStrictEqual(links.from('https://chat.whatsapp.com/IZ4FM0ZHJRN7hMFsxlQTcx/'),
                         { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
});

check('web.whatsapp.com accept link with query parameters extracts invite code', () => {
  assert.deepStrictEqual(
    links.from('https://web.whatsapp.com/accept?code=IZ4FM0ZHJRN7hMFsxlQTcx&utm_campaign=wa_chat_v2'),
    { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
});

check('invite URLs missing valid code return null', () => {
  assert.strictEqual(links.from('https://chat.whatsapp.com/'), null);
  assert.strictEqual(links.from('https://chat.whatsapp.com'), null);
  assert.strictEqual(links.from('whatsapp://chat/'), null);
  assert.strictEqual(links.from('https://web.whatsapp.com/accept'), null);
  /* Short enough to be a truncated link rather than a code. */
  assert.strictEqual(links.from('https://chat.whatsapp.com/abc'), null);
});

check('inviteOf accepts base64url characters and rejects path traversal or invalid strings', () => {
  assert.strictEqual(links.inviteOf('IZ4FM0ZHJRN7hMFsxlQTcx'), 'IZ4FM0ZHJRN7hMFsxlQTcx');
  assert.strictEqual(links.inviteOf('has a space in it'), '');
  assert.strictEqual(links.inviteOf('../../etc/passwd'), '');
  assert.strictEqual(links.inviteOf(''), '');
  assert.strictEqual(links.inviteOf(null), '');
});

/* --------------------------------------------------------------- the web links */

check('api.whatsapp.com send link parses phone and message', () => {
  assert.deepStrictEqual(links.from('https://api.whatsapp.com/send?phone=201501899476&text=hi'),
                         { phone: '201501899476', text: 'hi' });
});

check('wa.me short link with path phone number parses phone and message', () => {
  assert.deepStrictEqual(links.from('https://wa.me/201501899476?text=hi'),
                         { phone: '201501899476', text: 'hi' });
});

check('web.whatsapp.com send URL parses phone and defaults text to empty', () => {
  assert.deepStrictEqual(links.from('https://web.whatsapp.com/send?phone=201501899476'),
                         { phone: '201501899476', text: '' });
});

check('formatted phone number containing spaces and plus prefix normalizes to digits', () => {
  assert.strictEqual(links.from('https://wa.me/+20 150 189 9476').phone, '201501899476');
});

/* ------------------------------------------------------- and what is left alone */

check('a wa.me short code, which only WhatsApp can resolve, goes to a browser', () => {
  assert.strictEqual(links.from('https://wa.me/message/ABCDEFGHIJKLM1'), null);
});

check('the client itself is not a link to a chat', () => {
  assert.strictEqual(links.from('https://web.whatsapp.com/'), null);
});

check('non-whatsapp HTTP domains and mailto links return null', () => {
  assert.strictEqual(links.from('https://example.com/send?phone=201501899476'), null);
  assert.strictEqual(links.from('mailto:someone@example.com'), null);
});

check('empty, null, or malformed inputs return null without throwing', () => {
  assert.strictEqual(links.from(''), null);
  assert.strictEqual(links.from(null), null);
  assert.strictEqual(links.from('not a url at all'), null);
  assert.strictEqual(links.from('whatsapp://send?phone=12'), null);
});

/* --------------------------------------------------------------- the command line */

check('the link is found among the switches a launch carries', () => {
  const argv = ['/usr/lib/whatsapp-desktop/whatsapp-desktop', '--font-retry',
                'whatsapp://send?phone=201501899476'];
  assert.deepStrictEqual(links.inArgv(argv), { phone: '201501899476', text: '' });
});

check('an ordinary launch carries no link', () => {
  assert.strictEqual(links.inArgv(['/usr/lib/whatsapp-desktop/whatsapp-desktop', '--hidden']), null);
  assert.strictEqual(links.inArgv([]), null);
  assert.strictEqual(links.inArgv(undefined), null);
});

check('group invite URL switch in command line arguments is extracted', () => {
  const argv = ['/usr/lib/whatsapp-desktop/whatsapp-desktop',
                'whatsapp://chat/?code=IZ4FM0ZHJRN7hMFsxlQTcx'];
  assert.deepStrictEqual(links.inArgv(argv), { invite: 'IZ4FM0ZHJRN7hMFsxlQTcx' });
});

/* ---------------------------------------- the ones with nowhere else to go */

check('a whatsapp: verb this client cannot act on is named rather than eaten', () => {
  assert.strictEqual(links.unhandled('whatsapp://call?phone=201501899476'), 'call');
  assert.strictEqual(links.unhandled('whatsapp://settings'), 'settings');
});

check('non-whatsapp protocols and invalid URLs return empty string for unhandled verb', () => {
  assert.strictEqual(links.unhandled('https://example.com/'), '');
  assert.strictEqual(links.unhandled('not a url at all'), '');
  assert.strictEqual(links.unhandled(''), '');
  assert.strictEqual(links.unhandled(undefined), '');
});

/* ------------------------------------------------------------------ the claim */

check('the scheme is not claimed when the owner has said not to', () => {
  const app = { isDefaultProtocolClient: () => { throw new Error('should not be asked'); } };
  assert.strictEqual(links.claim(app, 'io.github.shehawey.whatsapp-desktop', { enabled: false }),
                     'not asked for');
});

check('claiming protocol client sets CHROME_DESKTOP env and registers desktop file', () => {
  const before = process.env.CHROME_DESKTOP;
  delete process.env.CHROME_DESKTOP;
  const app = { isDefaultProtocolClient: () => false, setAsDefaultProtocolClient: () => true };
  assert.strictEqual(links.claim(app, 'io.github.shehawey.whatsapp-desktop'), 'claimed');
  assert.strictEqual(process.env.CHROME_DESKTOP, 'io.github.shehawey.whatsapp-desktop.desktop');
  if (before === undefined) delete process.env.CHROME_DESKTOP;
  else process.env.CHROME_DESKTOP = before;
});

check('app that already holds scheme does not re-register protocol client', () => {
  const app = {
    isDefaultProtocolClient: () => true,
    setAsDefaultProtocolClient: () => { throw new Error('should not be asked'); },
  };
  assert.strictEqual(links.claim(app, 'io.github.shehawey.whatsapp-desktop'), 'already ours');
});

for (const line of ok) console.log('  ok   ' + line);
if (!process.exitCode) console.log('\nlink checks pass');
