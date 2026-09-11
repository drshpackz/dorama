'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPluginFile } = require('./helpers/lampa-mock');

function load(mock) { return loadPluginFile(mock || makeMock(), 'multi-fan.js'); }

// Timeline hashes are opaque in Lampa; here a readable stand-in.
const hash = (s) => 'h:' + s;
const NONE = { percent: 0, time: 0, duration: 0, updated: 0 };
function withTimeline(mock, progress, continues) {
  mock.Lampa.Utils = { hash: hash };
  mock.Lampa.Timeline = { view: (h) => progress[h] || NONE };
  mock.Lampa.Favorite.continues = (t) => (continues[t] || []).slice();
  return mock;
}

const RICK = { id: 60625, name: 'Рик и Морти', original_name: 'Rick and Morty', genre_ids: [16, 35], poster_path: '/rick.jpg', first_air_date: '2013-12-02' };
const GRIFFINS = { id: 1434, name: 'Гриффины', original_name: 'Family Guy', poster_path: '/fg.jpg', first_air_date: '1999-01-31' }; // stored from its full page: no genre_ids
const BEARS = { id: 63401, name: 'Вся правда о медведях', original_name: 'We Bare Bears', genre_ids: [16], poster_path: '/wbb.jpg', first_air_date: '2015-07-27' };
const GOT = { id: 1399, name: 'Игра престолов', original_name: 'Game of Thrones', genre_ids: [18], poster_path: '/got.jpg', first_air_date: '2011-04-17' };
const SIMPSONS_MOVIE = { id: 35, title: 'Симпсоны в кино', original_title: 'The Simpsons Movie', genre_ids: [16, 35], poster_path: '/sm.jpg', release_date: '2007-07-25' };
const SHREK = { id: 808, title: 'Шрек', original_title: 'Shrek', genre_ids: [16, 35], poster_path: '/shrek.jpg', release_date: '2001-05-18' };

const seasons = (list) => list.map(([n, c]) => ({ season_number: n, episode_count: c }));
const tvRating = (us, ru) => ({ content_ratings: { results: [us && { iso_3166_1: 'US', rating: us }, ru && { iso_3166_1: 'RU', rating: ru }].filter(Boolean) } });
const movieRating = (us) => ({ release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: us }] }] } });
const tv = (o, us, ru) => Object.assign(o, tvRating(us, ru));

function responder(url) {
  let m;
  if (/\/tv\/60625\?/.test(url)) return tv({ id: 60625, name: 'Рик и Морти', original_name: 'Rick and Morty', genres: [{ id: 16 }], networks: [{ id: 80 }], seasons: seasons([[0, 5], [1, 11], [2, 10], [3, 10]]) }, 'TV-MA', '18+');
  if (/\/tv\/1434\?/.test(url)) return tv({ id: 1434, name: 'Гриффины', original_name: 'Family Guy', poster_path: '/fg.jpg', genres: [{ id: 16 }], networks: [{ id: 19 }], seasons: seasons([[1, 7], [2, 21]]) }, 'TV-14', '16+');
  if (/\/tv\/63401\?/.test(url)) return tv({ id: 63401, genres: [{ id: 16 }], networks: [{ id: 56 }], seasons: seasons([[1, 10]]) }, 'TV-Y7', '6+');
  if (/\/tv\/1399\?/.test(url)) return tv({ id: 1399, genres: [{ id: 18 }], networks: [{ id: 49 }], seasons: seasons([[1, 10]]) }, 'TV-MA');
  if (/\/tv\/1839\?/.test(url)) return tv({ id: 1839, name: 'kids pin', poster_path: '/k.jpg', genres: [{ id: 16 }], networks: [], seasons: [] }, 'TV-Y7');
  if ((m = /\/tv\/(\d+)\?/.exec(url))) return tv({ id: +m[1], name: 'pin' + m[1], original_name: 'pin' + m[1], poster_path: '/pin.jpg', genres: [{ id: 16 }], networks: [], seasons: [] }, 'TV-14');
  if (/\/movie\/35\?/.test(url)) return Object.assign({ id: 35, genres: [{ id: 16 }] }, movieRating('PG-13'));
  if (/\/movie\/808\?/.test(url)) return Object.assign({ id: 808, genres: [{ id: 16 }] }, movieRating('PG'));
  // discover: two poster cards per call, plus an anime and a poster-less card that must be dropped
  return { results: [
    { id: 9001, name: 'a', poster_path: '/a.jpg', original_language: 'en' },
    { id: 9002, name: 'b', poster_path: '/b.jpg', original_language: 'en' },
    { id: 9003, name: 'anime', poster_path: '/c.jpg', original_language: 'ja' },
    { id: 9004, name: 'no poster', original_language: 'en' },
    { id: 456, name: 'Симпсоны', poster_path: '/s.jpg', original_language: 'en' }
  ], total_pages: 1 };
}

