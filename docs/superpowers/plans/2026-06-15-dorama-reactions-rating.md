# Graded Reactions + Global Dislike + Badge Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make «Рекомендации для Вас» weight by likes **and** Lampa's 5-level reactions, push 💩/😴 look-alikes down across the whole catalog, and fix the missing «Совпадение %» badge by switching to standard cards + `line`-event injection.

**Architecture:** Read native likes (`Lampa.Favorite`) and reactions (`Lampa.Storage('mine_reactions')`), grade each rated title to a signed weight, drive a weighted recommender + a TMDB-look-alike "dislike set" used to exclude (recs) and stably de-prioritize (curated rows). The recommendations row uses standard Lampa cards; a global `line` listener injects the % badge. The custom `PredictionCard` is removed.

**Tech Stack:** Single-file ES5 `dorama.js`; Node `node:test` + the existing `Lampa`/`$` mock (extended for Storage/reactions/`line`).

**Reference spec:** `docs/superpowers/specs/2026-06-15-dorama-reactions-rating-design.md`. Builds on the shipped recommender.

**Repo hygiene (every task):** stage ONLY the files named; never `git add -A`/`.`/`-u`; never touch `.gitignore`, `sec-tests/`, `sec-out/` (the user's separate work).

---

## File structure

- Modify: `dorama.js` — add graded-signal + dislike + badge code; rewrite `loadRecommendations`/`loadCatalog`/`start`; remove `PredictionCard`/`makePredictionCard`/`escHtml`.
- Modify: `test/helpers/lampa-mock.js` — real `Storage` store + `mine_reactions` option + `Storage.listener('change')`; `$` passthrough for non-string args.
- Create: `test/reactions.test.js` — `gradeOf`/`collectReactions`/`collectSignals`.
- Create: `test/dislike.test.js` — `buildDislikeSet`/`reorderByDislike`.
- Modify: `test/recommend.test.js` — weighted scoring + 3-arg `loadRecommendations` + cold-start change.
- Replace: `test/card.test.js` — badge-injection tests (remove PredictionCard tests).
- Modify: `test/component.test.js`, `test/auth.test.js` — 3-arg flow + standard-card recs.

---

## Task 1: Mock — Storage store + reactions + `$` passthrough

**Files:** Modify: `test/helpers/lampa-mock.js`

- [ ] **Step 1: Make `$` accept element objects (so badge code can wrap render() output)**

In `test/helpers/lampa-mock.js`, replace the `$` function:

```js
  function $(arg) {
    if (typeof arg === 'string' && arg.charAt(0) === '<') return makeEl(arg);
    if (typeof arg === 'string') return { eq: function () { return menuList; }, length: 1 };
    return arg; // already an element-like object → pass through
  }
```

- [ ] **Step 2: Replace the `Storage` stub with a real in-memory store + change listener**

Replace the `Storage: { ... }` entry inside the `Lampa` object with:

```js
    Storage: (function () {
      var store = {};
      if (options.mine_reactions) store.mine_reactions = options.mine_reactions;
      if (options.storage) for (var sk in options.storage) if (options.storage.hasOwnProperty(sk)) store[sk] = options.storage[sk];
      var changeFns = [];
      return {
        field: function () { return 'ru'; },
        get: function (k, def) { return (k in store) ? store[k] : def; },
        set: function (k, v) { store[k] = v; for (var i = 0; i < changeFns.length; i++) changeFns[i]({ name: k, value: v }); },
        listener: { follow: function (name, fn) { if (name === 'change') changeFns.push(fn); }, send: function () {} }
      };
    })(),
```

- [ ] **Step 3: Verify the mock parses and existing tests still pass**

Run: `node --check "/root/projects/lampatv plugins/test/helpers/lampa-mock.js" && node --test`
Expected: parses OK; **37/37 pass** (Storage.field still returns 'ru' for `tmdbUrl`; get/set now back a real store but nothing depended on the old no-op).

- [ ] **Step 4: Commit**

```bash
git add test/helpers/lampa-mock.js
git commit -m "test: mock Storage store + mine_reactions + \$ element passthrough"
```

---

## Task 2: `gradeOf` + reaction reading

**Files:** Modify: `dorama.js`; Create: `test/reactions.test.js`

- [ ] **Step 1: Write `test/reactions.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/reactions.test.js`
Expected: FAIL — `_gradeOf`/`_collectReactions` undefined.

- [ ] **Step 3: Add to `dorama.js`** (immediately after `predictionPercent`, before `var RECS_TITLE`)

```js
  // --- graded signals: native likes + 5-level reactions (mine_reactions) ---
  var REACTION_WEIGHT = { fire: 2.0, nice: 1.0, think: 0.5 };

  function hasType(types, t) { return !!types && types.indexOf(t) >= 0; }

  // Signed grade for a title from its reaction types + liked flag.
  function gradeOf(types, liked) {
    types = types || [];
    if (hasType(types, 'shit')) return { sign: 'strongNeg', weight: -2 };
    if (hasType(types, 'bore')) return { sign: 'mildNeg', weight: -1 };
    var w = 0;
    if (hasType(types, 'fire')) w = Math.max(w, REACTION_WEIGHT.fire);
    if (hasType(types, 'nice')) w = Math.max(w, REACTION_WEIGHT.nice);
    if (hasType(types, 'think')) w = Math.max(w, REACTION_WEIGHT.think);
    if (liked) w = Math.max(w, 1.0);
    if (w <= 0) return { sign: 'none', weight: 0 };
    var posReaction = hasType(types, 'fire') || hasType(types, 'nice') || hasType(types, 'think');
    if (liked && posReaction) w = Math.min(w + 0.5, 2.5);
    return { sign: 'pos', weight: w };
  }

  // The user's own reactions from local Storage 'mine_reactions':
  // { '<media>_<tmdbId>': ['fire'|'nice'|'think'|'bore'|'shit', ...] }.
  function collectReactions() {
    var mine = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('mine_reactions', {}) || {}) : {};
    var out = [], k, us, media, id;
    for (k in mine) {
      if (!mine.hasOwnProperty(k)) continue;
      us = k.indexOf('_'); if (us < 0) continue;
      media = k.slice(0, us); id = parseInt(k.slice(us + 1), 10);
      if (!id) continue;
      out.push({ media: media, id: id, types: mine[k] || [] });
    }
    return out;
  }
```

Add exports (in `module.exports`, after `_predictionPercent`): `_gradeOf: gradeOf,` and `_collectReactions: collectReactions,`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/reactions.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/reactions.test.js
git commit -m "feat: gradeOf + collectReactions (likes+reactions graded signals)"
```

---

## Task 3: `collectSignals`

**Files:** Modify: `dorama.js`; Modify: `test/reactions.test.js`

- [ ] **Step 1: Append to `test/reactions.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/reactions.test.js`
Expected: FAIL — `_collectSignals` undefined.

- [ ] **Step 3: Add to `dorama.js`** (right after `collectReactions`)

```js
  // Merge likes + reactions → positive seeds (with weight + card if liked),
  // negative seeds, and the set of all rated ids.
  function collectSignals() {
    var liked = favGet('like');
    var reactions = collectReactions();
    var map = {}, i, r, c, key, e, g;
    for (i = 0; i < reactions.length; i++) {
      r = reactions[i]; key = r.media + '_' + r.id;
      map[key] = { id: r.id, media: r.media, types: (r.types || []).slice(), liked: false, card: null };
    }
    for (i = 0; i < liked.length; i++) {
      c = liked[i]; key = (c.name ? 'tv' : 'movie') + '_' + c.id;
      if (!map[key]) map[key] = { id: c.id, media: (c.name ? 'tv' : 'movie'), types: [], liked: false, card: null };
      map[key].liked = true; map[key].card = c;
    }
    var positives = [], negatives = [], ratedIds = {};
    for (key in map) {
      if (!map.hasOwnProperty(key)) continue;
      e = map[key]; ratedIds[e.id] = true;
      g = gradeOf(e.types, e.liked);
      if (g.sign === 'pos') { if (!e.card || isAsianDrama(e.card)) positives.push({ id: e.id, media: e.media, weight: g.weight, card: e.card }); }
      else if (g.sign === 'strongNeg') negatives.push({ id: e.id, media: e.media, strong: true });
      else if (g.sign === 'mildNeg') negatives.push({ id: e.id, media: e.media, strong: false });
    }
    positives.sort(function (a, b) { return b.weight - a.weight; });
    return { positives: positives.slice(0, 8), negatives: negatives.slice(0, 6), ratedIds: ratedIds };
  }
```

Add export `_collectSignals: collectSignals,`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/reactions.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/reactions.test.js
git commit -m "feat: collectSignals (merge likes+reactions into graded seeds)"
```

---

## Task 4: Weighted taste profile + score

**Files:** Modify: `dorama.js`; Modify: `test/recommend.test.js`

- [ ] **Step 1: Append a weighted-scoring test to `test/recommend.test.js`**

```js
test('scoreCandidate weights co-occurrence by seed weight (fire seed beats think seed)', () => {
  const { _scoreCandidate, _buildTasteProfile } = load();
  const profile = _buildTasteProfile([{ card: { genre_ids: [18], original_language: 'ko' }, weight: 2 }]);
  const fromFire = _scoreCandidate({ genre_ids: [18], original_language: 'ko', vote_average: 7, vote_count: 100 }, profile, 2.0);
  const fromThink = _scoreCandidate({ genre_ids: [18], original_language: 'ko', vote_average: 7, vote_count: 100 }, profile, 0.5);
  assert.ok(fromFire > fromThink, 'higher weighted co-occurrence scores higher');
});

test('buildTasteProfile accepts weighted {card,weight} seeds', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([{ card: { genre_ids: [18, 80], original_language: 'ko' }, weight: 2 }]);
  assert.ok(p.genreWeight[18] > 0 && p.genreWeight[80] > 0);
  assert.strictEqual(p.topLang, 'ko');
});
```

(`load` is the helper at the top of `recommend.test.js`; if it isn't defined there, add `function load(opts){ return loadPlugin(makeMock(opts)); }` near the imports.)

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/recommend.test.js`
Expected: FAIL — the fire/think test fails because `scoreCandidate`'s `co` still uses `min(x,3)/3` (so 2.0 and 0.5 both differ but the profile-`weight` path in `buildTasteProfile` isn't read) — confirm the failing assertion, then fix.

- [ ] **Step 3: Edit `buildTasteProfile` and `scoreCandidate` in `dorama.js`**

Replace `buildTasteProfile` with (reads `.card`/`.weight`, defaults keep old plain-card tests working):

```js
  // Weighted genre/language profile. Seeds may be plain cards (weight 1) or
  // {card, weight} objects.
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, i, j, gids, g, ln, w, card;
    for (i = 0; i < seeds.length; i++) {
      card = seeds[i].card || seeds[i]; w = seeds[i].weight || seeds[i].__weight || 1;
      if (!card) continue;
      gids = card.genre_ids || [];
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + w; total += w; }
      ln = card.original_language; if (ln) langCount[ln] = (langCount[ln] || 0) + w;
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang };
  }
