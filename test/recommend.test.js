'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load(fav) { return loadPlugin(makeMock(fav ? { favorites: fav } : undefined)); }

test('buildTasteProfile weights genres and finds the top language', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([
    { genre_ids: [18, 80], original_language: 'ko' },
    { genre_ids: [18], original_language: 'ko' },
    { genre_ids: [9648], original_language: 'ja' }
  ]);
  assert.strictEqual(p.topLang, 'ko');
  assert.ok(p.genreWeight[18] > p.genreWeight[80]); // 18 appears twice, 80 once
  assert.ok(p.langs.ko && p.langs.ja);
});

test('scoreCandidate ranks genre+language+co-occurrence higher; predictionPercent in 55..99', () => {
  const { _scoreCandidate, _predictionPercent, _buildTasteProfile } = load();
  const profile = _buildTasteProfile([{ genre_ids: [18, 80], original_language: 'ko' }]);
  const strong = _scoreCandidate({ genre_ids: [18, 80], original_language: 'ko', vote_average: 8.5, vote_count: 500 }, profile, 3);
  const weak = _scoreCandidate({ genre_ids: [35], original_language: 'en', vote_average: 6, vote_count: 10 }, profile, 1);
  assert.ok(strong > weak);
  const pct = _predictionPercent(strong);
  assert.ok(pct >= 55 && pct <= 99, 'pct=' + pct);
  assert.strictEqual(_predictionPercent(0), 55);
  assert.strictEqual(_predictionPercent(9), 99);
});

test('buildTasteProfile is safe on empty seeds (no genres, no division by zero)', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([]);
  assert.deepStrictEqual(p.genreWeight, {});
  assert.deepStrictEqual(p.langs, {});
  assert.strictEqual(p.topLang, '');
});

test('loadRecommendations builds a personal row sorted by match, excluding liked', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], vote_average: 8, first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [
        { id: 201, original_language: 'ko', genre_ids: [18, 80], vote_average: 8.5, vote_count: 500, poster_path: '/a.jpg' },
        { id: 100, original_language: 'ko', genre_ids: [18], vote_average: 9, vote_count: 900, poster_path: '/b.jpg' }, // liked → excluded
        { id: 202, original_language: 'en', genre_ids: [35], vote_average: 6, vote_count: 50, poster_path: '/c.jpg' }
      ] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  assert.strictEqual(row.title, 'Рекомендации для Вас');
  assert.ok(row.personal);
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(100) < 0, 'liked seed excluded');
  assert.strictEqual(row.results[0].id, 201, 'ko + genre + rating ranks first');
  assert.ok(row.results[0].__match >= 55 && row.results[0].__match <= 99);
});

test('loadRecommendations shows a prompt card when there are no Asian likes', () => {
  const mock = makeMock({ favorites: { like: [{ id: 1, original_language: 'en', genre_ids: [35] }] } });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  assert.strictEqual(row.results.length, 0);
  assert.strictEqual(row.__cold, true);
});

test('loadRecommendations flags an error row when seeds exist but every request fails', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }] },
    responder: function () { return { __error: 401 }; }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  assert.strictEqual(row.results.length, 0);
  assert.strictEqual(row.__errored, true);
});

test('loadRecommendations caches by liked-set signature (no refetch) until favorites change', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) { return url.indexOf('/recommendations') >= 0 ? { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }] } : { results: [] }; }
  });
  const api = loadPlugin(mock);
  const net = new mock.Lampa.Reguest();
  api._loadRecommendations(net, null, function () {});
  const after1 = mock.calls.requests.length;
  api._loadRecommendations(net, null, function () {});
  assert.strictEqual(mock.calls.requests.length, after1, 'second identical call served from cache');
  mock.Lampa.Favorite.toggle('like', { id: 300, original_language: 'ko', genre_ids: [80], first_air_date: '2021-01-01' }); // changes likes + fires state:changed
  api._loadRecommendations(net, null, function () {});
  assert.ok(mock.calls.requests.length > after1, 'recompute after favorites changed');
});

test('loadRecommendations falls back to /similar when the recommendations pool is thin', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }] };
      if (url.indexOf('/similar') >= 0) return { results: [{ id: 202, original_language: 'ko', genre_ids: [18], vote_average: 7.5, vote_count: 150, poster_path: '/b.jpg' }] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  assert.match(mock.calls.requests.join('\n'), /\/similar/, 'similar fetched when pool < MIN_POOL');
  assert.ok(row.results.map(c => c.id).indexOf(202) >= 0, 'similar candidate included');
});

test('scoreCandidate weights co-occurrence by seed weight (fire seed beats think seed)', () => {
  const { _scoreCandidate, _buildTasteProfile } = load();
  const profile = _buildTasteProfile([{ card: { genre_ids: [18], original_language: 'ko' }, weight: 2 }]);
  const fromFire = _scoreCandidate({ genre_ids: [18], original_language: 'ko', vote_average: 7, vote_count: 100 }, profile, 2.0);
  const fromThink = _scoreCandidate({ genre_ids: [18], original_language: 'ko', vote_average: 7, vote_count: 100 }, profile, 0.5);
  assert.ok(fromFire > fromThink, 'higher weighted co-occurrence scores higher');
});

test('buildTasteProfile accepts weighted {card,weight} seeds', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([{ card: { genre_ids: [18, 80], original_language: 'ko' }, weight: 2 }]);
  assert.ok(p.genreWeight[18] > 0 && p.genreWeight[80] > 0);
  assert.strictEqual(p.topLang, 'ko');
});

test('loadRecommendations excludes disliked look-alikes', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0 || url.indexOf('/similar') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }, { id: 202, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/b.jpg' }] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), { strong: { 202: true }, mild: {} }, function (r) { row = r; });
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(201) >= 0 && ids.indexOf(202) < 0, '202 excluded as disliked look-alike');
});
