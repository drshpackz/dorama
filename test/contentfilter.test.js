'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('every catalog discover row excludes BL/gay keywords (without_keywords)', () => {
  const api = loadPlugin(makeMock());
  const rows = api._buildCatalogRows();
  assert.ok(rows.length > 0);
  rows.forEach(r => {
    assert.ok(r.url.indexOf('without_keywords=') >= 0, 'no exclusion in: ' + r.url);
    assert.ok(r.url.indexOf('289844') >= 0, 'BL keyword id not excluded in: ' + r.url); // boys' love (bl)
  });
});

test('the raw curated rows (buildRows) stay untouched — exclusion is added only in the catalog', () => {
  const api = loadPlugin(makeMock());
  api.buildRows().forEach(r => {
    assert.ok(r.url.indexOf('without_keywords=') < 0, 'buildRows must remain frozen: ' + r.url);
  });
});

test('recommendations exclude BL/gay titles by id (block set)', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('with_keywords=289844') >= 0) return { results: [{ id: 777, original_language: 'ko' }] }; // BL block query → 777 is BL
      if (url.indexOf('/recommendations') >= 0 || url.indexOf('/similar') >= 0) return { results: [
        { id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' },
        { id: 777, original_language: 'ko', genre_ids: [18], vote_average: 9, vote_count: 900, poster_path: '/b.jpg' } // BL → must be excluded
      ] };
      return { results: [{ id: 1, poster_path: '/x.jpg' }] };
    }
  });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const recs = comp._built.filter(r => r.personal)[0];
  assert.ok(recs, 'recommendations row present');
  const ids = recs.results.map(c => c.id);
  assert.ok(ids.indexOf(201) >= 0, 'clean candidate kept');
  assert.ok(ids.indexOf(777) < 0, 'BL candidate excluded from recommendations');
});