```

In `scoreCandidate`, change the `co` line and the param name (the candidate's weighted co-occurrence saturates at 6 ≈ three 🔥 seeds):

```js
  // Weighted content+collaborative score. `coScore` = sum of seed weights that surfaced this candidate.
  function scoreCandidate(c, profile, coScore) {
    var co = Math.min(coScore || 0, 6) / 6;
    var gids = c.genre_ids || [], over = 0, i;
    for (i = 0; i < gids.length; i++) { over += profile.genreWeight[gids[i]] || 0; }
    if (over > 1) over = 1;
    var lang = c.original_language;
    var langMatch = lang === profile.topLang ? 1 : (profile.langs[lang] ? 0.6 : (ASIAN_LANGS[lang] ? 0.3 : 0));
    var rating = Math.max(0, Math.min(10, c.vote_average || 0)) / 10;
    var votesConf = (c.vote_count || 0) >= 100 ? 1 : (c.vote_count || 0) / 100;
    return 3.0 * co + 2.5 * over + 1.5 * langMatch + 1.5 * rating + 0.5 * votesConf;
  }
```

- [ ] **Step 4: Run to verify pass (whole suite — the old scoreCandidate test still holds)**

Run: `node --test`
Expected: PASS — including the prior `scoreCandidate`/`buildTasteProfile` tests (they pass plain cards → weight 1; the `co` change keeps strong > weak).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/recommend.test.js
git commit -m "feat: weight taste profile + co-occurrence by seed weight"
```

