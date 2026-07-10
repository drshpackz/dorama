'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPluginFile } = require('./helpers/lampa-mock');

// Fake detail-page render root. Records every button insertion as {where, btn}
// so tests can assert both placement and count. .find('.view--playtv') reflects
// insertions, which is what the plugin's idempotency check reads.
function fakeRender(opts) {
  opts = opts || {};
  var inserted = [];
  function slot(where, present) {
    return { length: present ? 1 : 0, after: function (btn) { inserted.push({ where: where, btn: btn }); } };
  }
  return {
    _inserted: inserted,
    find: function (sel) {
      if (sel === '.view--playtv') return { length: inserted.length };
      if (sel === '.view--online') return slot('online', !!opts.online);
      if (sel === '.view--torrent') return slot('torrent', !!opts.torrent);
      if (sel === '.full-start-new__buttons') return { length: opts.row ? 1 : 0, append: function (btn) { inserted.push({ where: 'row', btn: btn }); } };
      if (sel === '.full-start__buttons') return { length: 0 };
      return { length: 0 };
    }
  };
}

// Simulate the detail page finishing its render.
function fire(mock, render, movie) {
  mock.Lampa.Listener.send('full', {
    type: 'complite',
    object: { activity: { render: function () { return render; } } },
    data: { movie: movie }
  });
}

const MOVIE = { id: 42, title: 'Test Movie', original_title: 'Test Movie' };

test('injects one button after .view--online, idempotent on repeat events', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true, torrent: true });
  fire(mock, render, MOVIE);
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 1);
  assert.strictEqual(render._inserted[0].where, 'online');
  assert.ok(render._inserted[0].btn._html.indexOf('view--playtv') >= 0);
});

test('falls back to .view--torrent, then to the buttons row', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const afterTorrent = fakeRender({ torrent: true });
  fire(mock, afterTorrent, MOVIE);
  assert.strictEqual(afterTorrent._inserted[0].where, 'torrent');

  const intoRow = fakeRender({ row: true });
  fire(mock, intoRow, MOVIE);
  assert.strictEqual(intoRow._inserted[0].where, 'row');
});

test('hover:enter sends the native activity object when Activity.active() is a full page', () => {
  // Real Broadcast.open reads params.object.card.id — the object must be the
  // activity object (what Activity.extractObject returns), never the raw movie.
  const fullActivity = { component: 'full', id: MOVIE.id, method: 'movie', card: MOVIE, source: 'tmdb', activity: { render: function () {} } };
  const mock = makeMock({ activeActivity: fullActivity });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  render._inserted[0].btn.trigger('hover:enter');
  assert.strictEqual(mock.calls.broadcastOpen.length, 1);
  const sent = mock.calls.broadcastOpen[0];
  assert.strictEqual(sent.type, 'card');
  assert.deepStrictEqual(sent.object, { component: 'full', id: MOVIE.id, method: 'movie', card: MOVIE, source: 'tmdb' }, 'activity object with runtime keys stripped');
});

test('hover:enter falls back to a constructed full-activity object (with .card) when Activity.active() is unavailable', () => {
  const mock = makeMock(); // no activeActivity → Activity.active() throws
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  render._inserted[0].btn.trigger('hover:enter');
  assert.strictEqual(mock.calls.broadcastOpen.length, 1);
  const sent = mock.calls.broadcastOpen[0];
  assert.strictEqual(sent.type, 'card');
  assert.strictEqual(sent.object.component, 'full');
  assert.strictEqual(sent.object.id, MOVIE.id);
  assert.strictEqual(sent.object.method, 'movie', 'no .name/.number_of_seasons → movie');
  assert.deepStrictEqual(sent.object.card, MOVIE, 'Broadcast.open dereferences object.card.id');
  assert.strictEqual(sent.object.source, 'tmdb');
});

