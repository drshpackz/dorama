# Graded reactions + global dislike + badge fix (Design Spec)

**Date:** 2026-06-15
**Status:** Approved (design)
**Author:** drshpackz
**Builds on:** `2026-06-15-dorama-recommendations-design.md` (the «Рекомендации для Вас» recommender).

## 1. Goal

Make recommendations respond to **graded feedback** — Lampa's native likes
(`Favorite`) **and** its 5-level reactions (`mine_reactions`) — and let dislikes
push matching content **down across the whole catalog**. Also **fix the missing
«Совпадение %» badge** by switching the recommendations row to standard Lampa
cards and injecting the badge via the `line` event.

Approved choices: graded weights 🔥→💩; 💩Плохо excludes from recs + pushes
look-alikes to the **end of every row**; 😴Скука mild down-rank; standard cards
+ injected badge. (AI-подборка row with a BYO key in settings is a **separate
later project** — not in this spec.)

## 2. Verified Lampa API (real source)

- **Reactions (own picks, local, enumerable):**
  `Lampa.Storage.get('mine_reactions', {})` → `{ '<media>_<tmdbId>': ['<type>', …] }`
  where `<media>` is `tv`|`movie` and `<type>` ∈ `fire`(Супер) / `nice`(Неплохо)
  / `think`(Смотрибельно) / `bore`(Скука) / `shit`(Плохо). A title may hold
  multiple types (take the strongest). Forward-only, device-local; gated by the
  reactions setting (absent → empty object → degrade gracefully).
  Live refresh: `Lampa.Storage.listener.follow('change', e => e.name==='mine_reactions')`.
- **Likes:** `Lampa.Favorite.get({type:'like'})`; change event `Lampa.Listener.follow('state:changed', e => e.target==='favorite')`.
- **Badge:** standard cards only. `Lampa.Listener.follow('line', e => …)`; payload
  `{type, data (row obj), items (Card instances), body, …}`; `type` ∈
  `append`/`visible`/… . Inject into `$(item.render(true)).find('.card__view')`
  (the sized `position:relative; padding-bottom:150%` box), reading
  `item.data.__match`. Guard against duplicates; handle `append` **and**
  `visible` (lazy card creation).

## 3. Signal model → weights

For each rated title compute a single signed weight (likes + reactions combined):

| Source | Weight |
|---|---|
| 🔥 fire (Супер) | **+2.0** |
| ❤️ like + 👍 nice | **+1.0** |
| 🤔 think (Смотрибельно) | **+0.5** |
| 😴 bore (Скука) | **negative (mild)** |
| 💩 shit (Плохо) | **negative (strong)** |

Combine rules (per title):
- If reacted 💩shit → **strong-negative** (overrides any like/positive — the user
  explicitly disliked it).
- Else if reacted 😴bore → **mild-negative**.
- Else **positive weight** = max(best positive reaction weight, like ? 1.0 : 0)
  `+ 0.5` if it has *both* a like and a positive reaction; capped at **2.5**.
- A title with no signal contributes nothing.

`gradeOf(types, liked)` (pure) returns `{ sign: 'pos'|'mildNeg'|'strongNeg'|'none', weight }`.

## 4. Positive engine — «Рекомендации для Вас»

As in the prior recommender, but **weighted** and **dislike-aware**:
- **Positive seeds** = titles whose `gradeOf` sign is `pos`, Asian-drama filtered
  (§ prior spec), most-recent-first, capped at `SEED_LIMIT=8`. Each carries its
  weight.
- Per seed: `(tv|movie)/{id}/recommendations` (+ `/similar` when distinct pool <
  `MIN_POOL=20`).
- **Weighted co-occurrence:** `coScore[id]` += the seed's weight for each distinct
  seed that surfaced the candidate (a 🔥 seed contributes 2.0, a 🤔 seed 0.5).
