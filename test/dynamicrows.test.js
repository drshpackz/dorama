'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('buildDynamicRows(now) builds newest-first tv + movie rows with a bounded date window', () => {
  const { _buildDynamicRows } = load();
  const rows = _buildDynamicRows(new Date('2026-06-15'));
  assert.strictEqual(rows.length, 2);

  const tv = rows.find(r => r.method === 'tv');
  const movie = rows.find(r => r.method === 'movie');
  assert.ok(tv && movie, 'one tv and one movie row');

  assert.match(tv.url, /first_air_date\.lte=2026-06-15/);
  assert.match(tv.url, /sort_by=first_air_date\.desc/);
  assert.match(movie.url, /primary_release_date\.lte=2026-06-15/);
  assert.match(movie.url, /sort_by=primary_release_date\.desc/);

  // gte floor present, well-formed, and strictly before the lte upper bound.
  [tv, movie].forEach(r => {
    const lte = /date\.lte=(\d{4}-\d{2}-\d{2})/.exec(r.url)[1];
    const gte = /date\.gte=(\d{4}-\d{2}-\d{2})/.exec(r.url)[1];
    assert.ok(gte < lte, 'gte (' + gte + ') must be before lte (' + lte + ')');
    assert.ok(r.posterRequired, 'new-release rows are poster-gated');
  });
});

test('buildDynamicRows defaults to the current date when no argument is given', () => {
  const { _buildDynamicRows } = load();
  const rows = _buildDynamicRows();
  assert.strictEqual(rows.length, 2);
  rows.forEach(r => assert.match(r.url, /date\.lte=\d{4}-\d{2}-\d{2}/));
});
