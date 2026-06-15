# «Рекомендации для Вас» Recommender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personalized «Рекомендации для Вас» row (each item showing a «Совпадение xx%» badge) driven by the user's native Lampa likes, replacing the «В духе Паразитов» anchor row.

**Architecture:** Pure, unit-tested scoring functions (`collectSeeds`, `buildTasteProfile`, `scoreCandidate`, `predictionPercent`) feed a `loadRecommendations` flow that fetches TMDB `/recommendations` per liked seed, scores+ranks candidates, and emits a row whose results are rendered by a custom `PredictionCard` via the verified `params.createInstance` hook. Likes use Lampa's native `Favorite.toggle('like', …)`; the row refreshes when favorites change.

**Tech Stack:** Plain ES5 (single `dorama.js`), Node `node:test` + the existing `Lampa`/`$` mock (extended with `Lampa.Favorite`).

**Reference spec:** `docs/superpowers/specs/2026-06-15-dorama-recommendations-design.md`. Builds on the shipped `dorama.js` (curated catalog + auth fix).

---

## File structure

- Modify: `dorama.js` — remove `ANCHORS`/`pickAnchors`/`loadRecos`; add recommender helpers, `PredictionCard`, `loadRecommendations`; rewire `loadCatalog` + `start`.
- Modify: `test/helpers/lampa-mock.js` — add `Lampa.Favorite`, `Lampa.Noty`, `Lampa.Api.img`, `Lampa.Listener.send`, a `favorites` option.
- Create: `test/recommend.test.js` — pure scoring fns + `loadRecommendations` flow + cache.
- Create: `test/card.test.js` — `PredictionCard` behavior.
- Modify: `test/recos.test.js` — drop `ANCHORS`/`pickAnchors` tests (keep `mergeRecommendations`).
- Modify: `test/component.test.js`, `test/auth.test.js` — update for the new first row.

---

## Task 1: Extend the mock with Favorite + recommender deps

**Files:**
- Modify: `test/helpers/lampa-mock.js`

- [ ] **Step 1: Add the new globals to the mock**

In `test/helpers/lampa-mock.js`, change the `calls` initializer to add tracking fields:

```js
  var calls = { activityPush: [], componentAdd: {}, listeners: {}, requests: [], clears: 0, empties: [], loaderCalls: [], toggles: 0, favToggles: [], noty: [] };
```

Replace the `Lampa.Listener` entry and the `Storage` line, and add `Favorite`/`Noty`/`Api`. Find:

```js
    Listener: { follow: function (name, fn) { calls.listeners[name] = fn; } },
```

replace with:

```js
    Listener: {
      follow: function (name, fn) { calls.listeners[name] = fn; },
      send: function (name, ev) { if (calls.listeners[name]) calls.listeners[name](ev); }
    },
```

Then, immediately after the `Controller: {...}` entry inside the `Lampa` object, add:

```js
    Noty: { show: function (m) { calls.noty.push(m); } },
    Api: { img: function (path, size) { return 'IMG:' + (path || ''); } },
    Favorite: (function () {
      var store = options.favorites || { like: [], history: [], viewed: [] };
      function idx(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return i; } return -1; }
      return {
        get: function (p) { return (store[p.type] || []).slice(); },
        check: function (card) {
          var r = { any: false }, types = ['like', 'history', 'viewed', 'book', 'wath'], i;
          for (i = 0; i < types.length; i++) { r[types[i]] = idx(store[types[i]] || [], card.id) >= 0; if (r[types[i]]) r.any = true; }
          return r;
        },
        toggle: function (where, card) {
          store[where] = store[where] || [];
          var i = idx(store[where], card.id), added;
          if (i >= 0) { store[where].splice(i, 1); added = false; } else { store[where].unshift(card); added = true; }
          calls.favToggles.push({ where: where, id: card.id });
          if (calls.listeners['state:changed']) calls.listeners['state:changed']({ target: 'favorite', reason: 'update', type: where, card: card });
          return added;
        },
        add: function (where, card) { store[where] = store[where] || []; if (idx(store[where], card.id) < 0) store[where].unshift(card); },
        remove: function (where, card) { store[where] = store[where] || []; var i = idx(store[where], card.id); if (i >= 0) store[where].splice(i, 1); }
      };
    })()
```

