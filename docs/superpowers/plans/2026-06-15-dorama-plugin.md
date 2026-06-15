# Дорама Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `dorama.js`, a single-file ES5 Lampa TV plugin that adds a «Дорама» sidebar entry opening a curated catalog of dark Korean social-thrillers (8 verified TMDB Discover rows + an anchor-seeded recommendation feed), then ship it on GitHub like `anime.js`.

**Architecture:** One IIFE (`dorama.js`) that (1) injects a `.menu__item` into Lampa's sidebar, (2) registers a custom component built on the native `Lampa.InteractionMain`, and (3) fills it with rows from `Lampa.TMDB` requests. Pure helpers (`buildRows`, `ANCHORS`, `pickAnchors`, `mergeRecommendations`) are split out and exported under a `typeof module` guard so they can be unit-tested in Node with a mocked `Lampa`/`$`. The shipped file is browser-only; the export hook is inert in a browser.

**Tech Stack:** Plain ES5 JavaScript (no build step), Node's built-in `node:test` + `node:assert` for tests, a hand-written ~80-line `Lampa`/`$` mock (no npm runtime deps), `gh` CLI for deploy.

**Reference spec:** `docs/superpowers/specs/2026-06-15-dorama-plugin-design.md` (v2). All TMDB IDs/URLs below come from its §4–§7 (verified against themoviedb.org).

---

## File structure

- Create: `dorama.js` — the plugin (grows across Tasks 2–6; always `require`-able).
- Create: `test/helpers/lampa-mock.js` — mock `Lampa` + `$` + `window`, and a fresh-load helper.
- Create: `test/rows.test.js` — Discover row URLs + genre-safety invariant.
- Create: `test/recos.test.js` — anchor matrix, `pickAnchors`, `mergeRecommendations`.
- Create: `test/menu.test.js` — boot + sidebar injection + activity push.
- Create: `test/component.test.js` — component factory: `create`/`build`/`onMore`/`destroy`.
- Create: `package.json` — `"test": "node --test"`.
- Create: `.gitignore` — `node_modules/`.
- Create: `README.md` — install + tuning docs.

---