// ---------- model ----------

test('model: eight networks with TMDB ids, a logo, age levels and curated series; no Disney Channel', () => {
  const { NETWORKS } = load();
  assert.deepStrictEqual(NETWORKS.map(n => n.title),
    ['Adult Swim', 'Cartoon Network', 'FOX', 'Comedy Central', 'MTV', 'TBS', 'Netflix', 'Hulu']);
  assert.strictEqual(new Set(NETWORKS.map(n => n.key)).size, NETWORKS.length);
  NETWORKS.forEach(n => {
    assert.ok(n.tmdb.length && n.tmdb.every(Number.isInteger), n.key);
    assert.match(n.logo, /^\/\w+\.png$/);
    assert.ok(n.ages.length && n.ages.every(a => a === '12' || a === '18'), n.key);
    assert.ok(n.ages.indexOf('12') >= 0, n.key + ' must exist at 12+');
    assert.ok(n.series.length >= 3, n.key + ' has ' + n.series.length);
    assert.strictEqual(new Set(n.series).size, n.series.length, n.key + ' repeats a series');
  });
});

test('model: the requested examples still lead their networks, minus the kids\' shows', () => {
  const { networkByKey, NETWORKS } = load();
  assert.deepStrictEqual(networkByKey('adult-swim').series.slice(0, 7), [60625, 131378, 709, 61593, 96372, 202282, 74387]);
  assert.deepStrictEqual(networkByKey('cartoon-network').series.slice(0, 2), [15260, 256694]);
  assert.deepStrictEqual(networkByKey('fox').series.slice(0, 11), [456, 1434, 32726, 2122, 1433, 131033, 93292, 202224, 82653, 15632, 63039]);
  assert.deepStrictEqual(networkByKey('netflix').series.slice(0, 2), [61222, 86831]);
  const all = [].concat(...NETWORKS.map(n => n.series));
  [63401, 117030].forEach(id => assert.ok(all.indexOf(id) < 0, 'kids show ' + id + ' still curated'));
});

test('networksOf: curated membership, TMDB membership, several networks at once', () => {
  const { networksOf } = load();
  assert.deepStrictEqual(networksOf(131378, [6783]), ['adult-swim'], 'Fionna & Cake: Max on TMDB, Adult Swim here');
  assert.deepStrictEqual(networksOf(615, [19, 47, 453]), ['fox', 'comedy-central', 'hulu']);
  assert.deepStrictEqual(networksOf(777777, [54]), [], 'Disney Channel is not a network here');
});

test('networksFor: 18+ offers only the networks with enough adult animation', () => {
  const { networksFor, AGES, NETWORKS } = load();
  assert.strictEqual(networksFor(AGES['12']).length, NETWORKS.length);
  assert.deepStrictEqual(networksFor(AGES['18']).map(n => n.key), ['adult-swim', 'fox', 'comedy-central', 'netflix', 'hulu']);
});

// ---------- age rule ----------

