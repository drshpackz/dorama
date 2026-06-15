# «Рекомендации для Вас» — personalized Dorama recommender + Like (Design Spec)

**Date:** 2026-06-15
**Status:** Approved (design)
**Author:** drshpackz
**Builds on:** `2026-06-15-dorama-plugin-design.md` (v2) — the curated catalog.

## 1. Goal

Add a personalized **«Рекомендации для Вас»** row to the top of the Дорама
catalog, driven by the dramas the user "Likes". Each recommended item shows a
**«Совпадение xx%»** (prediction-rate) badge. The new row **replaces** the
editorial «В духе «Паразитов»» anchor row.

Approved choices:
- **Like** = Lampa's native `favorite/like` (no new storage).
- **Prediction %** = a custom card badge (bespoke `PredictionCard`).
- **Cold start** (no likes yet) = a single **prompt card**.
- **Replace** «В духе «Паразитов»» (remove `ANCHORS` / `pickAnchors` / the anchor
  row; keep `mergeRecommendations`, reused for candidate dedupe).

## 2. Verified Lampa API (from real source — do not guess)

`Lampa.Favorite` (`src/core/favorite.js`):
- `Lampa.Favorite.toggle('like', card)` — add/remove like; returns new state.
- `Lampa.Favorite.add('like', card)` / `remove('like', card)`.
- `Lampa.Favorite.check(card)` → `{like, wath, book, history, …, any}`.
- `Lampa.Favorite.get({type:'like'})` → **array of stored card objects**
  (most-recent-first). Same for `{type:'history'}`, `{type:'viewed'}`.
- Stored card fields (via `clearCard`): `id`, `source`, `genre_ids`,
  `original_language`, `origin_country`, `vote_average`, `vote_count`,
  `popularity`, `name`/`title`, `original_name`/`original_title`,
  `first_air_date`/`release_date`, `number_of_seasons`, `poster_path`, `img`.
- Change event: every add/remove/toggle fires
  `Lampa.Listener.send('state:changed', {target:'favorite', reason:'update', method, type, card})`.
  Subscribe with `Lampa.Listener.follow('state:changed', fn)`.

Cards built by Lampa's native Card factory (used by `InteractionMain` rows)
already get the long-press favorite menu (incl. «Нравится») + heart icons for
free — so the **7 curated rows need no like wiring**. Only the custom
`PredictionCard` wires Like itself.

TV-vs-movie of a stored card: `card.number_of_seasons || card.first_air_date ||
card.name` ⇒ `tv`, else `movie` (mirrors core `recomend.js`).

## 3. Catalog row order (after this change)

1. **Рекомендации для Вас** — personalized; `PredictionCard` with % badge.
   (Prompt card when there are no qualifying likes.)
2. Корейские триллеры (сериалы)
3. Корейское кино: триллеры
4. Социальные триллеры (неравенство)
5. Выживание и антиутопия
6. Дом-ловушка (бетон / многоэтажка)
7. Игры разума и саспенс
8. Лучшее: корейские триллеры

The previous «В духе «Паразитов»» row (anchor-seeded) is removed.

## 4. The recommender (deep + bounded)

All client-side, via authenticated `tmdbUrl()` (spec v2 §8) + `Lampa.Reguest`.
ES5, sequential requests.

### 4.1 Seeds
`seeds = Lampa.Favorite.get({type:'like'})` filtered to Asian dramas —
`original_language` ∈ {`ko`,`ja`,`zh`,`th`} **or** `origin_country` ∩
{`KR`,`JP`,`CN`,`TW`,`HK`,`TH`} ≠ ∅. Keep most-recent-first, cap at
`SEED_LIMIT = 8` (perf). If none qualify ⇒ **cold start** (§4.6).

### 4.2 Candidate pool (collaborative signal)
For each seed: `tmdbUrl(type + '/' + id + '/recommendations')`. Stamp each
candidate's `media_type` = seed type. Track **co-occurrence**: `coCount[id]` =
number of distinct seeds whose recommendations surfaced that candidate (the
strongest signal). If the distinct pool `< MIN_POOL = 20`, additionally fetch
`type/{id}/similar` per seed and merge. Total calls bounded to
≤ `SEED_LIMIT × 2 = 16`.

### 4.3 Taste profile (free — from stored seed fields, no calls)
- `genreWeight[g]` = (occurrences of genre `g` across seeds) ÷ (total genre
  occurrences) — a normalized genre preference in [0,1].
- `langs` = set of seed `original_language`; `topLang` = the most frequent.

### 4.4 Excludes
Drop candidates whose `id` is in `like` ∪ `history` ∪ `viewed`
(`Lampa.Favorite.get` for each), the seeds themselves, items lacking
`poster_path`, and dedupe by `id` (reuse `mergeRecommendations` with a large cap
so the full pool is scored — the top-`RESULT_LIMIT` cut happens *after* scoring
in §4.5, not here).

### 4.5 Scoring & prediction %
Per candidate `c` (weights are tunable constants):
```
co        = min(coCount[c.id], 3) / 3                         // saturating co-occurrence
genreOver = min( Σ_{g ∈ c.genre_ids} genreWeight[g], 1 )      // 0..1
langMatch = c.original_language==topLang ? 1
          : langs has c.original_language ? 0.6
          : {ko,ja,zh,th} has c.original_language ? 0.3 : 0
rating    = clamp(c.vote_average, 0, 10) / 10
votesConf = c.vote_count >= 100 ? 1 : (c.vote_count||0)/100

score = 3.0*co + 2.5*genreOver + 1.5*langMatch + 1.5*rating + 0.5*votesConf
```
`SCORE_MAX = 9.0`. Sort candidates by `score` desc; take top `RESULT_LIMIT =
20`. Prediction rate:
```
match% = round( 55 + 44 * clamp(score / SCORE_MAX, 0, 1) )    // 55..99
```
Each result carries `__match` (integer %). `buildTasteProfile`,
`scoreCandidate`, `predictionPercent` are **pure & unit-tested**.

