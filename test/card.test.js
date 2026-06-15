'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// Fake Lampa Card instance whose render() returns a jQuery-like element with .find('.card__view').
function fakeCard(match, prompt) {
  var appended = [];
  var view = {
    length: 1,
    append: function (html) { appended.push(html); return view; },
    find: function (sel) { return { length: sel === '.dorama-match' ? appended.length : 0 }; }
  };
  var el = { find: function (sel) { return sel === '.card__view' ? view : { length: 0 }; } };
  return { data: prompt ? { __prompt: true } : { __match: match }, _appended: appended, render: function () { return el; } };
}

test('registerMatchBadge injects «%» into personal-row cards, once (idempotent)', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  api._registerMatchBadge();
  const card = fakeCard(87);
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: true }, items: [card] });
  assert.strictEqual(card._appended.length, 1);
  assert.ok(card._appended[0].indexOf('87%') >= 0);
  mock.Lampa.Listener.send('line', { type: 'visible', data: { personal: true }, items: [card] });
  assert.strictEqual(card._appended.length, 1, 'idempotent on repeat events');
});

test('registerMatchBadge ignores non-personal rows and prompt/no-match items', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  api._registerMatchBadge();
  const c1 = fakeCard(50), c2 = fakeCard(0, true);
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: false }, items: [c1] });
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: true }, items: [c2] }); // prompt → no __match
  assert.strictEqual(c1._appended.length, 0);
  assert.strictEqual(c2._appended.length, 0);
});
