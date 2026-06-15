'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('buildTasteProfile aggregates networks/keywords from enriched detail and backfills genres', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([
    { id: 1, media: 'tv', weight: 2, card: { genre_ids: [18], original_language: 'ko' },
      detail: { genre_ids: [18], networks: [866], companies: [], keywords: [100, 200], original_language: 'ko' } },
    { id: 2, media: 'tv', weight: 1, card: null, // reaction-only seed
      detail: { genre_ids: [9648], networks: [866, 885], companies: [], keywords: [100], original_language: 'ko' } }
  ]);
  assert.ok(p.networkWeight[866] > p.networkWeight[885], '866 weighted higher (appears twice)');
  assert.strictEqual(p.topNetworks[0], 866);
  assert.ok(p.keywordWeight[100] >= 3, 'keyword 100 accumulates weight');
  assert.ok(p.genreWeight[9648] > 0, 'reaction-only seed genres backfilled from detail');
});

test('orderCatalogRows floats taste-matching rows up, pins the head, leaves cold order intact', () => {
  const { _orderCatalogRows, _buildTasteProfile } = load();
  const rows = [
    { title: 'P1', url: 'discover/tv?sort_by=popularity.desc' },     // pinned
    { title: 'P2', url: 'discover/movie?sort_by=popularity.desc' },  // pinned
    { title: 'Romance', url: 'discover/tv?with_genres=10749' },
    { title: 'Crime', url: 'discover/tv?with_genres=80' },
    { title: 'tvN', url: 'discover/tv?with_networks=866' }
  ];
  const profile = _buildTasteProfile([{ genre_ids: [80], original_language: 'ko' }]); // likes crime
  const ordered = _orderCatalogRows(rows, profile, 2);
  assert.deepStrictEqual([ordered[0].title, ordered[1].title], ['P1', 'P2'], 'head pinned');
  assert.strictEqual(ordered[2].title, 'Crime', 'liked genre floats to the top of the tail');

  const cold = _orderCatalogRows(rows, _buildTasteProfile([]), 2);
  assert.deepStrictEqual(cold.map(r => r.title), rows.map(r => r.title), 'no taste → original order');
});

test('rowAffinity rewards a favoured network', () => {
  const { _rowAffinity, _buildTasteProfile } = load();
  const profile = _buildTasteProfile([
    { id: 1, media: 'tv', weight: 1, card: { genre_ids: [18], original_language: 'ko' }, detail: { genre_ids: [18], networks: [866], companies: [], keywords: [] } }
  ]);
  const tvn = _rowAffinity({ url: 'discover/tv?with_networks=866' }, profile);
  const sbs = _rowAffinity({ url: 'discover/tv?with_networks=156' }, profile);
  assert.ok(tvn > sbs, 'row on the favoured network scores higher');
});

test('buildExtraRows includes network and studio rows', () => {
  const { _buildExtraRows } = load();
  const rows = _buildExtraRows();
  const titles = rows.map(r => r.title);
  ['Дорамы tvN', 'Дорамы JTBC', 'Дорамы SBS', 'Netflix Корея', 'Большое корейское кино (студии)']
    .forEach(t => assert.ok(titles.indexOf(t) >= 0, 'missing ' + t));
  assert.ok(rows.find(r => r.title === 'Дорамы tvN').url.indexOf('with_networks=866') >= 0);
  assert.ok(rows.find(r => r.title === 'Большое корейское кино (студии)').url.indexOf('with_companies=') >= 0);
});

test('recommendations pull candidates from the user top-network discover source (multi-source)', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/100?append_to_response=keywords') >= 0) return { genres: [{ id: 18 }], networks: [{ id: 866 }], keywords: { results: [] } };
      if (url.indexOf('with_networks=866') >= 0) return { results: [{ id: 501, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/n.jpg' }] };
      if (url.indexOf('/recommendations') >= 0 || url.indexOf('/similar') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(501) >= 0, 'candidate surfaced only by the top-network source is included');
  assert.ok(ids.indexOf(201) >= 0, 'collaborative candidate also present');
});