test('passesAge: US scale first (TV-PG / PG-13 for 12+, TV-MA / R for 18+), Russian as the fallback', () => {
  const { passesAge, AGES } = load();
  const a12 = AGES['12'], a18 = AGES['18'];
  assert.ok(passesAge({ US: 'TV-PG' }, 'tv', a12), 'TV-PG sits at RU 12+');
  assert.ok(!passesAge({ US: 'TV-Y7', RU: '12+' }, 'tv', a12), 'the US rating decides when present');
  assert.ok(!passesAge({ US: 'TV-G' }, 'tv', a12));
  assert.ok(passesAge({ US: 'TV-14' }, 'tv', a12) && !passesAge({ US: 'TV-14' }, 'tv', a18));
  assert.ok(passesAge({ US: 'TV-MA' }, 'tv', a18));
  assert.ok(passesAge({ US: null, RU: '16+' }, 'tv', a12) && !passesAge({ US: null, RU: '16+' }, 'tv', a18));
  assert.ok(passesAge({ US: 'NR', RU: '18+' }, 'tv', a18), 'NR is no rating: fall back to RU');
  assert.ok(!passesAge({ US: null, RU: null }, 'tv', a12), 'unrated is not shown');
  assert.ok(!passesAge(null, 'movie', a12));
  assert.ok(!passesAge({ US: 'PG' }, 'movie', a12), 'film PG sits at RU 6+');
  assert.ok(passesAge({ US: 'PG-13' }, 'movie', a12) && !passesAge({ US: 'PG-13' }, 'movie', a18));
  assert.ok(passesAge({ US: 'R' }, 'movie', a18) && passesAge({ US: 'NC-17' }, 'movie', a18));
});

// ---------- rows ----------

const MOVIE_ONLY = ['53', '36', '10752', '10749', '27', '28', '12', '14', '878', '10402'];

['12', '18'].forEach(ageKey => {
  test('catalog rows at ' + ageKey + '+: every row carries the age filter for its media, one row per offered network', () => {
    const { _catalogRows, _certQuery, networksFor, AGES } = load();
    const age = AGES[ageKey];
    const rows = _catalogRows(new Date('2026-09-11T12:00:00Z'), age);
    rows.forEach(r => {
      assert.match(r.url, /^discover\/(tv|movie)\?/);
      assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
      assert.ok(r.url.endsWith(_certQuery(r.method, age)), 'no age filter: ' + r.url);
      assert.ok(r.url.indexOf('without_keywords=210024') >= 0, 'anime not excluded: ' + r.url);
      assert.ok(r.url.indexOf('with_companies=') < 0, 'studio rows are gone: ' + r.url);
      if (r.method === 'tv') {
        const g = /with_genres=([^&]*)/.exec(r.url);
        (g ? g[1].split(/[|,]/) : []).forEach(x => assert.ok(MOVIE_ONLY.indexOf(x) < 0, r.url));
      }
    });
    assert.deepStrictEqual(rows.filter(r => r.network).map(r => r.network), networksFor(age).map(n => n.key));
    assert.ok(rows.some(r => r.method === 'movie') && rows.some(r => r.method === 'tv'));
    assert.strictEqual(new Set(rows.map(r => r.title)).size, rows.length);
  });
});

test('the age filter per media: TV-PG / PG-13 at 12+, TV-MA / R at 18+', () => {
  const { _certQuery, AGES } = load();
  assert.strictEqual(_certQuery('tv', AGES['12']), '&certification_country=US&certification.gte=TV-PG');
  assert.strictEqual(_certQuery('movie', AGES['12']), '&certification_country=US&certification.gte=PG-13');
  assert.strictEqual(_certQuery('tv', AGES['18']), '&certification_country=US&certification.gte=TV-MA');
  assert.strictEqual(_certQuery('movie', AGES['18']), '&certification_country=US&certification.gte=R');
});

test('channel rows: only that network\'s animated series at the age; the first row is the curated one', () => {
  const { _channelRows, networkByKey, AGES } = load();
  const rows = _channelRows(networkByKey('comedy-central'), new Date('2026-09-11T12:00:00Z'), AGES['18']);
  assert.strictEqual(rows[0].pins, 'comedy-central');
  rows.forEach(r => {
    assert.strictEqual(r.method, 'tv');
    assert.strictEqual(r.age, '18');
    assert.ok(r.url.indexOf('with_networks=47&with_genres=16&without_keywords=210024') >= 0, r.url);
    assert.ok(r.url.endsWith('&certification_country=US&certification.gte=TV-MA'), r.url);
  });
});