- [ ] **Step 2: Verify the mock still parses and existing tests pass**

Run: `node --check "/root/projects/lampatv plugins/test/helpers/lampa-mock.js" && node --test`
Expected: parses OK; **27/27 pass** (no behavior change to existing tests).

- [ ] **Step 3: Commit**

```bash
git add test/helpers/lampa-mock.js
git commit -m "test: extend Lampa mock with Favorite/Noty/Api.img + Listener.send"
```

---

## Task 2: Pure recommender functions

**Files:**
- Modify: `dorama.js`
- Test: `test/recommend.test.js`

- [ ] **Step 1: Write the failing test `test/recommend.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load(fav) { return loadPlugin(makeMock(fav ? { favorites: fav } : undefined)); }

test('collectSeeds keeps Asian-drama likes, most-recent-first, capped', () => {
  const { _collectSeeds } = load();
  const liked = [
    { id: 1, original_language: 'ko' },
    { id: 2, original_language: 'en' },          // dropped (not Asian)
    { id: 3, origin_country: ['JP'] },           // kept via country
    { id: 4, original_language: 'th' }
  ];
  const seeds = _collectSeeds(liked, 8);
  assert.deepStrictEqual(seeds.map(s => s.id), [1, 3, 4]);
  assert.strictEqual(_collectSeeds(liked, 1).length, 1); // cap respected
});

test('buildTasteProfile weights genres and finds the top language', () => {
  const { _buildTasteProfile } = load();
  const p = _buildTasteProfile([
    { genre_ids: [18, 80], original_language: 'ko' },
    { genre_ids: [18], original_language: 'ko' },
    { genre_ids: [9648], original_language: 'ja' }
  ]);
  assert.strictEqual(p.topLang, 'ko');
  assert.ok(p.genreWeight[18] > p.genreWeight[80]); // 18 appears twice, 80 once
  assert.ok(p.langs.ko && p.langs.ja);
});

test('scoreCandidate ranks genre+language+co-occurrence higher; predictionPercent in 55..99', () => {
  const { _scoreCandidate, _predictionPercent, _buildTasteProfile } = load();
  const profile = _buildTasteProfile([{ genre_ids: [18, 80], original_language: 'ko' }]);
  const strong = _scoreCandidate({ genre_ids: [18, 80], original_language: 'ko', vote_average: 8.5, vote_count: 500 }, profile, 3);
  const weak = _scoreCandidate({ genre_ids: [35], original_language: 'en', vote_average: 6, vote_count: 10 }, profile, 1);
  assert.ok(strong > weak);
  const pct = _predictionPercent(strong);
  assert.ok(pct >= 55 && pct <= 99, 'pct=' + pct);
  assert.strictEqual(_predictionPercent(0), 55);
  assert.strictEqual(_predictionPercent(9), 99);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recommend.test.js`
Expected: FAIL — `_collectSeeds`/`_buildTasteProfile`/`_scoreCandidate`/`_predictionPercent` undefined.

- [ ] **Step 3: Add the pure functions to `dorama.js`**

Insert this block immediately **after** the `mergeRecommendations` function (and before the boot/menu code). (Note: `ANCHORS`/`pickAnchors` are removed in Task 5; they coexist harmlessly until then.)

