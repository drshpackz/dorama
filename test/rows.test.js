'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('buildRows returns the 7 verified curated rows', () => {
  const { buildRows } = load();
  const rows = buildRows();
  assert.strictEqual(rows.length, 7);
  const titles = rows.map(r => r.title);
  assert.ok(titles.indexOf('Корейские триллеры (сериалы)') >= 0);
  assert.ok(titles.indexOf('Лучшее: корейские триллеры') >= 0);
});

test('each row has url, method matching its discover path, and tmdb source', () => {
  const { buildRows } = load();
  buildRows().forEach(r => {
    assert.match(r.url, /^discover\/(tv|movie)\?/);
    assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
    assert.strictEqual(r.source, 'tmdb');
  });
});

test('INVARIANT: no discover/tv row uses the movie-only Thriller genre (53)', () => {
  const { buildRows } = load();
  buildRows().forEach(r => {
    if (r.url.indexOf('discover/tv') === 0) {
      const m = /with_genres=([^&]*)/.exec(r.url);
      const genres = m ? m[1].split(/[|,]/) : [];
      assert.ok(genres.indexOf('53') < 0, 'tv row must not contain genre 53: ' + r.url);
    }
  });
});

test('exact verified URLs are preserved character-for-character', () => {
  const { buildRows } = load();
  const byTitle = {};
  buildRows().forEach(r => { byTitle[r.title] = r.url; });
  assert.strictEqual(byTitle['Корейские триллеры (сериалы)'],
    'discover/tv?with_original_language=ko&with_genres=80|9648&sort_by=popularity.desc&vote_count.gte=40');
  assert.strictEqual(byTitle['Социальные триллеры (неравенство)'],
    'discover/movie?with_original_language=ko&with_genres=53,18&sort_by=popularity.desc&vote_count.gte=50');
  assert.strictEqual(byTitle['Лучшее: корейские триллеры'],
    'discover/movie?with_original_language=ko&with_genres=53|80&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=400&vote_average.gte=7');
});