---

## Task 5: Dislike set + reorder

**Files:** Modify: `dorama.js`; Create: `test/dislike.test.js`

- [ ] **Step 1: Write `test/dislike.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/dislike.test.js`
Expected: FAIL — `_buildDislikeSet`/`_reorderByDislike` undefined.

- [ ] **Step 3: Add to `dorama.js`** (after `collectSignals`)

```js
  var dislikeCache = { sig: '', set: null };

  function negativeSignature(negatives) {
    var s = '', i;
    for (i = 0; i < negatives.length; i++) s += negatives[i].id + (negatives[i].strong ? 's' : 'm') + ',';
    return s;
  }

  // Build {strong:{id:true}, mild:{id:true}} from negatives' ids + their TMDB look-alikes.
  function buildDislikeSet(network, negatives, done) {
    var sig = negativeSignature(negatives);
    if (dislikeCache.set && dislikeCache.sig === sig) { done(dislikeCache.set); return; }
    var set = { strong: {}, mild: {} }, i;
    for (i = 0; i < negatives.length; i++) (negatives[i].strong ? set.strong : set.mild)[negatives[i].id] = true;
    if (!negatives.length) { dislikeCache = { sig: sig, set: set }; done(set); return; }
    var k = 0;
    function step() {
      if (k >= negatives.length) { dislikeCache = { sig: sig, set: set }; done(set); return; }
      var n = negatives[k], bucket = n.strong ? set.strong : set.mild;
      fetchResults(network, n.media + '/' + n.id + '/recommendations', n.media, function (results) {
        var j; for (j = 0; j < results.length && j < 20; j++) { if (results[j] && results[j].id != null) bucket[results[j].id] = true; }
        k++; step();
      });
    }
    step();
  }

  function dislikeRank(set, id) {
    if (!set || id == null) return 0;
    if (set.strong[id]) return 2;
    if (set.mild[id]) return 1;
    return 0;
  }

  // Stable de-prioritization: normals keep order, 😴 below them, 💩 last. Nothing removed.
  function reorderByDislike(results, set) {
    if (!set) return results;
    var ranked = [], i;
    for (i = 0; i < results.length; i++) ranked.push({ r: results[i], rank: dislikeRank(set, results[i] && results[i].id), i: i });
    ranked.sort(function (a, b) { return (a.rank - b.rank) || (a.i - b.i); });
    var out = []; for (i = 0; i < ranked.length; i++) out.push(ranked[i].r);
    return out;
  }
```

