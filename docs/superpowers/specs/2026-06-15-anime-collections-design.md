# Anime Collections — Lampa Plugin (Design Spec)

**Date:** 2026-06-15
**Status:** Approved (design)
**Author:** drshpackz

## 1. Goal

A new single-file ES5 Lampa plugin, `anime-collections.js`, modeled on the
cub.red `collections` plugin but for **anime**. It adds a sidebar item
**«Аниме коллекции»** that opens a **hub of grouped collection covers**
(Студии / Франшизы / Подборки); selecting a cover opens a **6-column grid** of
that collection's anime; cards open the native detail page. Ships in the
existing repo (`drshpackz/dorama`), served at
`drshpackz.github.io/dorama/anime-collections.js` — a second menu item beside
«Дорама». No external backend: collections are defined statically and sourced
from TMDB.

Non-goals: custom card UI, auth, settings, the AI row, obfuscation.

## 2. Architecture (two tiers, native components)

Plain ES5 IIFE (`'use strict'`, `var`, no arrows/let/const), depends only on
`Lampa` + `$`. Boot: `window.appready ? start() : Lampa.Listener.follow('app', …)`.
Mirrors the verified `prisma_collections.js` pattern.

- **Menu:** append `<li class="menu__item selector" data-action="anime_collections">`
  (inline SVG + «Аниме коллекции») to `$('.menu .menu__list').eq(0)`; `hover:enter`
  → `Lampa.Activity.push({ component:'anime_collections_main', title:'Аниме коллекции', page:1 })`.
- **Hub** `anime_collections_main` — `new Lampa.InteractionMain(object)`. `create()`
  builds 3 rows (`Студии`, `Франшизы`, `Подборки`) directly from the static
  `ANIME_COLLECTIONS` array (no fetch → instant). Each row's results are **cover
  cards** `{ title, poster_path:<hardcoded>, _entry }`. Per-card wiring:
  `onMenu=false`; `onEnter` → push `anime_collections_view` with the entry.
- **View** `anime_collections_view` — `new Lampa.InteractionCategory(object)`.
  `create()` fetches `object.url`; `nextPageReuest` paginates (discover only);
  renders `mapping--grid cols--6`. Each card → native detail:
  `Lampa.Activity.push({ component:'full', id, method, card, source:'tmdb' })`.
- Register all three via `Lampa.Component.add(...)`.

## 3. Collections data (`ANIME_COLLECTIONS`, verified IDs)

Each entry: `{ group:'studio'|'franchise'|'theme', title, poster:'<path>',
source:{ type:'company'|'collection'|'discover' }, url:'<tmdb path>' }`.
`poster` is a hardcoded TMDB poster_path (one iconic title per collection,
gathered + verified) → cover via `Lampa.Api.img(poster,'w300')`.

**Студии (company)** — `discover/tv?with_companies=<id>&sort_by=popularity.desc&vote_count.gte=5`
(studios skew TV; movies reachable later if needed):
Ghibli `10342`, MAPPA `21444`, ufotable `5887`, Madhouse `3464`, BONES `2849`,
Kyoto Animation `5438`, Toei Animation `5542`, Production I.G `529`,
WIT `31058`, TRIGGER `50908`, Sunrise `3153`, A-1 Pictures `13113`.

**Франшизы (collection)** — `collection/<id>`:
Dragon Ball `386410`, Naruto `23616`, One Piece `23456`, Demon Slayer `925155`,
Evangelion `96850`, Pokémon `34055`, Doraemon `148065`.

**Подборки (discover)** — anime keyword `210024`, Animation genre `16`,
`with_original_language=ja`:
- Топ аниме — `discover/tv?with_keywords=210024&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=8`
- Новинки — `discover/tv?with_keywords=210024&with_original_language=ja&sort_by=first_air_date.desc&vote_count.gte=10`
- Популярное — `discover/tv?with_keywords=210024&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=10`
- Аниме-фильмы — `discover/movie?with_keywords=210024&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=10`
- Сёнен — `discover/tv?with_keywords=210024&with_genres=16,10759&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=10`

## 4. Fetch + parse (view)

Authenticated via the same `tmdbUrl(path)` as `dorama.js` (append
`api_key=Lampa.TMDB.key()` + `language=Storage.field('tmdb_lang')`, then
`Lampa.TMDB.api`). The view's `create`/`nextPageReuest` fetch `object.url`:
- `source.type === 'collection'` → response `.parts` (finite; no pagination;
  stamp `media_type:'movie'` unless `name`/`first_air_date`).
- `company`/`discover` → response `.results` + `total_pages` (paginate).
Each result keeps its TMDB fields so the native card opens `full` with the right
`method` (tv vs movie via `name`/`first_air_date`).

## 5. Error handling

- A view fetch that fails or is empty → `this.empty()` (native "nothing found").
- Per the verified pattern, `nextPageReuest(object, resolve, reject)` calls
  `reject` on failure so InteractionCategory stops paginating cleanly.
- Hub never fetches, so it can't fail; a missing cover falls back to a generic
  placeholder image.
- `tmdbUrl` carries the api_key (avoids the 401 class of bug).

## 6. Integration risk (flagged)

Whether `Lampa.InteractionMain` honors per-cover-card `onEnter` wiring for the
hub is the one device-only unknown (the `cardRender`/`onEnter` override is
verified on `InteractionCategory`; the hub uses `InteractionMain`). The plan's
first task **verifies the exact hub→view wiring against the real
InteractionMain/line source**; documented fallback = build the hub as a manual
`Lampa.Scroll` of `Lampa.InteractionLine`s (or render the hub itself as an
`InteractionCategory` grid of covers). On-device test is the final gate.

## 7. File structure & testing

- Create: `anime-collections.js` (the plugin).
- Create: `test/anime-collections.test.js` — Node + the existing
  `test/helpers/lampa-mock.js` (extended with `Lampa.InteractionCategory`,
  `cardRender`, and `Lampa.Component`/`Activity` already present).
- Pure/testable units: `buildHubRows()` (3 groups from `ANIME_COLLECTIONS`,
  exact verified IDs/urls), `parseItems(json, source)` (collection `.parts` vs
  discover `.results`, media_type tagging), the cover-card shape, and the
  view's `onEnter`→`full` push. Menu injection + component registration tested
  via the mock (as in `dorama.js`).
- `README.md` gains an «Аниме коллекции» install line.

## 8. Acceptance criteria

1. Loading `anime-collections.js` adds «Аниме коллекции» to the sidebar.
2. Opening it shows 3 rows of collection covers (Студии/Франшизы/Подборки) with
   posters, instantly (no load spinner on the hub).
3. Selecting a studio/theme cover opens a populated 6-column grid (paginates);
   selecting a franchise cover opens its parts.
4. Cards open the native detail page (correct movie/tv routing).
5. Un-obfuscated, ES5-safe, single file; does not touch `dorama.js`.

## 9. Manual test plan (device)

- Install the second raw URL; restart Lampa; confirm «Аниме коллекции» appears.
- Open hub → 3 cover rows render with posters.
- Open Ghibli → grid of Ghibli titles; scroll → pagination loads more.
- Open Demon Slayer (franchise) → its films/parts.
- Open a card → detail page (verify a TV and a movie).