## Task 1: Scaffolding + test harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `test/helpers/lampa-mock.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "lampa-dorama",
  "version": "1.0.0",
  "description": "Lampa TV plugin: curated dark Korean social-thriller catalog (Дорама)",
  "scripts": {
    "test": "node --test"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Create the mock harness `test/helpers/lampa-mock.js`**

This builds a fresh `Lampa`/`$`/`window` per test and loads `dorama.js` uncached. The `$` mock supports only what the plugin uses: create-from-`<html>`, `.on`, and `$('.menu .menu__list').eq(0).append(...)`.

```js
'use strict';
const path = require('path');

// --- minimal jQuery-like element ---
function makeEl(html) {
  return {
    _html: html || '',
    _handlers: {},
    _children: [],
    on: function (ev, fn) { this._handlers[ev] = fn; return this; },
    append: function (child) { this._children.push(child); return this; },
    trigger: function (ev) { if (this._handlers[ev]) this._handlers[ev](); return this; },
    text: function () { var m = /menu__text[^>]*>([^<]*)</.exec(this._html); return m ? m[1] : ''; }
  };
}

// --- mock factory: returns { Lampa, $, window, calls } ---
function makeMock(options) {
  options = options || {};
  var calls = { activityPush: [], componentAdd: {}, listeners: {}, requests: [], clears: 0 };

  var menuList = makeEl('');               // the .menu .menu__list element
  function $(arg) {
    if (typeof arg === 'string' && arg.charAt(0) === '<') return makeEl(arg);
    // selector query — only '.menu .menu__list' is used
    return { eq: function () { return menuList; }, length: 1 };
  }

  // canned TMDB responses keyed by URL substring; override via options.responder
  function defaultResponder(url) {
    if (url.indexOf('recommendations') >= 0) {
      // derive a couple of deterministic ids from the anchor id in the path
      var m = /\/(\d+)\/recommendations/.exec(url);
      var base = m ? parseInt(m[1], 10) : 0;
      return { results: [{ id: base + 1, title: 'rec' + (base + 1) }, { id: base + 2, title: 'rec' + (base + 2) }] };
    }
    return { results: [{ id: 1000, name: 'row-item' }], total_pages: 12 };
  }
  var responder = options.responder || defaultResponder;

  function Reguest() {
    this.silent = function (url, ok /*, err */) {
      calls.requests.push(url);
      var json = responder(url);
      ok(json);
    };
    this.clear = function () { calls.clears++; };
  }

  // Mock InteractionMain: records build()/empty()/destroy()
  function InteractionMain(object) {
    this.object = object;
    this.activity = { loader: function () {}, toggle: function () {} };
    this.build = function (data) { this._built = data; };
    this.empty = function () { this._empty = true; };
    this.render = function () { return {}; };
    this.destroy = function () { this._destroyed = true; };
  }

  var Lampa = {
    appready: false,
    Listener: { follow: function (name, fn) { calls.listeners[name] = fn; } },
    Activity: { push: function (o) { calls.activityPush.push(o); } },
    Component: { add: function (name, fn) { calls.componentAdd[name] = fn; } },
    InteractionMain: InteractionMain,
    Reguest: Reguest,
    TMDB: { api: function (url) { return 'https://api.themoviedb.org/3/' + url + (url.indexOf('?') >= 0 ? '&' : '?') + 'api_key=K&language=ru'; } },
    Arrays: { shuffle: function (a) { return a; }, destroy: function () {} },
    Storage: { field: function () { return 'ru'; }, get: function (k, def) { return def; }, set: function () {} }
  };

  return { Lampa: Lampa, $: $, calls: calls, menuList: menuList };
}

// Load dorama.js fresh with the given mock installed as globals.
function loadPlugin(mock) {
  global.Lampa = mock.Lampa;
  global.$ = mock.$;
  global.window = mock.Lampa.appready ? { appready: true } : { appready: false };
  var p = path.resolve(__dirname, '..', '..', 'dorama.js');
  delete require.cache[require.resolve(p)];
  return require(p); // returns the exported helpers object
}

module.exports = { makeMock: makeMock, loadPlugin: loadPlugin, makeEl: makeEl };
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore test/helpers/lampa-mock.js
git commit -m "chore: scaffold dorama plugin + Lampa/\$ test mock"
```

---

## Task 2: Discover rows + genre-safety invariant

**Files:**
- Create: `dorama.js`
- Test: `test/rows.test.js`

- [ ] **Step 1: Write the failing test `test/rows.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('buildRows returns the 7 verified curated rows', () => {
  const { buildRows } = load();
  const rows = buildRows();
  assert.strictEqual(rows.length, 7);
  const titles = rows.map(r => r.title);
  assert.ok(titles.indexOf('Корейские триллеры (сериалы)') >= 0);
  assert.ok(titles.indexOf('Лучшее: корейские триллеры') >= 0);
});

test('each row has url, method matching its discover path, and tmdb source', () => {
  const { buildRows } = load();
  buildRows().forEach(r => {
    assert.match(r.url, /^discover\/(tv|movie)\?/);
    assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
    assert.strictEqual(r.source, 'tmdb');
  });
});

test('INVARIANT: no discover/tv row uses the movie-only Thriller genre (53)', () => {
  const { buildRows } = load();
  buildRows().forEach(r => {
    if (r.url.indexOf('discover/tv') === 0) {
      const m = /with_genres=([^&]*)/.exec(r.url);
      const genres = m ? m[1].split(/[|,]/) : [];
      assert.ok(genres.indexOf('53') < 0, 'tv row must not contain genre 53: ' + r.url);
    }
  });
});

test('exact verified URLs are preserved character-for-character', () => {
  const { buildRows } = load();
  const byTitle = {};
  buildRows().forEach(r => { byTitle[r.title] = r.url; });
  assert.strictEqual(byTitle['Корейские триллеры (сериалы)'],
    'discover/tv?with_original_language=ko&with_genres=80|9648&sort_by=popularity.desc&vote_count.gte=40');
  assert.strictEqual(byTitle['Социальные триллеры (неравенство)'],
    'discover/movie?with_original_language=ko&with_genres=53,18&sort_by=popularity.desc&vote_count.gte=50');
  assert.strictEqual(byTitle['Лучшее: корейские триллеры'],
    'discover/movie?with_original_language=ko&with_genres=53|80&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=400&vote_average.gte=7');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rows.test.js`
Expected: FAIL — `Cannot find module '../../dorama.js'` (file doesn't exist yet).

- [ ] **Step 3: Create `dorama.js` with `buildRows` + export hook**

```js
(function () {
  'use strict';

  // Curated dark-Korean Discover rows. URLs verified against themoviedb.org
  // (spec v2 §5/§7). '|' = OR (broaden), ',' = AND (narrow). Thriller(53) is
  // MOVIE-ONLY and never appears in a discover/tv url.
  function buildRows() {
    return [
      { title: 'Корейские триллеры (сериалы)', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=80|9648&sort_by=popularity.desc&vote_count.gte=40' },
      { title: 'Корейское кино: триллеры', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|80|9648&sort_by=popularity.desc&vote_count.gte=50' },
      { title: 'Социальные триллеры (неравенство)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53,18&sort_by=popularity.desc&vote_count.gte=50' },
      { title: 'Выживание и антиутопия', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=10765|18|9648&with_keywords=4565|10349&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Дом-ловушка (бетон / многоэтажка)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_keywords=286239|33347|4565|10349&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Игры разума и саспенс', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|9648&with_keywords=12565|10714|9748&sort_by=popularity.desc&vote_count.gte=25' },
      { title: 'Лучшее: корейские триллеры', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|80&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=400&vote_average.gte=7' }
    ];
  }

  // --- test export hook (inert in a browser: `module` is undefined there) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildRows: buildRows };
  }
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rows.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/rows.test.js
git commit -m "feat: curated Discover rows with genre-safety invariant"
```

---

## Task 3: Anchor matrix + recommendation merge helpers

**Files:**
- Modify: `dorama.js` (add `ANCHORS`, `pickAnchors`, `mergeRecommendations`; extend exports)
- Test: `test/recos.test.js`

- [ ] **Step 1: Write the failing test `test/recos.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recos.test.js`
Expected: FAIL — `ANCHORS` / `pickAnchors` / `mergeRecommendations` are undefined.

- [ ] **Step 3: Add the helpers to `dorama.js`**

Insert these three definitions immediately after `buildRows` (before the export hook):

```js
  // 20 verified anchor titles (spec v2 §4). type routes to the correct
  // TMDB recommendations endpoint (movie/{id} vs tv/{id}).
  var ANCHORS = [
    { id: 496243, type: 'movie' }, { id: 1269208, type: 'movie' }, { id: 740441, type: 'movie' },
    { id: 729854, type: 'movie' }, { id: 396535, type: 'movie' }, { id: 670, type: 'movie' },
    { id: 11423, type: 'movie' }, { id: 491584, type: 'movie' }, { id: 110415, type: 'movie' },
    { id: 575604, type: 'movie' },
    { id: 93405, type: 'tv' }, { id: 89959, type: 'tv' }, { id: 106651, type: 'tv' },
    { id: 99489, type: 'tv' }, { id: 96648, type: 'tv' }, { id: 135340, type: 'tv' },
    { id: 84327, type: 'tv' }, { id: 99494, type: 'tv' }, { id: 119769, type: 'tv' },
    { id: 156484, type: 'tv' }
  ];

  // Pick `count` anchors starting at `offset`, wrapping around the pool.
  function pickAnchors(all, count, offset) {
    var out = [], n = all.length, i;
    for (i = 0; i < count && i < n; i++) out.push(all[(offset + i) % n]);
    return out;
  }

  // Merge recommendation result arrays: dedupe by id, drop the seed anchors,
  // cap at `cap` items. Tolerates null/empty lists.
  function mergeRecommendations(lists, anchorIds, cap) {
    var seen = {}, out = [], i, j, items, it;
    for (i = 0; i < anchorIds.length; i++) seen[anchorIds[i]] = true;
    for (i = 0; i < lists.length; i++) {
      items = lists[i] || [];
      for (j = 0; j < items.length; j++) {
        it = items[j];
        if (!it || seen[it.id]) continue;
        seen[it.id] = true;
        out.push(it);
        if (out.length >= cap) return out;
      }
    }
    return out;
  }
```

Then extend the export hook to expose them:

```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRows: buildRows,
      ANCHORS: ANCHORS,
      pickAnchors: pickAnchors,
      mergeRecommendations: mergeRecommendations
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/recos.test.js test/rows.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/recos.test.js
git commit -m "feat: anchor matrix + recommendation merge/dedupe helpers"
```

---

## Task 4: Boot + sidebar menu injection

**Files:**
- Modify: `dorama.js` (add icon, `openCatalog`, `addMenuItem`, `start`, boot guard; extend exports)
- Test: `test/menu.test.js`

- [ ] **Step 1: Write the failing test `test/menu.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('subscribes to app ready when appready is false', () => {
  const mock = makeMock();
  loadPlugin(mock);
  assert.strictEqual(typeof mock.calls.listeners.app, 'function');
  assert.strictEqual(mock.menuList._children.length, 0); // nothing injected before ready
});

test('on ready: registers component and injects a Дорама menu item', () => {
  const mock = makeMock();
  loadPlugin(mock);
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.dorama, 'function');
  assert.strictEqual(mock.menuList._children.length, 1);
  const item = mock.menuList._children[0];
  assert.strictEqual(item.text(), 'Дорама');
  assert.match(item._html, /data-action="dorama"/);
  assert.match(item._html, /menu__ico/);
});

test('hover:enter on the menu item pushes the dorama activity', () => {
  const mock = makeMock();
  loadPlugin(mock);
  mock.calls.listeners.app({ type: 'ready' });
  mock.menuList._children[0].trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush.length, 1);
  assert.deepStrictEqual(mock.calls.activityPush[0], {
    url: '', title: 'Дорама', component: 'dorama', source: 'tmdb', card_type: true, page: 1
  });
});

test('starts immediately when appready is already true', () => {
  const mock = makeMock();
  mock.Lampa.appready = true;
  loadPlugin(mock);
  assert.strictEqual(mock.menuList._children.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/menu.test.js`
Expected: FAIL — no listener registered / no menu item (those code paths don't exist yet).

- [ ] **Step 3: Add boot + menu code to `dorama.js`**

Insert after the helpers (before the export hook). Note the component factory is referenced by `start`; a stub is added now and fleshed out in Task 5, so the file stays loadable.

```js
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M3 5.5C3 4.4 3.9 3.5 5 3.5H19C20.1 3.5 21 4.4 21 5.5V18.5C21 19.6 20.1 20.5 19 20.5H5C3.9 20.5 3 19.6 3 18.5V5.5Z" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor"/></svg>';

  function openCatalog() {
    Lampa.Activity.push({
      url: '', title: 'Дорама', component: 'dorama',
      source: 'tmdb', card_type: true, page: 1
    });
  }

  function addMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="dorama">' +
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">Дорама</div>' +
      '</li>'
    );
    item.on('hover:enter', openCatalog);
    $('.menu .menu__list').eq(0).append(item);
  }

  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
  }
```

Add the component stub just above `start` (replaced with the real factory in Task 5):

```js
  function componentDorama(object) {
    return new Lampa.InteractionMain(object);
  }
```

Add the boot guard at the very bottom, just **before** the export hook:

```js
  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
```

Extend the export hook so component tests (Task 5) can reach internals:

```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRows: buildRows,
      ANCHORS: ANCHORS,
      pickAnchors: pickAnchors,
      mergeRecommendations: mergeRecommendations,
      _start: start,
      _addMenuItem: addMenuItem,
      _component: componentDorama
    };
  }
```

> Note: each fresh `loadPlugin` gets a new `global.window`, so the `window.dorama_plugin_ready` guard does not leak between tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (rows + recos + menu).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/menu.test.js
git commit -m "feat: app-ready boot + sidebar Дорама menu injection"
```

---

## Task 5: Catalog component (create / loadCatalog / onMore / destroy)

**Files:**
- Modify: `dorama.js` (replace the `componentDorama` stub with the real factory + `loadCatalog`/fetch helpers)
- Test: `test/component.test.js`

- [ ] **Step 1: Write the failing test `test/component.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('component.create assembles recos-first catalog from TMDB requests', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const built = comp._built;
  assert.ok(Array.isArray(built), 'build() received an array');
  assert.strictEqual(built[0].title, 'В духе «Паразитов»');     // recommendation row leads
  assert.ok(built[0].results.length > 0);
  assert.strictEqual(built[1].title, 'Корейские триллеры (сериалы)'); // then curated rows in order
  // every curated discover row was requested through Lampa.TMDB
  const reqs = mock.calls.requests.join('\n');
  assert.match(reqs, /discover\/tv\?with_original_language=ko&with_genres=80\|9648/);
  assert.match(reqs, /\/recommendations/); // recommendation seeds fetched
});

test('component.onMore pushes a category_full grid for the row', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  comp.onMore({ title: 'Корейские триллеры (сериалы)', url: 'discover/tv?x=1' });
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.deepStrictEqual(push, {
    url: 'discover/tv?x=1', title: 'Корейские триллеры (сериалы)',
    component: 'category_full', source: 'tmdb', card_type: true, page: 1
  });
});

test('component.create calls empty() when every request returns no results', () => {
  const mock = makeMock({ responder: function () { return { results: [] }; } });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.strictEqual(comp._built, undefined);
  assert.strictEqual(comp._empty, true);
});

test('component.destroy clears the network request', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  comp.destroy();
  assert.ok(mock.calls.clears > 0, 'destroy() must clear the in-flight Reguest');
});

