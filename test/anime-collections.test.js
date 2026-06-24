'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPluginFile } = require('./helpers/lampa-mock');

function loadAC() { return loadPluginFile(makeMock(), 'anime-collections.js'); }
function loadACWith(mock) { return loadPluginFile(mock, 'anime-collections.js'); }

test('buildHubRows builds 3 groups with the verified collections', () => {
  const { buildHubRows } = loadAC();
  const rows = buildHubRows();
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows.map(r => r.title), ['Студии', 'Франшизы', 'Подборки']);
  assert.strictEqual(rows[0].results.length, 12); // studios
  assert.strictEqual(rows[1].results.length, 7);  // franchises
  assert.strictEqual(rows[2].results.length, 5);  // themes
  assert.strictEqual(typeof rows[0].cardClass, 'function');
  const ghibli = rows[0].results.filter(c => c.title === 'Studio Ghibli')[0];
  assert.strictEqual(ghibli._entry.url, 'discover/movie?with_companies=10342&sort_by=popularity.desc&vote_count.gte=5');
  const ds = rows[1].results.filter(c => c.title === 'Demon Slayer')[0];
  assert.strictEqual(ds._entry.url, 'collection/925155');
  assert.ok(rows[0].results[0].poster_path, 'cover poster set');
});

test('isCollectionUrl and methodOf', () => {
  const ac = loadAC();
  assert.ok(ac.isCollectionUrl('collection/925155'));
  assert.ok(!ac.isCollectionUrl('discover/tv?x=1'));
  assert.strictEqual(ac.methodOf({ name: 'Show' }), 'tv');
  assert.strictEqual(ac.methodOf({ title: 'Film' }), 'movie');
  assert.strictEqual(ac.methodOf({ first_air_date: '2020' }), 'tv');
});

test('parseItems reads .parts for collections, .results for discover, tags media_type', () => {
  const { parseItems } = loadAC();
  const coll = parseItems({ parts: [{ id: 1, title: 'M' }, { id: 2, name: 'S' }] }, true);
  assert.strictEqual(coll.results.length, 2);
  assert.strictEqual(coll.total_pages, 1);
  assert.strictEqual(coll.results[0].media_type, 'movie');
  assert.strictEqual(coll.results[1].media_type, 'tv');
  const disc = parseItems({ results: [{ id: 3, name: 'T' }], total_pages: 9 }, false);
  assert.strictEqual(disc.results[0].media_type, 'tv');
  assert.strictEqual(disc.total_pages, 9);
});

test('_tmdbUrl adds api_key + language', () => {
  const ac = loadAC();
  const u = ac._tmdbUrl('discover/tv?with_companies=10342');
  assert.ok(u.indexOf('api_key=') >= 0, 'has api_key: ' + u);
  assert.ok(u.indexOf('language=') >= 0, 'has language: ' + u);
});

test('CoverCard renders its title and opens the view on hover:enter', () => {
  const mock = makeMock();
  const ac = loadACWith(mock);
  const entry = { url: 'collection/925155', title: 'Demon Slayer' };
  const card = new ac._CoverCard({ title: 'Demon Slayer', poster_path: '/p.jpg', _entry: entry });
  card.create();
  assert.ok(card.render()._html.indexOf('Demon Slayer') >= 0);
  card.render().trigger('hover:enter');
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.strictEqual(push.component, 'anime_collections_view');
  assert.strictEqual(push.url, 'collection/925155');
  assert.strictEqual(push.title, 'Demon Slayer');
});

test('start registers both components + injects the menu; hub builds 3 rows', () => {
  const mock = makeMock();
  const ac = loadACWith(mock);
  mock.calls.listeners.app({ type: 'ready' });
  assert.strictEqual(typeof mock.calls.componentAdd.anime_collections_main, 'function');
  assert.strictEqual(typeof mock.calls.componentAdd.anime_collections_view, 'function');
  assert.strictEqual(mock.menuList._children.length, 1);
  assert.strictEqual(mock.menuList._children[0].text(), 'Аниме коллекции');
  const comp = ac._hub({});
  comp.create();
  assert.strictEqual(comp._built.length, 3);
});

test('view fetches a discover page, builds results, paginates; cardRender opens detail', () => {
  const mock = makeMock({ responder: function () { return { results: [{ id: 700, name: 'Anime', poster_path: '/a.jpg' }], total_pages: 5 }; } });
  const ac = loadACWith(mock);
  const comp = ac._view({ url: 'discover/tv?with_companies=21444', page: 1 });
  comp.create();
  assert.ok(comp._built && Array.isArray(comp._built.results));
  assert.strictEqual(comp._built.results[0].id, 700);
  const reqs = mock.calls.requests.join('\n');
  assert.match(reqs, /discover\/tv\?with_companies=21444/);
  assert.match(reqs, /api_key=/); // authenticated
  const card = {};
  comp.cardRender({}, { id: 700, name: 'Anime' }, card);
  assert.strictEqual(card.onMenu, false);
  card.onEnter();
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.strictEqual(push.component, 'full');
  assert.strictEqual(push.id, 700);
  assert.strictEqual(push.method, 'tv');
  let resolved;
  comp.nextPageReuest({ page: 2 }, function (d) { resolved = d; }, function () {});
  assert.ok(resolved && resolved.results.length > 0, 'discover paginates');
});

test('view for a collection reads parts and does not paginate', () => {
  const mock = makeMock({ responder: function () { return { parts: [{ id: 1, title: 'Film1' }, { id: 2, title: 'Film2' }] }; } });
  const ac = loadACWith(mock);
  const comp = ac._view({ url: 'collection/925155', page: 1 });
  comp.create();
  assert.strictEqual(comp._built.results.length, 2);
  let rejected = false;
  comp.nextPageReuest({ page: 2 }, function () {}, function () { rejected = true; });
  assert.ok(rejected, 'collections are finite — nextPage rejects');
});

test('view shows empty state when the fetch returns nothing', () => {
  const mock = makeMock({ responder: function () { return { results: [] }; } });
  const ac = loadACWith(mock);
  const comp = ac._view({ url: 'discover/tv?with_companies=99999', page: 1 });
  comp.create();
  assert.strictEqual(comp._empty, true);
  assert.strictEqual(comp._built, undefined);
});
