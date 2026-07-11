# Design: Shorts panel v2 — poster/actions block + taste-driven feed order

Date: 2026-07-11. Status: approved by user.
Builds on: [2026-07-11-shorts-design.md](2026-07-11-shorts-design.md) (shipped, merge 2b865e7).

## Goal

Inside the Shorts player: a static bottom-left block with the title's poster and
info plus action buttons (open card / like / watch-later / "less like this"),
and a feed ordering upgrade: taste tiers inside the existing ko-first grouping,
driven by the dorama recommendation signals plus Shorts-local 👎 feedback.

## Decisions made

| Decision | Choice |
|---|---|
| Save/favorite target | The SHOW, via Lampa native favorites (`like`, `book`) — not CUB clip-likes |
| Priority model | Taste tiers inside ko-first (language stays the outer rule) |
| "Up/down" buttons | On-screen focusable buttons (←/→ + OK); ↑/↓ remain prev/next navigation |
| 👎 semantics | Shorts-local only (`dorama_shorts_taste`), never writes Lampa reactions |
| Panel visibility | Always visible; dims on idle (replaces today's full hide) |

## 1. UI — static bottom-left block

Replaces the current hide-on-idle panel content:

- Poster thumbnail (from `shot.card_poster` via `Lampa.Api.img`, fallback: hidden
  box), title, year, S/E + voice tags — bottom-left, over the existing gradient.
- Button row under the info: `[❤ Нравится] [🔖 Позже] [👎 Меньше такого]`.
- Focus model: a `focusables` array `[poster, like, book, less]`; ←/→ moves the
  focus index (wraps at ends is NOT required — clamp), OK activates the focused
  element. Default focus = poster. Focus rendered with a `.focus` class (white
  pill, like Lampa selectors).
- Poster activation → destroy feed → `Lampa.Activity.push({component:'full', ...})`
  (existing openCard).
- ❤ / 🔖 are toggles: filled/active class reflects
  `Lampa.Favorite.check(card).like/.book`; activation calls
  `Lampa.Favorite.toggle('like'|'book', card)` where `card` is built from shot
  fields: `{ id: +card_id, title/name per type, poster_path: card_poster, release_date/first_air_date: card_year, original_language: <from meta cache, best effort> }`
  (tv shots set `name`+`original_name`, movies `title`+`original_title` — the
  same duck-typing the rest of the plugin uses).
- 👎 toggle: active state from the taste store; toggling on removes an existing ❤
  boost for that card in the store (they are mutually exclusive there), and vice
  versa. 👎 does NOT auto-skip the current clip.
- Idle (5s): panel gets `--idle` class → opacity ~0.35 (progress bar unchanged);
  any key/mouse/touch restores. No full hide anymore.
- Marking viewed, wheel/swipe, paging, destroy semantics: unchanged.

## 2. Feed ordering — taste tiers inside ko-first

New pure function `orderShortsV2(shots, metaMap, viewedIds, taste)` replacing
`orderShorts` at the call sites (old function may be deleted; tests updated):

Inputs:
- `metaMap[cardKey] = { lang: 'ko', genres: [18, 53, ...] }` (see §3)
- `taste` = `{ boostCards: {cardKey:1}, sinkCards: {cardKey:1}, genreAdj: {gid:±w} }`
  built by `buildShortsTaste()` from: dorama `collectSignals().positives`
  (card keys + their genre weights via `buildTasteProfile` on enriched seeds is
  NOT re-run here — see below) and the Shorts-local store.

To keep it cheap and local (no TMDB seed enrichment in the Shorts path):
- `boostCards` = positives from `collectSignals()` (keys `media_id` → cardKey
  format `media + '_' + id`) **plus** ❤-ed cards from the Shorts store.
- `sinkCards` = 👎-ed cards from the Shorts store.
- `genreAdj` = for each ❤/👎-ed card in the Shorts store whose genres are in
  `metaMap`: `+0.5 / -0.5` per genre occurrence, summed, clamped to [-1.5, +1.5]
  per genre. (dorama's full genre profile is NOT recomputed here — the liked-title
  tier already carries the strongest dorama signal; genreAdj covers "more/less of
  this flavor".)

Ordering:
1. Tier 0: `boostCards` clips (not sunk), newest-first
2. Tier 1: ko clips with genre score > 0, sorted by score desc (stable; ties keep
   incoming order). Genre score = Σ `genreAdj[gid]` over the clip's genres.
3. Tier 2: remaining ko, incoming order
4. Tier 3: other Asian (ja/zh/th), same split: positive-score first, then rest
5. Tail: `sinkCards` clips, incoming order
- Viewed-sink applies WITHIN each tier (fresh before seen), as today.
- Unknown-language clips still dropped entirely.

Re-ordering happens on feed build and on each loadMore page (pages are ordered
before append, as today) — toggling ❤/👎 does NOT live-reshuffle the already
playing feed (next build reflects it).

## 3. Data / storage

- `dorama_shorts_meta` (replaces `dorama_shorts_lang`): `{ cardKey: { lang, genres: [ids] } }`,
  filled from the SAME TMDB detail response used for language (fields
  `original_language`, `genres[].id`) — zero extra requests. Size guard 500 as
  before. Migration: on first read, if `dorama_shorts_meta` missing and
  `dorama_shorts_lang` exists, convert `{key: lang}` → `{key: {lang, genres: []}}`
  once and continue; `dorama_shorts_lang` is no longer written.
- `dorama_shorts_taste`: `{ up: { cardKey: 1 }, down: { cardKey: 1 } }`, each map
  capped at 100 entries (oldest-insertion dropped — store as arrays of keys
  internally if simpler: `{ up: [cardKey,...], down: [...] }`, cap 100, no dups,
  mutual exclusion up/down).
- `resolveShortsLanguages` is renamed/extended to `resolveShortsMeta(network, shots, done)`
  → `done(metaMap)`; same concurrency/caching/failure semantics (failed lookups
  absent and uncached). Downstream `orderShorts` call sites updated. Test exports
  updated accordingly (`_resolveShortsMeta`, `_orderShortsV2`, `_buildShortsTaste`,
  `_shortsTasteToggle`).

## 4. Error handling / edge cases

| Case | Behavior |
|---|---|
| No signals at all (fresh user) | taste = empty → tiers collapse to today's ko→Asian order |
| Poster URL broken/missing | poster box hidden; focus skips it (title block stays) |
| `Lampa.Favorite` missing (old build) | ❤/🔖 buttons hidden; 👎 still works |
| genres missing for a card (old cache migration) | genre score 0; tier by language only |
| ❤ then 👎 same title | last action wins; the other is removed from the store |
| Storage caps | meta 500 (reset), taste 100/side (drop oldest) |

## 5. Testing

`test/shorts.test.js` additions (mock already has Favorite with toggle/check):
- `orderShortsV2`: tier order (boost > ko-scored > ko-rest > asian > sink), viewed
  sink within tier, empty taste = old behavior, sink beats boost when both set
  (impossible via store, but function must not crash — sink wins).
- `buildShortsTaste`: positives from collectSignals become boostCards; up/down
  store round-trip; genreAdj computed from metaMap and clamped; mutual exclusion.
- `resolveShortsMeta`: stores {lang, genres} from TMDB response; one-time
  migration from `dorama_shorts_lang`; cache-hit produces no request (as before).
- Card builder for Favorite.toggle: tv vs movie field shapes.
- Manual smoke: focus ring across poster/buttons, OK activation, ❤ appears in
  Lampa's «Нравится», panel dim-not-hide on idle.

## Out of scope

- CUB clip-likes (token) — still v2+ candidate.
- Live feed reshuffle on toggle; auto-skip on 👎.
- Writing `mine_reactions` from Shorts.