test('dropRedundant keeps a row only if it shows something new', () => {
  const rows = load()._dropRedundant([
    { title: 'a', results: [{ id: 1 }, { id: 2 }] },
    { title: 'b', results: [{ id: 2 }, { id: 1 }] },
    { title: 'c', results: [{ id: 2 }, { id: 3 }] }
  ]);
  assert.deepStrictEqual(rows.map(r => r.title), ['a', 'c']);
});

// ---------- continue watching ----------

test('seriesProgress: the most recently watched episode wins, not the highest numbered', () => {
  const mock = withTimeline(makeMock(), {
    [hash('25Rick and Morty')]: { percent: 40, time: 754, duration: 1320, updated: 2000 },
    [hash('31Rick and Morty')]: { percent: 10, time: 60, duration: 1320, updated: 1000 }
  }, {});
  const api = load(mock);
  const p = api._seriesProgress(RICK, [[1, 11], [2, 10], [3, 10]]);
  assert.deepStrictEqual([p.season, p.episode, p.time], [2, 5, 754]);
  assert.strictEqual(api._continueLabel(p), 'Сезон 2 · Серия 5 · 12:34');
});

test('seriesProgress: a finished episode hands over to the next, across seasons', () => {
  const mock = withTimeline(makeMock(), {
    [hash('210Rick and Morty')]: { percent: 97, time: 1300, duration: 1320, updated: 5 }
  }, {});
  const api = load(mock);
  const p = api._seriesProgress(RICK, [[1, 11], [2, 10], [3, 10]]);
  assert.deepStrictEqual([p.season, p.episode, p.next], [3, 1, true]);
  assert.strictEqual(api._continueLabel(p), 'Сезон 3 · Серия 1 · с начала');
  assert.strictEqual(api._seriesProgress(RICK, [[1, 11], [2, 10]]), null, 'the finale seen to the end: nothing to continue');
});

test('seriesProgress: seasons past 10 hash with Lampa\'s ":" separator', () => {
  const simpsons = { id: 456, original_name: 'The Simpsons' };
  const mock = withTimeline(makeMock(), { [hash('11:3The Simpsons')]: { percent: 20, time: 300, duration: 1300, updated: 1 } }, {});
  const p = load(mock)._seriesProgress(simpsons, [[11, 22]]);
  assert.deepStrictEqual([p.season, p.episode], [11, 3]);
});

test('movie progress label and clock formatting', () => {
  const mock = withTimeline(makeMock(), { [hash('The Simpsons Movie')]: { percent: 50, time: 2610, duration: 5220, updated: 9 } }, {});
  const api = load(mock);
  assert.strictEqual(api._continueLabel(api._movieProgress(SIMPSONS_MOVIE)), '43:30 из 1:27:00');
  assert.strictEqual(api._clock(3725), '1:02:05');
  assert.strictEqual(api._clock(59), '0:59');
});

// ---------- screens ----------

function viewMock(extra) {
  const mock = makeMock(Object.assign({ responder }, extra || {}));
  return withTimeline(mock, {
    [hash('25Rick and Morty')]: { percent: 40, time: 754, duration: 1320, updated: 100 },
    [hash('13Family Guy')]: { percent: 30, time: 400, duration: 1300, updated: 300 },
    [hash('14We Bare Bears')]: { percent: 30, time: 300, duration: 660, updated: 500 },
    [hash('12Game of Thrones')]: { percent: 30, time: 400, duration: 3300, updated: 400 },
    [hash('The Simpsons Movie')]: { percent: 50, time: 2610, duration: 5220, updated: 200 },
    [hash('Shrek')]: { percent: 50, time: 2700, duration: 5400, updated: 600 }
  }, { tv: [RICK, GRIFFINS, BEARS, GOT], movie: [SIMPSONS_MOVIE, SHREK] });
}

