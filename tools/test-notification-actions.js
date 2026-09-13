/*
 * Tests for interactive notification actions (Mark as Read, inline reply) in src/notify.js.
 */
'use strict';

const assert = require('assert');
const EventEmitter = require('events');

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

// Mock Electron Notification
class MockNotification extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.isShown = false;
    this.isClosed = false;
    MockNotification.instances.push(this);
  }

  static isSupported() {
    return true;
  }

  show() {
    this.isShown = true;
  }

  close() {
    this.isClosed = true;
    this.emit('close');
  }
}
MockNotification.instances = [];

// Install mock electron module into require cache before loading src/notify.js
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') {
    return {
      Notification: MockNotification,
      app: {
        getPath: () => '/tmp',
        whenReady: async () => {},
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

const { Banners } = require('../src/notify.js');

try {
  const banners = new Banners();

  // Test 1: Showing a message notification creates MockNotification with Mark as Read action and hasReply
  let markReadCalled = false;
  let replyTextReceived = null;

  banners.show({
    title: 'Alice',
    body: 'How are you?',
    chatId: '12345@c.us',
    onMarkAsRead: () => {
      markReadCalled = true;
    },
    onReply: text => {
      replyTextReceived = text;
    },
  });

  check('Notification instance was created', MockNotification.instances.length > 0, true);
  const n1 = MockNotification.instances[MockNotification.instances.length - 1];

  check('Notification has Mark as Read button action',
        n1.options.actions && n1.options.actions.some(a => a.text === 'Mark as Read'), true);
  check('Notification has hasReply enabled', n1.options.hasReply, true);
  check('Notification has replyPlaceholder set', n1.options.replyPlaceholder, 'Reply...');

  // Test 2: Simulating "Mark as Read" action event
  n1.emit('action', {}, 0);
  check('onMarkAsRead callback was fired', markReadCalled, true);

  // Test 3: Simulating "reply" event
  const n2 = new MockNotification({ actions: [{ type: 'button', text: 'Mark as Read' }], hasReply: true });
  banners.show({
    title: 'Bob',
    body: 'Dinner tonight?',
    chatId: '67890@c.us',
    onReply: text => {
      replyTextReceived = text;
    }
  });
  const n2Active = MockNotification.instances[MockNotification.instances.length - 1];
  n2Active.emit('reply', {}, 'Sounds great! See you at 8.');
  check('onReply callback received correct reply text', replyTextReceived, 'Sounds great! See you at 8.');

  // Test 4: Ongoing notifications (e.g., active call) should omit actions and reply
  banners.show({
    title: 'Incoming Call',
    body: 'Alice is calling...',
    ongoing: true,
  });
  const n3 = MockNotification.instances[MockNotification.instances.length - 1];
  check('Ongoing notification has empty actions', n3.options.actions.length, 0);
  check('Ongoing notification has hasReply disabled', n3.options.hasReply, false);

  // Test 5: Error resilience - throwing callback does not crash
  let errLogged = false;
  banners.show({
    title: 'Charlie',
    body: 'Test crash safety',
    onMarkAsRead: () => {
      throw new Error('Explosion');
    },
  });
  const n4 = MockNotification.instances[MockNotification.instances.length - 1];
  assert.doesNotThrow(() => {
    n4.emit('action', {}, 0);
  }, 'Notification action callback error is safely caught');
  check('Callback error was safely caught', true, true);

} catch (err) {
  failures++;
  console.error('Unexpected error in test-notification-actions.js:', err);
}

if (failures > 0) {
  process.exit(1);
} else {
  console.log('notification action checks pass');
  process.exit(0);
}
