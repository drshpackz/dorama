# Broadcast (Play on TV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `broadcast.js` Lampa plugin that injects a "Play on TV" («На ТВ») button on every movie/series detail page; tapping it casts the title to another Lampa device via the built-in `Lampa.Broadcast` module.

**Architecture:** Single self-contained ES5 IIFE (`broadcast.js`), same convention as `dorama.js`/`online.js`. It hooks `Lampa.Listener.follow('full', …)` to inject a `full-start__button` after the online/torrent buttons, and on `hover:enter` calls `Lampa.Broadcast.open({ type: 'card', object: movie })` — Lampa's native cast system handles device discovery, the picker modal, and the socket send. No networking code of our own.

**Tech Stack:** Plain ES5 JavaScript (runs on old Tizen/WebOS), jQuery-style `$` (provided by Lampa), `node --test` + `test/helpers/lampa-mock.js` for tests.

**Spec:** `docs/superpowers/specs/2026-07-10-play-on-tv-design.md` (file renamed from `playontv.js` to `broadcast.js` per user request; everything else unchanged).

## Global Constraints

- ES5 only — no `let`/`const`/arrow functions/template literals in `broadcast.js` (old-TV compatibility, matches `online.js`).
- Plugin is a single file `broadcast.js`, guarded by `window.broadcast_plugin` so it initializes once.
- Button CSS class: `view--playtv`. Lang keys prefixed `playontv_` (avoids collisions with Lampa's own `broadcast*` keys).
- Feature-detect `Lampa.Broadcast` — never render a dead button.
- Test command: `node --test` (runs everything), or `node --test test/broadcast.test.js` for one file.
- Tests export internals via `module.exports` guarded by `typeof module !== 'undefined'`, mirroring `dorama.js:791`.

---

### Task 1: Extend the Lampa mock (Broadcast stub, Lang stub, store-backed `Storage.field`)

**Files:**
- Modify: `test/helpers/lampa-mock.js:19` (the `calls` object), `:72-133` (the `Lampa` object)
- Test: existing suite (`node --test`) must stay green — this task changes only test infrastructure.

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 2 relies on these exact names):
  - `calls.broadcastOpen` — array of params passed to `Lampa.Broadcast.open(params)`.
  - `makeMock({ noBroadcast: true })` — `Lampa.Broadcast` is `undefined`.
  - `makeMock({ broadcastThrow: true })` — `Lampa.Broadcast.open` throws.
  - `makeMock({ storage: { parental_control: true } })` — `Lampa.Storage.field('parental_control')` returns `true`.
  - `Lampa.Lang.add(obj)` (no-op) and `Lampa.Lang.translate(key)` (returns the key).

- [ ] **Step 1: Add `broadcastOpen` to the `calls` object**

In `test/helpers/lampa-mock.js`, extend the `calls` initializer (currently line 19) with one more key:

```js
  var calls = { activityPush: [], componentAdd: {}, listeners: {}, requests: [], clears: 0, empties: [], loaderCalls: [], toggles: 0, favToggles: [], noty: [], broadcastOpen: [] };
```

- [ ] **Step 2: Add `Broadcast` and `Lang` to the mock `Lampa` object**

Inside the `var Lampa = { … }` literal (after the `Noty` entry, line 109), add:

```js
    Lang: {
      add: function () {},
      translate: function (k) { return k; }
    },
    Broadcast: options.noBroadcast ? undefined : {
      open: function (params) {
        if (options.broadcastThrow) throw new Error('broadcast failed');
        calls.broadcastOpen.push(params);
      }
    },
```

- [ ] **Step 3: Make `Storage.field` store-backed**

Replace the `field` function inside the `Storage` IIFE (line 96):

```js
        field: function (k) { if (k in store) return store[k]; return k === 'tmdb_lang' ? 'ru' : undefined; },
```

(Only `tmdb_lang` is ever read by existing plugins — `dorama.js:579`, `anime-collections.js:54` — so the `'ru'` fallback preserves current behavior; `options.storage` already seeds `store`.)

- [ ] **Step 4: Run the full suite to verify no regression**

Run: `node --test`
Expected: all existing tests PASS (same pass count as before the change; zero failures).

- [ ] **Step 5: Commit**

```bash
git add test/helpers/lampa-mock.js
git commit -m "test(mock): Broadcast/Lang stubs + store-backed Storage.field"
```

---

### Task 2: `broadcast.js` plugin (TDD)

**Files:**
- Create: `broadcast.js`
- Create: `test/broadcast.test.js`

