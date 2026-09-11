'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPluginFile } = require('./helpers/lampa-mock');

function load(mock) { return loadPluginFile(mock || makeMock(), 'kazakh.js'); }

// Discover answers: `n` poster cards (ids from `base`) plus one poster-less card.
function page(base, n) {
  const results = [];
  for (let i = 0; i < n; i++) results.push({ id: base + i, title: 'kz' + (base + i), original_language: 'ru', genre_ids: [18, 80], poster_path: '/p' + (base + i) + '.jpg' });
  results.push({ id: base + 999, title: 'no poster', original_language: 'ru' });
  return { results: results, total_pages: 3 };
}

// Movie-only TMDB genres: a discover/tv url carrying one returns nothing.
const MOVIE_ONLY = ['53', '36', '10752', '10749', '27', '28', '12', '14', '878', '10402'];
const KZ_PEOPLE = ['236013', '1184875', '1927559'];

test('every catalog row is a TMDB discover row whose method matches its path', () => {
  const rows = load()._buildCatalogRows();
  assert.ok(rows.length >= 20);
  rows.forEach(r => {
    assert.match(r.url, /^discover\/(tv|movie)\?/);
    assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
    assert.strictEqual(r.source, 'tmdb');
  });
  assert.strictEqual(new Set(rows.map(r => r.title)).size, rows.length, 'row titles are unique');
});

test('INVARIANT: every row is scoped to Kazakhstan', () => {
  load()._buildCatalogRows().forEach(r => {
    const people = /with_people=(\d+)/.exec(r.url);
    const scoped = r.url.indexOf('with_origin_country=KZ') >= 0 ||
      r.url.indexOf('with_original_language=kk') >= 0 ||
      r.url.indexOf('with_companies=') >= 0 ||
      (people && KZ_PEOPLE.indexOf(people[1]) >= 0);
    assert.ok(scoped, 'unscoped row: ' + r.url);
  });
});

test('INVARIANT: no discover/tv row uses a movie-only genre', () => {
  load()._buildCatalogRows().forEach(r => {
    if (r.url.indexOf('discover/tv') !== 0) return;
    const m = /with_genres=([^&]*)/.exec(r.url);
    (m ? m[1].split(/[|,]/) : []).forEach(g => assert.ok(MOVIE_ONLY.indexOf(g) < 0, 'tv row with movie genre ' + g + ': ' + r.url));
  });
});

test('every catalog row carries the BL/gay keyword exclusion', () => {
  const api = load();
  api._buildCatalogRows().forEach(r => assert.ok(r.url.indexOf('without_keywords=' + api.BL_KEYWORDS) >= 0, r.url));
});

test('newest rows are bounded by the injected date', () => {
  const rows = load()._buildDynamicRows(new Date('2026-09-11T12:00:00Z'));
  assert.match(rows[0].url, /primary_release_date\.lte=2026-09-11&primary_release_date\.gte=2025-03-20/);
  assert.match(rows[1].url, /first_air_date\.lte=2026-09-11&first_air_date\.gte=2024-03-25/);
});

test('isKazakh: kk language, KZ origin_country or KZ production country', () => {
  const { _isKazakh } = load();
  assert.ok(_isKazakh({ original_language: 'kk' }));
  assert.ok(_isKazakh({ original_language: 'ru', origin_country: ['KZ'] }));
  assert.ok(_isKazakh({ original_language: 'ru', production_countries: [{ iso_3166_1: 'RU' }, { iso_3166_1: 'KZ' }] }));
  assert.ok(!_isKazakh({ original_language: 'ru', origin_country: ['RU'] }));
  assert.ok(!_isKazakh({ original_language: 'ru' }), 'a Russian-language list card without a country is unknown, not Kazakh');
  assert.ok(!_isKazakh(null));
});

test('stampKazakh marks country-less cards and leaves a real country alone', () => {
  const cards = [{ id: 1 }, { id: 2, origin_country: ['KZ', 'FR'] }, { id: 3, origin_country: [] }];
  load()._stampKazakh(cards);
  assert.deepStrictEqual(cards.map(c => c.origin_country), [['KZ'], ['KZ', 'FR'], ['KZ']]);
});

