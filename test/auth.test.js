'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

// Regression for the live 401 bug: Lampa.TMDB.api() does NOT add api_key,
// so the plugin must append it itself or every request is unauthenticated.
test('every TMDB request carries an api_key (regression: 401 auth bug)', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.ok(mock.calls.requests.length > 0, 'requests were issued');
  mock.calls.requests.forEach(function (u) {
    assert.ok(u.indexOf('api_key=') >= 0, 'missing api_key in: ' + u);
  });
});

test('the URL builder is exported and adds api_key + language', () => {
  const mock = makeMock();
  const api = loadPlugin(mock);
  assert.strictEqual(typeof api._tmdbUrl, 'function');
  const u = api._tmdbUrl('discover/tv?with_original_language=ko');
  assert.ok(u.indexOf('api_key=') >= 0, 'has api_key: ' + u);
  assert.ok(u.indexOf('language=') >= 0, 'has language: ' + u);
  assert.ok(u.indexOf('api.themoviedb.org') >= 0 || u.indexOf('/3/') >= 0, 'has TMDB host: ' + u);
});

// Error visibility: a total auth failure must NOT look like a silent hang.
test('all requests failing (401) shows a visible auth error and resolves the activity', () => {
  const mock = makeMock({ responder: function () { return { __error: 401 }; } });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.strictEqual(comp._built, undefined, 'no content built');
  assert.strictEqual(mock.calls.empties.length, 1, 'one error screen shown');
  assert.ok(/401|авториз/i.test(mock.calls.empties[0].descr), 'error mentions auth/401: ' + mock.calls.empties[0].descr);
  assert.ok(mock.calls.loaderCalls.indexOf(false) >= 0, 'loader was turned off');
  assert.ok(mock.calls.toggles >= 1, 'activity toggled (no infinite spinner)');
});

// Genuinely empty (HTTP 200, no data) is a different state from an error.
test('genuinely empty results show "nothing found", not an auth error', () => {
  const mock = makeMock({ responder: function () { return { results: [] }; } });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.strictEqual(comp._built, undefined);
  assert.strictEqual(mock.calls.empties.length, 1, 'empty screen shown');
  assert.ok(!/401|авториз/i.test(mock.calls.empties[0].descr), 'not an auth error: ' + mock.calls.empties[0].descr);
  assert.ok(mock.calls.toggles >= 1, 'activity resolved (no infinite spinner)');
});

// Partial failure: if some rows load, show content (do not error the whole page).
test('partial failure still shows content when some rows load', () => {
  const mock = makeMock({ responder: function (url) {
    if (url.indexOf('discover/') >= 0) return { __error: 401 };
    if (url.indexOf('recommendations') >= 0) {
      var m = /\/(\d+)\/recommendations/.exec(url);
      var base = m ? parseInt(m[1], 10) : 0;
      return { results: [{ id: base + 1 }, { id: base + 2 }] };
    }
    return { results: [] };
  } });
  const api = loadPlugin(mock);
  const comp = api._component({});
  comp.create();
  assert.ok(Array.isArray(comp._built), 'content built despite discover failures');
  assert.strictEqual(comp._built[0].title, 'В духе «Паразитов»');
});
