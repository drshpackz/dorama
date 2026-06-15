// =============================================================================
//  TestSec — Z01 premium-gate security self-test  (Lampa plugin)
//  AUTHORIZED OWNER USE ONLY.
//
//  Settings -> TestSec ->
//    "Run backend test"      : ~3 requests. [1] check.php key disclosure for the
//                              logged-in email; [2] does a FRESH FAKE email get a
//                              real, stored key (farming / no email verification)?
//                              Writes ONE trial row, labelled for easy cleanup.
//    "Audit client-side gates": instant, READ-ONLY, no network, no writes. Reports
//                              the premium UX gates as actually enforced on the
//                              client: locked VIP sources, the "Укажите email"
//                              message, ads — and that all of it is localStorage.
//
//  Diagnostic, not a farming/unlock tool. Re-run after the server fix to confirm:
//  you want [1] = no key, [2] = OK, and the audit verdict unchanged (gates remain
//  client-side until you move enforcement to the server).
//
//  Cleanup after backend tests:
//    DELETE FROM trials WHERE raw_email LIKE 'zsec-testsec-%@example.com';
//
//  Keep this OUT of public builds. Set REQUIRE_FLAG=true below to hide the menu
//  unless  Lampa.Storage.set('testsec_enabled', 1)  is set on the device.
// =============================================================================
(function () {
  'use strict';

  var HOST = 'https://oplata.z01.online';
  var REQUIRE_FLAG = false;   // true => menu only shows when testsec_enabled is set

  // ---- helpers -------------------------------------------------------------
  function reqJSON(url, cb) {
    fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; } cb(j); })
      .catch(function (e) { cb({ error: String(e) }); });
  }
  function ruid() {
    var s = 'abcdefghijklmnopqrstuvwxyz0123456789', o = '', i;
    for (i = 0; i < 8; i++) o += s.charAt(Math.floor(Math.random() * 36));
    return o;
  }
  function short(k) { return k ? (String(k).slice(0, 12) + '...') : ''; }
  function yn(v) { return v ? 'yes' : 'no'; }

  function showReport(title, lines) {
    var box = $('<div style="padding:1.5em;line-height:1.5;text-align:left;max-width:44em;"></div>');
    box.append('<div style="font-size:1.4em;margin-bottom:.5em;color:#e74c3c;">' + title + '</div>');
    var pre = $('<pre style="white-space:pre-wrap;font-size:1.02em;opacity:.95;"></pre>');
    pre.text(lines.join('\n'));            // .text() => no HTML injection from server output
    box.append(pre);
    Lampa.Modal.open({
      title: '',
      html: box,
      onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('settings_component'); }
    });
  }

  // mirror of online.js isRuUser() — VIP sources only appear for ru users
  function isRuUser() {
    try { var lang = Lampa.Storage.field('language'); if (lang) return lang === 'ru'; } catch (e) {}
    try { var nl = (navigator.language || navigator.userLanguage || '').toLowerCase(); return nl === 'ru' || nl.indexOf('ru-') === 0; } catch (e) {}
    return false;
  }

  // ---- [1]+[2] backend test ------------------------------------------------
  function runBackendTest() {
    Lampa.Noty.show('TestSec: running backend test...');
    var out = [];
    var myEmail = Lampa.Storage.get('account_email', '');

    function step2() {
      var fake = 'zsec-testsec-' + Date.now() + '@example.com';
      var uid = ruid();
      reqJSON(HOST + '/trial.php?email=' + encodeURIComponent(fake) + '&uid=' + uid, function (g) {
        reqJSON(HOST + '/check.php?email=' + encodeURIComponent(fake), function (ck) {
          out.push('');
          out.push('[2] fake unverified email:');
          out.push('    ' + fake);
          out.push('    trial.php -> ' + (g.status || g.raw || g.error || '?') + (g.zpremkey ? '  key=' + short(g.zpremkey) : ''));
          out.push('    check.php -> ' + (ck.status || ck.raw || ck.error || '?') + (ck.zpremkey ? '  key=' + short(ck.zpremkey) : ''));
          var farmable = g.zpremkey && (ck.status === 'active' || ck.zpremkey);
          out.push('    ' + (farmable
            ? 'FARMABLE: a fake email got a real, stored key (no verification).'
            : 'OK: fake email did not yield a usable key.'));
          out.push('');
          out.push("cleanup: DELETE FROM trials WHERE raw_email LIKE 'zsec-testsec-%@example.com';");
          Lampa.Noty.show('TestSec: done');
          showReport('TestSec — backend', out);
        });
      });
    }

    if (myEmail) {
      reqJSON(HOST + '/check.php?email=' + encodeURIComponent(myEmail), function (c) {
        out.push('[1] check.php for your email:');
        out.push('    ' + myEmail);
        out.push('    ' + (c.zpremkey ? 'KEY DISCLOSED (' + (c.status || '?') + '): ' + short(c.zpremkey)
                                      : 'no key (' + (c.status || c.error || '?') + ')'));
        step2();
      });
    } else {
      out.push('[1] no account email set in Lampa — disclosure test skipped');
      step2();
    }
  }

  // ---- [3] client-side gate audit (read-only, no network) ------------------
  function auditClientGates() {
    var out = [];
    var email = Lampa.Storage.get('account_email', '');
    var key   = Lampa.Storage.get('zpremkey', '');
    var exp   = Lampa.Storage.get('zprem_expires', '');
    var used  = Lampa.Storage.get('zprem_trial_used', '');
    var purl  = Lampa.Storage.get('online_url', '');
    var validExp = exp ? (new Date(exp).getTime() > Date.now()) : false;
    var clientPremium = !!key && validExp;
    var ru = isRuUser();

    // Lampa-core premium (which gates the start ads) — probed defensively; this is
    // SEPARATE from zpremkey, so Z01 premium does not remove Lampa-core ads.
    var lampaPrem = 'n/a (Lampa-core, not this plugin)';
    try {
      if (window.Lampa && Lampa.Account && typeof Lampa.Account.hasPremium === 'function') {
        lampaPrem = yn(Lampa.Account.hasPremium());
      }
    } catch (e) {}

    out.push('STORAGE (the entire gate state lives here):');
    out.push('  account_email    : ' + (email || '(none)') + '   logged-in: ' + yn(!!email));
    out.push('  zpremkey         : ' + (key ? 'present (len ' + key.length + ')' : '(none)'));
    out.push('  zprem_expires    : ' + (exp || '(none)') + '   valid: ' + yn(validExp));
    out.push('  zprem_trial_used : ' + (used || '(none)'));
    out.push('  online_url       : ' + (purl || '(none)'));
    out.push('');
    out.push('DERIVED UI STATE:');
    out.push('  client thinks premium : ' + yn(clientPremium));
    out.push('  isRuUser (language)   : ' + yn(ru));
    out.push('  VIP teasers shown     : ' + yn(ru && !key) +
             (ru && !key ? '  (Filmix/HDRezka/KinoPub/Alloha 4K VIP' + (used ? '' : ' [demo]') + ')' : ''));
    out.push('  pick VIP without key  : locked -> ' + (email ? 'buy/trial dialog' : '"Укажите email в настройках"'));
    out.push('  start ads (Lampa-core): premium=' + lampaPrem + '  (zpremkey does NOT affect this)');
    out.push('');
    out.push('VERDICT:');
    out.push('  Every gate above is read from Lampa.Storage on the client:');
    out.push('   - set zpremkey + a future zprem_expires  => UI flips to "premium"');
    out.push('     (VIP unlocks, teasers hidden, buy/trial prompts gone).');
    out.push('   - a REAL key (farmed/disclosed) also plays streams, because the');
    out.push('     stream server validates X-Zprem-Key.');
    out.push('   - a FAKE key unlocks only the look; streams fail server-side.');
    out.push('   - ADS are gated by Lampa-core, not zpremkey, so a Z01 subscriber');
    out.push('     still sees them (product gap, separate from this plugin).');
    out.push('  => UI gating is cosmetic. Real enforcement must be server-side.');

    showReport('TestSec — client gate audit', out);
  }

  // ---- menu ----------------------------------------------------------------
  function addMenu() {
    if (!window.Lampa || !Lampa.SettingsApi) return;
    if (REQUIRE_FLAG && !Lampa.Storage.get('testsec_enabled', '')) return;

    Lampa.SettingsApi.addComponent({
      component: 'testsec',
      name: 'TestSec',
      icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>'
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_backend', type: 'button' },
      field: { name: 'Run backend test', description: 'check.php disclosure + fake-email farming (~3 requests, 1 trial row). Authorized owner use.' },
      onChange: runBackendTest
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_audit', type: 'button' },
      field: { name: 'Audit client-side gates', description: 'Read-only: VIP locks, ads, "Укажите email" — shows they are all localStorage.' },
      onChange: auditClientGates
    });
  }

  if (window.appready) addMenu();
  else if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addMenu(); });
  }
})();
