'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

// Every row across the whole catalog (popular + dynamic + 7 curated + extra).
function allRows(api) {
  return api._popularRows()
    .concat(api._buildDynamicRows(new Date('2026-06-15')))
    .concat(api.buildRows())
    .concat(api._buildExtraRows());
}

test('popularRows leads with «Сейчас смотрят» + two «Самые популярные» rows', () => {
  const { _popularRows } = load();
  const titles = _popularRows().map(r => r.title);
  assert.strictEqual(titles[0], 'Сейчас смотрят');
  assert.ok(titles.indexOf('Самые популярные: фильмы') >= 0);
  assert.ok(titles.indexOf('Самые популярные: сериалы') >= 0);
});

test('buildExtraRows includes the requested thematic rows (exact titles)', () => {
  const { _buildExtraRows } = load();
  const titles = _buildExtraRows().map(r => r.title);
  ['Психологический хоррор (сериалы)', 'Психологический хоррор (фильмы)',
   'Триллер-головоломка (сериалы)', 'Триллер-головоломка: игра со зрителем']
    .forEach(t => assert.ok(titles.indexOf(t) >= 0, 'missing row: ' + t));
});

test('buildCatalogRows: recs-less order is popular → newest → 7 curated → extra', () => {
  const { _buildCatalogRows, _popularRows } = load();
  const rows = _buildCatalogRows();
  assert.strictEqual(rows[0].title, 'Сейчас смотрят');
  assert.strictEqual(rows[_popularRows().length].title, 'Корейские новинки: сериалы');
  // the 7 original curated rows are present, unchanged
  assert.ok(rows.some(r => r.title === 'Корейские триллеры (сериалы)'));
  assert.ok(rows.some(r => r.title === 'Лучшее: корейские триллеры'));
});

test('INVARIANT: every catalog row is Korean-only (with_original_language=ko)', () => {
  const api = load();
  allRows(api).forEach(r => {
    assert.ok(r.url.indexOf('with_original_language=ko') >= 0, 'not ko-only: ' + r.url);
  });
});

test('INVARIANT: no discover/tv row uses the movie-only Thriller genre (53)', () => {
  const api = load();
  allRows(api).forEach(r => {
    if (r.url.indexOf('discover/tv') === 0) {
      const m = /with_genres=([^&]*)/.exec(r.url);
      const genres = m ? m[1].split(/[|,]/) : [];
      assert.ok(genres.indexOf('53') < 0, 'tv row must not contain genre 53: ' + r.url);
    }
  });
});

test('every catalog row has a discover url, matching method, and tmdb source', () => {
  const api = load();
  allRows(api).forEach(r => {
    assert.match(r.url, /^discover\/(tv|movie)\?/);
    assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
    assert.strictEqual(r.source, 'tmdb');
  });
});
