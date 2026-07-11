# Shorts Panel v2 (poster/actions + taste tiers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static poster/info/actions block to the Shorts player (open card, ❤ like, 🔖 watch-later, 👎 less-like-this) and reorder the feed into taste tiers driven by dorama's recommendation signals plus Shorts-local feedback.

**Architecture:** All changes live in the existing "Shorts (CUB clip feed)" section of `dorama.js` (lines ~773–1159 on master). The language cache upgrades to a `{lang, genres}` meta cache (same TMDB response, zero extra requests). A local taste store (`dorama_shorts_taste`) plus `collectSignals()` feed a pure `orderShortsV2` that replaces `orderShorts`. The player panel is rebuilt with a focusable poster + three buttons.

**Tech Stack:** Vanilla ES5 (Lampa TV plugin), Lampa APIs (`Storage`, `Favorite`, `Controller`, `Activity`, `Api.img`), TMDB, `node:test` with `test/helpers/lampa-mock.js`.

**Spec:** `docs/superpowers/specs/2026-07-11-shorts-panel-v2-design.md`.

## Global Constraints

- **ES5 only in `dorama.js`**: `var`, `function`, string concatenation, `p['catch'](...)` bracket style. No `const`/`let`/arrows/template literals. (`Array.prototype.map/filter/indexOf` are ES5 and allowed.) Tests may use modern JS.
- `Array.sort` stability is NOT guaranteed on old TV engines — any "stable" sort must tie-break on a decorated incoming index.
- Storage keys: `dorama_shorts_meta` (`{cardKey: {lang, genres:[ids]}}`, size-guard 500), `dorama_shorts_taste` (`{up:[cardKey], down:[cardKey]}`, cap 100 per list, no duplicates, up/down mutually exclusive), `dorama_shorts_viewed` unchanged. Old `dorama_shorts_lang` is migrated from, never written again.
- Card key format stays `card_type + '_' + card_id` via `shortsCardKey(shot)`.
- 👎 must never write Lampa reactions (`mine_reactions`) or call CUB write endpoints.
- ❤/🔖 use `Lampa.Favorite.toggle('like'|'book', card)` and `Lampa.Favorite.check(card)`; if `Lampa.Favorite` is missing those two buttons are hidden (👎 still shown).
- ↑/↓ remain prev/next clip; ←/→ move panel focus; OK activates the focused control; poster is the default focus.
- Run tests with `node --test` from the repo root. Baseline on master: **127 tests / 127 pass / 0 fail**. Everything must stay green; report exact counts.
- Another session may work in the main checkout — execution happens in a worktree on a feature branch (controller handles this).

---

### Task 1: Meta cache — `resolveShortsMeta` (lang + genres, with migration)

**Files:**
- Modify: `dorama.js` — replace `resolveShortsLanguages` (lines ~828–875) and adapt `orderShorts`'s lang lookup (line ~889) + the two call sites (`buildShortsFeedData` ~937, `shortsLoadMore` ~953)
- Modify: `dorama.js` exports block (`_resolveShortsLanguages` → `_resolveShortsMeta`)
- Modify: `test/shorts.test.js` — extend `shortsMock` responder; rewrite the 4 resolver tests; add migration test

**Interfaces:**
- Consumes: `shortsCardKey(shot)`, `tmdbUrl(path)`, `network.silent`, `Lampa.Storage`.
- Produces: `resolveShortsMeta(network, shots, done)` → `done(metaMap)` where `metaMap[cardKey] = { lang: 'ko', genres: [18, 53] }`. Cached cards → no TMDB request; failed lookups absent and uncached; Storage key `dorama_shorts_meta` with the same 500 size guard; one-time in-memory migration from `dorama_shorts_lang` (`{key: lang}` → `{key: {lang, genres: []}}`, persisted only when a fetch dirties the cache). `orderShorts` transitionally accepts BOTH map shapes (string or `{lang}` entry) so its existing unit tests stay valid until Task 3 replaces it.

- [ ] **Step 1: Update the mock + write the failing tests**

In `test/shorts.test.js`, replace the TMDB branch of `shortsMock`'s responder (the `const m = /themoviedb.../` block) with:

```js
      const m = /themoviedb\.org\/3\/(tv|movie)\/(\d+)/.exec(url);
      if (m) {
        const lang = (opts.langs || {})[m[1] + '/' + m[2]];
        if (!lang) return { __error: 404 };
        // string value = language only; object value = {lang, genres:[ids]}
        if (typeof lang === 'string') return { id: parseInt(m[2], 10), original_language: lang, genres: [] };
        return {
          id: parseInt(m[2], 10),
          original_language: lang.lang,
          genres: (lang.genres || []).map(id => ({ id, name: 'g' + id }))
        };
      }
```

Replace the four `resolveShortsLanguages` tests with these (same positions in the file):

