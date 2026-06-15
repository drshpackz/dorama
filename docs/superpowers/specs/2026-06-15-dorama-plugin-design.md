# Дорама — Lampa TV Catalog Plugin (Design Spec v2)

**Date:** 2026-06-15
**Status:** Approved (design) — v2 supersedes the multi-region v1
**Author:** drshpackz

## 1. Goal

A single-file Lampa TV plugin that adds one **«Дорама»** entry to the left
sidebar menu. Selecting it opens a curated catalog page of **dark Korean
social-thrillers** (the tone of *Parasite*, *84 m² / Wall to Wall*, *Unlocked*,
*Squid Game*, *Concrete Utopia*), sourced from TMDB and rendered with Lampa's
native multi-row component. Distributed as a raw HTTPS URL and published on
GitHub like the reference `anime.js` plugin.

**Design pivot from v1:** v1 was a generic 4-region catalog (Korean / Japanese /
Chinese / Thai). The user's taste is specifically dark Korean social-thrillers,
so v2 **replaces** the multi-region layout with **Korean-focused curated rows
tuned by genre + keyword** plus a **recommendation-seeded feed**. No
Japanese / Chinese / Thai rows.

Non-goals: custom card rendering, custom data sources, auth, settings UI,
anti-tamper / origin locking, obfuscation.

## 2. UX decision

**Single sidebar entry → curated category-list page (8 rows).** Selecting
«Дорама» opens one page that immediately shows rows of real drama/film cards
(acceptance criterion: a populated grid, not a list of names). The page leads
with a personalized **«В духе Паразитов»** recommendation row, then 7 curated
Discover rows mixing series and films.

## 3. Architecture