test('start page (12+): tiles on top, a continue row without kids\' titles, the catalog below', () => {
  const mock = viewMock();
  const comp = load(mock)._component({ network: '', age: '12' });
  comp.create();
  const built = comp._built;
  assert.strictEqual(built[0].title, 'Каналы');
  assert.strictEqual(typeof built[0].cardClass, 'function');
  assert.deepStrictEqual(built[0].results.map(t => t.title).slice(0, 4), ['Все мульты', '18+', 'Adult Swim', 'Cartoon Network']);
  assert.ok(built[0].results[0].__active && !built[0].results[1].__active);

  const cw = built[1];
  assert.strictEqual(cw.title, 'Продолжить просмотр');
  assert.deepStrictEqual(cw.results.map(c => c.id), [1434, 35, 60625], 'no Bears (TV-Y7), no Shrek (PG), no GoT (not animation)');
  assert.deepStrictEqual(cw.results.map(c => c.__cw.label), ['Сезон 1 · Серия 3 · 6:40', '43:30 из 1:27:00', 'Сезон 2 · Серия 5 · 12:34']);

  const catalog = built.slice(2);
  assert.strictEqual(catalog[0].title, 'Популярные мультсериалы');
  catalog.forEach(r => r.results.forEach(c => {
    assert.ok(c.poster_path, 'poster-less card in ' + r.title);
    assert.notStrictEqual(c.original_language, 'ja', 'anime in ' + r.title);
  }));
  assert.ok(catalog.some(r => r.network === 'hulu'));
  assert.ok(mock.calls.requests.filter(u => u.indexOf('discover/') >= 0).every(u => u.indexOf('certification.gte=') >= 0), 'an unfiltered discover request');
});

test('18+ page: only adult networks offered, only TV-MA / R in the continue row', () => {
  const mock = viewMock();
  const comp = load(mock)._component({ network: '', age: '18' });
  comp.create();
  const built = comp._built;
  assert.deepStrictEqual(built[0].results.map(t => t.title), ['Все мульты', '18+', 'Adult Swim', 'FOX', 'Comedy Central', 'Netflix', 'Hulu']);
  assert.ok(built[0].results[0].__active && built[0].results[1].__active, 'all networks, 18+');
  assert.deepStrictEqual(built[1].results.map(c => c.id), [60625]);
  const discover = mock.calls.requests.filter(u => u.indexOf('discover/') >= 0);
  assert.ok(discover.every(u => /certification\.gte=(TV-MA|R)&/.test(u)), 'a 12+ request on the 18+ page');
});

test('a network page: its curated series first, kids\' pins left out, its continue row only', () => {
  const mock = viewMock();
  const api = load(mock);
  const fox = api.networkByKey('fox');
  const comp = api._component({ network: 'fox', age: '12' });
  comp.create();
  const built = comp._built;
  assert.deepStrictEqual(built[0].results.filter(t => t.__active).map(t => t.key || t.kind), ['all'].filter(() => false).concat(['fox']));
  assert.strictEqual(built[1].title, 'Продолжить просмотр');
  assert.deepStrictEqual(built[1].results.map(c => c.id), [1434], 'Rick is Adult Swim; films have no network');
  const main = built[2];
  assert.strictEqual(main.title, 'Главное на FOX');
  const expected = fox.series.filter(id => id !== 1839);
  assert.deepStrictEqual(main.results.slice(0, expected.length).map(c => c.id), expected, 'a pin rated TV-Y7 is dropped');
  assert.deepStrictEqual(main.results.slice(expected.length).map(c => c.id), [9001, 9002]);
  assert.ok(mock.calls.requests.some(u => /\/tv\/32726\?append_to_response=content_ratings/.test(u)), 'a pin TMDB did not list is fetched with its rating');
  assert.strictEqual(built.length, 3, 'views repeating the curated row are dropped');
});

test('pinned details are cached: a second visit fetches nothing by id', () => {
  const mock = viewMock();
  load(mock)._component({ network: 'fox', age: '12' }).create();
  const count = () => mock.calls.requests.filter(u => /\/tv\/\d+\?/.test(u)).length;
  const before = count();
  load(mock)._component({ network: 'fox', age: '12' }).create(); // fresh plugin instance, same Storage
  assert.ok(before > 0);
  assert.strictEqual(count(), before);
});

