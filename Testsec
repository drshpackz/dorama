// =============================================================================
//  TestSec — Z01 premium-gate security self-test  (Lampa plugin)
//  AUTHORIZED OWNER USE ONLY.
//
//  Adds  Settings -> TestSec -> "Run security test".  It runs a BOUNDED set of
//  diagnostics against your own backend and shows a report:
//    [1] check.php disclosure for the logged-in email (is a key returned?)
//    [2] does a single FRESH FAKE email get a real, stored key (farming / no
//        email verification)?  -> one trial row, labelled for easy cleanup.
//
//  This is a diagnostic, not a farming tool: it makes ~3 requests per run and
//  reports PASS/FAIL. Re-run it AFTER deploying the server-side fix to confirm
//  the holes are closed (you want [1] = no key, [2] = OK).
//
//  Cleanup after use:
//    DELETE FROM trials WHERE raw_email LIKE 'zsec-testsec-%@example.com';
// =============================================================================
(function () {
  'use strict';

  var HOST = 'https://oplata.z01.online';

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

  function showReport(lines) {
    var box = $('<div style="padding:1.5em;line-height:1.5;text-align:left;max-width:42em;"></div>');
    box.append('<div style="font-size:1.4em;margin-bottom:.5em;color:#e74c3c;">TestSec — results</div>');
    var pre = $('<pre style="white-space:pre-wrap;font-size:1.05em;opacity:.95;"></pre>');
    pre.text(lines.join('\n'));            // .text() = no HTML injection from server output
    box.append(pre);
    Lampa.Modal.open({
      title: '',
      html: box,
      onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('settings_component'); }
    });
  }

  function runTests() {
    Lampa.Noty.show('TestSec: running...');
    var out = [];
    var myEmail = Lampa.Storage.get('account_email', '');

    // [2] fresh fake email -> trial.php -> check.php  (farming / verification test)
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
          out.push('cleanup SQL:');
          out.push("DELETE FROM trials WHERE raw_email LIKE 'zsec-testsec-%@example.com';");
          Lampa.Noty.show('TestSec: done');
          showReport(out);
        });
      });
    }

    // [1] disclosure for the logged-in email
    if (myEmail) {
      reqJSON(HOST + '/check.php?email=' + encodeURIComponent(myEmail), function (c) {
        out.push('[1] check.php for your email:');
        out.push('    ' + myEmail);
        out.push('    ' + (c.zpremkey
          ? 'KEY DISCLOSED (' + (c.status || '?') + '): ' + short(c.zpremkey)
          : 'no key (' + (c.status || c.error || '?') + ')'));
        step2();
      });
    } else {
      out.push('[1] no account email set in Lampa — disclosure test skipped');
      step2();
    }
  }

  function addMenu() {
    if (!window.Lampa || !Lampa.SettingsApi) return;
    Lampa.SettingsApi.addComponent({
      component: 'testsec',
      name: 'TestSec',
      icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>'
    });
    Lampa.SettingsApi.addParam({
      component: 'testsec',
      param: { name: 'testsec_run', type: 'button' },
      field: {
        name: 'Run security test',
        description: 'Bounded check of check.php / trial.php — authorized owner use. Re-run after the fix to confirm it is closed.'
      },
      onChange: function () { runTests(); }
    });
  }

  if (window.appready) addMenu();
  else if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addMenu(); });
  }
})();
