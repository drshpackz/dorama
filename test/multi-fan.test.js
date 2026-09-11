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
const GOT = { id: 1399, name: 'Игра престолов', original_name: 'Game of Thrones', genre_ids: [18], poster_path: '/got.jpg', first_air_date: '2011-04-17' };
const SHREK = { id: 808, title: 'Шрек', original_title: 'Shrek', genre_ids: [16, 35], poster_path: '/shrek.jpg', release_date: '2001-05-18' };

function seasons(list) { return list.map(([n, c]) => ({ season_number: n, episode_count: c })); }

function responder(url) {
  let m;
  if (/\/tv\/60625\?/.test(url)) return { id: 60625, name: 'Рик и Морти', original_name: 'Rick and Morty', genres: [{ id: 16 }], networks: [{ id: 80 }], seasons: seasons([[0, 5], [1, 11], [2, 10], [3, 10]]) };
  if (/\/tv\/1434\?/.test(url)) return { id: 1434, name: 'Гриффины', original_name: 'Family Guy', poster_path: '/fg.jpg', genres: [{ id: 16 }], networks: [{ id: 19 }], seasons: seasons([[1, 7], [2, 21]]) };
  if (/\/tv\/1399\?/.test(url)) return { id: 1399, genres: [{ id: 18 }], networks: [{ id: 49 }], seasons: seasons([[1, 10]]) };
  if ((m = /\/tv\/(\d+)\?/.exec(url))) return { id: +m[1], name: 'pin' + m[1], original_name: 'pin' + m[1], poster_path: '/pin.jpg', genres: [{ id: 16 }], networks: [], seasons: [] };
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

test('model: nine networks, each with TMDB ids, a logo and curated series', () => {
  const { NETWORKS } = load();
  assert.deepStrictEqual(NETWORKS.map(n => n.title),
    ['Adult Swim', 'Cartoon Network', 'FOX', 'Comedy Central', 'Disney Channel', 'MTV', 'TBS', 'Netflix', 'Hulu']);
  assert.strictEqual(new Set(NETWORKS.map(n => n.key)).size, 9);
  NETWORKS.forEach(n => {
    assert.ok(n.tmdb.length && n.tmdb.every(Number.isInteger), n.key);
    assert.match(n.logo, /^\/\w+\.png$/);
    assert.ok(n.series.length >= 7, n.key + ' has ' + n.series.length);
    assert.strictEqual(new Set(n.series).size, n.series.length, n.key + ' repeats a series');
  });
});

test('model: the requested examples lead their networks, in the requested order', () => {
  const { networkByKey } = load();
  assert.deepStrictEqual(networkByKey('adult-swim').series.slice(0, 7), [60625, 131378, 709, 61593, 96372, 202282, 74387]);
  assert.deepStrictEqual(networkByKey('cartoon-network').series.slice(0, 4), [15260, 256694, 63401, 117030]);
  assert.deepStrictEqual(networkByKey('fox').series.slice(0, 11), [456, 1434, 32726, 2122, 1433, 131033, 93292, 202224, 82653, 15632, 63039]);
  assert.deepStrictEqual(networkByKey('netflix').series.slice(0, 2), [61222, 86831]);
});

test('networksOf: curated membership, TMDB membership, several networks at once', () => {
  const { networksOf } = load();
  assert.deepStrictEqual(networksOf(131378, [6783]), ['adult-swim'], 'Fionna & Cake: Max on TMDB, Adult Swim here');
  assert.deepStrictEqual(networksOf(615, [19, 47, 453]), ['fox', 'comedy-central', 'hulu']);
  assert.deepStrictEqual(networksOf(777777, [44]), ['disney'], 'Disney XD counts as Disney Channel');
  assert.deepStrictEqual(networksOf(777777, [49]), []);
});

// ---------- rows ----------

const MOVIE_ONLY = ['53', '36', '10752', '10749', '27', '28', '12', '14', '878', '10402'];

test('catalog rows: discover rows, series and films, one row per network', () => {
  const { _catalogRows, NETWORKS } = load();
  const rows = _catalogRows(new Date('2026-09-11T12:00:00Z'));
  rows.forEach(r => {
    assert.match(r.url, /^discover\/(tv|movie)\?/);
    assert.strictEqual(r.method, r.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie');
    if (r.method === 'tv') {
      const g = /with_genres=([^&]*)/.exec(r.url);
      (g ? g[1].split(/[|,]/) : []).forEach(x => assert.ok(MOVIE_ONLY.indexOf(x) < 0, r.url));
    }
    if (r.url.indexOf('with_companies=') < 0) assert.ok(r.url.indexOf('without_keywords=210024') >= 0, 'anime not excluded: ' + r.url);
  });
  assert.ok(rows.some(r => r.method === 'movie') && rows.some(r => r.method === 'tv'));
  NETWORKS.forEach(n => {
    const nr = rows.filter(r => r.network === n.key);
    assert.strictEqual(nr.length, 1, n.key);
    assert.ok(nr[0].url.indexOf('with_networks=' + n.tmdb.join('|')) >= 0);
  });
  assert.strictEqual(new Set(rows.map(r => r.title)).size, rows.length);
});

test('channel rows: only that network\'s animated series; the first row is the curated one', () => {
  const { _channelRows, networkByKey } = load();
  const disney = networkByKey('disney');
  const rows = _channelRows(disney, new Date('2026-09-11T12:00:00Z'));
  assert.strictEqual(rows[0].pins, 'disney');
  rows.forEach(r => {
    assert.strictEqual(r.method, 'tv');
    assert.ok(r.url.indexOf('with_networks=54|44&with_genres=16&without_keywords=210024') >= 0, r.url);
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
  const mock = withTimeline(makeMock(), { [hash('Shrek')]: { percent: 50, time: 2700, duration: 5400, updated: 9 } }, {});
  const api = load(mock);
  assert.strictEqual(api._continueLabel(api._movieProgress(SHREK)), '45:00 из 1:30:00');
  assert.strictEqual(api._clock(3725), '1:02:05');
  assert.strictEqual(api._clock(59), '0:59');
});

// ---------- screens ----------

function mainMock(extra) {
  const mock = makeMock(Object.assign({ responder }, extra || {}));
  return withTimeline(mock, {
    [hash('25Rick and Morty')]: { percent: 40, time: 754, duration: 1320, updated: 100 },
    [hash('13Family Guy')]: { percent: 30, time: 400, duration: 1300, updated: 300 },
    [hash('12Game of Thrones')]: { percent: 30, time: 400, duration: 3300, updated: 400 },
    [hash('Shrek')]: { percent: 50, time: 2700, duration: 5400, updated: 200 }
  }, { tv: [RICK, GRIFFINS, GOT], movie: [SHREK] });
}

test('no network selected: tiles on top, continue row, the whole catalog below', () => {
  const mock = mainMock();
  const comp = load(mock)._component({ network: '' });
  comp.create();
  const built = comp._built;
  assert.strictEqual(built[0].title, 'Каналы');
  assert.strictEqual(typeof built[0].cardClass, 'function');
  assert.deepStrictEqual(built[0].results.map(t => t.title).slice(0, 3), ['Все мульты', 'Adult Swim', 'Cartoon Network']);
  assert.ok(built[0].results[0].__active && !built[0].results[1].__active);

  const cw = built[1];
  assert.strictEqual(cw.title, 'Продолжить просмотр');
  assert.deepStrictEqual(cw.results.map(c => c.id), [1434, 808, 60625], 'animation only, most recent first');
  assert.deepStrictEqual(cw.results.map(c => c.__cw.label), ['Сезон 1 · Серия 3 · 6:40', '45:00 из 1:30:00', 'Сезон 2 · Серия 5 · 12:34']);

  const catalog = built.slice(2);
  assert.strictEqual(catalog[0].title, 'Популярные мультсериалы');
  catalog.forEach(r => r.results.forEach(c => {
    assert.ok(c.poster_path, 'poster-less card in ' + r.title);
    assert.notStrictEqual(c.original_language, 'ja', 'anime in ' + r.title);
  }));
  assert.ok(catalog.some(r => r.network === 'hulu'));
  assert.ok(mock.calls.toggles >= 1);
});

test('a network selected: its curated series first, its continue row only', () => {
  const mock = mainMock();
  const api = load(mock);
  const fox = api.networkByKey('fox');
  const comp = api._component({ network: 'fox' });
  comp.create();
  const built = comp._built;
  assert.ok(built[0].results.filter(t => t.__active).map(t => t.key).join() === 'fox');
  assert.strictEqual(built[1].title, 'Продолжить просмотр');
  assert.deepStrictEqual(built[1].results.map(c => c.id), [1434], 'Rick is Adult Swim; films have no network');
  const main = built[2];
  assert.strictEqual(main.title, 'Главное на FOX');
  assert.deepStrictEqual(main.results.slice(0, fox.series.length).map(c => c.id), fox.series);
  assert.deepStrictEqual(main.results.slice(fox.series.length).map(c => c.id), [9001, 9002]);
  assert.ok(mock.calls.requests.some(u => /\/tv\/32726\?/.test(u)), 'a pin TMDB did not list is fetched by id');
  assert.strictEqual(built.length, 3, 'views repeating the curated row are dropped');
});

test('pinned details are cached: a second visit fetches nothing by id', () => {
  const mock = mainMock();
  const api = load(mock);
  api._component({ network: 'fox' }).create();
  const before = mock.calls.requests.filter(u => /\/tv\/\d+\?/.test(u)).length;
  const api2 = load(mock); // fresh plugin instance, same Storage
  api2._component({ network: 'fox' }).create();
  const after = mock.calls.requests.filter(u => /\/tv\/\d+\?/.test(u)).length;
  assert.ok(before > 0);
  assert.strictEqual(after, before);
});

test('«Ещё» is forced on network rows and on deep rows the filter left short', () => {
  const mock = makeMock({ responder });
  const comp = load(mock)._component({ network: '' });
  comp.create();
  const hulu = comp._built.find(r => r.network === 'hulu');
  assert.strictEqual(hulu.results.length, 3, 'a short row');
  assert.strictEqual(hulu.more, true);
  const pixar = comp._built.find(r => r.title === 'Pixar');
  assert.strictEqual(pixar.more, false, 'one page, no network: Lampa decides');
  assert.ok(!comp._built[0].more, 'tiles row has no «Ещё»');
});

test('tiles row is its own line type, so Lampa\'s poster-height min-height does not apply', () => {
  const row = load()._tilesRow('fox');
  assert.strictEqual(row.line_type, 'multifan-tiles');
  assert.strictEqual(row.nomore, true);
});

test('a network page starts the remote on its series; the catalog starts on the tiles', () => {
  let mock = makeMock({ responder });
  let comp = load(mock)._component({ network: 'fox' });
  let downs = 0; comp.down = () => { downs++; };
  comp.create();
  assert.strictEqual(downs, 1);

  mock = makeMock({ responder });
  comp = load(mock)._component({ network: '' });
  downs = 0; comp.down = () => { downs++; };
  comp.create();
  assert.strictEqual(downs, 0);
});

test('without Lampa Timeline there is simply no continue row', () => {
  const mock = makeMock({ responder });
  const comp = load(mock)._component({ network: '' });
  comp.create();
  assert.strictEqual(comp._built[0].title, 'Каналы');
  assert.strictEqual(comp._built[1].title, 'Популярные мультсериалы');
});

// ---------- navigation ----------

test('choosing a network: push from the catalog, replace between networks, same one is a no-op', () => {
  let mock = makeMock();
  load(mock)._openNetwork('fox');
  assert.deepStrictEqual(mock.calls.activityPush[0], { url: '', title: 'Multi-Fan · FOX', component: 'multifan', network: 'fox', source: 'tmdb', card_type: true, page: 1 });

  const replaced = [];
  mock = makeMock({ activeActivity: { component: 'multifan', network: 'fox' } });
  mock.Lampa.Activity.replace = (o) => replaced.push(o);
  const api = load(mock);
  api._openNetwork('hulu');
  api._openNetwork('');
  api._openNetwork('fox');
  assert.deepStrictEqual(replaced.map(o => o.network), ['hulu', '']);
  assert.strictEqual(mock.calls.activityPush.length, 0);
});

test('a tile opens its network on enter, not a card page', () => {
  const mock = makeMock();
  const api = load(mock);
  const row = api._tilesRow('');
  const tile = row.cardClass(row.results[3]);
  tile.create();
  tile.render().trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush[0].network, 'fox');
  assert.match(tile.render()._html, /<img class="multifan-net__logo" src="IMG:\/1DSpHrWyOORkL9N2QHX7Adt31mQ\.png"/);
});

test('a lazily appended tile joins the remote\'s focus collection when Lampa marks it visible', () => {
  const api = load();
  const row = api._tilesRow('');
  const tile = row.cardClass(row.results[9]);
  tile.create();
  assert.match(tile.render()._html, /class="multifan-net selector layer--visible layer--render/);
  let appended = 0;
  tile.onVisible = () => { appended++; }; // the row sets this after create()
  tile.render().trigger('visible');
  assert.strictEqual(appended, 1);
});

test('«Ещё» on a network row opens the network; on other rows, the grid', () => {
  const mock = makeMock({ responder });
  const comp = load(mock)._component({ network: '' });
  comp.create();
  comp.onMore({ title: 'Hulu', url: 'discover/tv?x', network: 'hulu' });
  comp.onMore({ title: 'Pixar', url: 'discover/movie?with_companies=3' });
  assert.strictEqual(mock.calls.activityPush[0].network, 'hulu');
  assert.deepStrictEqual(mock.calls.activityPush[1], { url: 'discover/movie?with_companies=3', title: 'Pixar', component: 'category_full', source: 'tmdb', card_type: true, page: 1 });
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
  const comp = load(mock)._component({ network: '' });
  comp.create();
  assert.match(mock.calls.empties[0].descr, /401/);
});

test('on ready: one Multi-Fan menu item that opens the full catalog, once', () => {
  const mock = makeMock();
  load(mock);
  mock.calls.listeners.app({ type: 'ready' });
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.multifan, 'function');
  assert.strictEqual(mock.menuList._children.length, 1);
  const item = mock.menuList._children[0];
  assert.strictEqual(item.text(), 'Multi-Fan');
  item.trigger('hover:enter');
  assert.strictEqual(mock.calls.activityPush[0].component, 'multifan');
  assert.strictEqual(mock.calls.activityPush[0].network, '');
});