**Interfaces:**
- Consumes: mock capabilities from Task 1 (`calls.broadcastOpen`, `noBroadcast`, `broadcastThrow`, `storage.parental_control`, `Lang` stub); `loadPluginFile(mock, 'broadcast.js')` from `test/helpers/lampa-mock.js:149`.
- Produces: `module.exports = { _addButton, _makeButtonHtml }` from `broadcast.js`; the `'full'`-listener behavior described below. Nothing later depends on this task except README (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `test/broadcast.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPluginFile } = require('./helpers/lampa-mock');

// Fake detail-page render root. Records every button insertion as {where, btn}
// so tests can assert both placement and count. .find('.view--playtv') reflects
// insertions, which is what the plugin's idempotency check reads.
function fakeRender(opts) {
  opts = opts || {};
  var inserted = [];
  function slot(where, present) {
    return { length: present ? 1 : 0, after: function (btn) { inserted.push({ where: where, btn: btn }); } };
  }
  return {
    _inserted: inserted,
    find: function (sel) {
      if (sel === '.view--playtv') return { length: inserted.length };
      if (sel === '.view--online') return slot('online', !!opts.online);
      if (sel === '.view--torrent') return slot('torrent', !!opts.torrent);
      if (sel === '.full-start-new__buttons') return { length: opts.row ? 1 : 0, append: function (btn) { inserted.push({ where: 'row', btn: btn }); } };
      if (sel === '.full-start__buttons') return { length: 0 };
      return { length: 0 };
    }
  };
}

// Simulate the detail page finishing its render.
function fire(mock, render, movie) {
  mock.Lampa.Listener.send('full', {
    type: 'complite',
    object: { activity: { render: function () { return render; } } },
    data: { movie: movie }
  });
}

const MOVIE = { id: 42, title: 'Test Movie', original_title: 'Test Movie' };

test('injects one button after .view--online, idempotent on repeat events', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true, torrent: true });
  fire(mock, render, MOVIE);
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 1);
  assert.strictEqual(render._inserted[0].where, 'online');
  assert.ok(render._inserted[0].btn._html.indexOf('view--playtv') >= 0);
});

test('falls back to .view--torrent, then to the buttons row', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const afterTorrent = fakeRender({ torrent: true });
  fire(mock, afterTorrent, MOVIE);
  assert.strictEqual(afterTorrent._inserted[0].where, 'torrent');

  const intoRow = fakeRender({ row: true });
  fire(mock, intoRow, MOVIE);
  assert.strictEqual(intoRow._inserted[0].where, 'row');
});

test('hover:enter calls Lampa.Broadcast.open with type card and the movie', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  render._inserted[0].btn.trigger('hover:enter');
  assert.strictEqual(mock.calls.broadcastOpen.length, 1);
  assert.deepStrictEqual(mock.calls.broadcastOpen[0], { type: 'card', object: MOVIE });
});

test('no button when Lampa.Broadcast is absent', () => {
  const mock = makeMock({ noBroadcast: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('no button in child mode (parental_control set)', () => {
  const mock = makeMock({ storage: { parental_control: true } });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('Broadcast.open throwing shows a Noty and does not propagate', () => {
  const mock = makeMock({ broadcastThrow: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.doesNotThrow(() => render._inserted[0].btn.trigger('hover:enter'));
  assert.strictEqual(mock.calls.noty.length, 1);
  assert.ok(mock.calls.noty[0].indexOf('playontv_error') >= 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/broadcast.test.js`
Expected: FAIL — `Cannot find module '…broadcast.js'` (loadPluginFile requires a file that doesn't exist yet).

- [ ] **Step 3: Write `broadcast.js`**

Create `broadcast.js` (ES5 throughout):

```js
/**
 * Broadcast — «Play on TV» button for Lampa (lampa.mx).
 *
 * Adds a "На ТВ / On TV" button to every movie/series detail page. Tapping it
 * calls Lampa's built-in Broadcast module (device discovery + picker + socket
 * transport), sending type:'card' so the chosen device opens this title's
 * detail page — playback is then started on the TV itself.
 *
 * No networking of our own: if the running Lampa build has no Broadcast
 * module (or child mode is on), the button is simply not rendered.
 */
(function () {
  'use strict';

  var manifest = { name: 'Broadcast', version: '1.0.0' };

  function addLang() {
    if (!Lampa.Lang || !Lampa.Lang.add) return;
    Lampa.Lang.add({
      playontv_title: { ru: 'На ТВ', en: 'On TV', uk: 'На ТБ' },
      playontv_error: {
        ru: 'Не удалось отправить на устройство',
        en: 'Could not send to device',
        uk: 'Не вдалося надіслати на пристрій'
      }
    });
  }

  function makeButtonHtml() {
    return '<div class="full-start__button selector view--playtv" data-subtitle="' + manifest.name + ' ' + manifest.version + '">' +
      '<svg width="128" height="128" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="4" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>' +
      '<span>' + Lampa.Lang.translate('playontv_title') + '</span>' +
      '</div>';
  }

  function childMode() {
    try { return !!Lampa.Storage.field('parental_control'); } catch (e) { return false; }
  }

  function canBroadcast() {
    return !!(Lampa.Broadcast && typeof Lampa.Broadcast.open === 'function');
  }

  function addButton(render, movie) {
    if (!render || !render.find) return;
    if (!canBroadcast() || childMode()) return;
    if (render.find('.view--playtv').length) return;

    var btn = $(makeButtonHtml());
    btn.on('hover:enter', function () {
      try {
        Lampa.Broadcast.open({ type: 'card', object: movie });
      } catch (e) {
        Lampa.Noty.show(Lampa.Lang.translate('playontv_error'));
      }
    });

    // Keep ordering predictable: right after the online button when present,
    // else after torrent, else at the end of the buttons row.
    var online = render.find('.view--online');
    var torrent = render.find('.view--torrent');
    if (online.length) online.after(btn);
    else if (torrent.length) torrent.after(btn);
    else {
      var row = render.find('.full-start-new__buttons');
      if (!row.length) row = render.find('.full-start__buttons');
      if (row.length) row.append(btn);
    }
  }

  function startPlugin() {
    window.broadcast_plugin = true;
    addLang();

    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') addButton(e.object.activity.render(), e.data.movie);
    });

    // Plugin may load while a detail page is already open.
    try {
      if (Lampa.Activity.active().component === 'full') {
        addButton(Lampa.Activity.active().activity.render(), Lampa.Activity.active().card);
      }
    } catch (e) {}
  }

  if (!window.broadcast_plugin) startPlugin();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _addButton: addButton,
      _makeButtonHtml: makeButtonHtml
    };
  }
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/broadcast.test.js`
Expected: 6 tests PASS, 0 fail.

Note: the mock's `makeEl` button supports `.on()`/`.trigger()` (`test/helpers/lampa-mock.js:5-15`), and the mock `Lampa.Activity` has no `active()` — the startup fallback throws and is swallowed by its try/catch, which is the intended behavior.

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: all tests PASS (existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add broadcast.js test/broadcast.test.js
git commit -m "feat: broadcast.js — «Play on TV» button via Lampa.Broadcast (type:card)"
```

---

### Task 3: README entry + live verification

**Files:**
- Modify: `README.md` (plugin list section)

**Interfaces:**
- Consumes: `broadcast.js` from Task 2.
- Produces: nothing downstream.

- [ ] **Step 1: Add README entry**

In `README.md`, find the section listing the plugins (where `dorama.js` / `online.js` / `anime-collections.js` are described) and add a matching entry:

```markdown
### broadcast.js — «На ТВ» (Play on TV)

Adds a "Play on TV" button to every movie/series detail page. Uses Lampa's
built-in `Broadcast` module: tap → pick a paired Lampa device → the title's
detail page opens on the TV, ready to play. The button hides itself on Lampa
builds without `Broadcast` and in child mode.
```

Match the exact heading style/level and language (ru/en) of the neighboring plugin entries — mirror whatever format the README already uses.

- [ ] **Step 2: Run the full suite once more**

Run: `node --test`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README entry for broadcast.js (Play on TV)"
```

- [ ] **Step 4: Live verification (manual, user-assisted)**

This repo's norm is live-verified features. Ask the user to:
1. Load `broadcast.js` into Lampa on the phone (same way `dorama.js`/`online.js` are loaded, e.g. plugin URL).
2. Have a second Lampa device (TV) on the same account/network.
3. Open any movie → confirm the «На ТВ» button appears right after «Онлайн».
4. Tap it → Lampa's device picker appears → pick the TV → the movie's detail page opens on the TV.
5. If the picker shows no devices, that's a Lampa pairing/network issue (Broadcast discovers devices itself) — not a plugin failure; report back and we can add a "no devices" hint.

Report the outcome honestly; do not claim success without user confirmation.
