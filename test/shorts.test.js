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
    favorites: opts.favorites,
    mine_reactions: opts.mine_reactions,
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
        // string value = language only; object value = {lang, genres:[ids]}
        if (typeof lang === 'string') return { id: parseInt(m[2], 10), original_language: lang, genres: [] };
        return {
          id: parseInt(m[2], 10),
          original_language: lang.lang,
          genres: (lang.genres || []).map(id => ({ id, name: 'g' + id }))
        };
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

test('resolveShortsMeta fetches unknown cards once and caches lang+genres', () => {
  const mock = shortsMock({ langs: { 'tv/100': { lang: 'ko', genres: [18, 53] }, 'movie/200': 'ja' } });
  const api = loadPlugin(mock);
  const shots = [shot(1, 100, 'tv'), shot(2, 100, 'tv'), shot(3, 200, 'movie')];
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), shots, m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [18, 53] });
  assert.deepStrictEqual(map.movie_200, { lang: 'ja', genres: [] });
  const tmdbCalls = mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0);
  assert.strictEqual(tmdbCalls.length, 2, 'one lookup per unique card');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}),
    { tv_100: { lang: 'ko', genres: [18, 53] }, movie_200: { lang: 'ja', genres: [] } });
});

test('resolveShortsMeta serves cached cards without TMDB requests', () => {
  const mock = shortsMock({ storage: { dorama_shorts_meta: { tv_100: { lang: 'ko', genres: [18] } } } });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [18] });
  assert.strictEqual(mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0).length, 0);
});

test('resolveShortsMeta migrates the old language-only cache once', () => {
  const mock = shortsMock({ storage: { dorama_shorts_lang: { tv_100: 'ko' } } });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [] });
  assert.strictEqual(mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0).length, 0,
    'migrated entry counts as a cache hit');
});

test('resolveShortsMeta excludes failed lookups and does not cache them', () => {
  const mock = shortsMock({ langs: {} });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.strictEqual(map.tv_100, undefined);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}), {});
});

test('resolveShortsMeta resets an oversized cache', () => {
  const big = {};
  for (let i = 0; i < 501; i++) big['movie_' + i] = { lang: 'fr', genres: [] };
  const mock = shortsMock({ storage: { dorama_shorts_meta: big }, langs: { 'tv/100': 'ko' } });
  const api = loadPlugin(mock);
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], () => {});
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}),
    { tv_100: { lang: 'ko', genres: [] } });
});

test('orderShortsV2 with empty taste keeps the v1 order (ko, asian, viewed sink)', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(9, 1, 'tv'), shot(8, 2, 'tv'), shot(7, 3, 'tv'), shot(6, 4, 'tv'), shot(5, 5, 'movie')];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [] }, tv_2: { lang: 'ko', genres: [] },
    tv_3: { lang: 'ja', genres: [] }, tv_4: { lang: 'ja', genres: [] },
    movie_5: { lang: 'en', genres: [] }
  };
  const empty = { boostCards: {}, sinkCards: {}, genreAdj: {} };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [9, 7], empty).map(s => s.id),
    [8, 9, 6, 7], 'en dropped; viewed 9/7 sink within their language groups');
});

test('orderShortsV2 tiers: boost > ko-scored > ko-rest > asian > sink', () => {
  const api = loadPlugin(shortsMock());
  const shots = [
    shot(100, 1, 'tv'),   // ko, no genre match      -> tier 2
    shot(99, 2, 'tv'),    // ko, genre 18 (adj +1)   -> tier 1
    shot(98, 3, 'movie'), // boosted card            -> tier 0
    shot(97, 4, 'tv'),    // ja                      -> tier 4
    shot(96, 5, 'tv'),    // sunk card (ko)          -> tier 5
    shot(95, 6, 'tv')     // ko, genre 53 (adj +0.5) -> tier 1, below id 99
  ];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [99] },
    tv_2: { lang: 'ko', genres: [18] },
    movie_3: { lang: 'ko', genres: [] },
    tv_4: { lang: 'ja', genres: [] },
    tv_5: { lang: 'ko', genres: [] },
    tv_6: { lang: 'ko', genres: [53] }
  };
  const taste = { boostCards: { movie_3: 1 }, sinkCards: { tv_5: 1 }, genreAdj: { 18: 1.0, 53: 0.5 } };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [], taste).map(s => s.id),
    [98, 99, 95, 100, 97, 96]);
});