```js
  // --- personalized recommender (pure helpers) ---
  var ASIAN_LANGS = { ko: 1, ja: 1, zh: 1, th: 1 };
  var ASIAN_COUNTRIES = { KR: 1, JP: 1, CN: 1, TW: 1, HK: 1, TH: 1 };
  var SCORE_MAX = 9.0;

  function isAsianDrama(card) {
    if (!card) return false;
    if (card.original_language && ASIAN_LANGS[card.original_language]) return true;
    var oc = card.origin_country || [], i;
    for (i = 0; i < oc.length; i++) { if (ASIAN_COUNTRIES[oc[i]]) return true; }
    return false;
  }

  // Liked cards filtered to Asian dramas, most-recent-first, capped at `limit`.
  function collectSeeds(liked, limit) {
    var out = [], i;
    liked = liked || [];
    for (i = 0; i < liked.length && out.length < limit; i++) {
      if (isAsianDrama(liked[i])) out.push(liked[i]);
    }
    return out;
  }

  // TV vs movie for a stored favorite card (mirrors core recomend.js).
  function seedType(card) {
    return (card.number_of_seasons || card.first_air_date || card.name) ? 'tv' : 'movie';
  }

  // Normalized genre preference + language distribution across seeds (no API calls).
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, i, j, gids, g, ln;
    for (i = 0; i < seeds.length; i++) {
      gids = seeds[i].genre_ids || [];
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + 1; total++; }
      ln = seeds[i].original_language; if (ln) langCount[ln] = (langCount[ln] || 0) + 1;
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang };
  }

  // Weighted content+collaborative score for one candidate.
  function scoreCandidate(c, profile, coCount) {
    var co = Math.min(coCount || 0, 3) / 3;
    var gids = c.genre_ids || [], over = 0, i;
    for (i = 0; i < gids.length; i++) { over += profile.genreWeight[gids[i]] || 0; }
    if (over > 1) over = 1;
    var lang = c.original_language;
    var langMatch = lang === profile.topLang ? 1 : (profile.langs[lang] ? 0.6 : (ASIAN_LANGS[lang] ? 0.3 : 0));
    var rating = Math.max(0, Math.min(10, c.vote_average || 0)) / 10;
    var votesConf = (c.vote_count || 0) >= 100 ? 1 : (c.vote_count || 0) / 100;
    return 3.0 * co + 2.5 * over + 1.5 * langMatch + 1.5 * rating + 0.5 * votesConf;
  }

  // Map a raw score to a 55..99% "match" band.
  function predictionPercent(score) {
    var r = score / SCORE_MAX;
    if (r < 0) r = 0; if (r > 1) r = 1;
    return Math.round(55 + 44 * r);
  }
```

Then extend the export hook (find the `module.exports = {` block) to add these — insert after `mergeRecommendations: mergeRecommendations,`:

```js
      _collectSeeds: collectSeeds,
      _buildTasteProfile: buildTasteProfile,
      _scoreCandidate: scoreCandidate,
      _predictionPercent: predictionPercent,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/recommend.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/recommend.test.js
git commit -m "feat: pure recommender scoring (seeds, taste profile, score, prediction%)"
```

---

## Task 3: `loadRecommendations` flow + refresh cache

**Files:**
- Modify: `dorama.js` (add `loadRecommendations`, `recommendationsRow`, exclude/cache helpers)
- Test: `test/recommend.test.js` (append)

- [ ] **Step 1: Append the flow tests to `test/recommend.test.js`**

