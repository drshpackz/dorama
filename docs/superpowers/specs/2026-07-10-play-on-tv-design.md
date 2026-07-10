# Play on TV — Design

**Date:** 2026-07-10
**Status:** Approved for planning

## Goal

Add a **"Play on TV"** button to every movie/series detail page in Lampa. Tapping
it casts that title to another Lampa device (e.g. an Android TV box) so the movie
opens on the TV, where the existing «Онлайн»/torrent buttons are ready to play.

## Chosen mechanism

Reuse Lampa's built-in **`Lampa.Broadcast`** module — the native "cast to another
Lampa" system. We do **not** build any networking, discovery, or socket code.

`Lampa.Broadcast` already:

- Discovers reachable Lampa devices over Lampa's Socket transport (polls ~every 3s),
  and excludes the CUB cloud and the current device from the target list.
- Exposes `Lampa.Broadcast.open({ type, object })`, which shows Lampa's own
  device-picker modal and sends the command:
  - `type: 'card'` → `Socket.send('open', …)` → the target device **opens the
    title's detail page**.
  - `type: 'play'` → mirrors an already-playing stream (not used here).
- Disables itself in child mode.

Our button calls `Lampa.Broadcast.open({ type: 'card', object: movie })`. Because
nothing is playing yet on a detail page, `'card'` is the correct, reliable choice:
the TV opens the movie so the user finishes on the TV remote. No balancer/quality
guessing.

## Non-goals (YAGNI)

- No auto-play of the first online source on the TV (fragile; explicitly rejected).
- No custom device-picker UI — we use Lampa's.
- No DLNA/UPnP, Chromecast, or direct-LAN-HTTP transports.
- No custom pairing/setup flow — we rely on whatever devices `Lampa.Broadcast`
  already sees.

## Component

Single new plugin file: **`playontv.js`** — a self-contained IIFE, matching the
existing one-file-per-plugin convention (`dorama.js`, `online.js`,
`anime-collections.js`). Guarded by a `window.playontv_plugin` flag so it
initializes once.

### Integration point

Same hook the online plugin uses ([online.js:2603-2618](../../../online.js#L2603-L2618)):

```js
Lampa.Listener.follow('full', function (e) {
  if (e.type === 'complite') addButton(e.object.activity.render(), e.data.movie);
});
// plus the "already on full when plugin loads" fallback:
if (Lampa.Activity.active().component === 'full') { … }
```

### `addButton(renderRoot, movie)`

1. **Idempotency:** return early if `.view--playtv` already exists in `renderRoot`.
2. **Gates (don't render the button at all if any fail):**
   - `Lampa.Broadcast` and `Lampa.Broadcast.open` exist (feature-detect the running build).
   - Not in child mode (`Lampa.Storage.field('parental_control')` truthy → skip).
3. Build the button from an HTML template: `full-start__button selector view--playtv`
   with a TV/cast SVG icon and a localized `<span>` label.
4. **Placement:** insert **after** the online button (`.view--online`) if present,
   else after `.view--torrent`, else append into the `.full-start__buttons` /
   `.full-start-new__buttons` row — so ordering is predictable regardless of which
   other plugins loaded.
5. **`hover:enter` handler:** `Lampa.Broadcast.open({ type: 'card', object: movie })`.
   Wrap in try/catch; on throw, `Lampa.Noty.show(<localized error>)`.

### Localization

Register strings via `Lampa.Lang.add` with keys under a `playontv_` prefix:

| Key | ru | en | uk |
|-----|----|----|----|
| `playontv_title` | На ТВ | On TV | На ТБ |
| `playontv_error` | Не удалось отправить на устройство | Could not send to device | Не вдалося надіслати на пристрій |

Label text = `Lampa.Lang.translate('playontv_title')`.

### Icon

Inline SVG (TV/screen glyph) consistent in stroke weight with the existing
online-button SVG, so the button row looks native.

## Data flow

```
detail page renders → 'full' complite → addButton() injects «На ТВ»
user taps «На ТВ» → Lampa.Broadcast.open({type:'card', object: movie})
  → Lampa device-picker modal (Lampa's own)
  → user picks TV → Socket.send('open', …)
  → TV Lampa opens the movie detail page
```

## Error handling

- Missing/older Lampa without `Lampa.Broadcast` → button not rendered (no dead button).
- No other devices discovered → Lampa's own picker shows its empty/only-self state
  (Broadcast excludes self); we don't reimplement that.
- `open()` throws → `Lampa.Noty.show(playontv_error)`.
- Child mode → button not rendered.

## Testing

Follow the existing `node --test` + `test/helpers/lampa-mock.js` convention.

1. **Export internals for tests:** at the bottom of `playontv.js`, when
   `typeof module !== 'undefined' && module.exports`, export
   `{ _addButton, _makeButtonHtml }` (mirrors how `dorama.js` exposes `_…` hooks).
2. **Extend `lampa-mock.js`** with a `Broadcast` stub that records `open(params)`
   calls, plus a way to toggle it absent (to test the feature-detect gate) and a
   `parental_control` storage field (to test the child-mode gate). The `'full'`
   listener path is already supported via `Listener.send('full', ev)`.
3. **`test/playontv.test.js` cases:**
   - Injects exactly one `.view--playtv` button on `full` complite; idempotent on repeat.
   - `hover:enter` calls `Broadcast.open` once with `{ type:'card', object: movie }`.
   - Button **not** injected when `Lampa.Broadcast` is absent.
   - Button **not** injected in child mode.
   - `open()` throwing triggers `Lampa.Noty.show` and does not throw out of the handler.
4. **Live verification** (per repo norm of live-verified features): load `playontv.js`
   on two real Lampa devices on the same account/network, open a movie, tap «На ТВ»,
   confirm the TV opens that movie's detail page.

## Files touched

- `playontv.js` — new plugin (~50–70 lines incl. template + lang).
- `test/helpers/lampa-mock.js` — add `Broadcast` stub + child-mode field.
- `test/playontv.test.js` — new test file.
- `README.md` — add the plugin to the plugin list (short entry).
