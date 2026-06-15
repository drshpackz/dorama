'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('ANCHORS holds the 20 verified anchors (10 movie + 10 tv)', () => {
  const { ANCHORS } = load();
  assert.strictEqual(ANCHORS.length, 20);
  assert.strictEqual(ANCHORS.filter(a => a.type === 'movie').length, 10);
  assert.strictEqual(ANCHORS.filter(a => a.type === 'tv').length, 10);
  // spot-check verified ids + correct media routing
  assert.ok(ANCHORS.some(a => a.id === 496243 && a.type === 'movie')); // Parasite
  assert.ok(ANCHORS.some(a => a.id === 156484 && a.type === 'tv'));     // The 8 Show (tv, not movie)
  assert.ok(ANCHORS.some(a => a.id === 110415 && a.type === 'movie'));  // Snowpiercer (en, still a movie seed)
});

test('pickAnchors rotates and never exceeds the pool', () => {
  const { ANCHORS, pickAnchors } = load();
  const five = pickAnchors(ANCHORS, 5, 0);
  assert.strictEqual(five.length, 5);
  assert.strictEqual(five[0].id, ANCHORS[0].id);
  const wrap = pickAnchors(ANCHORS, 5, 18); // wraps past the end
  assert.strictEqual(wrap.length, 5);
  assert.strictEqual(wrap[0].id, ANCHORS[18].id);
  assert.strictEqual(wrap[2].id, ANCHORS[0].id);
  assert.strictEqual(pickAnchors(ANCHORS, 999, 0).length, 20); // capped at pool size
});

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
