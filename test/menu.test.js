'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('subscribes to app ready when appready is false', () => {
  const mock = makeMock();
  loadPlugin(mock);
  assert.strictEqual(typeof mock.calls.listeners.app, 'function');
  assert.strictEqual(mock.menuList._children.length, 0); // nothing injected before ready
});

test('on ready: registers component and injects a Дорама menu item', () => {
  const mock = makeMock();
  loadPlugin(mock);
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.dorama, 'function');
  assert.strictEqual(mock.menuList._children.length, 2);
  const item = mock.menuList._children[0];
  assert.strictEqual(item.text(), 'Дорама');
  assert.match(item._html, /data-action="dorama"/);
  assert.match(item._html, /menu__ico/);
});

test('hover:enter on the menu item pushes the dorama activity', () => {
  const mock = makeMock();
  loadPlugin(mock);
  mock.calls.listeners.app({ type: 'ready' });
  mock.menuList._children[0].trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush.length, 1);
  assert.deepStrictEqual(mock.calls.activityPush[0], {
    url: '', title: 'Дорама', component: 'dorama', source: 'tmdb', card_type: true, page: 1
  });
});

test('starts immediately when appready is already true', () => {
  const mock = makeMock();
  mock.Lampa.appready = true;
  loadPlugin(mock);
  assert.strictEqual(mock.menuList._children.length, 2);
});

test('start() is idempotent — a second app:ready does not double-inject', () => {
  const mock = makeMock();
  loadPlugin(mock);
  mock.calls.listeners.app({ type: 'ready' });
  mock.calls.listeners.app({ type: 'ready' }); // fire ready again
  assert.strictEqual(mock.menuList._children.length, 2);
});
