'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('mergeRecommendations dedupes by id, drops anchors, caps length', () => {
  const { mergeRecommendations } = load();
  const lists = [
    [{ id: 1 }, { id: 2 }, { id: 2 }],   // dup id 2
    [{ id: 3 }, { id: 496243 }],          // 496243 is an anchor -> dropped
    [{ id: 4 }, { id: 5 }, { id: 6 }]
  ];
  const merged = mergeRecommendations(lists, [496243], 4);
  assert.deepStrictEqual(merged.map(x => x.id), [1, 2, 3, 4]); // capped at 4, anchor + dup removed
});

test('mergeRecommendations tolerates null/empty lists', () => {
  const { mergeRecommendations } = load();
  assert.deepStrictEqual(mergeRecommendations([null, [], [{ id: 9 }]], [], 40).map(x => x.id), [9]);
});

test('mergeRecommendations skips items with a missing id', () => {
  const { mergeRecommendations } = load();
  const merged = mergeRecommendations([[{ id: 1 }, { title: 'no-id' }, { id: 2 }]], [], 40);
  assert.deepStrictEqual(merged.map(x => x.id), [1, 2]);
});

test('mergeRecommendations returns empty when cap is 0', () => {
  const { mergeRecommendations } = load();
  assert.deepStrictEqual(mergeRecommendations([[{ id: 1 }, { id: 2 }]], [], 0), []);
});
