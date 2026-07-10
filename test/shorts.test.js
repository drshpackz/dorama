'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// Build a mock whose responder serves CUB lenta + TMDB language lookups.
// shotsByCall: array — Nth lenta request returns shotsByCall[N] (last repeats).
// langs: map like { 'tv/273160': 'ko' } for TMDB /tv/{id} и /movie/{id} lookups.
// failFirstMirror: every cub.rip request errors, cubnotrip.top answers.
// failAllShots: every shots request errors.
function shortsMock(opts) {
  opts = opts || {};
  let lentaCall = 0;
  const mock = makeMock({
    storage: opts.storage,
    responder: function (url) {
      if (url.indexOf('/api/shots/lenta') >= 0) {
        if (opts.failAllShots) return { __error: 500 };
        if (opts.failFirstMirror && url.indexOf('cub.rip') >= 0) return { __error: 500 };
        const batches = opts.shotsByCall || [[]];
        const batch = batches[Math.min(lentaCall, batches.length - 1)];
        lentaCall++;
        return { secuses: true, results: batch };
      }
      const m = /themoviedb\.org\/3\/(tv|movie)\/(\d+)/.exec(url);
      if (m) {
        const lang = (opts.langs || {})[m[1] + '/' + m[2]];
        if (!lang) return { __error: 404 };
        return { id: parseInt(m[2], 10), original_language: lang };
      }
      return { results: [] };
    }
  });
  return mock;
}

// Minimal ready shot factory.
function shot(id, cardId, type, extra) {
  return Object.assign({
    id: id, status: 'ready',
    file: 'https://video.lampa-shorts.com/o/' + id + '/o.mp4',
    screen: 'https://video.lampa-shorts.com/o/' + id + '/s.jpg',
    card_id: String(cardId), card_type: type,
    card_title: 'title' + cardId, card_year: '2024',
    season: 0, episode: 0, voice_name: ''
  }, extra || {});
}

test('shotsLentaUrl builds params in fixed order', () => {
  const api = loadPlugin(shortsMock());
  assert.strictEqual(
    api._shotsLentaUrl('https://cub.rip/api/shots/', { sort: 'new', page: 1, limit: 50 }),
    'https://cub.rip/api/shots/lenta?sort=new&page=1&limit=50');
  assert.strictEqual(
    api._shotsLentaUrl('https://cub.rip/api/shots/', { sort: 'from_id', id: 3300, limit: 50 }),
    'https://cub.rip/api/shots/lenta?sort=from_id&id=3300&limit=50');
});

test('fetchLenta returns results from the primary mirror', () => {
  const mock = shortsMock({ shotsByCall: [[shot(1, 10, 'tv')]] });
  const api = loadPlugin(mock);
  let got;
  api._fetchLenta(new mock.Lampa.Reguest(), { sort: 'new', page: 1, limit: 50 }, r => { got = r; });
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].id, 1);
  assert.ok(mock.calls.requests[0].indexOf('https://cub.rip/api/shots/lenta') === 0);
});

test('fetchLenta falls back to the second mirror on error', () => {
  const mock = shortsMock({ failFirstMirror: true, shotsByCall: [[shot(2, 10, 'tv')]] });
  const api = loadPlugin(mock);
  let got;
  api._fetchLenta(new mock.Lampa.Reguest(), { sort: 'new', page: 1, limit: 50 }, r => { got = r; });
  assert.strictEqual(got.length, 1);
  const urls = mock.calls.requests;
  assert.ok(urls.some(u => u.indexOf('cub.rip') >= 0), 'tried primary');
  assert.ok(urls.some(u => u.indexOf('cubnotrip.top') >= 0), 'fell back');
});

test('fetchLenta reports null when both mirrors fail', () => {
  const mock = shortsMock({ failAllShots: true });
  const api = loadPlugin(mock);
  let got = 'unset';
  api._fetchLenta(new mock.Lampa.Reguest(), { sort: 'new', page: 1, limit: 50 }, r => { got = r; });
  assert.strictEqual(got, null);
});

test('filterReadyShots drops non-ready and file-less clips', () => {
  const api = loadPlugin(shortsMock());
  const list = [
    shot(1, 10, 'tv'),
    shot(2, 10, 'tv', { status: 'processing' }),
    shot(3, 10, 'tv', { file: '' }),
    shot(4, 10, 'tv', { status: 'blocked' })
  ];
  assert.deepStrictEqual(api._filterReadyShots(list).map(s => s.id), [1]);
});

test('dedupeById keeps first occurrence, minShortId finds the smallest id', () => {
  const api = loadPlugin(shortsMock());
  const list = [shot(5, 1, 'tv'), shot(3, 2, 'tv'), shot(5, 3, 'tv')];
  assert.deepStrictEqual(api._dedupeById(list).map(s => s.id), [5, 3]);
  assert.strictEqual(api._minShortId(list), 3);
});