- **Taste profile:** genre/language frequencies weighted by seed weight.
- `scoreCandidate` uses weighted-co + weighted genre overlap + language + rating
  (same shape, `co` term now driven by `coScore`, normalized).
- **Exclude:** rated (like ∪ all reactions) ∪ history ∪ viewed ∪ seeds ∪ the
  **dislike set** (§5). Drop items without `poster_path`. Dedupe.
- Top `RESULT_LIMIT=20`, each stamped `__match` = `predictionPercent(score)`.
- Results are **plain TMDB objects** with `__match` (no `params.createInstance`)
  → standard cards; the row carries `personal:true` so the badge listener (§6)
  decorates it.

## 5. Global dislike set + catalog-wide de-prioritization (new)

Build a **dislike set** from negative-reacted titles (computed once per open,
cached by the negative-set signature, refreshed on `mine_reactions` change;
negatives capped at `DISLIKE_LIMIT=6`, ≤1–2 calls each):
- `strongIds` = 💩shit title ids; `strongSimilar` = union of their
  `/recommendations` (+ `/similar` if thin) — the look-alikes.
- `mildIds` = 😴bore title ids; `mildSimilar` = their `/recommendations`.
- `dislikeRank(id)` → `2` if id ∈ strongIds∪strongSimilar, `1` if id ∈
  mildIds∪mildSimilar, else `0`.

Apply:
- **Recommendations row:** exclude every id with `dislikeRank > 0`.
- **Every curated row (all 7):** `reorderByDislike(results)` — a **stable** sort
  by `dislikeRank` ascending, so normal items stay first (original order),
  😴-similar sink below them, 💩-similar go last. **Nothing is removed** (discover
  rows stay full); items are only re-ordered.

Rationale for using TMDB look-alikes (not a genre profile): the catalog is all
Korean thrillers, so a genre-based dislike would sink everything — TMDB's
per-title similar lists are precise enough to push only true look-alikes down.

## 6. Badge fix — standard cards + `line` injection

- The recommendations row uses **standard Lampa cards** (they render correctly
  and gain native Реакции/Нравится for free — you can react to a recommendation,
  which feeds back into §3 on next open).
- `registerMatchBadge()` (called once in `start()`):
  ```js
  Lampa.Listener.follow('line', function (e) {
    if (e.type !== 'append' && e.type !== 'visible') return;
    if (!e.data || !e.data.personal || !e.items) return;
    for (var i = 0; i < e.items.length; i++) {
      var item = e.items[i];
      var el = item && item.render ? $(item.render(true)) : null;
      if (!el || !el.find) continue;
      var view = el.find('.card__view');
      var pct = item.data && item.data.__match;
      if (!view.length || !pct || view.find('.dorama-match').length) continue;
      view.append('<div class="dorama-match" style="position:absolute;left:0.3em;top:0.3em;z-index:2;background:rgba(0,0,0,0.7);color:#7ed957;font-weight:700;padding:0.2em 0.5em;border-radius:1em;pointer-events:none">' + pct + '%</div>');
    }
  });
  ```
- **Remove** `PredictionCard` / `makePredictionCard` / the `params.createInstance`
  stamping (the custom card is replaced by this approach).

## 7. Cold start

No positive signals (no likes, no positive reactions) → the recommendations row
contains **one prompt item** `{ __prompt:true, title:'Лайкните или оцените
дорамы, чтобы получить персональные рекомендации' }` rendered as a standard card.
The badge listener, seeing `e.data.personal` + `item.data.__prompt`, skips the %
badge and ensures the prompt title is visible (hides the broken-poster img,
centers the text). On-device verification is the gate; contingency: if the
single-card prompt looks off on the target build, fall back to omitting the row
and showing a one-time `Lampa.Noty` hint on first open.

## 8. Refresh & caches

- `recsCache` keyed by the **positive-signal signature** (liked ids + positive
  reaction ids).
- `dislikeCache` keyed by the **negative-signal signature** (shit/bore ids).
- Both invalidated by `state:changed` (favorites) **and** `Storage 'change'`
  where `e.name==='mine_reactions'`. Identical signals ⇒ instant reopen.

