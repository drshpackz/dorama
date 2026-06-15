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
    var box = $('<div style="padding:1.2em;line-height:1.45;text-align:left;max-width:44em;"></div>');
    box.append('<div style="font-size:1.3em;margin-bottom:.5em;color:#e74c3c;">' + title + '</div>');
    var pre = $('<pre style="white-space:pre-wrap;word-break:break-word;font-size:0.92em;opacity:.95;"></pre>');
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

    // Lampa-core premium gates the start ads — SEPARATE from zpremkey, so Z01
    // premium never removes Lampa-core ads. Probed defensively.
    var ads = 'Lampa-core gated';
    try {
      if (window.Lampa && Lampa.Account && typeof Lampa.Account.hasPremium === 'function') {
        ads = Lampa.Account.hasPremium() ? 'hidden (Lampa prem)' : 'shown (free)';
      }
    } catch (e) {}

    // short, one-fact-per-line layout so it fits a phone / TV screen
    out.push('STORAGE (= the whole gate):');
    out.push(' email: ' + (email || '(none)'));
    out.push('   logged-in: ' + yn(!!email));
    out.push(' zpremkey: ' + (key ? 'len ' + key.length : '(none)'));
    out.push(' expires: ' + (exp || '(none)'));
    out.push('   valid: ' + yn(validExp));
    out.push(' trial_used: ' + (used || '(none)'));
    out.push(' online_url: ' + (purl || '(none)'));
    out.push('');
    out.push('UI STATE (derived):');
    out.push(' client premium: ' + yn(clientPremium));
    out.push(' ru user: ' + yn(ru));
    out.push(' VIP teasers: ' + (ru && !key ? 'shown' + (used ? '' : ' [demo]') : 'hidden'));
    if (ru && !key) out.push('   Filmix/HDRezka/KinoPub/Alloha');
    out.push(' VIP w/o key: locked');
    out.push('   -> ' + (email ? 'buy/trial dialog' : '"Укажите email"'));
    out.push(' ads: ' + ads);
    out.push('   (zpremkey has no effect)');
    out.push('');
    out.push('VERDICT:');
    out.push(' All gates = Lampa.Storage');
    out.push(' (client-side only):');
    out.push(' - set zpremkey + future');
    out.push('   expires => UI "premium"');
    out.push(' - REAL key also plays');
    out.push('   streams (server checks');
    out.push('   X-Zprem-Key)');
    out.push(' - FAKE key = look only;');
    out.push('   streams fail server-side');
    out.push(' - ads = Lampa-core, not');
    out.push('   zpremkey (product gap)');
    out.push(' => UI gating is cosmetic.');
    out.push('    Enforce server-side.');

    showReport('TestSec — client gate audit', out);
  }

  // ---- UI-state simulator (for testing the premium UX) ---------------------
  // Snapshots your real storage on first use; "Restore" puts it all back.
  // "Premium look" sets a DUMMY key => UI flips to premium but streams will NOT
  // play (the stream server validates the key). That is correct for UI testing.
  var BK = 'testsec_backup';
  var SIM_KEYS = ['account_email', 'zpremkey', 'zprem_expires', 'zprem_trial_used', 'online_url'];

  function snapshot() {
    if (Lampa.Storage.get(BK, '')) return;           // keep the first (real) snapshot
    var snap = {}, i;
    for (i = 0; i < SIM_KEYS.length; i++) snap[SIM_KEYS[i]] = Lampa.Storage.get(SIM_KEYS[i], '');
    Lampa.Storage.set(BK, snap);
  }
  function applyState(map, note) {
    snapshot();
    var k;
    for (k in map) if (map.hasOwnProperty(k)) Lampa.Storage.set(k, map[k]);
    Lampa.Noty.show('TestSec: ' + note + ' — reloading...');
    setTimeout(function () { location.reload(); }, 1200);
  }
  function simFree()     { applyState({ account_email: '', zpremkey: '', zprem_expires: '', zprem_trial_used: '', online_url: '' }, 'Free / logged out'); }
  function simNoSub()    { applyState({ account_email: 'uitest@example.com', zpremkey: '', zprem_expires: '', zprem_trial_used: '' }, 'Logged-in, no subscription'); }
  function simPremiumUI(){ applyState({ zpremkey: 'DEMO-ui-only', zprem_expires: '2030-01-01' }, 'Premium look (UI only, no real streams)'); }
  function simRestore() {
    var snap = Lampa.Storage.get(BK, ''), i;
    if (!snap) { Lampa.Noty.show('TestSec: nothing to restore'); return; }
    for (i = 0; i < SIM_KEYS.length; i++) Lampa.Storage.set(SIM_KEYS[i], snap[SIM_KEYS[i]] || '');
    Lampa.Storage.set(BK, '');
    Lampa.Noty.show('TestSec: restored your real state — reloading...');
    setTimeout(function () { location.reload(); }, 1200);
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

    // --- UI-state simulator (snapshots real state; use Restore to revert) ---
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_sim_free', type: 'button' },
      field: { name: 'Sim: Free / logged out', description: 'Clear email + key. VIP teasers locked, "Укажите email" on select.' },
      onChange: simFree
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_sim_nosub', type: 'button' },
      field: { name: 'Sim: Logged-in, no subscription', description: 'Email set, no key. VIP select shows the buy / 48h-trial dialog.' },
      onChange: simNoSub
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_sim_premium', type: 'button' },
      field: { name: 'Sim: Premium look (UI only)', description: 'Dummy key => premium UI. Streams will NOT play (server-checked). For UI testing.' },
      onChange: simPremiumUI
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_sim_restore', type: 'button' },
      field: { name: 'Restore my real state', description: 'Revert all simulated changes back to your real account/key.' },
      onChange: simRestore
    });
  }

  if (window.appready) addMenu();
  else if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addMenu(); });
  }
})();
