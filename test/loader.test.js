'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// The concurrent loader must preserve catalog order. With every discover row
// returning a posterful result and no likes (cold → no recs row), the built rows
// should exactly mirror buildCatalogRows() order.
test('concurrent loader preserves catalog row order', () => {
  const mock = makeMock({
    responder: function (url) {
      if (url.indexOf('discover/') >= 0) return { results: [{ id: 1, poster_path: '/p.jpg' }], total_pages: 5 };
      return { results: [] }; // recommendations: cold (no likes)
    }
  });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const expected = api._buildCatalogRows().map(r => r.title);
  const built = comp._built.map(r => r.title);
  assert.deepStrictEqual(built, expected, 'rows render in catalog order');
});

// posterRequired rows (new-release + keyword rows) drop poster-less results;
// ordinary rows (popular, curated) keep them.
test('posterRequired rows are filtered out when results lack posters; others survive', () => {
  const mock = makeMock({
    responder: function (url) {
      if (url.indexOf('discover/') >= 0) return { results: [{ id: 1, name: 'no-poster' }], total_pages: 1 };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const titles = comp._built.map(r => r.title);
  assert.ok(titles.indexOf('Сейчас смотрят') >= 0, 'non-poster-gated popular row survives');
  assert.ok(titles.indexOf('Корейские новинки: фильмы') < 0, 'poster-gated new-release row dropped');
  assert.ok(titles.indexOf('Триллер-головоломка: игра со зрителем') < 0, 'poster-gated keyword row dropped');
});
