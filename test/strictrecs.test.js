'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// Strict-by-taste recommendations: drop non-Asian candidates, drop candidates
// with no genre overlap, and let co-occurrence + genre overlap dominate rating.

test('non-Asian candidate is dropped even with a poster and high rating', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [
        { id: 201, original_language: 'ko', genre_ids: [18, 80], vote_average: 7, vote_count: 200, poster_path: '/a.jpg' },
        { id: 999, original_language: 'en', genre_ids: [18, 80], vote_average: 9.5, vote_count: 9000, poster_path: '/b.jpg' } // non-Asian → dropped
      ] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(201) >= 0, 'Asian, on-genre candidate kept');
  assert.ok(ids.indexOf(999) < 0, 'non-Asian candidate dropped despite high rating');
});

test('Asian candidate with no genre overlap is dropped', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [
        { id: 201, original_language: 'ko', genre_ids: [18], vote_average: 7, vote_count: 200, poster_path: '/a.jpg' },
        { id: 888, original_language: 'ko', genre_ids: [10749], vote_average: 9, vote_count: 900, poster_path: '/b.jpg' } // genre 10749 not in profile → dropped
      ] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), null, function (r) { row = r; });
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(201) >= 0, 'overlapping-genre candidate kept');
  assert.ok(ids.indexOf(888) < 0, 'zero-overlap candidate dropped');
});

test('co-occurrence + genre overlap outweigh raw rating', () => {
  const { _scoreCandidate, _buildTasteProfile } = loadPlugin(makeMock());
  const profile = _buildTasteProfile([{ genre_ids: [18, 80], original_language: 'ko' }]);
  // low rating but on-genre and co-occurring
  const onTaste = _scoreCandidate({ genre_ids: [18, 80], original_language: 'ko', vote_average: 5, vote_count: 50 }, profile, 3);
  // max rating but no overlap and no co-occurrence
  const popcorn = _scoreCandidate({ genre_ids: [35], original_language: 'ko', vote_average: 10, vote_count: 1000 }, profile, 0);
  assert.ok(onTaste > popcorn, 'taste match must beat a higher-rated off-taste title');
});