test('«Ещё» is forced on network rows and on deep rows the filter left short', () => {
  const mock = makeMock({ responder });
  const comp = load(mock)._component({ network: '' });
  comp.create();
  const hulu = comp._built.find(r => r.network === 'hulu');
  assert.strictEqual(hulu.results.length, 3, 'a short row');
  assert.strictEqual(hulu.more, true);
  const best = comp._built.find(r => r.title === 'Лучшие мультфильмы');
  assert.strictEqual(best.more, false, 'one page, no network: Lampa decides');
  assert.ok(!comp._built[0].more, 'tiles row has no «Ещё»');
});

test('tiles row is its own line type, so Lampa\'s poster-height min-height does not apply', () => {
  const row = load()._tilesRow('fox', '12');
  assert.strictEqual(row.line_type, 'multifan-tiles');
  assert.strictEqual(row.nomore, true);
});

test('a network page starts the remote on its series; the start page on the tiles', () => {
  let comp = load(makeMock({ responder }))._component({ network: 'fox' });
  let downs = 0; comp.down = () => { downs++; };
  comp.create();
  assert.strictEqual(downs, 1);
  comp = load(makeMock({ responder }))._component({ network: '' });
  downs = 0; comp.down = () => { downs++; };
  comp.create();
  assert.strictEqual(downs, 0);
});

test('without Lampa Timeline there is simply no continue row', () => {
  const comp = load(makeMock({ responder }))._component({ network: '' });
  comp.create();
  assert.strictEqual(comp._built[0].title, 'Каналы');
  assert.strictEqual(comp._built[1].title, 'Популярные мультсериалы');
});

// ---------- navigation ----------

test('from the start page a filter opens a new page', () => {
  const mock = makeMock({ activeActivity: { component: 'multifan', network: '', age: '12' } });
  mock.Lampa.Activity.replace = () => assert.fail('the start page must stay behind the new page');
  const api = load(mock);
  api._openView('fox', '12');
  api._openView('', '18');
  assert.deepStrictEqual(mock.calls.activityPush.map(o => [o.network, o.age, o.title]),
    [['fox', '12', 'Multi-Fan · FOX'], ['', '18', 'Multi-Fan · 18+']]);
});

test('elsewhere a filter replaces the page; the same view is a no-op; a network without 18+ falls back', () => {
  const replaced = [];
  let mock = makeMock({ activeActivity: { component: 'multifan', network: 'fox', age: '12' } });
  mock.Lampa.Activity.replace = (o) => replaced.push(o);
  let api = load(mock);
  api._openView('hulu', '12');
  api._openView('fox', '18');
  api._openView('fox', '12');
  assert.deepStrictEqual(replaced.map(o => [o.network, o.age, o.title]), [['hulu', '12', 'Multi-Fan · Hulu'], ['fox', '18', 'Multi-Fan · FOX · 18+']]);
  assert.strictEqual(mock.calls.activityPush.length, 0);

  replaced.length = 0;
  mock = makeMock({ activeActivity: { component: 'multifan', network: 'mtv', age: '12' } });
  mock.Lampa.Activity.replace = (o) => replaced.push(o);
  load(mock)._openView('mtv', '18');
  assert.deepStrictEqual(replaced.map(o => [o.network, o.age]), [['', '18']], 'MTV has no 18+ page');
});

test('tiles: a logo keeps the age, «18+» toggles it, «Все мульты» keeps it and clears the network', () => {
  const push = (view, index) => {
    const mock = makeMock({ activeActivity: { component: 'multifan', network: view[0], age: view[1] } });
    const got = [];
    mock.Lampa.Activity.replace = (o) => got.push(o);
    mock.Lampa.Activity.push = (o) => got.push(o);
    const api = load(mock);
    const row = api._tilesRow(view[0], view[1]);
    const tile = row.cardClass(row.results[index]);
    tile.create();
    tile.render().trigger('hover:enter');
    return got.map(o => [o.network, o.age]);
  };
  assert.deepStrictEqual(push(['', '12'], 4), [['fox', '12']]);    // Все, 18+, Adult Swim, Cartoon Network, FOX
  assert.deepStrictEqual(push(['', '12'], 1), [['', '18']]);
  assert.deepStrictEqual(push(['fox', '18'], 1), [['fox', '12']]);
  assert.deepStrictEqual(push(['fox', '18'], 0), [['', '18']]);
  assert.deepStrictEqual(push(['', '18'], 3), [['fox', '18']]);    // Все, 18+, Adult Swim, FOX
});