```js
test('resolveShortsMeta fetches unknown cards once and caches lang+genres', () => {
  const mock = shortsMock({ langs: { 'tv/100': { lang: 'ko', genres: [18, 53] }, 'movie/200': 'ja' } });
  const api = loadPlugin(mock);
  const shots = [shot(1, 100, 'tv'), shot(2, 100, 'tv'), shot(3, 200, 'movie')];
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), shots, m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [18, 53] });
  assert.deepStrictEqual(map.movie_200, { lang: 'ja', genres: [] });
  const tmdbCalls = mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0);
  assert.strictEqual(tmdbCalls.length, 2, 'one lookup per unique card');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}),
    { tv_100: { lang: 'ko', genres: [18, 53] }, movie_200: { lang: 'ja', genres: [] } });
});

test('resolveShortsMeta serves cached cards without TMDB requests', () => {
  const mock = shortsMock({ storage: { dorama_shorts_meta: { tv_100: { lang: 'ko', genres: [18] } } } });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [18] });
  assert.strictEqual(mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0).length, 0);
});

test('resolveShortsMeta migrates the old language-only cache once', () => {
  const mock = shortsMock({ storage: { dorama_shorts_lang: { tv_100: 'ko' } } });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.deepStrictEqual(map.tv_100, { lang: 'ko', genres: [] });
  assert.strictEqual(mock.calls.requests.filter(u => u.indexOf('themoviedb.org') >= 0).length, 0,
    'migrated entry counts as a cache hit');
});

test('resolveShortsMeta excludes failed lookups and does not cache them', () => {
  const mock = shortsMock({ langs: {} });
  const api = loadPlugin(mock);
  let map;
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], m => { map = m; });
  assert.strictEqual(map.tv_100, undefined);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}), {});
});

test('resolveShortsMeta resets an oversized cache', () => {
  const big = {};
  for (let i = 0; i < 501; i++) big['movie_' + i] = { lang: 'fr', genres: [] };
  const mock = shortsMock({ storage: { dorama_shorts_meta: big }, langs: { 'tv/100': 'ko' } });
  const api = loadPlugin(mock);
  api._resolveShortsMeta(new mock.Lampa.Reguest(), [shot(1, 100, 'tv')], () => {});
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_meta', {}),
    { tv_100: { lang: 'ko', genres: [] } });
});
```

Note for existing tests: the `buildShortsFeedData`/`openShorts` tests pass `langs: {'tv/1': 'ko'}`-style strings — the updated responder keeps those working (string form). They must still pass untouched.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/shorts.test.js`
Expected: new tests FAIL with `api._resolveShortsMeta is not a function`; other shorts tests still pass.

- [ ] **Step 3: Implement**

In `dorama.js`, replace the whole `resolveShortsLanguages` function AND its two constants (keep `SHORTS_LOOKUP_CONCURRENCY`, rename the cache max) with:

```js
  var SHORTS_META_CACHE_MAX = 500;
  var SHORTS_LOOKUP_CONCURRENCY = 4;

  // done(metaMap): cardKey -> { lang, genres:[ids] }. Language and genres come
  // from the SAME TMDB detail response, so genres cost zero extra requests.
  // A title's language/genres never change, so the Storage cache has no TTL —
  // only a size guard. Migrates the older language-only cache in memory;
  // persists (under the new key) only when a fetch dirties the cache.
  function resolveShortsMeta(network, shots, done) {
    var cache = Lampa.Storage.get('dorama_shorts_meta', null);
    if (!cache) {
      cache = {};
      var old = Lampa.Storage.get('dorama_shorts_lang', null), ok;
      if (old) { for (ok in old) { if (old.hasOwnProperty(ok)) cache[ok] = { lang: old[ok], genres: [] }; } }
    }
    var map = {}, pending = [], seen = {}, i, key;
    for (i = 0; i < shots.length; i++) {
      key = shortsCardKey(shots[i]);
      if (cache[key]) map[key] = cache[key];
      else if (!seen[key]) {
        seen[key] = 1;
        pending.push({ key: key, path: (shots[i].card_type === 'tv' ? 'tv/' : 'movie/') + shots[i].card_id });
      }
    }
    if (!pending.length) { done(map); return; }
    var launched = 0, finished = 0, dirty = false;
    function finish() {
      if (dirty) {
        var count = 0, k;
        for (k in cache) count++;
        if (count > SHORTS_META_CACHE_MAX) {
          cache = {};
          for (k in map) cache[k] = map[k];
        }
        Lampa.Storage.set('dorama_shorts_meta', cache);
      }
      done(map);
    }
    function settle(item, json) {
      var lang = json && json.original_language;
      if (lang) {
        var gids = [], gs = json.genres || [], g;
        for (g = 0; g < gs.length; g++) { if (gs[g] && gs[g].id) gids.push(gs[g].id); }
        var entry = { lang: lang, genres: gids };
        map[item.key] = entry; cache[item.key] = entry; dirty = true;
      }
      finished++;
      if (finished >= pending.length) { finish(); return; }
      launchNext();
    }
    function launchNext() {
      if (launched >= pending.length) return;
      var item = pending[launched++];
      network.silent(tmdbUrl(item.path), function (json) {
        settle(item, json);
      }, function () {
        settle(item, null);
      });
    }
    var burst = Math.min(SHORTS_LOOKUP_CONCURRENCY, pending.length);
    for (i = 0; i < burst; i++) launchNext();
  }
```

In `orderShorts`, make the lang lookup shape-tolerant (transitional until Task 3 replaces the function). Replace:

```js
      var lang = langMap[shortsCardKey(shots[i])];