Add exports `_buildDislikeSet: buildDislikeSet,` and `_reorderByDislike: reorderByDislike,`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/dislike.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/dislike.test.js
git commit -m "feat: dislike set from reaction look-alikes + stable reorder"
```

---

## Task 6: Badge listener; remove PredictionCard

**Files:** Modify: `dorama.js`; Replace: `test/card.test.js`

- [ ] **Step 1: Replace `test/card.test.js` entirely**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// Fake Lampa Card instance whose render() returns a jQuery-like element with .find('.card__view').
function fakeCard(match, prompt) {
  var appended = [];
  var view = {
    length: 1,
    append: function (html) { appended.push(html); return view; },
    find: function (sel) { return { length: sel === '.dorama-match' ? appended.length : 0 }; }
  };
  var el = { find: function (sel) { return sel === '.card__view' ? view : { length: 0 }; } };
  return { data: prompt ? { __prompt: true } : { __match: match }, _appended: appended, render: function () { return el; } };
}

test('registerMatchBadge injects «%» into personal-row cards, once (idempotent)', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  api._registerMatchBadge();
  const card = fakeCard(87);
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: true }, items: [card] });
  assert.strictEqual(card._appended.length, 1);
  assert.ok(card._appended[0].indexOf('87%') >= 0);
  mock.Lampa.Listener.send('line', { type: 'visible', data: { personal: true }, items: [card] });
  assert.strictEqual(card._appended.length, 1, 'idempotent on repeat events');
});

test('registerMatchBadge ignores non-personal rows and prompt/no-match items', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  api._registerMatchBadge();
  const c1 = fakeCard(50), c2 = fakeCard(0, true);
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: false }, items: [c1] });
  mock.Lampa.Listener.send('line', { type: 'append', data: { personal: true }, items: [c2] }); // prompt → no __match
  assert.strictEqual(c1._appended.length, 0);
  assert.strictEqual(c2._appended.length, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/card.test.js`
