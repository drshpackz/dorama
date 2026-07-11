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
const DEVICE = { device_id: 'd-tv', uid: 'conn-tv', name: 'Noname - Lampa' };

// ---------- button injection ----------

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

test('no button when Lampa.Socket is unavailable', () => {
  const mock = makeMock({ noSocket: true });
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
  // keys, which hid the button on every real device.
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

// ---------- picker open/close lifecycle ----------

test('hover:enter opens the picker modal, subscribes to socket messages, polls devices; onBack cleans up', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  render._inserted[0].btn.trigger('hover:enter');

  assert.strictEqual(mock.calls.modalOpen.length, 1, 'modal opened');
  assert.strictEqual(mock.calls.socketSend.filter(s => s.method === 'devices').length, 1, 'initial devices poll sent');
  // one 'message' follower from startPlugin (rename receiver) + one from the picker
  assert.strictEqual(mock.Lampa.Socket.listener.count('message'), 2, 'picker follows socket messages');

  mock.calls.modalOpen[0].onBack(); // close the picker (also stops the 3s interval)
  assert.strictEqual(mock.Lampa.Socket.listener.count('message'), 1, 'picker unsubscribed, receiver stays');
  assert.strictEqual(mock.calls.modalClose, 1, 'modal closed');
});

test('Modal.open throwing shows a Noty and does not propagate', () => {
  const mock = makeMock({ modalThrow: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.doesNotThrow(() => render._inserted[0].btn.trigger('hover:enter'));
  assert.strictEqual(mock.calls.noty.length, 1);
  assert.ok(mock.calls.noty[0].indexOf('playontv_error') >= 0);
});

// ---------- cast payload ----------

test('sendOpenTo(): native activity object when Activity.active() is a full page, card shrunk to {id, source}', () => {
  const fullActivity = { component: 'full', id: MOVIE.id, method: 'movie', card: MOVIE, source: 'tmdb', activity: { render: function () {} } };
  const mock = makeMock({ activeActivity: fullActivity });
  const api = loadPluginFile(mock, 'broadcast.js');
  api._sendOpenTo(DEVICE, MOVIE);
  const sent = mock.calls.socketSend.filter(s => s.method === 'open');
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].data.uid, 'conn-tv', 'addressed by connection uid, like native');
  assert.deepStrictEqual(sent[0].data.params, {
    component: 'full', id: MOVIE.id, method: 'movie', card: { id: MOVIE.id, source: 'tmdb' }, source: 'tmdb'
  }, 'runtime keys stripped, card shrunk exactly like native Broadcast');
});

test('sendOpenTo(): constructed full-activity fallback when Activity.active() is unavailable', () => {
  const mock = makeMock(); // no activeActivity → Activity.active() throws
  const api = loadPluginFile(mock, 'broadcast.js');
  api._sendOpenTo(DEVICE, MOVIE);
  const sent = mock.calls.socketSend.filter(s => s.method === 'open');
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].data.params, {
    component: 'full', id: MOVIE.id, method: 'movie', card: { id: MOVIE.id, source: 'tmdb' }, source: 'tmdb'
  });
});

// ---------- device filtering & display names ----------

test('pickerDevices(): excludes CUB and this device, keeps the rest', () => {
  const mock = makeMock({ socketUid: 'me' });
  const api = loadPluginFile(mock, 'broadcast.js');
  const out = api._pickerDevices([
    { device_id: 'me', uid: 'c0', name: 'Mobile - Lampa' },
    { device_id: 'x1', uid: 'c1', name: 'CUB' },
    { device_id: 'x2', uid: 'c2', name: 'Browser - Lampa' },
    null,
    { device_id: 'x3', uid: 'c3', name: 'Noname - Lampa' }
  ]);
  assert.deepStrictEqual(out.map(d => d.device_id), ['x2', 'x3']);
});

