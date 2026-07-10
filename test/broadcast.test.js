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

test('hover:enter calls Lampa.Broadcast.open with type card and the movie', () => {
  const mock = makeMock();
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  render._inserted[0].btn.trigger('hover:enter');
  assert.strictEqual(mock.calls.broadcastOpen.length, 1);
  assert.deepStrictEqual(mock.calls.broadcastOpen[0], { type: 'card', object: MOVIE });
});

test('no button when Lampa.Broadcast is absent', () => {
  const mock = makeMock({ noBroadcast: true });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
});

test('no button in child mode (parental_control set)', () => {
  const mock = makeMock({ storage: { parental_control: true } });
  loadPluginFile(mock, 'broadcast.js');
  const render = fakeRender({ online: true });
  fire(mock, render, MOVIE);
  assert.strictEqual(render._inserted.length, 0);
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
