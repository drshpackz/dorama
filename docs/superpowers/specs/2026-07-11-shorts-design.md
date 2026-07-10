# Design: «Shorts» — Korean clip feed in the dorama plugin

Date: 2026-07-11. Status: approved by user.
Background research: [docs/shots-research.md](../../shots-research.md) — full teardown
of lampa.mx/CUB «Shots» (plugin architecture, API, live response shapes).

## Goal

Add a «Shorts» entry to the dorama plugin: a TikTok-style fullscreen vertical feed
of short clips from Korean (and, as filler, other Asian) movies/series, sourced
from CUB's public Shots API. Read-only v1: watch clips and jump to the TMDB card;
no recording, likes, favorites, or CUB account features.

## Decisions made

| Decision | Choice |
|---|---|
| Placement | Second left-menu item «Shorts» directly under «Дорама», indented; opens the feed directly |
| Playback UX | Custom fullscreen vertical feed (modeled on CUB's Lenta component), not the standard player |
| Content pool | Korean-first (`original_language == 'ko'`), then other Asian (`ja`, `zh`, `th`); everything else dropped |
| Sourcing | Approach A: scan public `lenta` feed + resolve languages via TMDB, cached (chosen over per-card queries — those are hundreds of mostly-empty requests) |
| Scope | Read-only; viewed-tracking local only (no `viewed` POSTs, no CUB token usage) |
| Code location | Inside `dorama.js` (repo's single-file-per-plugin style), ~300 lines + tests |

## Data source: CUB public Shots API

Base: `https://cub.rip/api/shots/` (fallback mirror `https://cubnotrip.top/api/shots/`).
Read endpoints work without authentication. Note: `lampa.mx` itself is TLS-unreachable
from the dev machine; `cub.rip` works.

- `lenta?sort=new&limit=50&page=1` — newest clips.
- `lenta?sort=from_id&id={last_id}&limit=50` — walk deeper into history for paging.
- Response wrapper: `{ secuses: true, results: [...] }` (typo `secuses` is real).
- Shot fields used: `id`, `status` (keep only `'ready'`), `file` (mp4 URL),
  `screen` (jpg thumbnail), `card_id`, `card_type` (`movie`/`tv`), `card_title`,
  `card_year`, `card_poster`, `season`, `episode`, `voice_name`, `start_point`, `end_point`.

## Components (all in dorama.js)

### 1. shortsApi
Thin fetchers over `Lampa.Reguest`/network wrapper already used in the file.
- `fetchLenta(query, done)` — GET lenta with given params; `done(results)` with `[]`
  on error. Tries `cub.rip`, falls back to `cubnotrip.top` once on hard failure.
- Filters to `status == 'ready'` and non-empty `file`.

### 2. Language resolver + cache
- Storage key `dorama_shorts_lang`: plain object `{ "<card_type>_<card_id>": "ko" | "ja" | ... }`.
  Language of a title never changes → no TTL, capped at ~500 entries (drop-oldest is
  unnecessary; simple size guard: if > 500, reset to {}).
- For unique cards missing from cache: GET TMDB `/{movie|tv}/{id}` via the existing
  `tmdbUrl()` helper, read `original_language`, store. Bounded concurrency 4
  (reuse the file's slot pattern). TMDB failure for a card → treat as unknown,
  exclude the clip this session, do not cache.

### 3. Feed builder
- Fetch 3 lenta pages: `sort=new` page 1 + two deeper `from_id` steps (~150 clips).
- Resolve languages; keep `ko` (group 1) and `ja/zh/th` (group 2).
- Order: group 1 newest-first, then group 2 newest-first.
- Locally viewed clips (Storage `dorama_shorts_viewed`, array of ids, capped at 500)
  sink to the end of their group instead of disappearing.
- Dedupe by `id`.
- Empty final list → `Lampa.Noty.show('Пока нет коротких роликов по дорамам')` and stay in menu.
- Network dead (both mirrors) → `Lampa.Noty.show` error message.
- `Lampa.Loading.start/stop` wraps the initial build.

### 4. ShortsFeed UI (fullscreen vertical feed)
Custom fullscreen overlay appended to body (like CUB's Lenta), not an Activity.
- `<video autoplay loop playsinline>` with `poster = shot.screen`, `src = shot.file`;
  thin progress bar driven by `timeupdate`.
- Info panel (bottom gradient): year, title, tags (`S-x`, `E-x`, voice name).
  The title/card area is a `selector`; OK opens the standard TMDB card:
  `Lampa.Activity.push({ component: 'full', source: 'tmdb', id: card_id, method: card_type, card: {id} })`
  (feed closes first).
- Controller `dorama_shorts` via `Lampa.Controller.add/toggle`:
  up/down = prev/next clip; left/right = move focus within panel; back = destroy
  feed and `Lampa.Controller.toggle('content')`.
- Web/touch: mouse wheel switches clips (500ms throttle); touch swipe up/down with
  threshold (copy CUB's gesture math); click on video toggles pause.
- Panel auto-hides after ~5s idle (CSS class toggle), any key/move shows it again.
- Paging: when position >= length - 3, fetch next `from_id` page (using the smallest
  seen id), language-filter it the same way, append non-duplicate results.
- Video element `error` event → auto-advance to next clip (and drop the broken one).
- On clip change: mark previous clip id viewed in `dorama_shorts_viewed`.
- Destroy: remove DOM, clear timers, restore controller.

### 5. Menu item
- `addShortsMenuItem()` mirrors `addMenuItem()`: an `<li class="menu__item selector">`
  with a shorts icon and text «Shorts», inserted **immediately after** the «Дорама»
  item (`insertAfter`), visually indented (padding-left on the text).
- `hover:enter` → build feed and open ShortsFeed.

## Error handling summary

| Failure | Behavior |
|---|---|
| Both CUB mirrors down | Noty error, nothing opens |
| TMDB lookups fail for some cards | Those clips excluded this session only |
| Zero ko+Asian clips | Noty «пока нет роликов», nothing opens |
| mp4 fails to load/play | Auto-skip to next clip |
| Feed exhausted (no more pages) | Stop paging; up/down clamps at ends |

## Testing

`test/shorts.test.js` with the existing `test/helpers/lampa-mock` +
`loadPluginFile` pattern; internals exposed via the file's existing test-export object.
- Feed ordering: ko before other Asian; newest-first within group; viewed ids sink.
- Language cache: cached cards produce no TMDB request; unknown languages excluded;
  cache size guard.
- Lenta filtering: non-`ready` and empty-`file` clips dropped; dedupe by id;
  mirror fallback on error.
- Menu: «Shorts» item inserted after «Дорама»; enter triggers feed build.
- Empty/error paths: Noty called, no overlay created.

Manual smoke test in Lampa (web) for video playback, gestures, and remote navigation.

## Out of scope (v2 candidates)

- Likes/favorites/report via CUB account token.
- Per-card `card/{id}/{type}` queries to surface the user's liked titles first.
- Recording own clips (needs CUB account + their server does the cutting).
- «Shorts» row on the Дорама catalog screen.