Expected: FAIL — `_registerMatchBadge` undefined (and the old PredictionCard tests are gone).

- [ ] **Step 3: Edit `dorama.js`**

(a) **Delete** the `escHtml` function and the entire `PredictionCard` function and the `makePredictionCard` function.

(b) Simplify `recommendationsRow` (remove the `createInstance` stamping; add a `__cold` flag):

```js
  function recommendationsRow(results, errored, cold) {
    return { title: RECS_TITLE, personal: true, results: results, source: 'tmdb', __errored: !!errored, __cold: !!cold };
  }
```

(c) Make `setRecsDirty` also clear the dislike cache:

```js
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; dislikeCache.sig = ''; dislikeCache.set = null; }
```

(d) Add `positiveSignature` + `registerMatchBadge` (place near `recommendationsRow`):

```js
  function positiveSignature(positives) {
    var s = '', i;
    for (i = 0; i < positives.length; i++) s += positives[i].id + ':' + positives[i].weight + ',';
    return s;
  }

  // Inject a «xx%» badge into each card of a personal row, via the 'line' event.
  function registerMatchBadge() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('line', function (e) {
      if (!e || (e.type !== 'append' && e.type !== 'visible')) return;
      if (!e.data || !e.data.personal || !e.items) return;
      var i, item, el, view, pct;
      for (i = 0; i < e.items.length; i++) {
        item = e.items[i];
        el = (item && item.render) ? item.render() : null;
        if (!el || !el.find) continue;
        view = el.find('.card__view');
        if (!view.length || view.find('.dorama-match').length) continue;
        pct = item.data && item.data.__match;
        if (!pct) continue;
        view.append('<div class="dorama-match" style="position:absolute;left:0.3em;top:0.3em;z-index:2;background:rgba(0,0,0,0.7);color:#7ed957;font-weight:700;padding:0.2em 0.5em;border-radius:1em;pointer-events:none">' + pct + '%</div>');
      }
    });
  }
```

(e) In `module.exports`: **remove** `_PredictionCard: PredictionCard,`; **add** `_registerMatchBadge: registerMatchBadge,`.

> Note: `loadRecommendations` still references `recommendationsRow` (fine) but Task 6 leaves `loadRecommendations`/`loadCatalog`/`start` otherwise unchanged — they're rewritten in Tasks 7–8. The file must still load: `recommendationsRow` no longer stamps `createInstance`, and `makePredictionCard`/`PredictionCard` are gone (nothing else references them after this edit).

