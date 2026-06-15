'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load(opts) { return loadPlugin(makeMock(opts)); }

test('gradeOf maps reactions to signed weights; shit overrides like; like+nice bonus capped', () => {
  const { _gradeOf } = load();
  assert.deepStrictEqual(_gradeOf(['fire'], false), { sign: 'pos', weight: 2.0 });
  assert.deepStrictEqual(_gradeOf(['nice'], false), { sign: 'pos', weight: 1.0 });
  assert.deepStrictEqual(_gradeOf(['think'], false), { sign: 'pos', weight: 0.5 });
  assert.deepStrictEqual(_gradeOf([], true), { sign: 'pos', weight: 1.0 });
  assert.strictEqual(_gradeOf(['fire'], true).weight, 2.5);       // like + positive reaction bonus, capped
  assert.strictEqual(_gradeOf(['bore'], true).sign, 'mildNeg');
  assert.strictEqual(_gradeOf(['shit'], true).sign, 'strongNeg'); // shit beats the like
  assert.strictEqual(_gradeOf([], false).sign, 'none');
});

test('gradeOf precedence: shit overrides a positive reaction; multiple positives take the max', () => {
  const { _gradeOf } = load();
  assert.strictEqual(_gradeOf(['fire', 'shit'], false).sign, 'strongNeg'); // shit wins over fire
  assert.strictEqual(_gradeOf(['bore', 'nice'], false).sign, 'mildNeg');   // bore wins over nice
  assert.deepStrictEqual(_gradeOf(['fire', 'nice', 'think'], false), { sign: 'pos', weight: 2.0 }); // max
});

test('collectReactions skips malformed keys', () => {
  const { _collectReactions } = load({ mine_reactions: { 'badkey': ['fire'], 'tv_': ['nice'], 'movie_42': ['fire'] } });
  const ids = _collectReactions().map(x => x.id);
  assert.deepStrictEqual(ids, [42]); // 'badkey' (no _) and 'tv_' (NaN id) skipped
});

test('collectReactions parses mine_reactions into {media,id,types}', () => {
  const { _collectReactions } = load({ mine_reactions: { 'tv_1399': ['fire'], 'movie_27205': ['shit', 'bore'] } });
  const r = _collectReactions();
  const byId = {}; r.forEach(x => { byId[x.id] = x; });
  assert.strictEqual(byId[1399].media, 'tv');
  assert.deepStrictEqual(byId[1399].types, ['fire']);
  assert.strictEqual(byId[27205].media, 'movie');
  assert.deepStrictEqual(byId[27205].types, ['shit', 'bore']);
});

test('collectSignals splits positives/negatives, merges like+reaction, caps, Asian-filters', () => {
  const { _collectSignals } = load({
    favorites: { like: [
      { id: 1399, name: 'KDrama', original_language: 'ko', genre_ids: [18] },   // liked TV (also reacted fire below)
      { id: 500, title: 'EnMovie', original_language: 'en', genre_ids: [35] }    // liked but NOT Asian → dropped from positives
    ], history: [], viewed: [] },
    mine_reactions: { 'tv_1399': ['fire'], 'movie_27205': ['shit'], 'tv_2000': ['bore'] }
  });
  const s = _collectSignals();
  const pos = {}; s.positives.forEach(p => { pos[p.id] = p; });
  assert.ok(pos[1399], 'liked + fire kept');
  assert.strictEqual(pos[1399].weight, 2.5, 'fire(2.0)+like bonus → 2.5');
  assert.ok(!pos[500], 'non-Asian liked dropped from positives');
  const negIds = s.negatives.map(n => n.id);
  assert.ok(negIds.indexOf(27205) >= 0, 'shit is negative');
  assert.ok(negIds.indexOf(2000) >= 0, 'bore is negative');
  assert.strictEqual(s.negatives.filter(n => n.id === 27205)[0].strong, true);
  assert.strictEqual(s.negatives.filter(n => n.id === 2000)[0].strong, false);
  assert.ok(s.ratedIds[1399] && s.ratedIds[27205] && s.ratedIds[2000] && s.ratedIds[500]);
});