```
with:
```js
      // Transitional: accepts the old string map and the new meta-entry map.
      var entry = langMap[shortsCardKey(shots[i])];
      var lang = entry && entry.lang ? entry.lang : entry;
```

In `buildShortsFeedData` and `shortsLoadMore`, replace both `resolveShortsLanguages(network, ...)` calls with `resolveShortsMeta(network, ...)` (callback param rename `langMap` is optional — the shape-tolerant lookup handles it).

In the exports block, replace `_resolveShortsLanguages: resolveShortsLanguages,` with `_resolveShortsMeta: resolveShortsMeta,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/shorts.test.js` → all shorts tests pass (24 = 23 previous − 4 replaced + 5 new).
Run: `node --test` → expect 128 tests / 128 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/shorts.test.js
git commit -m "feat(shorts): meta cache with genres — resolveShortsMeta replaces language resolver"
```

---

### Task 2: Taste store + `buildShortsTaste`

**Files:**
- Modify: `dorama.js` — append after `resolveShortsMeta`
- Modify: `dorama.js` exports block
- Modify: `test/shorts.test.js`

**Interfaces:**
- Consumes: `collectSignals()` (existing; returns `{ positives: [{id, media, weight, card}], ... }`), `Lampa.Storage`, `metaMap` from Task 1.
- Produces:
  - `shortsTasteGet()` → `{ up: [cardKey], down: [cardKey] }` (normalized from Storage `dorama_shorts_taste`).
  - `shortsTasteToggle(kind, cardKey)` → toggles `cardKey` in list `kind` (`'up'`/`'down'`); adding to one removes it from the other; cap 100 per list (oldest dropped); persists; returns `true` when active in `kind` after the call.
  - `buildShortsTaste(metaMap)` → `{ boostCards: {cardKey:1}, sinkCards: {cardKey:1}, genreAdj: {gid: number} }`. boost = `collectSignals().positives` keys (`media + '_' + id`) plus the up-list; sink = down-list (sink removes a key from boost); genreAdj = +0.5 per genre occurrence across up-cards, −0.5 across down-cards, clamped to ±1.5 (genres read from `metaMap`; cards missing there contribute nothing).

- [ ] **Step 1: Write the failing tests**

In `test/shorts.test.js`, first let `shortsMock` pass favorites through — change its `makeMock({...})` call to include them:

```js
  const mock = makeMock({
    storage: opts.storage,
    favorites: opts.favorites,
    mine_reactions: opts.mine_reactions,
    responder: function (url) {
```

Then append:

```js
test('shortsTasteToggle: round-trip, mutual exclusion, cap', () => {
  const mock = shortsMock();
  const api = loadPlugin(mock);
  assert.strictEqual(api._shortsTasteToggle('up', 'tv_1'), true);
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: ['tv_1'], down: [] });
  assert.strictEqual(api._shortsTasteToggle('down', 'tv_1'), true, 'down evicts up');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: [], down: ['tv_1'] });
  assert.strictEqual(api._shortsTasteToggle('down', 'tv_1'), false, 'second toggle removes');
  assert.deepStrictEqual(mock.Lampa.Storage.get('dorama_shorts_taste', {}), { up: [], down: [] });
  for (let i = 0; i < 101; i++) api._shortsTasteToggle('up', 'movie_' + i);
  const up = mock.Lampa.Storage.get('dorama_shorts_taste', {}).up;
  assert.strictEqual(up.length, 100);
  assert.strictEqual(up.indexOf('movie_0'), -1, 'oldest dropped');
});

test('buildShortsTaste: boosts from signals + up-list, sinks win, genreAdj clamped', () => {
  const mock = shortsMock({
    favorites: { like: [{ id: 777, name: 'liked show', original_language: 'ko' }], history: [], viewed: [] },
    storage: { dorama_shorts_taste: { up: ['movie_5', 'tv_9'], down: ['tv_777', 'movie_6'] } }
  });
  const api = loadPlugin(mock);
  const metaMap = {
    movie_5: { lang: 'ko', genres: [18, 53] },
    tv_9: { lang: 'ko', genres: [18] },
    movie_6: { lang: 'ko', genres: [35] },
    tv_777: { lang: 'ko', genres: [] }
  };
  const taste = api._buildShortsTaste(metaMap);
  assert.strictEqual(taste.boostCards.movie_5, 1);
  assert.strictEqual(taste.boostCards.tv_9, 1);
  assert.strictEqual(taste.boostCards.tv_777, undefined, 'sink evicts the liked-signal boost');
  assert.strictEqual(taste.sinkCards.tv_777, 1);
  assert.strictEqual(taste.sinkCards.movie_6, 1);
  assert.strictEqual(taste.genreAdj[18], 1.0, '0.5 from movie_5 + 0.5 from tv_9');
  assert.strictEqual(taste.genreAdj[53], 0.5);
  assert.strictEqual(taste.genreAdj[35], -0.5);
});

test('buildShortsTaste: genreAdj clamps at ±1.5 and empty signals give empty taste', () => {
  const up = [];
  const metaMap = {};
  for (let i = 0; i < 4; i++) { up.push('movie_' + i); metaMap['movie_' + i] = { lang: 'ko', genres: [18] }; }
  const mock = shortsMock({ storage: { dorama_shorts_taste: { up, down: [] } } });
  const api = loadPlugin(mock);
  assert.strictEqual(api._buildShortsTaste(metaMap).genreAdj[18], 1.5, '4×0.5 clamped to 1.5');
  const empty = loadPlugin(shortsMock())._buildShortsTaste({});
  assert.deepStrictEqual(empty, { boostCards: {}, sinkCards: {}, genreAdj: {} });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/shorts.test.js`
