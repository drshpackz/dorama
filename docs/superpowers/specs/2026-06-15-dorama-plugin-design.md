# Дорама — Lampa TV Catalog Plugin (Design Spec)

**Date:** 2026-06-15
**Status:** Approved (design)
**Author:** drshpackz

## 1. Goal

A single-file Lampa TV plugin that adds one **«Дорама»** entry to the left
sidebar menu. Selecting it opens a catalog page showing **four rows** of Asian
dramas (Korean / Japanese / Chinese / Thai) sourced from TMDB, reusing Lampa's
native components. Distributed as a raw HTTPS URL and published on GitHub Pages
exactly like the reference `anime.js` plugin.

Non-goals: custom card rendering, custom data sources, auth, settings UI,
anti-tamper / origin locking, obfuscation.

## 2. UX decision (FR4)

**Single sidebar entry → category-list page with 4 rows.** Chosen over (a) a
`Lampa.Select` popup submenu and (b) four separate sidebar rows. Rationale:
keeps the sidebar as clean as `anime.js` (one item), and satisfies acceptance
criterion #2 — selecting the item shows a **populated grid of dramas
immediately**, not a list of region names. Each row also exposes a "more"
affordance opening that region's full infinite-scroll grid, so all four regions
are reachable as full catalogs (AC #4).

## 3. Architecture

One file, `dorama.js`, plain ES5 IIFE (`'use strict'`, `var` only, **no arrow
functions / template literals / const-let in shipped code** — legacy TV WebView
safe). Depends only on the global `Lampa` object and `$` (jQuery, provided by
Lampa). Three concerns:

1. **Boot / lifecycle (FR1)**
   ```js
   if (window.appready) start();
   else Lampa.Listener.follow('app', function (e) { if (e.type == 'ready') start(); });
   ```

2. **Menu injection (FR2)** — append one
   `<li class="menu__item selector" data-action="dorama">` containing a
   `menu__ico` (inline SVG) and a `menu__text` reading "Дорама" to
   `$('.menu .menu__list').eq(0)`. Bind the TV-remote OK key via
   `item.on('hover:enter', openCatalog)`.

3. **Catalog component** — registered with
   `Lampa.Component.add('dorama', componentFactory)`, built on the **native
   `Lampa.InteractionMain`** class (the home-screen "rows of cards" component).
   Selecting the menu item pushes:
   ```js
   Lampa.Activity.push({
     url: '',
     title: 'Дорама',
     component: 'dorama',
     source: 'tmdb',
     card_type: true,
     page: 1
   });
   ```

### Why `InteractionMain`

`Lampa.InteractionMain` is the same class Lampa's main page uses to render
vertical stacks of horizontal card lines. It handles cards, focus/navigation,
backgrounds, the per-card → native detail page, and the per-row "more" → full
grid for us. We only supply the four row queries. This mirrors the **real,
non-obfuscated** `prisma_collections.js` plugin (see References), so the
integration is proven rather than guessed.

## 4. Data flow

`component.create()` issues **four TMDB Discover requests** (one per region),
tags each result set with a Russian row title, and passes the array of rows to
`this.build(rows)`.

Base query (shared by all rows):
```
discover/tv?with_genres=18&sort_by=popularity.desc&vote_average.gte=6&first_air_date.gte=2015-01-01
```

| Row title (RU)            | appended param                 |
|---------------------------|--------------------------------|
| Корейские дорамы          | `&with_original_language=ko`   |
| Японские дорамы           | `&with_original_language=ja`   |
| Китайские дорамы          | `&with_original_language=zh`   |
| Тайские дорамы (лакорн)   | `&with_original_language=th`   |

- **Card → enter:** native detail page via `InteractionMain`'s default card
  handler →
  `Lampa.Activity.push({ component:'full', id, method, card, source:'tmdb' })`
  (AC #3).
- **Row → "more" (`onMore`):** push the region's full grid using the **exact
  FR3 `category_full` shape**:
  ```js
  Lampa.Activity.push({
    url: 'discover/tv?with_original_language=ko&with_genres=18&sort_by=popularity.desc&vote_average.gte=6&first_air_date.gte=2015-01-01',
    title: 'Корейские дорамы',
    component: 'category_full',
    source: 'tmdb',
    card_type: true,
    page: 1
  });
  ```
  (AC #4 — every region reachable as an infinite-scroll grid.)

### Fetching

Use Lampa's TMDB plumbing. Primary: `Lampa.Api.get(url, params, onComplete,
onError)` per row, collected via a small counter (or `Lampa.Api.partNext` for
ordered lazy rows). Each response object is shaped `{ title, results:[...],
... }` to become one row passed to `build`. Hold the request handle from
`new Lampa.Reguest()` so `destroy()` can `clear()` it.

## 5. Error handling

- A region whose request fails or returns zero results is **skipped** — no
  crash, no empty row.
- If **all** four fail/empty, call `this.empty()` to show Lampa's native
  "nothing found" screen.
- `destroy()` clears the in-flight request and destroys the scroll, per the
  native lifecycle (`create / start / pause / stop / render / destroy`).

## 6. Spec reconciliation note

FR3's literal default query has **no** genre filter; FR4 requires
`&with_genres=18`. Decision: apply `with_genres=18` to all four rows (per FR4)
to keep results live-action drama (excludes pure anime for the `ja` row).
README documents how to drop `with_genres=18` to broaden results.

## 7. Deliverables / files

- `dorama.js` — the plugin (un-obfuscated, ES5).
- `README.md` — install via **Settings → Расширения** (paste raw URL); records
  the single-entry→4-row UX choice and the query-tuning notes.
- GitHub repo + GitHub Pages so the file is reachable at a public raw URL,
  packaged like `anime.js`.

## 8. Acceptance criteria

1. Loading `dorama.js` adds a "Дорама" item to the sidebar.
2. Selecting it opens a populated catalog (4 rows of real drama cards, no empty
   results).
3. Cards open detail pages normally via the native `full` component.
4. All four language regions are reachable (rows + per-region full grid).
5. Code is readable, un-obfuscated, and ES5-safe.

## 9. Manual test plan

- Install via Settings → Расширения → paste raw URL; restart Lampa.
- Confirm the "Дорама" menu item appears in the sidebar.
- Open it; verify each of the 4 rows loads cards.
- Open a card → detail page renders.
- Open a row "more" → full grid loads and paginates.
- Navigate entirely with keyboard/remote (`hover:enter` / arrows).

## 10. References (real, non-obfuscated Lampa source)

- Menu injection + appready guard + `category_full` push:
  `levende/lampa-plugins` → `prisma_collections.js`, `collection_sources.js`,
  `tmdb-networks.js`.
- `InteractionMain` / `InteractionCategory` custom component pattern
  (`create` / `onMore` / `cardRender` overrides + `Lampa.Component.add`):
  `prisma_collections.js`.
- Multi-row TMDB Discover aggregation (`Lampa.Api.partNext`, per-row `title`):
  `lampame/main` → `nc/nc.js`.
- Manual fallback (vertical `Lampa.Scroll` of horizontal lines +
  `Lampa.Controller`): `yumata/lampa-source` → `plugins/radio/component.js`,
  `plugins/radio/line.js`.
- `hover:enter` → native `full` detail shape: `yumata/lampa-source` →
  `src/components/feed.js`.

### Contingency

If `Lampa.InteractionMain`'s `build(rows)` data contract differs across the
target Lampa build and produces empty rows, fall back to the manual
`radio/component.js` + `radio/line.js` pattern (vertical scroll of horizontal
lines with a custom card), which is fully verbatim-available and version-robust.
The public API surface (`Lampa.Component.add`, `Lampa.Activity.push`,
`Lampa.Reguest`, `Lampa.Scroll`, `Lampa.Controller`) is identical either way.