- [ ] **Step 4: Run to verify pass (card tests green; others may now fail — that's Tasks 7–8)**

Run: `node --test test/card.test.js`
Expected: PASS (2 tests). (The full suite is reconciled in Task 8; `recommend.test.js` still references the old 2-arg `loadRecommendations`/createInstance until then.)

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/card.test.js
git commit -m "feat: line-event «%» badge; remove PredictionCard custom card"
```

---

## Task 7: Rewrite `loadRecommendations` (graded + dislike-aware + standard cards)

**Files:** Modify: `dorama.js`; Modify: `test/recommend.test.js`

- [ ] **Step 1: Replace the `loadRecommendations` function in `dorama.js`**

```js
  // Build the personalized row. done(row); row.results is [picks] or [] (cold/empty).
  // dislikeSet (or null) excludes disliked look-alikes.
  function loadRecommendations(network, dislikeSet, done) {
    var signals = collectSignals();
    var positives = signals.positives;
    var sig = positiveSignature(positives);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }
    if (!positives.length) { emit(recommendationsRow([], false, true)); return; }

    var profile = buildTasteProfile(positives);
    var exclude = collectExcludeIds(), key, ei;
    for (key in signals.ratedIds) if (signals.ratedIds.hasOwnProperty(key)) exclude.push(parseInt(key, 10));
    for (ei = 0; ei < positives.length; ei++) exclude.push(positives[ei].id);
    var coScore = {}, lists = [], errors = 0;

    function gather(path, weight, type, cb) {
      fetchResults(network, path, type, function (results, totalPages, err) {
        if (err) errors++;
        var seen = {}, i, r;
        for (i = 0; i < results.length; i++) { r = results[i]; if (!r || r.id == null) continue; if (!seen[r.id]) { seen[r.id] = true; coScore[r.id] = (coScore[r.id] || 0) + weight; } }
        lists.push(results); cb();
      });
    }
    function pass(endpoint, doneCb) {
      var k = 0;
      function step() {
        if (k >= positives.length) { doneCb(); return; }
        var s = positives[k];
        gather(s.media + '/' + s.id + '/' + endpoint, s.weight, s.media, function () { k++; step(); });
      }
      step();
    }
    pass('recommendations', function () {
      var distinct = mergeRecommendations(lists, exclude, 100000).length;
      if (distinct >= MIN_POOL) { finish(); return; }
      pass('similar', finish);
    });
    function finish() {
      var pool = mergeRecommendations(lists, exclude, 1000);
      var scored = [], i, c, sc;
      for (i = 0; i < pool.length; i++) {
        c = pool[i];
        if (!c.poster_path) continue;
        if (dislikeRank(dislikeSet, c.id) > 0) continue;
        sc = scoreCandidate(c, profile, coScore[c.id]);
        c.__score = sc; c.__match = predictionPercent(sc);
        scored.push(c);
      }
      scored.sort(function (a, b) { return b.__score - a.__score; });
      var top = scored.slice(0, 20);
      if (!top.length) { emit(recommendationsRow([], errors > 0, false)); return; }
      emit(recommendationsRow(top, false, false));
    }
    function emit(row) { recsCache = { sig: sig, row: row }; done(row); }
  }
