'use strict';
const path = require('path');

// --- minimal jQuery-like element ---
function makeEl(html) {
  return {
    _html: html || '',
    _handlers: {},
    _children: [],
    length: 1,
    on: function (ev, fn) { this._handlers[ev] = fn; return this; },
    append: function (child) { this._children.push(child); return this; },
    empty: function () { this._children = []; return this; },
    find: function () { return makeEl(''); },
    addClass: function () { return this; },
    removeClass: function () { return this; },
    trigger: function (ev) { if (this._handlers[ev]) this._handlers[ev](); return this; },
    text: function () { var m = /menu__text[^>]*>([^<]*)</.exec(this._html); return m ? m[1] : ''; }
  };
}

// --- mock factory: returns { Lampa, $, window, calls } ---
function makeMock(options) {
  options = options || {};
  var calls = { activityPush: [], componentAdd: {}, listeners: {}, requests: [], clears: 0, empties: [], loaderCalls: [], toggles: 0, favToggles: [], noty: [], socketSend: [], modalOpen: [], inputEdits: [] };

  var menuList = makeEl('');               // the .menu .menu__list element
  function $(arg) {
    if (typeof arg === 'string' && arg.charAt(0) === '<') return makeEl(arg);
    if (typeof arg === 'string') return { eq: function () { return menuList; }, length: 1 };
    return arg; // already an element-like object → pass through
  }

  // canned TMDB responses keyed by URL substring; override via options.responder
  function defaultResponder(url) {
    if (url.indexOf('recommendations') >= 0) {
      // derive a couple of deterministic ids from the anchor id in the path
      var m = /\/(\d+)\/recommendations/.exec(url);
      var base = m ? parseInt(m[1], 10) : 0;
      return { results: [{ id: base + 1, title: 'rec' + (base + 1) }, { id: base + 2, title: 'rec' + (base + 2) }] };
    }
    return { results: [{ id: 1000, name: 'row-item' }], total_pages: 12 };
  }
  var responder = options.responder || defaultResponder;

  function Reguest() {
    this.timeout = function () {};
    this.silent = function (url, ok, err) {
      calls.requests.push(url);
      var json = responder(url);
      // Simulate a real HTTP/network error when the responder asks for one:
      // real Lampa.Reguest passes the augmented jqXHR to the error callback.
      if (json && json.__error) {
        if (err) err({ status: json.__error, decode_code: json.__error, decode_error: 'auth failed' });
        return;
      }
      ok(json);
    };
    this.clear = function () { calls.clears++; };
  }

  // Mock InteractionMain: records build()/empty()/destroy(), loader/toggle, and
  // exposes an appendable root via render() (for the error/empty Lampa.Empty path).
  function InteractionMain(object) {
    this.object = object;
    var rootEl = makeEl('<div class="dorama-root"></div>');
    this.activity = {
      loader: function (v) { calls.loaderCalls.push(v); },
      toggle: function () { calls.toggles++; }
    };
    this.build = function (data) { this._built = data; };
    this.empty = function () { this._empty = true; };
    this.render = function () { return rootEl; };
    this.destroy = function () { this._destroyed = true; };
  }

  var Lampa = {
    appready: false,
    Listener: {
      follow: function (name, fn) { calls.listeners[name] = fn; },
      send: function (name, ev) { if (calls.listeners[name]) calls.listeners[name](ev); }
    },
    Activity: {
      push: function (o) { calls.activityPush.push(o); },
      // Models real Lampa: active() returns the current activity object;
      // extractObject strips the runtime keys (activity/props/params).
      active: function () { if (!options.activeActivity) throw new Error('no active activity'); return options.activeActivity; },
      extractObject: function (object) {
        var saved = {};
        for (var i in object) if (!(i === 'activity' || i === 'props' || i === 'params')) saved[i] = object[i];
        return saved;
      }
    },
    Component: { add: function (name, fn) { calls.componentAdd[name] = fn; } },
    InteractionMain: InteractionMain,
    InteractionCategory: InteractionMain,
    Reguest: Reguest,
    // Real Lampa: api() only builds the host (+ proxy_tmdb); it does NOT append
    // api_key. key() is a function returning the public TMDB key.
    TMDB: {
      api: function (url) { return 'https://api.themoviedb.org/3/' + url; },
      key: function () { return 'TESTKEY'; }
    },
    Arrays: { shuffle: function (a) { return a; }, destroy: function () {} },
    Storage: (function () {
      var store = {};
      if (options.mine_reactions) store.mine_reactions = options.mine_reactions;
      if (options.storage) for (var sk in options.storage) if (options.storage.hasOwnProperty(sk)) store[sk] = options.storage[sk];
      var changeFns = [];
      return {
        // Models real Lampa: Params.field(name) = Storage.get(name, defaults[name] + '').
        // Unregistered keys therefore return the TRUTHY string 'undefined', not undefined.
        field: function (k) { if (k in store) return store[k]; return k === 'tmdb_lang' ? 'ru' : 'undefined'; },
        get: function (k, def) { return (k in store) ? store[k] : def; },
        set: function (k, v) { store[k] = v; for (var i = 0; i < changeFns.length; i++) changeFns[i]({ name: k, value: v }); },
        listener: { follow: function (name, fn) { if (name === 'change') changeFns.push(fn); }, send: function () {} }
      };
    })(),
    // Records constructed empties so tests can assert the error/empty descr.
    Empty: function (params) {
      calls.empties.push(params || {});
      this.render = function () { return makeEl('<div class="empty">' + ((params && params.descr) || '') + '</div>'); };
      this.start = function () { calls.emptyStart = (calls.emptyStart || 0) + 1; };
    },
    Controller: { add: function () {}, toggle: function () {}, collectionSet: function () {}, collectionFocus: function () {} },
    Noty: { show: function (m) { calls.noty.push(m); } },
    Lang: {
      add: function () {},
      translate: function (k) { return k; }
    },
    // Models real Lampa: Account.Permit.child is the public child-profile signal
    // (the same one native Broadcast's head icon checks); Permit.access is the
    // modern "logged in + account enabled" signal (Account.logged() is deprecated).
    Account: { Permit: { child: !!options.childProfile, access: !options.notLogged } },
    // Models real Lampa Socket (core/socket.js): uid() is this device's stable id,
    // devices() the last device list, send() attaches account per message, and
    // every inbound message is fanned out to listener 'message' followers.
    Socket: options.noSocket ? undefined : (function () {
      var followers = {};
      return {
        uid: function () { return options.socketUid || 'self-uid'; },
        devices: function () { return options.devices || []; },
        send: function (method, data) { calls.socketSend.push({ method: method, data: data }); },
        listener: {
          follow: function (name, fn) { (followers[name] = followers[name] || []).push(fn); },
          remove: function (name, fn) { var l = followers[name] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
          send: function (name, ev) { var l = (followers[name] || []).slice(); for (var i = 0; i < l.length; i++) l[i](ev); },
          count: function (name) { return (followers[name] || []).length; }
        }
      };
    })(),
    Modal: {
      open: function (params) { if (options.modalThrow) throw new Error('modal failed'); calls.modalOpen.push(params); },
      close: function () { calls.modalClose = (calls.modalClose || 0) + 1; },
      toggle: function () {}
    },
    Input: {
      edit: function (opts, cb) { calls.inputEdits.push(opts); if ('inputValue' in options) cb(options.inputValue); }
    },
    Api: { img: function (path, size) { return 'IMG:' + (path || ''); } },
    Favorite: (function () {
      var store = options.favorites || { like: [], history: [], viewed: [] };
      function idx(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return i; } return -1; }
      return {
        get: function (p) { return (store[p.type] || []).slice(); },
        check: function (card) {
          var r = { any: false }, types = ['like', 'history', 'viewed', 'book', 'wath'], i;
          for (i = 0; i < types.length; i++) { r[types[i]] = idx(store[types[i]] || [], card.id) >= 0; if (r[types[i]]) r.any = true; }
          return r;
        },
        toggle: function (where, card) {
          store[where] = store[where] || [];
          var i = idx(store[where], card.id), added;
          if (i >= 0) { store[where].splice(i, 1); added = false; } else { store[where].unshift(card); added = true; }
          calls.favToggles.push({ where: where, id: card.id });
          if (calls.listeners['state:changed']) calls.listeners['state:changed']({ target: 'favorite', reason: 'update', type: where, card: card });
          return added;
        },
        add: function (where, card) { store[where] = store[where] || []; if (idx(store[where], card.id) < 0) store[where].unshift(card); },
        remove: function (where, card) { store[where] = store[where] || []; var i = idx(store[where], card.id); if (i >= 0) store[where].splice(i, 1); }
      };
    })()
  };

  return { Lampa: Lampa, $: $, calls: calls, menuList: menuList };
}

// Load dorama.js fresh with the given mock installed as globals.
function loadPlugin(mock) {
  global.Lampa = mock.Lampa;
  global.$ = mock.$;
  global.window = mock.Lampa.appready ? { appready: true } : { appready: false };
  var p = path.resolve(__dirname, '..', '..', 'dorama.js');
  delete require.cache[require.resolve(p)];
  return require(p); // returns the exported helpers object
}

// Load an arbitrary plugin file (e.g. 'anime-collections.js') fresh with the mock globals.
function loadPluginFile(mock, filename) {
  global.Lampa = mock.Lampa;
  global.$ = mock.$;
  global.window = mock.Lampa.appready ? { appready: true } : { appready: false };
  var p = path.resolve(__dirname, '..', '..', filename);
  delete require.cache[require.resolve(p)];
  return require(p);
}

module.exports = { makeMock: makeMock, loadPlugin: loadPlugin, loadPluginFile: loadPluginFile, makeEl: makeEl };