### 4.6 Cold start
`seeds.length === 0` ⇒ the row contains one sentinel `{__prompt:true, title:
'Лайкните дорамы, чтобы получить персональные рекомендации'}`. `PredictionCard`
renders prompt mode (no poster/%; `hover:enter` shows a `Lampa.Noty`/no-op).

### 4.7 Refresh / cache
A small session cache keyed by a signature of the liked-set ids. On
`Lampa.Listener.follow('state:changed', e=>e.target==='favorite')` invalidate the
cache so the next catalog open recomputes; identical likes ⇒ instant reopen.

## 5. PredictionCard (custom card)

A self-contained ES5 card (mirrors the readable `Shikimori`/`nc.js` card
pattern), so it isn't subject to a fragile native-card contract:
- `create()` builds DOM from a template string: poster
  (`Lampa.Api.img(data.poster_path,'w300')` with graceful fallback), title,
  TMDB rating, a corner **«Совпадение {data.__match}%»** badge, and a heart shown
  when `Lampa.Favorite.check(data).like`.
- `hover:enter` → detail: `Lampa.Activity.push({component:'full', id:data.id,
  method:data.media_type, card:data, source:'tmdb'})`. (Prompt card: no-op/Noty.)
- `hover:long` → `Lampa.Favorite.toggle('like', data)`, update the heart, brief
  `Lampa.Noty`.
- `render(js)` / `destroy()`.

### Integration
The recommendations row carries `cardClass: PredictionCard`. **Risk:** whether
`InteractionMain`/`InteractionLine` honors a per-row `cardClass` must be verified
against the real source in the plan. **Contingency:** if not honored, render the
recommendations row as a manually-built `Lampa.InteractionLine` (or
`Lampa.Scroll` of `PredictionCard`s) prepended above the `InteractionMain`
content, with its own controller — fully version-robust. The plan resolves this
before implementing the card.

## 6. Error handling

- Reuses the v2 error model: `fetchResults` distinguishes a hard HTTP failure
  from empty; per-seed failures are skipped. The recommender never throws.
- If all recommendation calls fail but the user has likes, the row shows a
  visible error state (same `Lampa.Empty`/Noty path) — never a silent gap; the
  rest of the catalog still loads independently.
- A request budget + the existing 15s timeout bound latency.

## 7. File structure

Stays a single ES5 `dorama.js`. New, clearly-sectioned units (pure ones
exported under the test hook):
- `collectSeeds()`, `buildTasteProfile(seeds)`, `scoreCandidate(c, profile,
  coCount)`, `predictionPercent(score)`, `excludeSeen(cands, excludeIds)`
  (reusing `mergeRecommendations`), `loadRecommendations(network, done)`.
- `PredictionCard(data)`.
- Remove `ANCHORS`, `pickAnchors`, and the old `loadRecos`.
- `loadCatalog` prepends the recommendations row, then the 7 curated rows.

## 8. Testing

Extend the Node mock (`test/helpers/lampa-mock.js`) with `Lampa.Favorite`
(`get`/`toggle`/`check`/`add`/`remove` over an in-memory store), a `state:changed`
listener channel, `Lampa.Noty`, `Lampa.Api.img`. Tests:
- `buildTasteProfile` weights genres/language correctly.
- `scoreCandidate` ordering: co-occurrence + genre + rating dominate;
  `predictionPercent` maps to the 55–99 band; perfect overlap ⇒ ~99%.
- `excludeSeen` drops liked/history/viewed/seeds and dedupes.
- `loadRecommendations`: builds the row from canned `/recommendations`, sorts by
  match desc, caps at 20, tags `media_type`.
- Cold start: no qualifying likes ⇒ single prompt card.
- Seed filter: non-Asian likes excluded; Asian likes kept; capped at 8.
- `PredictionCard`: renders the % badge; `hover:enter` pushes `full`;
  `hover:long` calls `Lampa.Favorite.toggle('like', …)`.
- Catalog: row 1 is «Рекомендации для Вас»; «В духе Паразитов» is gone; the 7
  curated rows follow.

## 9. Acceptance criteria

1. Long-pressing any card → «Нравится» likes it (native); liking persists.
2. «Рекомендации для Вас» is the first row; «В духе Паразитов» is removed.
3. With ≥1 Asian like, the row shows personalized picks, each with a
   «Совпадение xx%» badge, sorted by match desc, excluding already-liked/seen.
4. With no likes, the row shows the prompt card.
5. Liking more dramas changes the recommendations on the next open.
6. Cards open detail normally; the row never hangs (visible error on total
   failure).
7. Code stays readable, un-obfuscated, ES5-safe, single-file.

## 10. Manual test plan (on device)

- Open Дорама → confirm «Рекомендации для Вас» is first and «В духе Паразитов»
  is gone.
- Fresh profile (no likes) → prompt card shows.
- Long-press a few Korean titles → «Нравится»; reopen Дорама → personalized row
  populates with % badges; verify liked items aren't recommended back.
- Open a recommended card → detail page; confirm the % badge renders on the
  card face.
- Verify navigation by remote (enter / long-press / arrows).
