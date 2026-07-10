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
      }
    });
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
    try { return !!Lampa.Storage.field('parental_control'); } catch (e) { return false; }
  }

  function canBroadcast() {
    return !!(Lampa.Broadcast && typeof Lampa.Broadcast.open === 'function');
  }

  function addButton(render, movie) {
    if (!render || !render.find) return;
    if (!canBroadcast() || childMode()) return;
    if (render.find('.view--playtv').length) return;

    var btn = $(makeButtonHtml());
    btn.on('hover:enter', function () {
      try {
        Lampa.Broadcast.open({ type: 'card', object: movie });
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
      _makeButtonHtml: makeButtonHtml
    };
  }
})();