test('spreadRepeats moves titles an earlier row showed to the back, dropping nothing', () => {
  const rows = [
    { results: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { results: [{ id: 2 }, { id: 4 }, { id: 1 }, { id: 5 }] },
    { results: [{ id: 1 }, { id: 2 }] }
  ];
  load()._spreadRepeats(rows);
  assert.deepStrictEqual(rows[0].results.map(c => c.id), [1, 2, 3]);
  assert.deepStrictEqual(rows[1].results.map(c => c.id), [4, 5, 2, 1]);
  assert.deepStrictEqual(rows[2].results.map(c => c.id), [1, 2], 'an all-repeat row keeps its cards');
});

test('collectSignals: a non-Kazakh like is no seed; Kazakh likes outrank reactions to other films', () => {
  const mine = {};
  for (let i = 0; i < 10; i++) mine['movie_' + (500 + i)] = ['fire'];
  const mock = makeMock({
    mine_reactions: mine,
    favorites: {
      like: [
        { id: 100, title: 'Хакер', original_language: 'ru', origin_country: ['KZ'] },
        { id: 900, title: 'Dune', original_language: 'en' }
      ],
      history: [], viewed: []
    }
  });
  const sig = load(mock)._collectSignals();
  assert.strictEqual(sig.positives[0].id, 100);
  assert.ok(sig.positives.every(p => p.id !== 900));
  assert.strictEqual(sig.positives.length, 8);
});

test('kazakhSeeds keeps liked cards and reactions whose detail is Kazakh', () => {
  const seeds = load()._kazakhSeeds([
    { id: 1, card: { id: 1 }, detail: null },
    { id: 2, card: null, detail: { kazakh: true } },
    { id: 3, card: null, detail: { kazakh: false } },
    { id: 4, card: null, detail: null }
  ]);
  assert.deepStrictEqual(seeds.map(s => s.id), [1, 2]);
});

test('component.create with no signals: poster-gated, stamped rows; «Сейчас смотрят» leads', () => {
  let base = 0;
  const mock = makeMock({ responder: () => page((base += 100), 10) });
  const comp = load(mock)._component({});
  comp.create();
  const built = comp._built;
  assert.ok(Array.isArray(built) && built.length >= 20);
  assert.strictEqual(built[0].title, 'Сейчас смотрят');
  built.forEach(r => r.results.forEach(c => {
    assert.ok(c.poster_path, 'poster-less card leaked into ' + r.title);
    assert.deepStrictEqual(c.origin_country, ['KZ']);
  }));
  assert.ok(mock.calls.noty.length >= 1, 'cold-start hint shown');
  assert.ok(mock.calls.toggles >= 1);
  mock.calls.requests.forEach(u => assert.match(u, /api_key=TESTKEY/));
});

test('a rotated page too short to fill a row falls back to page 1', () => {
  const mock = makeMock({
    storage: { kazakh_open_seq: 1 },
    responder: (url) => url.indexOf('&page=') >= 0 ? page(7000, 2) : page(100, 10)
  });
  const comp = load(mock)._component({});
  comp.create();
  assert.ok(mock.calls.requests.some(u => u.indexOf('&page=') >= 0), 'some row rotated');
  comp._built.forEach(r => assert.ok(r.results.every(c => c.id < 7000), 'stub page shown in ' + r.title));
});

test('recommendations: Kazakh like → personal row first, only Kazakh candidates, match badge data', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, title: 'Хакер', original_language: 'ru', origin_country: ['KZ'], genre_ids: [18, 80] }], history: [], viewed: [] },
    responder: (url) => {
      if (url.indexOf('/recommendations') >= 0 || url.indexOf('/similar') >= 0) {
        return { results: [
          { id: 201, title: 'Russian film', original_language: 'ru', genre_ids: [18], poster_path: '/r.jpg' },
          { id: 202, title: 'Hollywood', original_language: 'en', genre_ids: [18], poster_path: '/h.jpg' }
        ] };
      }
      if (/movie\/100\?/.test(url)) return { genres: [{ id: 18 }, { id: 80 }], production_countries: [{ iso_3166_1: 'KZ' }], production_companies: [{ id: 48860 }], original_language: 'ru' };
      return page(300, 10);
    }
  });
  const comp = load(mock)._component({});
  comp.create();
  const recs = comp._built[0];
  assert.strictEqual(recs.title, 'Рекомендации для Вас');
  assert.ok(recs.personal);
  const ids = recs.results.map(c => c.id);
  assert.ok(ids.indexOf(300) >= 0, 'KZ discover candidate recommended');
  assert.ok(ids.indexOf(201) < 0 && ids.indexOf(202) < 0, 'non-Kazakh candidates filtered');
  assert.ok(ids.indexOf(100) < 0, 'the liked seed itself is excluded');
  recs.results.forEach(c => assert.ok(c.__match >= 55 && c.__match <= 99));
  assert.strictEqual(comp._built[1].title, 'Сейчас смотрят');
  assert.ok(mock.calls.requests.some(u => /discover\/movie\?with_origin_country=KZ&with_companies=48860/.test(u)), 'studio taste feeds a KZ discover');
});