```js
test('loadRecommendations builds a personal row sorted by match, excluding liked', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], vote_average: 8, first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [
        { id: 201, original_language: 'ko', genre_ids: [18, 80], vote_average: 8.5, vote_count: 500, poster_path: '/a.jpg' },
        { id: 100, original_language: 'ko', genre_ids: [18], vote_average: 9, vote_count: 900, poster_path: '/b.jpg' }, // liked → excluded
        { id: 202, original_language: 'en', genre_ids: [35], vote_average: 6, vote_count: 50, poster_path: '/c.jpg' }
      ] };
      return { results: [] };
    }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), function (r) { row = r; });
  assert.strictEqual(row.title, 'Рекомендации для Вас');
  assert.ok(row.personal);
  const ids = row.results.map(c => c.id);
  assert.ok(ids.indexOf(100) < 0, 'liked seed excluded');
  assert.strictEqual(row.results[0].id, 201, 'ko + genre + rating ranks first');
  assert.ok(row.results[0].__match >= 55 && row.results[0].__match <= 99);
  assert.strictEqual(typeof row.results[0].params.createInstance, 'function'); // custom card factory stamped
});

test('loadRecommendations shows a prompt card when there are no Asian likes', () => {
  const mock = makeMock({ favorites: { like: [{ id: 1, original_language: 'en', genre_ids: [35] }] } });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), function (r) { row = r; });
  assert.strictEqual(row.results.length, 1);
  assert.ok(row.results[0].__prompt);
  assert.strictEqual(typeof row.results[0].params.createInstance, 'function');
});

test('loadRecommendations flags an error row when seeds exist but every request fails', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }] },
    responder: function () { return { __error: 401 }; }
  });
  const api = loadPlugin(mock);
  let row;
  api._loadRecommendations(new mock.Lampa.Reguest(), function (r) { row = r; });
  assert.strictEqual(row.results.length, 0);
  assert.strictEqual(row.__errored, true);
});

test('loadRecommendations caches by liked-set signature (no refetch) until favorites change', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) { return url.indexOf('/recommendations') >= 0 ? { results: [{ id: 201, original_language: 'ko', genre_ids: [18], vote_average: 8, vote_count: 200, poster_path: '/a.jpg' }] } : { results: [] }; }
  });
  const api = loadPlugin(mock);
  const net = new mock.Lampa.Reguest();
  api._loadRecommendations(net, function () {});
  const after1 = mock.calls.requests.length;
  api._loadRecommendations(net, function () {});
  assert.strictEqual(mock.calls.requests.length, after1, 'second identical call served from cache');
  mock.Lampa.Favorite.toggle('like', { id: 300, original_language: 'ko', genre_ids: [80], first_air_date: '2021-01-01' }); // changes likes + fires state:changed
  api._loadRecommendations(net, function () {});
  assert.ok(mock.calls.requests.length > after1, 'recompute after favorites changed');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/recommend.test.js`
Expected: FAIL — `_loadRecommendations` undefined.

- [ ] **Step 3: Add the flow to `dorama.js`**

Insert after the pure helpers from Task 2:

```js
  var RECS_TITLE = 'Рекомендации для Вас';
  var recsCache = { sig: '', row: null };
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; }

  function makePredictionCard(elem) { return new PredictionCard(elem); }

  // Stamp the verified per-item factory hook so the Line renders PredictionCard.
  function recommendationsRow(results, errored) {
    var i;
    for (i = 0; i < results.length; i++) {
      results[i].params = results[i].params || {};
      results[i].params.createInstance = makePredictionCard;
    }
    return { title: RECS_TITLE, personal: true, results: results, source: 'tmdb', __errored: !!errored };
  }

  function promptCard() {
    return { __prompt: true, title: 'Лайкните дорамы, чтобы получить персональные рекомендации' };
  }

  function favGet(type) {
    return (Lampa.Favorite && Lampa.Favorite.get) ? (Lampa.Favorite.get({ type: type }) || []) : [];
  }

  function collectExcludeIds() {
    var ids = [], types = ['like', 'history', 'viewed'], t, i, list;
    for (t = 0; t < types.length; t++) {
      list = favGet(types[t]);
      for (i = 0; i < list.length; i++) { if (list[i] && list[i].id != null) ids.push(list[i].id); }
    }
    return ids;
  }

  function likedSignature(liked) {
    var s = '', i;
    for (i = 0; i < liked.length; i++) { s += (liked[i].id || '') + ','; }
    return s;
  }

  // Build the personalized row. done(row) — row.results is [picks], [prompt], or [].
  function loadRecommendations(network, done) {
    var liked = favGet('like');
    var sig = likedSignature(liked);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }

    var seeds = collectSeeds(liked, 8);
    if (!seeds.length) { emit(recommendationsRow([promptCard()], false)); return; }

    var profile = buildTasteProfile(seeds);
    var excludeIds = collectExcludeIds();
    var coCount = {}, lists = [], s = 0, errors = 0;

    function nextSeed() {
      if (s >= seeds.length) { finish(); return; }
      var seed = seeds[s], type = seedType(seed);
      fetchResults(network, type + '/' + seed.id + '/recommendations', type, function (results, totalPages, err) {
        if (err) errors++;
        var seen = {}, i, r;
        for (i = 0; i < results.length; i++) {
          r = results[i]; if (!r || r.id == null) continue;
          if (!seen[r.id]) { seen[r.id] = true; coCount[r.id] = (coCount[r.id] || 0) + 1; }
        }
        lists.push(results); s++; nextSeed();
      });
    }

    function finish() {
      var exclude = excludeIds.slice(), i;
      for (i = 0; i < seeds.length; i++) exclude.push(seeds[i].id);
      var pool = mergeRecommendations(lists, exclude, 1000);
      var scored = [], c, sc;
      for (i = 0; i < pool.length; i++) {
        c = pool[i]; if (!c.poster_path) continue;
        sc = scoreCandidate(c, profile, coCount[c.id]);
        c.__score = sc; c.__match = predictionPercent(sc);
        scored.push(c);
      }
      scored.sort(function (a, b) { return b.__score - a.__score; });
      var top = scored.slice(0, 20);
      if (!top.length) { emit(recommendationsRow([], errors > 0)); return; }
      emit(recommendationsRow(top, false));
    }

    function emit(row) { recsCache = { sig: sig, row: row }; done(row); }

    nextSeed();
  }
```