One file, `dorama.js`, plain ES5 IIFE (`'use strict'`, `var` only, **no arrow
functions / template literals / let / const in shipped code** — legacy TV
WebView safe). Depends only on the global `Lampa` object and `$` (jQuery,
provided by Lampa). Three concerns:

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
     url: '', title: 'Дорама', component: 'dorama',
     source: 'tmdb', card_type: true, page: 1
   });
   ```

### Why `InteractionMain`

`Lampa.InteractionMain` is the class Lampa's main page uses to render a vertical
stack of horizontal card lines. It handles cards, focus/navigation,
backgrounds, the per-card → native `full` detail page, and per-row "more" → full
grid for us. We only supply the rows. This mirrors the **real, non-obfuscated**
`prisma_collections.js` plugin (`new Lampa.InteractionMain(object)` + override
`create` → `this.build(data)` + `onMore`). See §10 References.

## 4. Verified TMDB reference data

All IDs below were verified against themoviedb.org during design (workflow
`dorama-curation-research`). **Do not invent IDs; use only these.**

**Genres** — *Thriller (53) is MOVIE-ONLY; never send it to `discover/tv`.*
- TV dark-tone genres: `80` Crime, `9648` Mystery, `18` Drama, `10765` Sci-Fi & Fantasy.
- Movie dark-tone genres: `53` Thriller, `80` Crime, `9648` Mystery, `18` Drama.

**Keyword IDs** (read off anchor films' TMDB pages):
`4565` dystopia · `10349` survival · `11479` social-commentary ·
`14514` class-differences · `352649` anti-capitalist · `192311` social-class ·
`592` capitalism · `159930` inequality · `12565` psychological-thriller ·
`10714` serial-killer · `9748` revenge · `10453` con-artist ·
`286239` apartment · `33347` apartment-building · `18420` surveillance ·
`12361` hacking · `214578` smart-phone · `15156` cell-phone · `6844` stalker.

**Anchor matrix** (20 verified TMDB IDs for the recommendation feed):

| Films (movie) | id | Series (tv) | id |
|---|---|---|---|
| Parasite | 496243 | Squid Game | 93405 |
| Wall to Wall (84 m²) | 1269208 | Strangers from Hell | 89959 |
| Unlocked | 740441 | Hellbound | 106651 |
| Concrete Utopia | 729854 | The Penthouse | 99489 |
| Train to Busan | 396535 | Sweet Home | 96648 |
| Oldboy | 670 | Happiness | 135340 |
| Memories of Murder | 11423 | SKY Castle | 84327 |
| Burning | 491584 | Flower of Evil | 99494 |
| Snowpiercer | 110415 | Taxi Driver | 119769 |
| The Call | 575604 | The 8 Show | 156484 |

Caveats baked in: Snowpiercer is `original_language=en` (won't appear in `ko`
Discover rows, fine as a recommendation seed); "The 8 Show" is `tv` (limited
series), so it must be routed to the **tv** recommendations endpoint, not movie.

## 5. Catalog rows (data flow)

`component.create()` assembles the rows below and passes them to `this.build()`.
Each Discover row = one TMDB request → one row `{ title, results }`. Lampa
renders cards; card → enter opens native `full` detail; row → "more" (`onMore`)
opens that row's full grid. Quality floors and OR/AND logic are exactly as
adversarially verified (see §7).

| # | Row title (RU) | media | Discover path + query (host/api_key injected by Lampa) |
|---|---|---|---|
| 1 | **В духе «Паразитов»** | mixed | *dynamic* — recommendation feed, see §6 |
| 2 | Корейские триллеры (сериалы) | tv | `discover/tv?with_original_language=ko&with_genres=80\|9648&sort_by=popularity.desc&vote_count.gte=40` |
| 3 | Корейское кино: триллеры | movie | `discover/movie?with_original_language=ko&with_genres=53\|80\|9648&sort_by=popularity.desc&vote_count.gte=50` |
| 4 | Социальные триллеры (неравенство) | movie | `discover/movie?with_original_language=ko&with_genres=53,18&sort_by=popularity.desc&vote_count.gte=50` |
| 5 | Выживание и антиутопия | tv | `discover/tv?with_original_language=ko&with_genres=10765\|18\|9648&with_keywords=4565\|10349&sort_by=popularity.desc&vote_count.gte=10` |
| 6 | Дом-ловушка (бетон / многоэтажка) | movie | `discover/movie?with_original_language=ko&with_keywords=286239\|33347\|4565\|10349&sort_by=popularity.desc&vote_count.gte=10` |
| 7 | Игры разума и саспенс | movie | `discover/movie?with_original_language=ko&with_genres=53\|9648&with_keywords=12565\|10714\|9748&sort_by=popularity.desc&vote_count.gte=25` |
| 8 | Лучшее: корейские триллеры | movie | `discover/movie?with_original_language=ko&with_genres=53\|80&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=400&vote_average.gte=7` |

Notes:
- `|` = OR (broaden), `,` = AND (narrow). Row 4 uses `53,18` (Thriller AND
  Drama) deliberately to keep the *social-thriller* set non-empty yet on-tone.
- Rows 5 & 6 verified live as **strong** tone with healthy counts at the listed
  floors; keep vote floors low for margin.
- The `|` is passed through to TMDB; if a strict transport rejects it,
  URL-encode as `%7C` (test during implementation).

## 6. Recommendation feed — «В духе Паразитов»

The headline row, seeded from the §4 anchor matrix using TMDB's own
collaborative filtering.

- Maintain `var ANCHORS = [{id:496243,type:'movie'}, … {id:156484,type:'tv'}]`
  (all 20).
- On build, select a **bounded subset** (5 anchors per open; the rotation offset
  steps by 7 — coprime with the 20-anchor pool — so the seed mix varies widely
  across opens) to limit requests.
- For each selected anchor fetch `type + '/' + id + '/recommendations'`
  (`movie/{id}/recommendations` or `tv/{id}/recommendations`). Optionally
  supplement a thin anchor with `…/similar`.
- **Merge** all results, **dedupe by `id`**, drop the anchors themselves, keep a
  light quality gate, cap to ≈40 cards, then deliver as row 1.
- **ES5, no `Promise.all`:** use a completion counter; when all selected anchors
  have returned (success or error), assemble and emit the row. A failed anchor
  is skipped, never fatal.
- Each merged result keeps its TMDB fields + correct type so the native card
  opens the right `full` detail (movie vs tv).

## 7. Adversarial-verification record (why these rows)

The candidate rows were adversarially verified; the following were **fixed or
dropped** and must not be reintroduced:
- *Корейские дорамы (TV) with Drama OR* → tone too generic; **dropped Drama**,
  row 2 uses `80|9648`.
- *Социальные триллеры with 4 keyword AND* → Korean∩keywords **empty**; row 4
  switched to `with_genres=53,18`.
- *Классовая война (TV) + keywords* → **broken** (SKY Castle / Penthouse don't
  carry those keywords; capitalism/inequality skew Western-documentary).
  **Dropped**; those titles surface via the recommendation feed (they are
  anchors) + rows 2–4.
- *Цифровая паранойя (movie, smartphone keywords)* → Korean pool too small,
  **likely empty**. **Dropped**; covered by the *Unlocked* anchor (740441) in
  the recommendation feed.
- *Лучшее with bare `vote_average.desc`* → diluted/sort-trap; row 8 adds
  `without_genres=99,10770` and `vote_average.gte=7`.

## 8. Error handling

- A row whose request fails or returns empty is **skipped** — no crash, no empty
  row. If **all** rows fail, call `this.empty()` (native "nothing found").
- The recommendation feed tolerates per-anchor failures (counter pattern).
- `destroy()` clears in-flight requests (`new Lampa.Reguest().clear()`) and
  destroys the scroll, per the native lifecycle
  (`create / start / pause / stop / render / destroy`).

## 9. Deliverables / files & acceptance criteria

**Files:** `dorama.js` (the plugin, un-obfuscated ES5); `README.md` (install via
**Settings → Расширения**, paste raw URL; documents the Korean-dark-thriller
curation, the row list, and how to tune `vote_count.gte` / add a region);
GitHub repo + Pages so the file is reachable at a public raw URL, packaged like
`anime.js`.

**Acceptance criteria:**
1. Loading `dorama.js` adds a "Дорама" item to the sidebar.
2. Selecting it opens a populated catalog: the 8 curated rows render real cards
   (no empty rows under normal TMDB availability).
3. The «В духе Паразитов» row populates from anchor recommendations.
4. Cards open detail pages normally via the native `full` component (movie & tv).
5. Per-row "more" opens that row's full grid.
6. Code is readable, un-obfuscated, and ES5-safe.

## 10. References (real, non-obfuscated Lampa source)

- Menu injection + appready guard + `category_full` push:
  `levende/lampa-plugins` → `prisma_collections.js`, `collection_sources.js`,
  `tmdb-networks.js`.
- `InteractionMain` / `InteractionCategory` custom component pattern
  (`create` / `onMore` / `cardRender` overrides + `Lampa.Component.add`):
  `prisma_collections.js`.
- Multi-row TMDB aggregation / per-row `title` (`Lampa.Api.partNext`):
  `lampame/main` → `nc/nc.js`.
- Manual fallback (vertical `Lampa.Scroll` of horizontal lines +
  `Lampa.Controller`): `yumata/lampa-source` → `plugins/radio/{component,line}.js`.
- `hover:enter` → native `full` detail shape: `yumata/lampa-source` →
  `src/components/feed.js`.

### Contingency

If `Lampa.InteractionMain`'s `build(rows)` data contract differs on the target
Lampa build and yields empty rows, fall back to the manual
`radio/component.js` + `radio/line.js` pattern (vertical scroll of horizontal
lines with a custom card). The public API surface (`Lampa.Component.add`,
`Lampa.Activity.push`, `Lampa.Reguest`, `Lampa.Scroll`, `Lampa.Controller`,
`Lampa.TMDB`) is identical either way.