test('tile markup: logo tiles and the two text tiles, all with the native visibility contract', () => {
  const api = load();
  const row = api._tilesRow('', '12');
  const html = (i) => { const t = row.cardClass(row.results[i]); t.create(); return t.render()._html; };
  assert.match(html(0), /class="multifan-net selector layer--visible layer--render multifan-net--all multifan-net--active">.*Все мульты/);
  assert.match(html(1), /multifan-net--age">.*18\+/);
  assert.match(html(4), /<img class="multifan-net__logo" src="IMG:\/1DSpHrWyOORkL9N2QHX7Adt31mQ\.png"/);
  const tile = row.cardClass(row.results[9]);
  tile.create();
  let appended = 0;
  tile.onVisible = () => { appended++; }; // the row sets this after create()
  tile.render().trigger('visible');
  assert.strictEqual(appended, 1);
});

test('«Ещё» on a network row opens the network at the page\'s age; on other rows, the grid', () => {
  const mock = makeMock({ responder });
  const comp = load(mock)._component({ network: '', age: '18' });
  comp.create();
  comp.onMore({ title: 'Hulu', url: 'discover/tv?x', network: 'hulu' });
  comp.onMore({ title: 'Лучшие мультфильмы', url: 'discover/movie?y' });
  assert.deepStrictEqual([mock.calls.activityPush[0].network, mock.calls.activityPush[0].age], ['hulu', '18']);
  assert.deepStrictEqual(mock.calls.activityPush[1], { url: 'discover/movie?y', title: 'Лучшие мультфильмы', component: 'category_full', source: 'tmdb', card_type: true, page: 1 });
  comp.destroy();
  assert.ok(mock.calls.clears > 0);
});

test('continue overlay: label + bar drawn once on continue-row cards only', () => {
  const mock = makeMock();
  load(mock)._registerContinueOverlay();
  function item(has) {
    const appended = [];
    const view = { length: 1, find: () => ({ length: has ? 1 : 0 }), append: (h) => appended.push(h) };
    return { appended, data: { __cw: { label: 'Сезон 2 · Серия 5 · 12:34', percent: 40 } }, render: () => ({ find: () => view }) };
  }
  const a = item(false), b = item(true), c = item(false);
  mock.calls.listeners.line({ type: 'append', data: { multifan_continue: true }, items: [a, b] });
  mock.calls.listeners.line({ type: 'append', data: {}, items: [c] });
  assert.strictEqual(a.appended.length, 1);
  assert.match(a.appended[0], /Сезон 2 · Серия 5 · 12:34.*width:40%/);
  assert.strictEqual(b.appended.length, 0);
  assert.strictEqual(c.appended.length, 0);
});

test('a TMDB 401 everywhere ends in a visible auth error', () => {
  const mock = makeMock({ responder: () => ({ __error: 401 }) });
  load(mock)._component({ network: '' }).create();
  assert.match(mock.calls.empties[0].descr, /401/);
});

test('on ready: one Multi-Fan menu item that opens the 12+ start page, once', () => {
  const mock = makeMock();
  load(mock);
  mock.calls.listeners.app({ type: 'ready' });
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.multifan, 'function');
  assert.strictEqual(mock.menuList._children.length, 1);
  const item = mock.menuList._children[0];
  assert.strictEqual(item.text(), 'Multi-Fan');
  item.trigger('hover:enter');
  assert.deepStrictEqual([mock.calls.activityPush[0].component, mock.calls.activityPush[0].network, mock.calls.activityPush[0].age], ['multifan', '', '12']);
});
