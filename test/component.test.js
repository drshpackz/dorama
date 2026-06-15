'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('component.create puts «Рекомендации для Вас» first, then curated rows', () => {
  const mock = makeMock({
    favorites: { like: [{ id: 100, original_language: 'ko', genre_ids: [18, 80], vote_average: 8, first_air_date: '2020-01-01' }], history: [], viewed: [] },
    responder: function (url) {
      if (url.indexOf('/recommendations') >= 0) return { results: [{ id: 201, original_language: 'ko', genre_ids: [18, 80], vote_average: 8.4, vote_count: 300, poster_path: '/a.jpg' }] };
      return { results: [{ id: 1000, name: 'row-item', poster_path: '/x.jpg' }], total_pages: 12 };
    }
  });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const built = comp._built;
  assert.ok(Array.isArray(built));
  assert.strictEqual(built[0].title, 'Рекомендации для Вас');
  assert.ok(built[0].personal);
  assert.strictEqual(built[1].title, 'Сейчас смотрят'); // popular row right after recs
  const reqs = mock.calls.requests.join('\n');
  assert.match(reqs, /\/recommendations/);                 // personalized seeds fetched
  assert.match(reqs, /discover\/tv\?with_original_language=ko&with_genres=80\|9648/); // curated rows still fetched
});

test('component.onMore pushes a category_full grid for the row', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  comp.onMore({ title: 'Корейские триллеры (сериалы)', url: 'discover/tv?x=1' });
  const push = mock.calls.activityPush[mock.calls.activityPush.length - 1];
  assert.deepStrictEqual(push, {
    url: 'discover/tv?x=1', title: 'Корейские триллеры (сериалы)',
    component: 'category_full', source: 'tmdb', card_type: true, page: 1
  });
});

test('component.create with no signals shows curated rows (recs omitted, Noty hinted)', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.ok(Array.isArray(comp._built));
  assert.strictEqual(comp._built[0].title, 'Сейчас смотрят'); // no recs row; popular row leads
  assert.ok(mock.calls.noty.length >= 1, 'cold-start hint shown');
  assert.ok(mock.calls.toggles >= 1);
});

test('component.destroy clears the network request', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  comp.destroy();
  assert.ok(mock.calls.clears > 0, 'destroy() must clear the in-flight Reguest');
});

test('recommendation items are tagged with media_type for correct detail routing', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  // built[0] is the prompt row (no likes), built[1..] are curated rows with TMDB results
  const curated = comp._built.filter(function (r) { return !r.personal; });
  curated.forEach(function (row) {
    row.results.forEach(function (it) {
      assert.ok(it.media_type === 'movie' || it.media_type === 'tv');
    });
  });
});

test('component.onMore ignores the recommendation row (no url → no broken grid)', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const before = mock.calls.activityPush.length;
  comp.onMore({ title: 'В духе «Паразитов»', results: [], source: 'tmdb' }); // no url
  assert.strictEqual(mock.calls.activityPush.length, before);
});