test('orderShortsV2: sink beats boost; equal scores keep incoming order', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(10, 1, 'tv'), shot(9, 2, 'tv'), shot(8, 3, 'tv')];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [18] },
    tv_2: { lang: 'ko', genres: [18] },
    tv_3: { lang: 'ko', genres: [] }
  };
  const taste = { boostCards: { tv_3: 1 }, sinkCards: { tv_3: 1 }, genreAdj: { 18: 0.5 } };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [], taste).map(s => s.id),
    [10, 9, 8], 'tv_3 sunk despite boost; 10 before 9 (same score, incoming order)');
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
  // 299 (the filtered-out "processing" clip) is the smallest RAW id on page 1 -
  // the cursor must walk from there, not from 300 (the smallest READY id), or
  // the non-ready low id would be re-requested forever.
  assert.ok(lentaUrls[1].indexOf('id=299') >= 0, 'walks down from the smallest raw seen id');
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

test('shortsLoadMore: returns ordered items and raw cursor', () => {
  const mock = shortsMock({
    shotsByCall: [[shot(240, 7, 'tv')]],
    langs: { 'tv/7': 'ko' }
  });
  const api = loadPlugin(mock);
  let result;
  api._shortsLoadMore(new mock.Lampa.Reguest(), 300, r => { result = r; });
  assert.deepStrictEqual(result.items.map(s => s.id), [240]);
  assert.strictEqual(result.next, 240);
});

test('shortsLoadMore: non-Asian page still advances the cursor', () => {
  const mock = shortsMock({
    shotsByCall: [[shot(220, 8, 'tv'), shot(210, 9, 'movie')]],
    langs: { 'tv/8': 'en', 'movie/9': 'en' }
  });
  const api = loadPlugin(mock);
  let result;
  api._shortsLoadMore(new mock.Lampa.Reguest(), 300, r => { result = r; });
  assert.deepStrictEqual(result.items, []);
  assert.strictEqual(result.next, 210);
});

test('shortsLoadMore: empty page signals exhausted', () => {
  const mock = shortsMock({ shotsByCall: [[]] });
  const api = loadPlugin(mock);
  let result;
  api._shortsLoadMore(new mock.Lampa.Reguest(), 300, r => { result = r; });
  assert.deepStrictEqual(result.items, []);
  assert.strictEqual(result.next, null);
});

test('openShorts loadMore walks past non-Asian pages and stops when exhausted', () => {
  const koPage = [shot(300, 1, 'tv')];
  const nonAsianPage = [shot(280, 2, 'tv'), shot(270, 3, 'movie')];
  const mock = shortsMock({
    // idx0: initial page1 (koPage); idx1: buildShortsFeedData's walk attempt (empty ->
    // stops the initial walk); idx2/idx3: the two loadMore pages under test.
    shotsByCall: [koPage, [], nonAsianPage, []],
    langs: { 'tv/1': 'ko', 'tv/2': 'en', 'movie/3': 'en' }
  });
  const api = loadPlugin(mock);
  let loadMoreFn;
  api._openShorts((items, loadMore) => { loadMoreFn = loadMore; });
  assert.strictEqual(typeof loadMoreFn, 'function');

  function lentaRequests() { return mock.calls.requests.filter(u => u.indexOf('/api/shots/lenta') >= 0); }
  const countAfterOpen = lentaRequests().length;

  let result1;
  loadMoreFn(r => { result1 = r; });
  assert.deepStrictEqual(result1, []);
  const lentaAfterFirst = lentaRequests();
  assert.strictEqual(lentaAfterFirst.length, countAfterOpen + 1, 'one new lenta request using the previous cursor');
  assert.ok(lentaAfterFirst[lentaAfterFirst.length - 1].indexOf('id=300') >= 0, 'used previous cursor id');

  let result2;
  loadMoreFn(r => { result2 = r; });
  assert.deepStrictEqual(result2, []);
  const countAfterSecond = lentaRequests().length;
  assert.strictEqual(countAfterSecond, countAfterOpen + 2, 'second call fetches the empty page and becomes exhausted');

  let result3;
  loadMoreFn(r => { result3 = r; });
  assert.deepStrictEqual(result3, []);
  assert.strictEqual(lentaRequests().length, countAfterSecond, 'exhausted feed does not issue a third lenta request');
});

