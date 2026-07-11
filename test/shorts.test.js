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

test('resolveShortsLanguages fetches unknown cards once and caches them', () => {
  const mock = shortsMock({ langs: { 'tv/100': 'ko', 'movie/200': 'ja' } });
  const api = loadPlugin(mock);
  const shots = [shot(1, 100, 'tv'), shot(2, 100, 'tv'), shot(3, 200, 'movie')];
  let map;
  api._resolveShortsLanguages(new mock.Lampa.Reguest(), shots, m => { map = m; });
  assert.strictEqual(map.tv_100, 'ko');
  assert.strictEqual(map.movie_200, 'ja');
  const tmdbCalls = mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0);
  assert.strictEqual(tmdbCalls.length, 2, 'one lookup per unique card');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_lang', {}),
    { tv_100: 'ko', movie_200: 'ja' });
});

test('resolveShortsLanguages serves cached cards without TMDB requests', () => {
  const mock = shortsMock({ storage: { dorama_shorts_lang: { tv_100: 'ko' } } });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsLanguages(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.strictEqual(map.tv_100, 'ko');
  assert.strictEqual(mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0).length, 0);
});

test('resolveShortsLanguages excludes failed lookups and does not cache them', () => {
  const mock = shortsMock({ langs: {} }); // every TMDB lookup 404s
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsLanguages(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.strictEqual(map.tv_100, undefined);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_lang', {}), {});
});

test('resolveShortsLanguages resets an oversized cache', () => {
  const big = {};
  for (let i = 0; i < 501; i++) big['movie_' + i] = 'fr';
  const mock = shortsMock({ storage: { dorama_shorts_lang: big }, langs: { 'tv/100': 'ko' } });
  const api = loadPlugin(mock);
  api._resolveShortsLanguages(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], () => {});
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_lang', {}), { tv_100: 'ko' });
});

test('orderShorts: ko first, then other Asian, others dropped', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(5, 1, 'tv'), shot(4, 2, 'movie'), shot(3, 3, 'tv'), shot(2, 4, 'movie')];
  const langMap = { tv_1: 'ja', movie_2: 'ko', tv_3: 'en', movie_4: 'ko' };
  assert.deepStrictEqual(api._orderShorts(shots, langMap, []).map(s => s.id), [4, 2, 5]);
});

test('orderShorts sinks viewed clips to the end of their group', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(9, 1, 'tv'), shot(8, 2, 'tv'), shot(7, 3, 'tv'), shot(6, 4, 'tv')];
  const langMap = { tv_1: 'ko', tv_2: 'ko', tv_3: 'ja', tv_4: 'ja' };
  // 9 and 7 are viewed -> each sinks within its own language group
  assert.deepStrictEqual(api._orderShorts(shots, langMap, [9, 7]).map(s => s.id), [8, 9, 6, 7]);
});

test('markShortViewed stores unique ids and caps at 500', () => {
  const mock = shortsMock();
  const api = loadPlugin(mock);
  api._markShortViewed(1);
  api._markShortViewed(1);
  api._markShortViewed(2);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_viewed', []), [1, 2]);
  for (let i = 10; i < 510; i++) api._markShortViewed(i);
  const arr = mock.Lampa.Storage.get('dorama_shorts_viewed', []);
  assert.strictEqual(arr.length, 500);
  assert.strictEqual(arr.indexOf(1), -1, 'oldest id evicted');
  assert.ok(arr.indexOf(509) >= 0, 'newest id kept');
});

test('buildShortsFeedData: fetches 3 pages, filters, resolves and orders', () => {
  const page1 = [shot(300, 1, 'tv'), shot(299, 2, 'movie', { status: 'processing' })];
  const page2 = [shot(250, 3, 'movie'), shot(300, 1, 'tv')]; // 300 is a dupe
  const page3 = [shot(200, 4, 'tv')];
  const mock = shortsMock({
    shotsByCall: [page1, page2, page3],
    langs: { 'tv/1': 'ja', 'movie/3': 'ko', 'tv/4': 'en' }
  });
  const api = loadPlugin(mock);
  let items;
  api._buildShortsFeedData(new mock.Lampa.Reguest(), r => { items = r; });
  // ko (250) first, ja (300) second, en (200) dropped, dupe collapsed
  assert.deepStrictEqual(items.map(s => s.id), [250, 300]);
  const lentaUrls = mock.calls.requests.filter(u => u.indexOf('/api/shots/lenta') >= 0);
  assert.strictEqual(lentaUrls.length, 3);
  assert.ok(lentaUrls[1].indexOf('sort=from_id') >= 0);
  assert.ok(lentaUrls[1].indexOf('id=300') >= 0, 'walks down from the smallest seen id');
});

test('buildShortsFeedData reports null on total network failure', () => {
  const mock = shortsMock({ failAllShots: true });
  const api = loadPlugin(mock);
  let items = 'unset';
  api._buildShortsFeedData(new mock.Lampa.Reguest(), r => { items = r; });
  assert.strictEqual(items, null);
});

test('openShorts: feed factory gets the ordered items and a loadMore fn', () => {
  const mock = shortsMock({
    shotsByCall: [[shot(300, 1, 'tv')], [], []],
    langs: { 'tv/1': 'ko' }
  });
  const api = loadPlugin(mock);
  let seen;
  api._openShorts((items, loadMore) => { seen = { items, loadMore }; });
  assert.deepStrictEqual(seen.items.map(s => s.id), [300]);
  assert.strictEqual(typeof seen.loadMore, 'function');
  assert.strictEqual(mock.calls.noty.length, 0);
});

test('openShorts: empty Asian pool -> Noty, factory not called', () => {
  const mock = shortsMock({
    shotsByCall: [[shot(300, 1, 'tv')], [], []],
    langs: { 'tv/1': 'en' } // nothing Asian
  });
  const api = loadPlugin(mock);
  let called = false;
  api._openShorts(() => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(mock.calls.noty.length, 1);
  assert.ok(/Пока нет/.test(mock.calls.noty[0]));
});

test('openShorts: network dead -> error Noty, factory not called', () => {
  const mock = shortsMock({ failAllShots: true });
  const api = loadPlugin(mock);
  let called = false;
  api._openShorts(() => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(mock.calls.noty.length, 1);
  assert.ok(/недоступен/.test(mock.calls.noty[0]));
});

test('menu: Shorts item lands right after Дорама', () => {
  const mock = shortsMock();
  const api = loadPlugin(mock);
  api._addMenuItem();
  api._addShortsMenuItem();
  const texts = mock.menuList._children.map(c => c.text());
  assert.deepStrictEqual(texts, ['Дорама', 'Shorts']);
});