test('recommendation items are tagged with media_type for correct detail routing', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const recos = comp._built[0].results;
  recos.forEach(it => assert.ok(it.media_type === 'movie' || it.media_type === 'tv'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/component.test.js`
Expected: FAIL — `_component({})` returns a bare `InteractionMain` with no `create`/`onMore` overrides (`comp._built` stays undefined; `onMore` is not a function).

- [ ] **Step 3: Replace the `componentDorama` stub in `dorama.js` with the real factory + fetch helpers**

Replace the entire stub:

```js
  function componentDorama(object) {
    return new Lampa.InteractionMain(object);
  }
```

with:

```js
  // GET a TMDB path via Lampa, stamp media_type onto each result, return results
  // (+ total_pages) through `done`. Network errors degrade to an empty list.
  function fetchResults(network, path, mediaType, done) {
    network.silent(Lampa.TMDB.api(path), function (json) {
      var res = (json && json.results) ? json.results : [];
      var i;
      if (mediaType) for (i = 0; i < res.length; i++) {
        if (res[i] && !res[i].media_type) res[i].media_type = mediaType;
      }
      done(res, (json && json.total_pages) || 1);
    }, function () { done([], 1); });
  }

  // Assemble the whole catalog: recommendation row first, then curated rows.
  // Sequential requests keep one Reguest instance safe on old WebViews.
  function loadCatalog(network, onDone, onEmpty) {
    var rows = buildRows();
    var curated = [];
    var i = 0;

    function nextRow() {
      if (i >= rows.length) { loadRecos(); return; }
      var row = rows[i];
      fetchResults(network, row.url, row.method, function (results, totalPages) {
        if (results.length) curated.push({
          title: row.title, results: results, url: row.url,
          method: row.method, source: 'tmdb', total_pages: totalPages
        });
        i++; nextRow();
      });
    }

    function loadRecos() {
      var offset = Math.floor((window.dorama_reco_offset || 0)) % ANCHORS.length;
      window.dorama_reco_offset = offset + 5; // rotate seeds across opens
      var picked = pickAnchors(ANCHORS, 5, offset);
      var anchorIds = [], lists = [], k = 0, p;
      for (p = 0; p < picked.length; p++) anchorIds.push(picked[p].id);

      function nextAnchor() {
        if (k >= picked.length) { finish(); return; }
        var a = picked[k];
        fetchResults(network, a.type + '/' + a.id + '/recommendations', a.type, function (results) {
          lists.push(results); k++; nextAnchor();
        });
      }
      function finish() {
        var merged = mergeRecommendations(lists, anchorIds, 40);
        var out = [];
        if (merged.length) out.push({ title: 'В духе «Паразитов»', results: merged, source: 'tmdb' });
        var final = out.concat(curated);
        if (final.length) onDone(final); else onEmpty();
      }
      nextAnchor();
    }

    nextRow();
  }

  function componentDorama(object) {
    var comp = new Lampa.InteractionMain(object);
    var network = new Lampa.Reguest();

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      loadCatalog(network, function (data) {
        self.build(data);
        self.activity.loader(false);
        self.activity.toggle();
      }, function () {
        self.activity.loader(false);
        self.empty();
      });
      return this.render();
    };

    // Row "more" → open that row's full infinite-scroll grid (FR3 shape).
    comp.onMore = function (row) {
      Lampa.Activity.push({
        url: row.url, title: row.title,
        component: 'category_full', source: 'tmdb', card_type: true, page: 1
      });
    };

    var inheritedDestroy = comp.destroy ? comp.destroy.bind(comp) : function () {};
    comp.destroy = function () {
      network.clear();
      inheritedDestroy();
    };

    return comp;
  }
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `node --test`
Expected: PASS (rows, recos, menu, component).

- [ ] **Step 5: Commit**

```bash
git add dorama.js test/component.test.js
git commit -m "feat: dorama catalog component (recos-first build, onMore, destroy)"
```

---

## Task 6: Final single-file coherence check

**Files:**
- Modify: `dorama.js` (only if the syntax/whole-suite check surfaces issues)

- [ ] **Step 1: Verify the shipped file parses as standalone JS**

Run: `node --check dorama.js`
Expected: no output, exit 0 (valid syntax; ES5-safe).

- [ ] **Step 2: Confirm there are no `let`/`const`/arrow functions in the shipped file**

Run: `grep -nE '\b(let|const)\b|=>' dorama.js`
Expected: no matches (exit 1). If any appear, rewrite them to `var` / `function`.

- [ ] **Step 3: Run the complete test suite**

Run: `node --test`
Expected: PASS — all four test files green.

- [ ] **Step 4: Commit (if any edits were needed)**

```bash
git add dorama.js
git commit -m "chore: ES5 syntax sweep for shipped dorama.js"
```

---

## Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Дорама — плагин для Lampa

Плагин добавляет пункт **«Дорама»** в левое меню Lampa и открывает подборку
тёмных корейских социальных триллеров (в духе «Паразитов», «84 квадратных
метра», «Украденной личности», «Игры в кальмара») из TMDB. Каталог собран из
проверенных запросов TMDB Discover плюс лента рекомендаций «В духе Паразитов».

## Установка

1. Откройте Lampa → **Настройки → Расширения** (Settings → Расширения).
2. Добавьте плагин по ссылке (raw URL):
   ```
   https://<ваш-логин>.github.io/dorama/dorama.js
   ```
3. Перезапустите Lampa. В левом меню появится пункт **«Дорама»**.

## Что внутри

Один экран с рядами карточек (сериалы и фильмы):

1. **В духе «Паразитов»** — рекомендации TMDB по 20 эталонным тайтлам.
2. Корейские триллеры (сериалы)
3. Корейское кино: триллеры
4. Социальные триллеры (неравенство)
5. Выживание и антиутопия
6. Дом-ловушка (бетон / многоэтажка)
7. Игры разума и саспенс
8. Лучшее: корейские триллеры

Карточки открывают обычную страницу деталей Lampa; у каждого ряда есть «ещё»
(полная сетка с бесконечной прокруткой).

## Как настроить выдачу

Запросы лежат в функции `buildRows()` в `dorama.js`. Можно:

- **Расширить выдачу** — поднять/убрать `vote_count.gte` или убрать
  `with_keywords`.
- **Сменить тон** — поменять `with_genres` (помните: жанр **Триллер `53`
  существует только для фильмов**, не для сериалов `discover/tv`).
- **Добавить регион** — скопировать ряд и поменять `with_original_language`
  (`ja` — Япония, `zh` — Китай, `th` — Таиланд).
- **Поменять рекомендации** — отредактировать массив `ANCHORS` (id и тип
  `movie`/`tv` берутся из URL TMDB, напр. `themoviedb.org/movie/496243` → id
  `496243`, тип `movie`).

## Совместимость

Чистый ES5, зависит только от глобального `Lampa` и `$` (jQuery из Lampa).
Никаких внешних запросов, кроме TMDB (через встроенный источник `tmdb`).
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install + tuning instructions"
```

---

## Task 8: Manual device test + GitHub/Pages deploy

> Deploy is outward-facing — confirm with the user before running the `gh`/push steps. The manual test must be done by the user on a real Lampa client (cannot be automated here).

- [ ] **Step 1: Manual on-device test checklist (user runs in Lampa)**

  1. Serve `dorama.js` at a raw HTTPS URL (Pages, or temporarily any raw host).
  2. Settings → Расширения → paste the URL → restart Lampa.
  3. Confirm the **«Дорама»** item appears in the left menu.
  4. Open it — confirm the rows load with cards (especially «В духе Паразитов»,
     «Выживание и антиутопия», «Игры разума и саспенс»).
  5. Open a card → detail page renders (try both a series and a film).
  6. Open a row's «ещё» → full grid loads and paginates.
  7. Navigate entirely with the remote/keyboard (`hover:enter` + arrows).
  - If any row is empty on-device, relax its `vote_count.gte` (or, per spec §
    Contingency, switch the component to the manual `radio/component.js` line
    pattern if `InteractionMain.build` rejects the row shape).

- [ ] **Step 2: Create the GitHub repo and push (confirm first)**

```bash
cd "/root/projects/lampatv plugins"
gh repo create dorama --public --source=. --remote=origin --description "Lampa TV plugin: dark Korean social-thriller catalog (Дорама)" --push
```

- [ ] **Step 3: Enable GitHub Pages so the raw file is reachable (like anime.js)**

```bash
gh api -X POST repos/{owner}/dorama/pages -f "source[branch]=main" -f "source[path]=/" || \
gh api -X PUT repos/{owner}/dorama/pages -f "source[branch]=main" -f "source[path]=/"
```

Then the install URL is `https://<owner>.github.io/dorama/dorama.js`. Verify:

```bash
curl -sI "https://<owner>.github.io/dorama/dorama.js" | head -n 1   # expect: HTTP/2 200
```

- [ ] **Step 4: Put the live URL into the README and commit**

Replace `<ваш-логин>` in `README.md` with the real `<owner>`, then:

```bash
git add README.md && git commit -m "docs: pin live GitHub Pages install URL" && git push
```

---

## Self-review notes

- **Spec coverage:** FR1 boot → Task 4; FR2 menu injection → Task 4; FR3
  `category_full` push → Task 5 (`onMore`); curated rows §5 → Task 2; verified
  IDs §4 → Tasks 2–3; recommendation feed §6 → Tasks 3 & 5; error handling §8 →
  Task 5 (`empty()`/skip/`destroy`); deliverables §9 → Tasks 7–8; contingency →
  Task 8 Step 1.
- **Genre-safety invariant** (spec headline fix) is enforced by an automated test
  (Task 2 Step 1), not just prose.
- **Type consistency:** row objects carry `{title, url, method, source}` in
  Tasks 2/5; `componentDorama`, `buildRows`, `ANCHORS`, `pickAnchors`,
  `mergeRecommendations`, `loadCatalog`, `fetchResults` names are identical across
  all tasks and the export hook.
- **No placeholders:** every code/test step is complete and runnable.