test('shortsTasteToggle: round-trip, mutual exclusion, cap', () => {
  const mock = shortsMock();
  const api = loadPlugin(mock);
  assert.strictEqual(api._shortsTasteToggle('up', 'tv_1'), true);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: ['tv_1'], down: [] });
  assert.strictEqual(api._shortsTasteToggle('down', 'tv_1'), true, 'down evicts up');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: [], down: ['tv_1'] });
  assert.strictEqual(api._shortsTasteToggle('down', 'tv_1'), false, 'second toggle removes');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: [], down: [] });
  for (let i = 0; i < 101; i++) api._shortsTasteToggle('up', 'movie_' + i);
  const up = mock.Lampa.Storage.get('dorama_shorts_taste', {}).up;
  assert.strictEqual(up.length, 100);
  assert.strictEqual(up.indexOf('movie_0'), -1, 'oldest dropped');
});

test('buildShortsTaste: boosts from signals + up-list, sinks win, genreAdj clamped', () => {
  const mock = shortsMock({
    favorites: { like: [{ id: 777, name: 'liked show', original_language: 'ko' }], history: [], viewed: [] },
    storage: { dorama_shorts_taste: { up: ['movie_5', 'tv_9'], down: ['tv_777', 'movie_6'] } }
  });
  const api = loadPlugin(mock);
  const metaMap = {
    movie_5: { lang: 'ko', genres: [18, 53] },
    tv_9: { lang: 'ko', genres: [18] },
    movie_6: { lang: 'ko', genres: [35] },
    tv_777: { lang: 'ko', genres: [] }
  };
  const taste = api._buildShortsTaste(metaMap);
  assert.strictEqual(taste.boostCards.movie_5, 1);
  assert.strictEqual(taste.boostCards.tv_9, 1);
  assert.strictEqual(taste.boostCards.tv_777, undefined, 'sink evicts the liked-signal boost');
  assert.strictEqual(taste.sinkCards.tv_777, 1);
  assert.strictEqual(taste.sinkCards.movie_6, 1);
  assert.strictEqual(taste.genreAdj[18], 1.0, '0.5 from movie_5 + 0.5 from tv_9');
  assert.strictEqual(taste.genreAdj[53], 0.5);
  assert.strictEqual(taste.genreAdj[35], -0.5);
});

test('buildShortsTaste: genreAdj clamps at ±1.5 and empty signals give empty taste', () => {
  const up = [];
  const metaMap = {};
  for (let i = 0; i < 4; i++) { up.push('movie_' + i); metaMap['movie_' + i] = { lang: 'ko', genres: [18] }; }
  const mock = shortsMock({ storage: { dorama_shorts_taste: { up, down: [] } } });
  const api = loadPlugin(mock);
  assert.strictEqual(api._buildShortsTaste(metaMap).genreAdj[18], 1.5, '4×0.5 clamped to 1.5');
  const empty = loadPlugin(shortsMock())._buildShortsTaste({});
  assert.deepStrictEqual(empty, { boostCards: {}, sinkCards: {}, genreAdj: {} });
});

test('menu: Shorts item lands right after Дорама', () => {
  const mock = shortsMock();
  const api = loadPlugin(mock);
  api._addMenuItem();
  api._addShortsMenuItem();
  const texts = mock.menuList._children.map(c => c.text());
  assert.deepStrictEqual(texts, ['Дорама', 'Shorts']);
});

test('shortsShotCard builds tv and movie card shapes for Favorite', () => {
  const api = loadPlugin(shortsMock());
  const tv = api._shortsShotCard(shot(1, 273160, 'tv', { card_title: 'Красота', card_year: '2026', card_poster: '/p.jpg' }));
  assert.deepStrictEqual(tv, {
    id: 273160, name: 'Красота', original_name: 'Красота',
    poster_path: '/p.jpg', first_air_date: '2026'
  });
  const mv = api._shortsShotCard(shot(2, 99, 'movie', { card_title: 'Фильм', card_year: '2020', card_poster: '' }));
  assert.deepStrictEqual(mv, {
    id: 99, title: 'Фильм', original_title: 'Фильм',
    poster_path: '', release_date: '2020'
  });
});