Expected: 3 new tests FAIL (`_shortsTasteToggle is not a function`).

- [ ] **Step 3: Implement**

Append to `dorama.js` after `resolveShortsMeta`:

```js
  var SHORTS_TASTE_MAX = 100;
  var SHORTS_GENRE_ADJ_STEP = 0.5;
  var SHORTS_GENRE_ADJ_CLAMP = 1.5;

  function shortsTasteGet() {
    var t = Lampa.Storage.get('dorama_shorts_taste', {}) || {};
    return { up: t.up || [], down: t.down || [] };
  }

  // kind: 'up' | 'down'. Toggles cardKey in that list; adding to one list
  // removes it from the other (❤ and 👎 are mutually exclusive). Returns true
  // when the key is active in `kind` after the call.
  function shortsTasteToggle(kind, cardKey) {
    var t = shortsTasteGet();
    var list = t[kind], other = t[kind === 'up' ? 'down' : 'up'];
    var oi = other.indexOf(cardKey);
    if (oi >= 0) other.splice(oi, 1);
    var i = list.indexOf(cardKey), active;
    if (i >= 0) { list.splice(i, 1); active = false; }
    else {
      list.push(cardKey);
      if (list.length > SHORTS_TASTE_MAX) list.shift();
      active = true;
    }
    Lampa.Storage.set('dorama_shorts_taste', t);
    return active;
  }

  // Shorts feed taste: boost/sink card sets + a genre adjustment map.
  // boost = dorama recommendation positives (liked/reacted titles) + Shorts ❤;
  // sink = Shorts 👎 (sink evicts boost). genreAdj uses ONLY the Shorts store
  // (±0.5 per genre occurrence, clamped ±1.5) — the liked-title tier already
  // carries the main dorama signal, so the profile is not recomputed here.
  function buildShortsTaste(metaMap) {
    var t = shortsTasteGet();
    var boost = {}, sink = {}, adj = {}, i, sig;
    try { sig = collectSignals(); } catch (e) { sig = { positives: [] }; }
    for (i = 0; i < sig.positives.length; i++) boost[sig.positives[i].media + '_' + sig.positives[i].id] = 1;
    for (i = 0; i < t.up.length; i++) boost[t.up[i]] = 1;
    for (i = 0; i < t.down.length; i++) { sink[t.down[i]] = 1; delete boost[t.down[i]]; }
    function apply(list, step) {
      var a, b, gids, g;
      for (a = 0; a < list.length; a++) {
        gids = (metaMap[list[a]] || {}).genres || [];
        for (b = 0; b < gids.length; b++) {
          g = gids[b];
          adj[g] = (adj[g] || 0) + step;
          if (adj[g] > SHORTS_GENRE_ADJ_CLAMP) adj[g] = SHORTS_GENRE_ADJ_CLAMP;
          if (adj[g] < -SHORTS_GENRE_ADJ_CLAMP) adj[g] = -SHORTS_GENRE_ADJ_CLAMP;
        }
      }
    }
    apply(t.up, SHORTS_GENRE_ADJ_STEP);
    apply(t.down, -SHORTS_GENRE_ADJ_STEP);
    return { boostCards: boost, sinkCards: sink, genreAdj: adj };
  }
```

Add to exports: `_shortsTasteGet: shortsTasteGet, _shortsTasteToggle: shortsTasteToggle, _buildShortsTaste: buildShortsTaste,`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/shorts.test.js` → 27 pass.
Run: `node --test` → 131/131.

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/shorts.test.js
git commit -m "feat(shorts): local taste store and buildShortsTaste (boost/sink/genre adjustments)"
```

---

### Task 3: `orderShortsV2` — taste tiers inside ko-first

**Files:**
- Modify: `dorama.js` — replace `orderShorts` (and its transitional lookup) with `orderShortsV2`; update the two call sites in `buildShortsFeedData`/`shortsLoadMore`
- Modify: `dorama.js` exports block (`_orderShorts` → `_orderShortsV2`)
- Modify: `test/shorts.test.js` — replace the two `orderShorts` tests, add tier tests

**Interfaces:**
- Consumes: `shortsCardKey`, `SHORTS_ASIAN_FILL`, `buildShortsTaste(metaMap)` (Task 2), `resolveShortsMeta` metaMap shape (Task 1).
- Produces: `orderShortsV2(shots, metaMap, viewedIds, taste)` → array ordered by tiers: 0) boosted cards' clips (unless sunk — sink wins), 1) ko clips with genre score > 0 sorted desc (stable via index tie-break), 2) remaining ko, 3) asian (ja/zh/th) score > 0 desc, 4) remaining asian, 5) sunk cards' clips. Viewed clips sink WITHIN their tier (fresh block then seen block, both keeping order). Unknown languages dropped. Genre score = Σ `taste.genreAdj[gid]` over `metaMap[key].genres`. Call sites pass `buildShortsTaste(metaMap)`.

