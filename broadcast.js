/**
 * Broadcast — «Play on TV» button for Lampa (lampa.mx).
 *
 * Adds a "На ТВ / On TV" button to every movie/series detail page. Tapping it
 * calls Lampa's built-in Broadcast module (device discovery + picker + socket
 * transport), sending type:'card' so the chosen device opens this title's
 * detail page — playback is then started on the TV itself.
 *
 * No networking of our own: if the running Lampa build has no Broadcast
 * module (or child mode is on), the button is simply not rendered.
 */
(function () {
  'use strict';

  var manifest = { name: 'Broadcast', version: '1.0.0' };

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
      }
    });
  }

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

  function renameRowHtml() {
    // Reuses the native broadcast__device class so focus styling matches the
    // device rows; the marker class keeps injection idempotent.
    return '<div class="broadcast__device selector broadcast-rename--plugin" style="display:flex;align-items:center;opacity:0.85">' +
      // Lampa's global CSS (svg{width:100%;height:100%}) overrides width/height
      // ATTRIBUTES — the size must be an inline style to win.
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:1em;height:1em;flex-shrink:0;margin-right:0.7em">' +
      '<path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>' +
      '</svg>' +
      '<span>' + Lampa.Lang.translate('playontv_rename') + ': ' + deviceName() + '</span>' +
      '</div>';
  }

  // Add a «✎ rename» row to the native Broadcast picker. The row lives OUTSIDE
  // .broadcast__devices, which the picker empties and refills every ~3s.
  function injectRenameRow() {
    if (!(Lampa.Input && typeof Lampa.Input.edit === 'function')) return;
    setTimeout(function () {
      try {
        var root = $('.broadcast');
        if (!root.length || root.find('.broadcast-rename--plugin').length) return;
        var row = $(renameRowHtml());
        row.on('hover:enter', function () {
          Lampa.Input.edit({
            title: Lampa.Lang.translate('playontv_rename'),
            value: deviceName(),
            free: true,
            nosave: true
          }, function (new_value) {
            if (saveDeviceName(new_value)) {
              row.find('span').text(Lampa.Lang.translate('playontv_rename') + ': ' + deviceName());
            }
            // Return focus to the picker modal after the keyboard closes.
            try { Lampa.Controller.toggle('modal'); } catch (e) {}
          });
        });
        root.append(row);
        // Re-collect the modal's focusables so the new row is navigable now,
        // not only after the next devices poll.
        try { Lampa.Controller.toggle('modal'); } catch (e) {}
      } catch (e) {}
    }, 100);
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

  function childMode() {
    // Same public signal native Broadcast checks (Permit.child) — exposed as
    // Lampa.Account.Permit. NOTE: never use Storage.field() for this: field()
    // returns the STRING 'undefined' (truthy!) for unregistered keys.
    try { return !!(Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.child); } catch (e) { return false; }
  }

  // Broadcast.open('card') dereferences params.object.card.id — it expects the
  // full-page ACTIVITY object (what the native icon sends), not the raw movie.
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

  function canBroadcast() {
    return !!(Lampa.Broadcast && typeof Lampa.Broadcast.open === 'function');
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

  function addButton(render, movie) {
    if (!render || !render.find) return;
    if (!canBroadcast() || childMode() || !loggedIn()) return;
    if (render.find('.view--playtv').length) return;

    var btn = $(makeButtonHtml());
    btn.on('hover:enter', function () {
      try {
        Lampa.Broadcast.open({ type: 'card', object: buildCardObject(movie) });
        injectRenameRow();
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
      _renameRowHtml: renameRowHtml
    };
  }
})();