test('no button when Lampa.Broadcast is absent', () => {
  const mock = makeMock({ noBroadcast: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('no button for a child profile (Account.Permit.child — the signal native Broadcast uses)', () => {
  const mock = makeMock({ childProfile: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('button DOES render on a normal profile even though field() returns truthy "undefined" for unknown keys', () => {
  // Regression: real Params.field returns the STRING 'undefined' for unregistered
  // keys (e.g. 'parental_control'), which hid the button on every real device.
  const mock = makeMock();
  assert.strictEqual(mock.Lampa.Storage.field('parental_control'), 'undefined', 'mock models real field()');
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 1);
});

test('no button when the account is not logged in (Permit.access false — no devices without CUB)', () => {
  const mock = makeMock({ notLogged: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('falls back to legacy Account.logged() when Permit is unavailable', () => {
  const mock = makeMock();
  mock.Lampa.Account = { logged: function () { return false; } }; // old build: no Permit
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0, 'legacy logged()=false hides the button');

  mock.Lampa.Account = { logged: function () { return true; } };
  const render2 = fakeRender({ online: true });
  fire(mock, render2, MOVIE);
  assert.strictEqual(render2._inserted.length, 1, 'legacy logged()=true shows the button');
});

test('deviceName(): falls back to "Lampa" for the truthy "undefined" string, uses stored value otherwise', () => {
  const bare = makeMock();
  const api1 = loadPluginFile(bare, 'broadcast.js');
  assert.strictEqual(api1._deviceName(), 'Lampa', 'field() returns "undefined" string for unset key');

  const named = makeMock({ storage: { device_name: 'Гостиная TV' } });
  const api2 = loadPluginFile(named, 'broadcast.js');
  assert.strictEqual(api2._deviceName(), 'Гостиная TV');
});

test('saveDeviceName(): trims and stores non-empty names, rejects empty/blank', () => {
  const mock = makeMock();
  const api = loadPluginFile(mock, 'broadcast.js');
  assert.strictEqual(api._saveDeviceName('  My iPhone  '), true);
  assert.strictEqual(mock.Lampa.Storage.get('device_name'), 'My iPhone');
  assert.strictEqual(api._saveDeviceName('   '), false, 'blank rejected');
  assert.strictEqual(api._saveDeviceName(undefined), false, 'undefined rejected');
  assert.strictEqual(mock.Lampa.Storage.get('device_name'), 'My iPhone', 'unchanged after rejects');
});

test('renameRowHtml(): native-styled selector row with pen icon and current name', () => {
  const mock = makeMock({ storage: { device_name: 'Кухня' } });
  const api = loadPluginFile(mock, 'broadcast.js');
  const html = api._renameRowHtml();
  assert.ok(html.indexOf('broadcast__device') >= 0, 'reuses native row class for focus styling');
  assert.ok(html.indexOf('broadcast-rename--plugin') >= 0, 'has marker class for idempotent inject');
  assert.ok(html.indexOf('selector') >= 0);
  assert.ok(html.indexOf('<svg') >= 0, 'has pen icon');
  // Lampa's global CSS is `svg{width:100%;height:100%}` — it overrides svg
  // width/height ATTRIBUTES, so the icon must be sized via inline style.
  const svgTag = html.slice(html.indexOf('<svg'), html.indexOf('>', html.indexOf('<svg')));
  assert.ok(/style="[^"]*width:\s*1em/.test(svgTag), 'svg width constrained via inline style');
  assert.ok(/style="[^"]*height:\s*1em/.test(svgTag), 'svg height constrained via inline style');
  assert.ok(html.indexOf('Кухня') >= 0, 'shows current device name');
});

test('Broadcast.open throwing shows a Noty and does not propagate', () => {
  const mock = makeMock({ broadcastThrow: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.doesNotThrow(() => render._inserted[0].btn.trigger('hover:enter'));
  assert.strictEqual(mock.calls.noty.length, 1);
  assert.ok(mock.calls.noty[0].indexOf('playontv_error') >= 0);
});