- [ ] **Step 1: Write the failing tests**

Replace the two old `orderShorts` tests (`'orderShorts: ko first...'` and `'orderShorts sinks viewed...'`) with:

```js
test('orderShortsV2 with empty taste keeps the v1 order (ko, asian, viewed sink)', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(9, 1, 'tv'), shot(8, 2, 'tv'), shot(7, 3, 'tv'), shot(6, 4, 'tv'), shot(5, 5, 'movie')];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [] }, tv_2: { lang: 'ko', genres: [] },
    tv_3: { lang: 'ja', genres: [] }, tv_4: { lang: 'ja', genres: [] },
    movie_5: { lang: 'en', genres: [] }
  };
  const empty = { boostCards: {}, sinkCards: {}, genreAdj: {} };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [9, 7], empty).map(s => s.id),
    [8, 9, 6, 7], 'en dropped; viewed 9/7 sink within their language groups');
});

test('orderShortsV2 tiers: boost > ko-scored > ko-rest > asian > sink', () => {
  const api = loadPlugin(shortsMock());
  const shots = [
    shot(100, 1, 'tv'),   // ko, no genre match      -> tier 2
    shot(99, 2, 'tv'),    // ko, genre 18 (adj +1)   -> tier 1
    shot(98, 3, 'movie'), // boosted card            -> tier 0
    shot(97, 4, 'tv'),    // ja                      -> tier 4
    shot(96, 5, 'tv'),    // sunk card (ko)          -> tier 5
    shot(95, 6, 'tv')     // ko, genre 53 (adj +0.5) -> tier 1, below id 99
  ];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [99] },
    tv_2: { lang: 'ko', genres: [18] },
    movie_3: { lang: 'ko', genres: [] },
    tv_4: { lang: 'ja', genres: [] },
    tv_5: { lang: 'ko', genres: [] },
    tv_6: { lang: 'ko', genres: [53] }
  };
  const taste = { boostCards: { movie_3: 1 }, sinkCards: { tv_5: 1 }, genreAdj: { 18: 1.0, 53: 0.5 } };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [], taste).map(s => s.id),
    [98, 99, 95, 100, 97, 96]);
});

test('orderShortsV2: sink beats boost; equal scores keep incoming order', () => {
  const api = loadPlugin(shortsMock());
  const shots = [shot(10, 1, 'tv'), shot(9, 2, 'tv'), shot(8, 3, 'tv')];
  const metaMap = {
    tv_1: { lang: 'ko', genres: [18] },
    tv_2: { lang: 'ko', genres: [18] },
    tv_3: { lang: 'ko', genres: [] }
  };
  const taste = { boostCards: { tv_3: 1 }, sinkCards: { tv_3: 1 }, genreAdj: { 18: 0.5 } };
  assert.deepStrictEqual(api._orderShortsV2(shots, metaMap, [], taste).map(s => s.id),
    [10, 9, 8], 'tv_3 sunk despite boost; 10 before 9 (same score, incoming order)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/shorts.test.js`
Expected: 3 new tests FAIL (`_orderShortsV2 is not a function`); the OTHER previously-passing tests that call feed builders still pass (they go through `orderShorts` until Step 3).

- [ ] **Step 3: Implement**

In `dorama.js`, replace the whole `orderShorts` function (keep `SHORTS_ASIAN_FILL` and `SHORTS_VIEWED_MAX` where they are) with:

```js
  // Taste-tiered ordering, language grouping ko-first as the outer rule:
  // 0) boosted cards' clips, 1) ko with genre score > 0 (score desc),
  // 2) ko rest, 3) asian (ja/zh/th) score > 0, 4) asian rest,
  // 5) sunk cards' clips dead last (sink beats boost, defensively).
  // Viewed clips sink WITHIN their tier; incoming order is preserved on ties
  // via an index tie-break — Array.sort stability is not guaranteed on old
  // TV engines. Unknown languages are dropped.
  function orderShortsV2(shots, metaMap, viewedIds, taste) {
    taste = taste || {};
    var boost = taste.boostCards || {}, sink = taste.sinkCards || {}, adj = taste.genreAdj || {};
    var viewed = {}, i, j;
    for (i = 0; i < (viewedIds || []).length; i++) viewed[viewedIds[i]] = 1;
    var fresh = [[], [], [], [], [], []];
    var seen = [[], [], [], [], [], []];
    for (i = 0; i < shots.length; i++) {
      var key = shortsCardKey(shots[i]);
      var entry = metaMap[key] || {};
      var lang = entry.lang;
      var isKo = lang === 'ko';
      if (!isKo && !SHORTS_ASIAN_FILL[lang]) continue;
      var gids = entry.genres || [], score = 0;
      for (j = 0; j < gids.length; j++) score += adj[gids[j]] || 0;
      var tier;
      if (sink[key]) tier = 5;
      else if (boost[key]) tier = 0;
      else if (isKo) tier = score > 0 ? 1 : 2;
      else tier = score > 0 ? 3 : 4;
      (viewed[shots[i].id] ? seen : fresh)[tier].push({ s: score, v: shots[i] });
    }
    function flatten(list, sortByScore) {
      if (sortByScore) {
        var dec = [], k;
        for (k = 0; k < list.length; k++) dec.push({ s: list[k].s, i: k, v: list[k].v });
        dec.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
        list = dec;
      }
      var out = [], m;
      for (m = 0; m < list.length; m++) out.push(list[m].v);
      return out;
    }
    var result = [], t;
    for (t = 0; t < 6; t++) {
      var scored = (t === 1 || t === 3);
      result = result.concat(flatten(fresh[t], scored), flatten(seen[t], scored));
    }
    return result;
  }
```

