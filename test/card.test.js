'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('PredictionCard renders the match badge and opens detail on enter', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ id: 5, media_type: 'tv', vote_average: 8.1, __match: 87, name: 'X', poster_path: '/p.jpg', source: 'tmdb' });
  card.create();
  assert.ok(card.render(true)._html.indexOf('Совпадение 87%') >= 0);
  card.render(true).trigger('hover:enter');
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.strictEqual(push.component, 'full');
  assert.strictEqual(push.id, 5);
  assert.strictEqual(push.method, 'tv');
});

test('PredictionCard hover:long toggles the native like', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ id: 9, media_type: 'movie', __match: 70, title: 'Y', poster_path: '/p.jpg' });
  card.create();
  card.render(true).trigger('hover:long');
  assert.deepStrictEqual(mock.calls.favToggles[mock.calls.favToggles.length - 1], { where: 'like', id: 9 });
  assert.ok(mock.calls.noty.length >= 1);
});

test('PredictionCard prompt mode shows text and does not open detail', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ __prompt: true, title: 'Лайкните дорамы, чтобы получить персональные рекомендации' });
  card.create();
  assert.ok(card.render(true)._html.indexOf('Лайкните дорамы') >= 0);
  const before = mock.calls.activityPush.length;
  card.render(true).trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush.length, before);
});
