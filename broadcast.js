/**
 * Broadcast — «Play on TV» button for Lampa (lampa.mx).
 *
 * Adds a "На ТВ / On TV" button to every movie/series detail page. Tapping it
 * opens the plugin's own device picker (same look and socket protocol as
 * Lampa's native Broadcast modal) listing every device logged into the same
 * account. Selecting a device opens this title's detail page there.
 *
 * Extras over the native picker:
 *  - a «✎» pen on every device row: renames that device. The new name is sent
 *    to the device over the socket (applied for everyone if it also runs this
 *    plugin) AND stored as a local alias (shown here immediately regardless);
 *  - a bottom row to rename THIS device (device_name — the name Lampa attaches
 *    to every socket message).
 *
 * The button is not rendered when Lampa.Socket/Modal are unavailable, in a
 * child profile, or when no account is logged in (device list would be empty).
 */
(function () {
  'use strict';

  var manifest = { name: 'Broadcast', version: '2.1.1' };

  function addLang() {
    if (!Lampa.Lang || !Lampa.Lang.add) return;
    Lampa.Lang.add({
      playontv_title: { ru: 'На ТВ', en: 'On TV', uk: 'На ТБ' },
      playontv_error: {
        ru: 'Не удалось отправить на устройство',
        en: 'Could not send to device',
        uk: 'Не вдалося надіслати на пристрій'
      },
      playontv_rename: {
        ru: 'Переименовать это устройство',
        en: 'Rename this device',
        uk: 'Перейменувати цей пристрій'
      },
      playontv_renamed: {
        ru: 'Устройство переименовано',
        en: 'Device renamed',
        uk: 'Пристрій перейменовано'
      }
    });
  }

  // ---------- names & aliases ----------

  function deviceName() {
    var n = '';
    try { n = Lampa.Storage.field('device_name'); } catch (e) {}
    // field() returns the STRING 'undefined' for unset keys — treat as unset.
    if (!n || n === 'undefined') n = 'Lampa';
    return n;
  }

  function saveDeviceName(value) {
    var v = typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '') : '';
    if (!v) return false;
    Lampa.Storage.set('device_name', v);
    return true;
  }

  // Local aliases (this device's private names for others), keyed by the
  // stable device_id. Storage may hand the map back as a JSON string.
  function aliasMap() {
    var m = {};
    try { m = Lampa.Storage.get('playontv_aliases', '{}'); } catch (e) {}
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
    return m && typeof m === 'object' ? m : {};
  }

  function setAlias(device_id, name) {
    var m = aliasMap();
    m[device_id] = name;
    Lampa.Storage.set('playontv_aliases', m);
  }

  function displayName(device) {
    var m = aliasMap();
    return m[device.device_id] || device.name || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- markup ----------

  // Lampa's global CSS (svg{width:100%;height:100%}) overrides width/height
  // ATTRIBUTES — the size must be an inline style to win.
  function penSvg(size) {
    var s = size || '1em';
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:' + s + ';height:' + s + ';flex-shrink:0">' +
      '<path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>' +
      '</svg>';
  }

  function renameRowHtml() {
    // Reuses the native broadcast__device class so focus styling matches the
    // device rows; the marker class identifies the plugin's self-rename row.
    return '<div class="broadcast__device selector broadcast-rename--plugin" style="display:flex;align-items:center;opacity:0.85">' +
      '<span style="display:inline-flex;margin-right:0.7em">' + penSvg('1em') + '</span>' +
      '<span>' + Lampa.Lang.translate('playontv_rename') + ': ' + escapeHtml(deviceName()) + '</span>' +
      '</div>';
  }

  function makeButtonHtml() {
    return '<div class="full-start__button selector view--playtv" data-subtitle="' + manifest.name + ' ' + manifest.version + '">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="4" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M8 21h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>' +
      '<span>' + Lampa.Lang.translate('playontv_title') + '</span>' +
      '</div>';
  }

  // ---------- gates ----------

  function childMode() {
    // Same public signal native Broadcast checks (Permit.child) — exposed as
    // Lampa.Account.Permit. NOTE: never use Storage.field() for this: field()
    // returns the STRING 'undefined' (truthy!) for unregistered keys.
    try { return !!(Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.child); } catch (e) { return false; }
  }

  function canCast() {
    return !!(Lampa.Socket && typeof Lampa.Socket.send === 'function' &&
      Lampa.Modal && typeof Lampa.Modal.open === 'function');
  }

  function loggedIn() {
    // Devices are discovered over the CUB account socket — without a logged-in
    // account the picker is always empty, so hide the button entirely.
    // Modern signal: Account.Permit.access; legacy fallback: Account.logged().
    try {
      if (Lampa.Account && Lampa.Account.Permit) return !!Lampa.Account.Permit.access;
      if (Lampa.Account && typeof Lampa.Account.logged === 'function') return !!Lampa.Account.logged();
    } catch (e) {}
    return false;
  }

  // ---------- socket protocol ----------

  // Same filter as native Broadcast: drop the CUB service entry and ourselves.
  function pickerDevices(list) {
    var self_uid = '';
    try { self_uid = Lampa.Socket.uid(); } catch (e) {}
    var out = [];
    for (var i = 0; i < (list || []).length; i++) {
      var d = list[i];
      if (!d || d.name === 'CUB' || d.device_id === self_uid) continue;
      out.push(d);
    }
    return out;
  }

  // The 'open' receiver does Activity.push(result.data) — it expects the
  // full-page ACTIVITY object. Mirror native Broadcast: extract the current
  // activity and shrink the card to {id, source}.
  function buildCardObject(movie) {
    try {
      var act = Lampa.Activity.active();
      if (act && act.component === 'full' && Lampa.Activity.extractObject) {
        return Lampa.Activity.extractObject(act);
      }
    } catch (e) {}
    return {
      component: 'full',
      id: movie.id,
      method: (movie.name || movie.number_of_seasons) ? 'tv' : 'movie',
      card: movie,
      source: movie.source || 'tmdb'
    };
  }

  function sendOpenTo(device, movie) {
    var object = buildCardObject(movie);
    var clone = {};
    for (var k in object) if (Object.prototype.hasOwnProperty.call(object, k)) clone[k] = object[k];
    var card = clone.card || movie || {};
    clone.card = { id: card.id, source: card.source || 'tmdb' };
    Lampa.Socket.send('open', { params: clone, uid: device.uid });
  }

  // Rename command to another device. Applied there when it runs this plugin;
  // the local alias makes the new name visible HERE immediately either way.
  function sendRename(device, name) {
    setAlias(device.device_id, name);
    try {
      Lampa.Socket.send('other', { params: { submethod: 'playontv_rename', name: name }, uid: device.uid });
    } catch (e) {}
  }

  // Receiver half of the rename protocol (subscribed once at plugin start).
  // Native code ignores 'other' submethods it doesn't know, but still fans
  // every message out to Socket.listener followers.
  function handleSocketMessage(e) {
    if (!e || e.method !== 'other' || !e.data || e.data.submethod !== 'playontv_rename') return;
    if (saveDeviceName(e.data.name)) {
      try { Lampa.Noty.show(Lampa.Lang.translate('playontv_renamed') + ': ' + deviceName()); } catch (err) {}
    }
  }

  // ---------- inline rename ----------

  // Commit half of an inline rename: value === null means cancelled (Esc).
  function commitDeviceRename(device, value) {
    var v = typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '') : '';
    if (!v || v === displayName(device)) return false;
    sendRename(device, v);
    return true;
  }

  function commitSelfRename(value) {
    var v = typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '') : '';
    if (!v || v === deviceName()) return false;
    return saveDeviceName(v);
  }

  // Swap an element's content for a text input, in place. Enter/blur commit,
  // Esc cancels; onDone(value|null) fires exactly once. Key events must not
  // bubble — Lampa's Navigator would treat them as remote-control navigation.
  function startInlineEdit(el, current, onDone) {
    var input = $('<input type="text" style="width:100%;box-sizing:border-box;background:transparent;border:none;outline:none;color:inherit;font:inherit;padding:0" />');
    var done = false;

    function finish(commit) {
      if (done) return;
      done = true;
      var v = '';
      try { v = input.val(); } catch (e) {}
      onDone(commit ? v : null);
    }

    input.on('keydown', function (e) {
      if (e.stopPropagation) e.stopPropagation();
      if (e.keyCode === 13) finish(true);
      if (e.keyCode === 27) finish(false);
    });
    // Clicks inside the input must not bubble into the row's hover:enter
    // (which would cast to the device / restart the edit).
    input.on('click mousedown mouseup', function (e) {
      if (e.stopPropagation) e.stopPropagation();
    });
    input.on('blur', function () { finish(true); });

    el.empty();
    el.append(input);
    try { input.val(current); } catch (e) {}
    setTimeout(function () {
      try { input[0].focus(); input[0].select(); } catch (e) {}
    }, 30);
  }

  // ---------- the picker ----------

  // Our own device picker: same template classes and socket protocol as the
  // native Broadcast modal, plus a pen per device row and a self-rename row.
  // (The native modal keeps device uids in closures — pens can't be added to it.)
  function openPicker(movie) {
    var enabled = 'content';
    try { enabled = Lampa.Controller.enabled().name; } catch (e) {}

    var html = $('<div class="broadcast">' +
      '<div class="broadcast__text">' + Lampa.Lang.translate('broadcast_open') + '</div>' +
      '<div class="broadcast__scan"><div></div></div>' +
      '<div class="broadcast__devices"></div>' +
      '</div>');
    var list = html.find('.broadcast__devices');
    var lastDevices = [];
    var lastKey = '';
    var poll = null;
    // While an inline rename is open, device updates must NOT re-render the
    // list — a rebuild destroys the input mid-edit. Data is buffered in
    // lastDevices and applied when the edit finishes.
    var editActive = false;

    function onMessage(e) {
      if (e && e.method === 'devices') {
        if (editActive) lastDevices = e.data || [];
        else renderDevices(e.data);
      }
    }

    function close() {
      try { Lampa.Socket.listener.remove('message', onMessage); } catch (e) {}
      clearInterval(poll);
      try { Lampa.Modal.close(); } catch (e) {}
      try { Lampa.Controller.toggle(enabled); } catch (e) {}
    }

    function renderDevices(devices) {
      lastDevices = devices || [];
      var select = null;
      list.empty();

      var filtered = pickerDevices(lastDevices);
      for (var i = 0; i < filtered.length; i++) {
        (function (device) {
          var editing = false;
          var wrap = $('<div style="display:flex;align-items:stretch"></div>');
          var name = $('<div class="broadcast__device selector" style="flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escapeHtml(displayName(device)) + '</div>');
          var pen = $('<div class="broadcast__device selector" style="flex-shrink:0;display:flex;align-items:center;margin-left:0.5em">' +
            penSvg('1.2em') + '</div>');

          name.on('hover:enter', function () {
            if (editing) return; // an input is open inside this row
            close();
            sendOpenTo(device, movie);
          }).on('hover:focus', function () { lastKey = device.uid; });

          pen.on('hover:enter', function () {
            if (editing) return;
            editing = true;
            editActive = true;
            // The name cell becomes the input, right where it was clicked.
            startInlineEdit(name, displayName(device), function (value) {
              editing = false;
              editActive = false;
              commitDeviceRename(device, value);
              renderDevices(lastDevices);
            });
          }).on('hover:focus', function () { lastKey = device.uid + ':pen'; });

          if (lastKey === device.uid) select = name[0];
          if (lastKey === device.uid + ':pen') select = pen[0];

          wrap.append(name);
          wrap.append(pen);
          list.append(wrap);
        })(filtered[i]);
      }

      var selfEditing = false;
      var self_row = $(renameRowHtml());
      self_row.on('hover:enter', function () {
        if (selfEditing) return;
        selfEditing = true;
        editActive = true;
        startInlineEdit(self_row, deviceName(), function (value) {
          selfEditing = false;
          editActive = false;
          commitSelfRename(value);
          renderDevices(lastDevices);
        });
      }).on('hover:focus', function () { lastKey = ':self'; });
      if (lastKey === ':self') select = self_row[0];
      list.append(self_row);

      // Re-collect the modal's focusables (and keep focus where it was).
      try { Lampa.Modal.toggle(select); } catch (e) {}
    }

    Lampa.Modal.open({
      title: '',
      html: html,
      size: 'small',
      mask: true,
      onBack: close
    });

    try { Lampa.Socket.listener.follow('message', onMessage); } catch (e) {}
    renderDevices((Lampa.Socket.devices && Lampa.Socket.devices()) || []);
    try { Lampa.Socket.send('devices', {}); } catch (e) {}
    poll = setInterval(function () {
      try { Lampa.Socket.send('devices', {}); } catch (e) {}
    }, 3000);
  }

  // ---------- button on the detail page ----------

  function addButton(render, movie) {
    if (!render || !render.find) return;
    if (!canCast() || childMode() || !loggedIn()) return;
    if (render.find('.view--playtv').length) return;

    var btn = $(makeButtonHtml());
    btn.on('hover:enter', function () {
      try {
        openPicker(movie);
      } catch (e) {
        Lampa.Noty.show(Lampa.Lang.translate('playontv_error'));
      }
    });

    // Keep ordering predictable: right after the online button when present,
    // else after torrent, else at the end of the buttons row.
    var online = render.find('.view--online');
    var torrent = render.find('.view--torrent');
    if (online.length) online.after(btn);
    else if (torrent.length) torrent.after(btn);
    else {
      var row = render.find('.full-start-new__buttons');
      if (!row.length) row = render.find('.full-start__buttons');
      if (row.length) row.append(btn);
    }
  }

  function startPlugin() {
    window.broadcast_plugin = true;
    addLang();

    // Receiver half of the rename protocol.
    try {
      if (Lampa.Socket && Lampa.Socket.listener) Lampa.Socket.listener.follow('message', handleSocketMessage);
    } catch (e) {}

    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') addButton(e.object.activity.render(), e.data.movie);
    });

    // Plugin may load while a detail page is already open.
    try {
      if (Lampa.Activity.active().component === 'full') {
        addButton(Lampa.Activity.active().activity.render(), Lampa.Activity.active().card);
      }
    } catch (e) {}
  }

  if (!window.broadcast_plugin) startPlugin();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _addButton: addButton,
      _makeButtonHtml: makeButtonHtml,
      _deviceName: deviceName,
      _saveDeviceName: saveDeviceName,
      _renameRowHtml: renameRowHtml,
      _escapeHtml: escapeHtml,
      _pickerDevices: pickerDevices,
      _displayName: displayName,
      _sendOpenTo: sendOpenTo,
      _commitDeviceRename: commitDeviceRename,
      _commitSelfRename: commitSelfRename,
      _handleSocketMessage: handleSocketMessage
    };
  }
})();