Update BOTH call sites — in `buildShortsFeedData`'s `finish`:

```js
      resolveShortsMeta(network, acc, function (metaMap) {
        done(orderShortsV2(acc, metaMap, Lampa.Storage.get('dorama_shorts_viewed', []) || [], buildShortsTaste(metaMap)), cursor);
      });
```

and in `shortsLoadMore`:

```js
      resolveShortsMeta(network, ready, function (metaMap) {
        done({ items: orderShortsV2(ready, metaMap, Lampa.Storage.get('dorama_shorts_viewed', []) || [], buildShortsTaste(metaMap)), next: rawNext });
      });
```

In exports, replace `_orderShorts: orderShorts,` with `_orderShortsV2: orderShortsV2,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/shorts.test.js` → 28 pass (27 + 3 new − 2 replaced).
Run: `node --test` → 132/132.

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/shorts.test.js
git commit -m "feat(shorts): taste-tiered feed order (orderShortsV2) wired into build and paging"
```

---

### Task 4: Player panel v2 — poster, actions, focus model + README

**Files:**
- Modify: `dorama.js` — `SHORTS_CSS`, `createShortsFeed` (panel HTML, focus model, buttons), new `shortsShotCard(shot)` helper before `createShortsFeed`
- Modify: `dorama.js` exports block (`_shortsShotCard`)
- Modify: `test/shorts.test.js` (shotCard tests)
- Modify: `README.md` («Shorts» section)

**Interfaces:**
- Consumes: `shortsTasteToggle` (Task 2), `shortsCardKey`, `Lampa.Favorite.toggle/check`, `Lampa.Api.img`, existing `createShortsFeed` internals (`show`, `move`, `openCard`, `destroy`, `wake`).
- Produces: `shortsShotCard(shot)` → Lampa card object: tv → `{ id:+card_id, name:card_title, original_name:card_title, poster_path:card_poster, first_air_date:card_year }`; movie → `{ id:+card_id, title:card_title, original_title:card_title, poster_path:card_poster, release_date:card_year }`. UI contract: ←/→ move focus over `[poster, ❤, 🔖, 👎]`, OK activates, ↑/↓ unchanged, panel dims (opacity .35) on 5s idle instead of hiding.

- [ ] **Step 1: Write the failing shotCard tests**

Append to `test/shorts.test.js`:

```js
test('shortsShotCard builds tv and movie card shapes for Favorite', () => {
  const api = loadPlugin(shortsMock());
  const tv = api._shortsShotCard(shot(1, 273160, 'tv', { card_title: 'Красота', card_year: '2026', card_poster: '/p.jpg' }));
  assert.deepStrictEqual(tv, {
    id: 273160, name: 'Красота', original_name: 'Красота',
    poster_path: '/p.jpg', first_air_date: '2026'
  });
  const mv = api._shortsShotCard(shot(2, 99, 'movie', { card_title: 'Фильм', card_year: '2020', card_poster: '' }));
  assert.deepStrictEqual(mv, {
    id: 99, title: 'Фильм', original_title: 'Фильм',
    poster_path: '', release_date: '2020'
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/shorts.test.js`
Expected: FAIL with `_shortsShotCard is not a function`.

- [ ] **Step 3: Implement `shortsShotCard` + panel**

Insert before `createShortsFeed` in `dorama.js`:

```js
  // A minimal Lampa card built from CUB shot fields — enough for
  // Favorite.toggle/check and the bookmarks UI (duck-typed like the rest of
  // the plugin: `name` marks tv, `title` marks movie).
  function shortsShotCard(shot) {
    if (shot.card_type === 'tv') {
      return {
        id: parseInt(shot.card_id, 10), name: shot.card_title || '', original_name: shot.card_title || '',
        poster_path: shot.card_poster || '', first_air_date: shot.card_year || ''
      };
    }
    return {
      id: parseInt(shot.card_id, 10), title: shot.card_title || '', original_title: shot.card_title || '',
      poster_path: shot.card_poster || '', release_date: shot.card_year || ''
    };
  }
```

Replace `SHORTS_CSS` with:

```js
  var SHORTS_CSS =
    '.dorama-shorts{position:fixed;left:0;top:0;width:100%;height:100%;z-index:500;background:#000}' +
    '.dorama-shorts video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;background:#000}' +
    '.dorama-shorts__progress{position:absolute;left:1em;right:1em;bottom:1em;height:.3em;background:rgba(255,255,255,.3);border-radius:1em;z-index:2}' +
    '.dorama-shorts__progress>div{height:100%;width:0;background:#fff;border-radius:1em}' +
    '.dorama-shorts__panel{position:absolute;left:0;right:0;bottom:0;padding:1.5em;padding-bottom:2.5em;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0));transition:opacity .3s;z-index:1}' +
    '.dorama-shorts--idle .dorama-shorts__panel{opacity:.35}' +
    '.dorama-shorts__card{display:flex;align-items:flex-end}' +
    '.dorama-shorts__poster{width:6.5em;height:9.5em;border-radius:.4em;overflow:hidden;background:rgba(255,255,255,.1);flex-shrink:0;border:.15em solid transparent}' +
    '.dorama-shorts__poster img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s}' +
    '.dorama-shorts__poster--loaded img{opacity:1}' +
    '.dorama-shorts__poster--hidden{display:none}' +
    '.dorama-shorts__poster.focus{border-color:#fff}' +
    '.dorama-shorts__info{padding-left:1.2em;min-width:0}' +
    '.dorama-shorts__year{font-size:1em;opacity:.8}' +
    '.dorama-shorts__title{font-size:1.7em;line-height:1.3;margin-top:.2em;text-shadow:0 0 .2em rgba(0,0,0,.5)}' +
    '.dorama-shorts__tags{margin-top:.6em}' +
    '.dorama-shorts__tags span{display:inline-block;background:rgba(0,0,0,.4);border-radius:.4em;padding:.2em .6em;margin-right:.4em;font-size:.9em}' +
    '.dorama-shorts__actions{margin-top:.8em}' +
    '.dorama-shorts__btn{display:inline-block;background:rgba(255,255,255,.14);border-radius:2em;padding:.45em 1em;margin-right:.5em;font-size:.95em}' +
    '.dorama-shorts__btn.focus{background:#fff;color:#000}' +
    '.dorama-shorts__btn--active{background:rgba(255,255,255,.35)}' +
    '.dorama-shorts__btn--active.focus{background:#fff}' +
    '.dorama-shorts__hint{position:absolute;right:1.5em;bottom:2.5em;font-size:.85em;opacity:.6;z-index:1}';
```

In `createShortsFeed`, replace the `root.innerHTML` block with:

```js
    root.innerHTML =
      '<video autoplay loop playsinline></video>' +
      '<div class="dorama-shorts__panel">' +
      '<div class="dorama-shorts__card">' +
      '<div class="dorama-shorts__poster" data-act="poster"><img alt=""></div>' +
      '<div class="dorama-shorts__info">' +
      '<div class="dorama-shorts__year"></div>' +
      '<div class="dorama-shorts__title"></div>' +
      '<div class="dorama-shorts__tags"></div>' +
      '<div class="dorama-shorts__actions">' +
      '<div class="dorama-shorts__btn" data-act="like">❤ Нравится</div>' +
      '<div class="dorama-shorts__btn" data-act="book">🔖 Позже</div>' +
      '<div class="dorama-shorts__btn" data-act="less">👎 Меньше такого</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dorama-shorts__hint">OK — выбрать • ←→ — кнопки • ↑↓ — ролики</div>' +
      '<div class="dorama-shorts__progress"><div></div></div>';
```

After the existing element refs (`elTags` etc.) add refs + the focus/actions machinery:

```js
    var elPoster = root.querySelector('.dorama-shorts__poster');
    var elPosterImg = elPoster.querySelector('img');
    var btnLike = root.querySelector('[data-act="like"]');
    var btnBook = root.querySelector('[data-act="book"]');
    var btnLess = root.querySelector('[data-act="less"]');
    var hasFavorite = !!(Lampa.Favorite && Lampa.Favorite.toggle && Lampa.Favorite.check);
    if (!hasFavorite) { btnLike.style.display = 'none'; btnBook.style.display = 'none'; }
    var focusIndex = 0;

    elPosterImg.onload = function () { elPoster.classList.add('dorama-shorts__poster--loaded'); };
    elPosterImg.onerror = function () { elPoster.classList.add('dorama-shorts__poster--hidden'); };

    function focusables() {
      var list = [];
      if (!elPoster.classList.contains('dorama-shorts__poster--hidden')) list.push(elPoster);
      if (hasFavorite) { list.push(btnLike); list.push(btnBook); }
      list.push(btnLess);
      return list;
    }

    function applyFocus() {
      var list = focusables(), i;
      if (focusIndex >= list.length) focusIndex = list.length - 1;
      if (focusIndex < 0) focusIndex = 0;
      for (i = 0; i < list.length; i++) list[i].classList.toggle('focus', i === focusIndex);
    }

    function moveFocus(dir) {
      focusIndex += dir;
      applyFocus();
      wake();
    }

    function syncButtons() {
      var shot = current();
      var key = shortsCardKey(shot);
      var taste = shortsTasteGet();
      btnLess.classList.toggle('dorama-shorts__btn--active', taste.down.indexOf(key) >= 0);
      if (hasFavorite) {
        var check = Lampa.Favorite.check(shortsShotCard(shot));
        btnLike.classList.toggle('dorama-shorts__btn--active', !!check.like);
        btnBook.classList.toggle('dorama-shorts__btn--active', !!check.book);
      }
    }

    function activate() {
      var list = focusables();
      var el = list[focusIndex] || list[0];
      var act = el ? el.getAttribute('data-act') : 'poster';
      var shot = current();
      var key = shortsCardKey(shot);
      if (act === 'poster') { openCard(); return; }
      if (act === 'like') {
        Lampa.Favorite.toggle('like', shortsShotCard(shot));
        // ❤ also feeds the Shorts boost list (mutually exclusive with 👎).
        var taste = shortsTasteGet();
        if (taste.up.indexOf(key) < 0) shortsTasteToggle('up', key);
        else shortsTasteToggle('up', key); // was active -> unlike removes it
      }
      if (act === 'book') Lampa.Favorite.toggle('book', shortsShotCard(shot));
      if (act === 'less') shortsTasteToggle('down', key);
      syncButtons();
      wake();
    }
```

Note on the like branch: the two calls collapse to a single unconditional `shortsTasteToggle('up', key);` — write it that way (the toggle mirrors Favorite's own like/unlike toggling):

```js
      if (act === 'like') {
        Lampa.Favorite.toggle('like', shortsShotCard(shot));
        shortsTasteToggle('up', key); // mirror into the Shorts boost list
      }
```

In `show(shot)`, after `elTags` filling and before the `bar.style.width` line, add:

```js
      elPoster.classList.remove('dorama-shorts__poster--loaded');
      elPoster.classList.remove('dorama-shorts__poster--hidden');
      if (shot.card_poster && Lampa.Api && Lampa.Api.img) {
        elPosterImg.src = Lampa.Api.img(shot.card_poster, 'w200');
      } else {
        elPoster.classList.add('dorama-shorts__poster--hidden');
      }
      focusIndex = 0;
      applyFocus();
      syncButtons();
```

Replace the controller registration with:

```js
    Lampa.Controller.add('dorama_shorts', {
      toggle: function () { wake(); },
      up: function () { move(-1); },
      down: function () { move(1); },
      left: function () { moveFocus(-1); },
      right: function () { moveFocus(1); },
      enter: activate,
      back: destroy
    });
```

Also make the panel's buttons clickable on web/touch — after the controller registration add:

```js
    var clickables = [elPoster, btnLike, btnBook, btnLess], ci;
    for (ci = 0; ci < clickables.length; ci++) {
      (function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var list = focusables(), k;
          for (k = 0; k < list.length; k++) if (list[k] === el) focusIndex = k;
          applyFocus();
          activate();
        });
      })(clickables[ci]);
    }
```

Add to exports: `_shortsShotCard: shortsShotCard,`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/shorts.test.js` → 29 pass.
Run: `node --test` → 133/133.

- [ ] **Step 5: Update README**

In `README.md`, in the «Shorts» section, replace the управление sentence with:

```markdown
Управление: **↑/↓** (или свайп/колесо) — следующий/предыдущий ролик, **←/→** —
выбор на панели (постер / «Нравится» / «Позже» / «Меньше такого»), **OK** —
активировать выбранное (постер открывает карточку тайтла), **Назад** — выход.
Лента персональная: сначала ролики из тайтлов, которые вам нравятся (лайки и
реакции Lampa + «Нравится» прямо в ленте), затем корейские ролики ваших любимых
жанров, затем остальное; «Меньше такого» опускает тайтл и его жанры в самый
конец. Все сигналы хранятся локально.
```

- [ ] **Step 6: Commit**

```bash
git add dorama.js test/shorts.test.js README.md
git commit -m "feat(shorts): poster/actions panel with focus model and taste feedback buttons"
```

- [ ] **Step 7: Manual smoke checklist (controller/user, before pushing master)**

1. Serve repo (`python -m http.server 8000`), add `http://localhost:8000/dorama.js` to a web Lampa.
2. Shorts opens; bottom-left shows poster + title + buttons; panel dims (not hides) after ~5s.
3. ←/→ moves the white focus ring poster→❤→🔖→👎; OK on poster opens the card.
4. OK on ❤ — button gets active state; the title appears in Lampa «Нравится»; reopening Shorts shows that title's clips first.
5. OK on 👎 — active state; reopening Shorts sinks that title's clips to the end.
6. Broken poster URL → poster box disappears, focus skips to ❤.
7. ↑/↓ still switch clips; Back exits; wheel/click still work on web.

---

## Self-review notes

- Spec coverage: §1 UI → Task 4; §2 ordering → Task 3 (taste from Task 2); §3 data/migration → Tasks 1–2; §4 edge cases → guards in Tasks 2–4 (Favorite missing, poster hidden, empty taste = v1 order test, sink-beats-boost test, caps); §5 tests → distributed per task; README → Task 4.
- Type consistency: `metaMap[key] = {lang, genres}` shape identical across Tasks 1/2/3; `taste = {boostCards, sinkCards, genreAdj}` identical across Tasks 2/3; `shortsShotCard` used by both Favorite branches in Task 4; export names match test usage (`_resolveShortsMeta`, `_shortsTasteGet`, `_shortsTasteToggle`, `_buildShortsTaste`, `_orderShortsV2`, `_shortsShotCard`).
- Known transitional seam: Task 1 leaves `orderShorts` shape-tolerant; Task 3 deletes it. Task 4's `activate()` like-branch is written twice in the step — the second (collapsed) form is the one to implement.