test('displayName(): local alias wins over the reported name; alias storage tolerates JSON strings', () => {
  const mock = makeMock({ storage: { playontv_aliases: '{"d-tv":"Гостиная ТВ"}' } });
  const api = loadPluginFile(mock, 'broadcast.js');
  assert.strictEqual(api._displayName(DEVICE), 'Гостиная ТВ', 'alias (parsed from JSON string) wins');
  assert.strictEqual(api._displayName({ device_id: 'other', name: 'Browser - Lampa' }), 'Browser - Lampa', 'no alias → reported name');
});

test('escapeHtml(): device names are escaped (they are remote-controlled strings)', () => {
  const mock = makeMock();
  const api = loadPluginFile(mock, 'broadcast.js');
  assert.strictEqual(api._escapeHtml('<img src=x onerror=alert(1)>&"'), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;');
});

// ---------- rename: sender side ----------

test('renameDeviceDialog(): prefills current name; saves local alias AND sends playontv_rename to the device', () => {
  const mock = makeMock({ inputValue: '  Кухня ТВ  ' });
  const api = loadPluginFile(mock, 'broadcast.js');
  api._renameDeviceDialog(DEVICE);

  assert.strictEqual(mock.calls.inputEdits.length, 1);
  assert.strictEqual(mock.calls.inputEdits[0].value, 'Noname - Lampa', 'keyboard prefilled with current display name');

  assert.strictEqual(api._displayName(DEVICE), 'Кухня ТВ', 'trimmed alias stored locally');

  const sent = mock.calls.socketSend.filter(s => s.method === 'other');
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].data, { params: { submethod: 'playontv_rename', name: 'Кухня ТВ' }, uid: 'conn-tv' });
});

test('renameDeviceDialog(): blank input changes nothing', () => {
  const mock = makeMock({ inputValue: '   ' });
  const api = loadPluginFile(mock, 'broadcast.js');
  api._renameDeviceDialog(DEVICE);
  assert.strictEqual(api._displayName(DEVICE), 'Noname - Lampa');
  assert.strictEqual(mock.calls.socketSend.filter(s => s.method === 'other').length, 0);
});

// ---------- rename: receiver side ----------

test('receiver applies playontv_rename from the socket and confirms with a Noty', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js'); // startPlugin subscribes the receiver
  mock.Lampa.Socket.listener.send('message', { method: 'other', data: { submethod: 'playontv_rename', name: 'Спальня' } });
  assert.strictEqual(mock.Lampa.Storage.get('device_name'), 'Спальня');
  assert.strictEqual(mock.calls.noty.length, 1);
});

test('receiver ignores foreign submethods, other methods, and empty names', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  mock.Lampa.Socket.listener.send('message', { method: 'other', data: { submethod: 'play', object: {} } });
  mock.Lampa.Socket.listener.send('message', { method: 'devices', data: [] });
  mock.Lampa.Socket.listener.send('message', { method: 'other', data: { submethod: 'playontv_rename', name: '   ' } });
  assert.strictEqual(mock.Lampa.Storage.get('device_name'), undefined, 'device_name untouched');
  assert.strictEqual(mock.calls.noty.length, 0);
});

// ---------- self rename & row markup ----------

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
  assert.ok(html.indexOf('broadcast-rename--plugin') >= 0, 'has marker class');
  assert.ok(html.indexOf('selector') >= 0);
  assert.ok(html.indexOf('<svg') >= 0, 'has pen icon');
  // Lampa's global CSS is `svg{width:100%;height:100%}` — it overrides svg
  // width/height ATTRIBUTES, so the icon must be sized via inline style.
  const svgTag = html.slice(html.indexOf('<svg'), html.indexOf('>', html.indexOf('<svg')));
  assert.ok(/style="[^"]*width:\s*1em/.test(svgTag), 'svg width constrained via inline style');
  assert.ok(/style="[^"]*height:\s*1em/.test(svgTag), 'svg height constrained via inline style');
  assert.ok(html.indexOf('Кухня') >= 0, 'shows current device name');
});
