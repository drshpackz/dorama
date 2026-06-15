'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('buildDislikeSet maps shit→strong, bore→mild, plus their look-alikes', () => {
  const mock = makeMock({
    responder: function (url) {
      if (url.indexOf('movie/900/recommendations') >= 0) return { results: [{ id: 901 }, { id: 902 }] };
      if (url.indexOf('tv/800/recommendations') >= 0) return { results: [{ id: 801 }] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let set;
  api._buildDislikeSet(new mock.Lampa.Reguest(), [{ id: 900, media: 'movie', strong: true }, { id: 800, media: 'tv', strong: false }], function (s) { set = s; });
  assert.ok(set.strong[900] && set.strong[901] && set.strong[902], 'shit id + look-alikes are strong');
  assert.ok(set.mild[800] && set.mild[801], 'bore id + look-alikes are mild');
});

test('reorderByDislike stably pushes mild below normal and strong last; removes nothing', () => {
  const api = loadPlugin(makeMock());
  const set = { strong: { 30: true }, mild: { 20: true } };
  const out = api._reorderByDislike([{ id: 10 }, { id: 30 }, { id: 11 }, { id: 20 }, { id: 12 }], set);
  assert.deepStrictEqual(out.map(x => x.id), [10, 11, 12, 20, 30]); // normals keep order, mild then strong last
  assert.strictEqual(out.length, 5, 'nothing removed');
});