```

- [ ] **Step 2: Update `test/recommend.test.js` for the new signature + behavior**

The recommender tests call `_loadRecommendations` and previously asserted `createInstance` and a prompt-card. Apply these edits:
- Every `api._loadRecommendations(net, function (r){...})` → `api._loadRecommendations(net, null, function (r){...})` (insert the `null` dislikeSet middle arg). There are 5 such calls (the "builds personal row", "prompt", "error row", "cache", "/similar fallback" tests).
- In the **"builds personalized row sorted by match, excluding liked"** test: DELETE the line `assert.strictEqual(typeof row.results[0].params.createInstance, 'function');` (standard cards now — no stamping). Keep the rest.
- Replace the **"shows a prompt card when there are no Asian likes"** test body's assertions with the cold-start-empty behavior:
  ```js
  assert.strictEqual(row.results.length, 0);
  assert.strictEqual(row.__cold, true);
  ```
  (remove the `row.results[0].__prompt` / createInstance assertions).
- Add a dislike-exclusion test:
  ```js
  test('loadRecommendations excludes disliked look-alikes', () => {
    const mock = makeMock({
      favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
      responder: function (url) {
        if (url.indexOf('/recommendations') >= 0 || url.indexOf('/similar') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }, { id: 202, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/b.jpg' }] };
        return { results: [] };
      }
    });
    const api = loadPlugin(mock);
    let row;
    api._loadRecommendations(new mock.Lampa.Reguest(), { strong: { 202: true }, mild: {} }, function (r) { row = r; });
    const ids = row.results.map(c => c.id);
    assert.ok(ids.indexOf(201) >= 0 && ids.indexOf(202) < 0, '202 excluded as disliked look-alike');
  });
  ```

- [ ] **Step 3: Run to verify**

Run: `node --test test/recommend.test.js`
Expected: PASS — all recommend tests (now 3-arg, no createInstance, cold=empty, dislike-exclusion).

- [ ] **Step 4: Commit**

```bash
git add dorama.js test/recommend.test.js
git commit -m "feat: graded + dislike-aware loadRecommendations (standard cards)"
```

---

## Task 8: Rewrite `loadCatalog` + `start`; reconcile integration tests

**Files:** Modify: `dorama.js`, `test/component.test.js`, `test/auth.test.js`

- [ ] **Step 1: Replace `loadCatalog` in `dorama.js`**

```js
  // Assemble the catalog: build the dislike set first, fetch curated rows
  // (de-prioritizing disliked look-alikes), then the personalized row first.
  function loadCatalog(network, onDone, onFail) {
    var rows = buildRows();
    var curated = [];
    var i = 0, errors = 0, lastStatus = 0;
    var signals = collectSignals();
    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    buildDislikeSet(network, signals.negatives, function (dislikeSet) {
      function nextRow() {
        if (i >= rows.length) { loadHead(dislikeSet); return; }
        var row = rows[i];
        fetchResults(network, row.url, row.method, function (results, totalPages, err) {
          note(err);
          if (results.length) curated.push({ title: row.title, results: reorderByDislike(results, dislikeSet), url: row.url, method: row.method, source: 'tmdb', total_pages: totalPages });
          i++; nextRow();
        });
      }
      nextRow();
    });

    function loadHead(dislikeSet) {
      loadRecommendations(network, dislikeSet, function (recRow) {
        if (recRow && recRow.__cold && !window.dorama_cold_noted) {
          window.dorama_cold_noted = true;
          if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Лайкните или оцените дорамы, чтобы получить персональные рекомендации');
        }
        var head = (recRow && recRow.results && recRow.results.length) ? [recRow] : [];
        var allRows = head.concat(curated);
        if (allRows.length) onDone(allRows);
        else onFail({ errored: errors > 0 || (recRow && recRow.__errored), status: lastStatus });
      });
    }
  }
```

- [ ] **Step 2: Update `start()` in `dorama.js`** — register the badge listener + the reactions-change listener:

```js
  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
    registerMatchBadge();
    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('state:changed', function (e) { if (e && e.target === 'favorite') setRecsDirty(); });
    }
    if (Lampa.Storage && Lampa.Storage.listener && Lampa.Storage.listener.follow) {
      Lampa.Storage.listener.follow('change', function (e) { if (e && e.name === 'mine_reactions') setRecsDirty(); });
    }
  }
```

- [ ] **Step 3: Reconcile `test/component.test.js`**

The first test fetches `/recommendations` and asserts the personal row first — still valid; the recs row now uses standard cards (no `createInstance` assertion existed there). Two updates:
- The **"shows the prompt row + curated when there are no likes"** test: with no signals the recs row is now **empty/omitted** (cold start → Noty, no row), so the first row is the first curated row. Replace that test with:
  ```js
  test('component.create with no signals shows curated rows (recs omitted, Noty hinted)', () => {
    const mock = makeMock();
    const api = loadPlugin(mock);
    const comp = api._component({});
    comp.create();
    assert.ok(Array.isArray(comp._built));
    assert.strictEqual(comp._built[0].title, 'Корейские триллеры (сериалы)'); // no recs row
    assert.ok(mock.calls.noty.length >= 1, 'cold-start hint shown');
    assert.ok(mock.calls.toggles >= 1);
  });
  ```
- The **"recommendation items are tagged with media_type"** test already filters to `!r.personal`; leave it.

- [ ] **Step 4: Reconcile `test/auth.test.js`**

The **"partial failure still shows content"** test currently has no favorites, so the recs row is cold (omitted) and `comp._built[0]` is now the first **curated** row, not the recs row. Update its final assertion:
```js
  assert.ok(Array.isArray(comp._built), 'content built despite discover failures');
  assert.strictEqual(comp._built[0].title, 'Корейские триллеры (сериалы)');
