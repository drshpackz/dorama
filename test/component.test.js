'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

test('component.create assembles recos-first catalog from TMDB requests', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  const built = comp._built;
  assert.ok(Array.isArray(built), 'build() received an array');
  assert.strictEqual(built[0].title, 'В духе «Паразитов»');     // recommendation row leads
  assert.ok(built[0].results.length > 0);
  assert.strictEqual(built[1].title, 'Корейские триллеры (сериалы)'); // then curated rows in order
  // every curated discover row was requested through Lampa.TMDB
  const reqs = mock.calls.requests.join('\n');
  assert.match(reqs, /discover\/tv\?with_original_language=ko&with_genres=80\|9648/);
  assert.match(reqs, /\/recommendations/); // recommendation seeds fetched
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

test('component.create calls empty() when every request returns no results', () => {
  const mock = makeMock({ responder: function () { return { results: [] }; } });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.strictEqual(comp._built, undefined);
  assert.strictEqual(comp._empty, true);
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
  const recos = comp._built[0].results;
  recos.forEach(it => assert.ok(it.media_type === 'movie' || it.media_type === 'tv'));
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