Then extend the export hook — add these lines next to the recommender exports
from Task 2 (after `_predictionPercent: predictionPercent,`):

```js
      _loadRecommendations: loadRecommendations,
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/recommend.test.js`
Expected: PASS (all recommend tests). (`PredictionCard` is defined in Task 4; it's only *referenced* inside `makePredictionCard`, which isn't called during these tests except via the factory stamp — the stamp stores the function reference without invoking it, so these tests pass. If your runner hoist-checks, Task 4 lands the definition.)

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/recommend.test.js
git commit -m "feat: loadRecommendations flow (candidates, scoring, exclude, cache)"
```

---

## Task 4: `PredictionCard` custom card

**Files:**
- Modify: `dorama.js` (add `PredictionCard`, export `_PredictionCard`)
- Test: `test/card.test.js`

- [ ] **Step 1: Write the failing test `test/card.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('PredictionCard renders the match badge and opens detail on enter', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ id: 5, media_type: 'tv', vote_average: 8.1, __match: 87, name: 'X', poster_path: '/p.jpg', source: 'tmdb' });
  card.create();
  assert.ok(card.render(true)._html.indexOf('Совпадение 87%') >= 0);
  card.render(true).trigger('hover:enter');
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.strictEqual(push.component, 'full');
  assert.strictEqual(push.id, 5);
  assert.strictEqual(push.method, 'tv');
});

test('PredictionCard hover:long toggles the native like', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ id: 9, media_type: 'movie', __match: 70, title: 'Y', poster_path: '/p.jpg' });
  card.create();
  card.render(true).trigger('hover:long');
  assert.deepStrictEqual(mock.calls.favToggles[mock.calls.favToggles.length - 1], { where: 'like', id: 9 });
  assert.ok(mock.calls.noty.length >= 1);
});

