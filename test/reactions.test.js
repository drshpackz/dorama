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

test('collectReactions parses mine_reactions into {media,id,types}', () => {
  const { _collectReactions } = load({ mine_reactions: { 'tv_1399': ['fire'], 'movie_27205': ['shit', 'bore'] } });
  const r = _collectReactions();
  const byId = {}; r.forEach(x => { byId[x.id] = x; });
  assert.strictEqual(byId[1399].media, 'tv');
  assert.deepStrictEqual(byId[1399].types, ['fire']);
  assert.strictEqual(byId[27205].media, 'movie');
  assert.deepStrictEqual(byId[27205].types, ['shit', 'bore']);
});