```
The 401 and genuinely-empty tests already add a like; with a like the recs path runs and fails/empties alongside curated → `showState`. They still hold (the dislike set is empty, no negatives). Re-run to confirm.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: ALL pass (reactions, dislike, recommend, card, rows, recos, menu, component, auth).

- [ ] **Step 6: Commit**

```bash
git add dorama.js test/component.test.js test/auth.test.js
git commit -m "feat: dislike-aware catalog (recs-first, reorder curated, reaction refresh)"
```

---

## Task 9: ES5 + gate

**Files:** none unless a check fails.

- [ ] **Step 1:** `node --check dorama.js` → exit 0.
- [ ] **Step 2:** `grep -nE '\b(let|const)\b|=>' dorama.js` → no matches (reword any tripping comment).
- [ ] **Step 3:** `grep -nE 'PredictionCard|createInstance|escHtml' dorama.js` → no matches (custom card fully removed).
- [ ] **Step 4:** `node --test` → all pass.
- [ ] **Step 5 (if edits needed):**
```bash
git add dorama.js
git commit -m "chore: ES5/cleanup sweep for reactions feature"
```

---

## Task 10: Deploy (confirm-gated)

> Public repo `drshpackz/dorama`. The remote may have moved (the user pushes TestSec commits). Rebase, don't force-push; never stage `.gitignore`/`sec-tests`/`sec-out`.

- [ ] **Step 1:** `git -C "/root/projects/lampatv plugins" pull --rebase --autostash origin master` then `node --test` (confirm green after rebase).
- [ ] **Step 2:** `git push origin master`.
- [ ] **Step 3:** Poll Pages until the live `dorama.js` contains `mine_reactions`, then `sha256sum` live vs committed (expect identical).
- [ ] **Step 4: Hand off device test:** reinstall the plugin (Lampa caches); react 🔥/💩 on a few titles; reopen → recs ranked with the **% badge**, 💩 look-alikes pushed to the end of all rows and gone from recs.

---

## Self-review notes

- **Spec coverage:** §2 verified API → Tasks 1/2/6/8; §3 weights → Task 2 (`gradeOf`); §4 positive engine → Tasks 3/4/7; §5 global dislike → Tasks 5/8; §6 badge → Task 6 (`registerMatchBadge`, standard cards); §7 cold start → Tasks 7/8 (empty row + Noty — the spec's documented contingency, chosen for robustness over a fragile fake card); §8 caches/refresh → Tasks 6/8 (`setRecsDirty` clears both; `mine_reactions` listener); §9 perf → bounded loops; §11 tests → Tasks 2–8.
- **Type consistency:** `gradeOf`, `collectReactions`, `collectSignals`, `buildTasteProfile`(weighted), `scoreCandidate`(`coScore`), `buildDislikeSet`, `dislikeRank`, `reorderByDislike`, `dislikeCache`, `positiveSignature`, `registerMatchBadge`, `recommendationsRow`(`__cold`), `loadRecommendations`(network, dislikeSet, done), `loadCatalog`(dislike-first) are named/used identically across tasks and exports.
- **Cold-start decision (noted):** the spec's §7 primary was a prompt *card*; standard cards make a text-only card fragile, so this plan uses the spec's documented contingency — omit the recs row + a one-time `Lampa.Noty`. Functionally equivalent intent (a visible hint), more robust.
- **No placeholders:** every step has complete code/commands.