test('PredictionCard prompt mode shows text and does not open detail', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const card = new api._PredictionCard({ __prompt: true, title: 'Лайкните дорамы, чтобы получить персональные рекомендации' });
  card.create();
  assert.ok(card.render(true)._html.indexOf('Лайкните дорамы') >= 0);
  const before = mock.calls.activityPush.length;
  card.render(true).trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush.length, before);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/card.test.js`
Expected: FAIL — `_PredictionCard` undefined.

- [ ] **Step 3: Add `PredictionCard` to `dorama.js`**

Insert immediately **before** `function componentDorama(object) {`:

```js
  // Custom card for the «Рекомендации для Вас» row: a «Совпадение xx%» badge plus
  // self-wired detail (hover:enter) and native like (hover:long). The framework
  // instantiates it via item.params.createInstance (see recommendationsRow).
  function PredictionCard(data) {
    var card = data;

    this.create = function () {
      var html, self = this;
      if (card.__prompt) {
        html = '<div class="card selector card--dorama-prompt"><div class="card__view">' +
               '<div class="card__promo-text" style="padding:1.2em;text-align:center">' + (card.title || '') + '</div>' +
               '</div></div>';
      } else {
        var title = card.title || card.name || card.original_title || card.original_name || '';
        var rating = card.vote_average ? (Math.round(card.vote_average * 10) / 10) : '';
        var liked = (Lampa.Favorite && Lampa.Favorite.check && Lampa.Favorite.check(card).like) ? ' card--liked' : '';
        html = '<div class="card selector card--dorama-match' + liked + '"><div class="card__view">' +
               '<img class="card__img" src="" alt="" />' +
               '<div class="card__match" style="position:absolute;left:0.5em;top:0.5em;background:rgba(0,0,0,0.75);color:#7ed957;padding:0.2em 0.5em;border-radius:0.4em;font-weight:600">Совпадение ' + (card.__match || 0) + '%</div>' +
               (rating !== '' ? '<div class="card__vote">' + rating + '</div>' : '') +
               '</div><div class="card__title">' + title + '</div></div>';
      }
      this.card = $(html);
      this.card.on('hover:enter', function () { self.onEnterCard(); });
      this.card.on('hover:long', function () { self.onLong(); });
      if (!card.__prompt) this.image();
    };

    this.image = function () {
      if (card.poster_path && Lampa.Api && Lampa.Api.img && this.card && this.card.find) {
        var img = this.card.find('.card__img');
        if (img && img.attr) img.attr('src', Lampa.Api.img(card.poster_path, 'w300'));
      }
    };

    this.onEnterCard = function () {
      if (card.__prompt) { if (Lampa.Noty) Lampa.Noty.show('Лайкните дораму (удержание OK), чтобы получить рекомендации'); return; }
      Lampa.Activity.push({ component: 'full', id: card.id, method: card.media_type || 'movie', card: card, source: card.source || 'tmdb' });
    };

    this.onLong = function () {
      if (card.__prompt) return;
      var added = Lampa.Favorite.toggle('like', card);
      if (Lampa.Noty) Lampa.Noty.show(added ? 'Добавлено в «Нравится»' : 'Убрано из «Нравится»');
      if (this.card && this.card.toggleClass) this.card.toggleClass('card--liked', !!added);
    };

    this.visible = function () { this.image(); };
    this.use = function () { /* benign: PredictionCard self-wires its events */ };
    this.render = function (js) { return this.card; };
    this.destroy = function () { if (this.card && this.card.remove) this.card.remove(); this.card = null; };
  }
```

Add `_PredictionCard: PredictionCard,` to the export hook (next to `_component`).

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/card.test.js test/recommend.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/card.test.js
git commit -m "feat: PredictionCard with «Совпадение %» badge + native like wiring"
```

---

## Task 5: Wire into `loadCatalog`; remove the anchor row

**Files:**
- Modify: `dorama.js` (rewrite `loadCatalog`'s recs section; remove `ANCHORS`/`pickAnchors`/`loadRecos`; add `state:changed` listener in `start`)
- Modify: `test/recos.test.js`, `test/component.test.js`, `test/auth.test.js`

- [ ] **Step 1: Update the catalog assembly in `dorama.js`**

Replace the entire `loadCatalog` function (the one with `loadRecos`/anchor logic) with:

```js
  // Assemble the catalog: personalized recommendations row first, then curated.
  function loadCatalog(network, onDone, onFail) {
    var rows = buildRows();
    var curated = [];
    var i = 0, errors = 0, lastStatus = 0;

    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    function nextRow() {
      if (i >= rows.length) { loadHead(); return; }
      var row = rows[i];
      fetchResults(network, row.url, row.method, function (results, totalPages, err) {
        note(err);
        if (results.length) curated.push({ title: row.title, results: results, url: row.url, method: row.method, source: 'tmdb', total_pages: totalPages });
        i++; nextRow();
      });
    }

    function loadHead() {
      loadRecommendations(network, function (recRow) {
        var head = (recRow && recRow.results && recRow.results.length) ? [recRow] : [];
        var allRows = head.concat(curated);
        if (allRows.length) onDone(allRows);
        else onFail({ errored: errors > 0 || (recRow && recRow.__errored), status: lastStatus });
      });
    }

    nextRow();
  }
```

Now **delete** the obsolete anchor code from `dorama.js`:
- the `var ANCHORS = [ ... ];` array,
- the `function pickAnchors(...) { ... }` function.

And in the export hook, **remove** the lines `ANCHORS: ANCHORS,` and `pickAnchors: pickAnchors,`. (Keep `mergeRecommendations`.)

- [ ] **Step 2: Register the favorites-change listener in `start`**

In `dorama.js`, change `start()` to invalidate the recommendation cache when likes change. Replace:

```js
  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
  }
```

with:

```js
  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('state:changed', function (e) { if (e && e.target === 'favorite') setRecsDirty(); });
    }
  }
```

- [ ] **Step 3: Update `test/recos.test.js` — drop anchor tests**

Open `test/recos.test.js` and **delete** the two tests whose names are
`'ANCHORS holds the 20 verified anchors (10 movie + 10 tv)'` and
`'pickAnchors rotates and never exceeds the pool'`. Keep the four
`mergeRecommendations` tests unchanged.

- [ ] **Step 4: Update `test/component.test.js` — new first row**

Replace the first test (`'component.create assembles recos-first catalog from TMDB requests'`) with one that sets up a like so the personal row is real:

```js
test('component.create puts «Рекомендации для Вас» first, then curated rows', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], vote_average: 8, first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18, 80], vote_average: 8.4, vote_count: 300, poster_path: '/a.jpg' }] };
      return { results: [{ id: 1000, name: 'row-item', poster_path: '/x.jpg' }], total_pages: 12 };
    }
  });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const built = comp._built;
  assert.ok(Array.isArray(built));
  assert.strictEqual(built[0].title, 'Рекомендации для Вас');
  assert.ok(built[0].personal);
  assert.strictEqual(built[1].title, 'Корейские триллеры (сериалы)');
  const reqs = mock.calls.requests.join('\n');
  assert.match(reqs, /\/recommendations/);                 // personalized seeds fetched
  assert.match(reqs, /discover\/tv\?with_original_language=ko&with_genres=80\|9648/);
});
```

Also update the `'component.create shows an empty state …'` test's expectation: with no favorites the personal row is a prompt (so `_built` is defined, not undefined). Replace that test with:

```js
test('component.create shows the prompt row + curated when there are no likes', () => {
  const mock = makeMock(); // no favorites
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.ok(Array.isArray(comp._built));
  assert.strictEqual(comp._built[0].title, 'Рекомендации для Вас');
  assert.ok(comp._built[0].results[0].__prompt);
  assert.ok(mock.calls.toggles >= 1);
});
```

- [ ] **Step 5: Update `test/auth.test.js` — partial-failure row title**

In `test/auth.test.js`, the `'partial failure still shows content when some rows load'` test asserts `comp._built[0].title === 'В духе «Паразитов»'`. With no favorites set in that test, the first row is now the prompt. Change its final two assertions to:

```js
  assert.ok(Array.isArray(comp._built), 'content built despite discover failures');
  assert.strictEqual(comp._built[0].title, 'Рекомендации для Вас');
```

(The `'all requests failing (401) …'` and `'genuinely empty …'` tests still hold: with no likes the personal row is the prompt — but those tests use a responder that errors/empties *every* request including the curated ones, and assert the error/empty screen. Re-run them; if the prompt row now keeps the page non-empty, update them as in Step 6.)

- [ ] **Step 6: Run the full suite; reconcile the two error-state tests**

Run: `node --test`

The `all-401` and `genuinely-empty` tests in `auth.test.js` were written when an empty personal feed meant `onFail`. Now, with **no likes**, the personal row is a *prompt* (non-empty), so the page is no longer "all empty" → `showState` isn't reached. Make those two tests exercise the real all-failure path by giving them a like (so the personal row tries to load and fails too). In `test/auth.test.js` change both tests' `makeMock({ responder … })` to also pass a like:

```js
  const mock = makeMock({ favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }] }, responder: function () { return { __error: 401 }; } });
```

for the 401 test, and

```js
  const mock = makeMock({ favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18], first_air_date: '2020-01-01' }] }, responder: function () { return { results: [] }; } });
```

for the empty test. Now every request (curated + recommendations) fails/empties, the personal row has zero results, and `showState` runs as those tests assert.

Re-run: `node --test`
Expected: **all green** (rows, recos, menu, component, auth, recommend, card).

- [ ] **Step 7: Commit**

```bash
git add dorama.js test/recos.test.js test/component.test.js test/auth.test.js
git commit -m "feat: «Рекомендации для Вас» replaces anchor row; refresh on like change"
```

---

## Task 6: ES5 + syntax + full-suite gate

**Files:** none unless a check fails.

- [ ] **Step 1: Syntax**

Run: `node --check dorama.js`
Expected: exit 0, no output.

- [ ] **Step 2: ES5 sweep**

Run: `grep -nE '\b(let|const)\b|=>' dorama.js`
Expected: no matches. (If a comment trips it, reword the comment.)

- [ ] **Step 3: Full suite**

Run: `node --test`
Expected: all tests pass, 0 fail.

- [ ] **Step 4: Confirm the anchor symbols are gone**

Run: `grep -nE '\bANCHORS\b|pickAnchors|В духе' dorama.js`
Expected: no matches (anchor row fully removed).

- [ ] **Step 5: Commit (if any edits were needed)**

```bash
git add dorama.js
git commit -m "chore: ES5/cleanup sweep for recommender"
```

---

## Task 7: Deploy to the live repo (confirm-gated)

> Outward-facing; the repo is `drshpackz/dorama` (public, Pages from `master`). Confirm before pushing.

- [ ] **Step 1: Commit any remaining work and push**

```bash
cd "/root/projects/lampatv plugins"
git push origin master
```

- [ ] **Step 2: Verify Pages serves the new version**

Poll until the live file contains the new marker:

```bash
for i in $(seq 1 30); do b=$(curl -s https://drshpackz.github.io/dorama/dorama.js); echo "$b" | grep -q 'Рекомендации для Вас' && { echo "live"; break; }; sleep 12; done
curl -s https://drshpackz.github.io/dorama/dorama.js | sha256sum
sha256sum dorama.js
```
Expected: the two SHA256 hashes match (live === committed).

- [ ] **Step 3: Hand off the on-device test**

Tell the user to remove/re-add the plugin in **Настройки → Расширения** (Lampa caches plugins), then: confirm «Рекомендации для Вас» is the first row with a prompt card; long-press a few Korean titles → «Нравится»; reopen Дорама → the row populates with «Совпадение xx%» badges, ranked, excluding already-liked titles.

---

## Self-review notes

- **Spec coverage:** native like → Tasks 1/4 (`Favorite.toggle`); recommendations row first / replaces Паразитов → Task 5; deep scoring (§4.5) → Task 2; candidate flow + excludes + cache (§4.2/4.4/4.7) → Task 3; cold-start prompt (§4.6) → Tasks 3/4; PredictionCard + `params.createInstance` (§5) → Tasks 3/4; error visibility (§6) → Task 5 (`__errored` → `showState`); single-file ES5 (§7) → Task 6; tests (§8) → Tasks 2–5.
- **Type consistency:** `collectSeeds`, `buildTasteProfile`, `scoreCandidate`, `predictionPercent`, `loadRecommendations`, `recommendationsRow`, `promptCard`, `collectExcludeIds`, `likedSignature`, `setRecsDirty`, `makePredictionCard`, `PredictionCard` are named identically across tasks and exports. `recRow.__errored`/`__match`/`__prompt`/`personal` are used consistently. The row object shape `{title, results, url?, method?, source, total_pages?, personal?}` matches `loadCatalog`/`onMore`.
- **No placeholders:** every step has complete, runnable code/commands.
- **Device risk (called out, not hidden):** `params.createInstance` is the source-verified hook; the on-device test (Task 7 Step 3) is the final gate, with the spec's `line`-listener badge-injection fallback if a build ignores it.