## 9. Performance

Bounded, sequential (ES5, one `Reguest`): positive seeds ≤8 (×1–2 calls),
negative seeds ≤6 (×1–2 calls, cached), 7 curated discover calls. Recompute only
when signals change; otherwise served from cache. The per-row `reorderByDislike`
is a cheap in-memory stable sort.

## 10. File structure (single ES5 `dorama.js`)

New/changed units (pure ones exported under the test hook):
- `REACTIONS` map + `gradeOf(types, liked)` (pure).
- `collectReactions()` → `[{ id, media, types }]` from `mine_reactions`;
  `reactionKey(card)` = `(card.name?'tv':'movie')+'_'+card.id`.
- `collectGradedSeeds()` → positive seeds with weights; `collectNegatives()`.
- `buildDislikeSet(network, done)` → `{ strong:{}, mild:{} }` id-maps, cached.
- `reorderByDislike(results, dislikeSet)` (pure) → stable de-prioritized array.
- `registerMatchBadge()` — the `line` listener.
- Updated `loadRecommendations` (weighted + exclude dislike set; standard cards),
  `loadCatalog` (build dislike set first, exclude in recs, `reorderByDislike` each
  curated row), `start()` (register badge listener + the `mine_reactions` change
  listener).
- **Removed:** `PredictionCard`, `makePredictionCard`, the createInstance stamping.

## 11. Testing (Node mock)

Extend the mock: `Lampa.Storage.get/set` backed by an in-memory store seeded with
a `mine_reactions` option + a `Storage.listener.follow('change', …)` channel;
`Lampa.Listener.send('line', …)` dispatch; mock Card items exposing
`render(true)` → an element with `.find('.card__view')` and `data`.

Tests:
- `gradeOf`: each reaction → correct sign/weight; shit overrides like; like+nice
  bonus capped at 2.5; bore → mildNeg.
- `collectGradedSeeds`: positives only, weighted, Asian-filtered, capped;
  shit/bore excluded from positives.
- weighted `scoreCandidate`: a 🔥-surfaced candidate outranks a 🤔-surfaced one.
- `buildDislikeSet`: strong/mild id maps from negative seeds' recs/similar.
- `reorderByDislike`: stable — normals first, 😴 below, 💩 last; nothing removed.
- `loadRecommendations`: excludes the dislike set + rated/seen; standard-card
  results (no `params.createInstance`); cold-start prompt item.
- `registerMatchBadge`: simulate a `line` `append` with `data.personal` + items
  carrying `__match` → a `.dorama-match` badge injected once (idempotent on
  repeat events); skipped for non-personal rows and for `__prompt` items.
- `loadCatalog`: recs row first; each curated row reordered so a dislike-similar
  id sinks to the end; refresh on `mine_reactions` change invalidates caches.

## 12. Acceptance criteria

1. Reacting 🔥/👍/🤔 (or liking) a title makes similar titles surface higher in
   «Рекомендации для Вас»; the more signals, the sharper.
2. Reacting 💩Плохо excludes look-alikes from recs **and** pushes them to the end
   of every curated row; 😴Скука mildly down-ranks them.
3. Recommendation cards show the **«Совпадение xx%»** badge and support native
   reactions/like.
4. Recommendations & dislike ordering update after new reactions/likes (next open).
5. No likes/reactions → the prompt; total failure → visible error; never a hang.
6. Single-file, un-obfuscated, ES5-safe.

## 13. Manual test plan (device)

- Open Дорама; with no signals confirm the prompt.
- React 🔥 on 2–3 Korean titles (or like them); reopen → recs fill with %
  badges, ranked, excluding rated titles.
- React 💩Плохо on a distinctive title; reopen → its look-alikes drop to the end
  of the curated rows and vanish from recs.
- Confirm a recommendation card's long-press shows Реакции; react there → next
  open reflects it.
