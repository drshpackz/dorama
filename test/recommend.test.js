'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load(fav) { return loadPlugin(makeMock(fav ? { favorites: fav } : undefined)); }

test('collectSeeds keeps Asian-drama likes, most-recent-first, capped', () => {
  const { _collectSeeds } = load();
  const liked = [
    { id: 1, original_language: 'ko' },
    { id: 2, original_language: 'en' },          // dropped (not Asian)
    { id: 3, origin_country: ['JP'] },           // kept via country
    { id: 4, original_language: 'th' }
  ];
  const seeds = _collectSeeds(liked, 8);
  assert.deepStrictEqual(seeds.map(s => s.id), [1, 3, 4]);
  assert.strictEqual(_collectSeeds(liked, 1).length, 1); // cap respected
});

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