test('match badge: drawn once, and skipped when the Дорама plugin already drew it', () => {
  const mock = makeMock();
  load(mock)._registerMatchBadge();
  function item(hasBadge, pct) {
    const appended = [];
    const view = { length: 1, find: () => ({ length: hasBadge ? 1 : 0 }), append: (h) => appended.push(h) };
    return { appended, data: { __match: pct }, render: () => ({ find: () => view }) };
  }
  const fresh = item(false, 87), done = item(true, 87);
  mock.calls.listeners.line({ type: 'append', data: { personal: true }, items: [fresh, done] });
  assert.strictEqual(fresh.appended.length, 1);
  assert.match(fresh.appended[0], /class="dorama-match"[^>]*>87%/);
  assert.strictEqual(done.appended.length, 0);
  const plain = item(false, 87);
  mock.calls.listeners.line({ type: 'append', data: { personal: false }, items: [plain] });
  assert.strictEqual(plain.appended.length, 0, 'non-personal rows get no badge');
});

test('onMore opens the row grid; the personal row (no url) opens nothing', () => {
  const mock = makeMock({ responder: () => page(100, 10) });
  const comp = load(mock)._component({});
  comp.create();
  comp.onMore({ title: 'Рекомендации для Вас' });
  assert.strictEqual(mock.calls.activityPush.length, 0);
  comp.onMore({ title: 'Комедии', url: 'discover/movie?x=1' });
  assert.deepStrictEqual(mock.calls.activityPush[0], {
    url: 'discover/movie?x=1', title: 'Комедии', component: 'category_full', source: 'tmdb', card_type: true, page: 1
  });
  comp.destroy();
  assert.ok(mock.calls.clears > 0);
});

test('a TMDB 401 on every row ends in a visible auth error, not a spinner', () => {
  const mock = makeMock({ responder: () => ({ __error: 401 }) });
  const comp = load(mock)._component({});
  comp.create();
  assert.strictEqual(mock.calls.empties.length, 1);
  assert.match(mock.calls.empties[0].descr, /401/);
  assert.strictEqual(mock.calls.loaderCalls[mock.calls.loaderCalls.length - 1], false);
});

test('on ready: registers the component and one «Казахское кино» menu item, once', () => {
  const mock = makeMock();
  load(mock);
  assert.strictEqual(mock.menuList._children.length, 0);
  mock.calls.listeners.app({ type: 'ready' });
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.kazakh, 'function');
  assert.strictEqual(mock.menuList._children.length, 1);
  const item = mock.menuList._children[0];
  assert.strictEqual(item.text(), 'Казахское кино');
  assert.match(item._html, /data-action="kazakh"/);
  item.trigger('hover:enter');
  assert.deepStrictEqual(mock.calls.activityPush[0], {
    url: '', title: 'Казахское кино', component: 'kazakh', source: 'tmdb', card_type: true, page: 1
  });
});
