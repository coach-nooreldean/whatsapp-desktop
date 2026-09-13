'use strict';

/*
 * Test for src/lock.html: verifies markup IDs and script wiring without a screen.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');

const html = read('lock.html');

// Check markup and used elements
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));

assert.deepStrictEqual([...used].filter(id => !ids.has(id)), [],
                       'lock.html: looked up but not in markup');
assert.deepStrictEqual([...ids].filter(id => !used.has(id)), [],
                       'lock.html: in markup but never wired');

// Simulate DOM stub
const node = id => ({
  id,
  value: '',
  textContent: '',
  classList: {
    classes: new Set(),
    add(c) { this.classes.add(c); },
    remove(c) { this.classes.delete(c); },
    contains(c) { return this.classes.has(c); },
  },
  listeners: {},
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  fire(ev, payload) {
    return Promise.all((this.listeners[ev] || []).map(fn => fn(payload)));
  },
  focus() { this.focused = true; },
  offsetWidth: 100,
});

const nodes = new Map([...ids].map(id => [id, node(id)]));

global.document = {
  getElementById: id => nodes.get(id) || null,
  documentElement: {
    setAttribute(k, v) { this[k] = v; },
  },
};

let unlockCalls = [];
global.window = {
  api: {
    unlock: async pin => {
      unlockCalls.push(pin);
      return pin === '1234';
    },
    getTheme: async () => 'dark',
  },
};

(async () => {
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1])();
  await new Promise(r => setTimeout(r, 20));

  assert.strictEqual(global.document.documentElement['data-theme'], 'dark');

  // Test unlock failure with wrong pin
  nodes.get('pinInput').value = '0000';
  await nodes.get('unlockBtn').fire('click');
  assert.deepStrictEqual(unlockCalls, ['0000']);
  assert.strictEqual(nodes.get('errorMsg').textContent, 'Incorrect passcode');
  assert.ok(nodes.get('lockCard').classList.contains('shake'));

  // Test unlock success with correct pin
  nodes.get('pinInput').value = '1234';
  await nodes.get('unlockBtn').fire('click');
  assert.deepStrictEqual(unlockCalls, ['0000', '1234']);
  assert.strictEqual(nodes.get('errorMsg').textContent, '');

  console.log('lock.html UI tests pass');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
