(function () {
  'use strict';

  // Curated dark-Korean Discover rows. URLs verified against themoviedb.org
  // (spec v2 §5/§7). '|' = OR (broaden), ',' = AND (narrow). Thriller(53) is
  // MOVIE-ONLY and never appears in a discover/tv url.
  function buildRows() {
    return [
      { title: 'Корейские триллеры (сериалы)', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=80|9648&sort_by=popularity.desc&vote_count.gte=40' },
      { title: 'Корейское кино: триллеры', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|80|9648&sort_by=popularity.desc&vote_count.gte=50' },
      { title: 'Социальные триллеры (неравенство)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53,18&sort_by=popularity.desc&vote_count.gte=50' },
      { title: 'Выживание и антиутопия', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=10765|18|9648&with_keywords=4565|10349&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Дом-ловушка (бетон / многоэтажка)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_keywords=286239|33347|4565|10349&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Игры разума и саспенс', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|9648&with_keywords=12565|10714|9748&sort_by=popularity.desc&vote_count.gte=25' },
      { title: 'Лучшее: корейские триллеры', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=53|80&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=400&vote_average.gte=7' }
    ];
  }

  // Merge recommendation result arrays: dedupe by id, drop any id in `excludeIds`,
  // cap at `cap` items. Tolerates null/empty lists.
  function mergeRecommendations(lists, excludeIds, cap) {
    var seen = {}, out = [], i, j, items, it;
    if (cap <= 0) return out;
    for (i = 0; i < excludeIds.length; i++) seen[excludeIds[i]] = true;
    for (i = 0; i < lists.length; i++) {
      items = lists[i] || [];
      for (j = 0; j < items.length; j++) {
        it = items[j];
        if (!it || it.id == null || seen[it.id]) continue;
        seen[it.id] = true;
        out.push(it);
        if (out.length >= cap) return out;
      }
    }
    return out;
  }

  // --- personalized recommender (pure helpers) ---
  var ASIAN_LANGS = { ko: 1, ja: 1, zh: 1, th: 1 };
  var ASIAN_COUNTRIES = { KR: 1, JP: 1, CN: 1, TW: 1, HK: 1, TH: 1 };
  var SCORE_MAX = 9.0;
  var MIN_POOL = 20;

  function isAsianDrama(card) {
    if (!card) return false;
    if (card.original_language && ASIAN_LANGS[card.original_language]) return true;
    var oc = card.origin_country || [], i;
    for (i = 0; i < oc.length; i++) { if (ASIAN_COUNTRIES[oc[i]]) return true; }
    return false;
  }

  // Liked cards filtered to Asian dramas, capped at `limit`. Order is the caller's
  // (Lampa.Favorite.get({type:'like'}) already returns most-recent-first).
  function collectSeeds(liked, limit) {
    var out = [], i;
    liked = liked || [];
    for (i = 0; i < liked.length && out.length < limit; i++) {
      if (isAsianDrama(liked[i])) out.push(liked[i]);
    }
    return out;
  }

  // TV vs movie for a stored favorite card (mirrors core recomend.js).
  function seedType(card) {
    return (card.number_of_seasons || card.first_air_date || card.name) ? 'tv' : 'movie';
  }

  // Weighted genre/language profile. Seeds may be plain cards (weight 1) or
  // {card, weight} objects.
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, i, j, gids, g, ln, w, card;
    for (i = 0; i < seeds.length; i++) {
      card = seeds[i].card || seeds[i]; w = seeds[i].weight || seeds[i].__weight || 1;
      if (!card) continue;
      gids = card.genre_ids || [];
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + w; total += w; }
      ln = card.original_language; if (ln) langCount[ln] = (langCount[ln] || 0) + w;
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang };
  }

  // Weighted content+collaborative score. `coScore` = sum of seed weights that surfaced this candidate.
  function scoreCandidate(c, profile, coScore) {
    var co = Math.min(coScore || 0, 6) / 6;
    var gids = c.genre_ids || [], over = 0, i;
    for (i = 0; i < gids.length; i++) { over += profile.genreWeight[gids[i]] || 0; }
    if (over > 1) over = 1;
    var lang = c.original_language;
    var langMatch = lang === profile.topLang ? 1 : (profile.langs[lang] ? 0.6 : (ASIAN_LANGS[lang] ? 0.3 : 0));
    var rating = Math.max(0, Math.min(10, c.vote_average || 0)) / 10;
    var votesConf = (c.vote_count || 0) >= 100 ? 1 : (c.vote_count || 0) / 100;
    return 3.0 * co + 2.5 * over + 1.5 * langMatch + 1.5 * rating + 0.5 * votesConf;
  }

  // Map a raw score to a 55..99% "match" band.
  function predictionPercent(score) {
    var r = score / SCORE_MAX;
    if (r < 0) r = 0; if (r > 1) r = 1;
    return Math.round(55 + 44 * r);
  }

  // --- graded signals: native likes + 5-level reactions (mine_reactions) ---
  var REACTION_WEIGHT = { fire: 2.0, nice: 1.0, think: 0.5 };

  function hasType(types, t) { return !!types && types.indexOf(t) >= 0; }

  // Signed grade for a title from its reaction types + liked flag.
  function gradeOf(types, liked) {
    types = types || [];
    if (hasType(types, 'shit')) return { sign: 'strongNeg', weight: -2 };
    if (hasType(types, 'bore')) return { sign: 'mildNeg', weight: -1 };
    var w = 0;
    if (hasType(types, 'fire')) w = Math.max(w, REACTION_WEIGHT.fire);
    if (hasType(types, 'nice')) w = Math.max(w, REACTION_WEIGHT.nice);
    if (hasType(types, 'think')) w = Math.max(w, REACTION_WEIGHT.think);
    if (liked) w = Math.max(w, 1.0);
    if (w <= 0) return { sign: 'none', weight: 0 };
    var posReaction = hasType(types, 'fire') || hasType(types, 'nice') || hasType(types, 'think');
    if (liked && posReaction) w = Math.min(w + 0.5, 2.5);
    return { sign: 'pos', weight: w };
  }

  // The user's own reactions from local Storage 'mine_reactions':
  // { '<media>_<tmdbId>': ['fire'|'nice'|'think'|'bore'|'shit', ...] }.
  function collectReactions() {
    var mine = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('mine_reactions', {}) || {}) : {};
    var out = [], k, us, media, id;
    for (k in mine) {
      if (!mine.hasOwnProperty(k)) continue;
      us = k.indexOf('_'); if (us < 0) continue;
      media = k.slice(0, us); id = parseInt(k.slice(us + 1), 10);
      if (!id) continue;
      out.push({ media: media, id: id, types: mine[k] || [] });
    }
    return out;
  }

  // Merge likes + reactions → positive seeds (with weight + card if liked),
  // negative seeds, and the set of all rated ids.
  function collectSignals() {
    var liked = favGet('like');
    var reactions = collectReactions();
    var map = {}, i, r, c, key, e, g;
    for (i = 0; i < reactions.length; i++) {
      r = reactions[i]; key = r.media + '_' + r.id;
      map[key] = { id: r.id, media: r.media, types: (r.types || []).slice(), liked: false, card: null };
    }
    for (i = 0; i < liked.length; i++) {
      c = liked[i]; key = (c.name ? 'tv' : 'movie') + '_' + c.id;
      if (!map[key]) map[key] = { id: c.id, media: (c.name ? 'tv' : 'movie'), types: [], liked: false, card: null };
      map[key].liked = true; map[key].card = c;
    }
    var positives = [], negatives = [], ratedIds = {};
    for (key in map) {
      if (!map.hasOwnProperty(key)) continue;
      e = map[key]; ratedIds[e.id] = true;
      g = gradeOf(e.types, e.liked);
      if (g.sign === 'pos') { if (!e.card || isAsianDrama(e.card)) positives.push({ id: e.id, media: e.media, weight: g.weight, card: e.card }); }
      else if (g.sign === 'strongNeg') negatives.push({ id: e.id, media: e.media, strong: true });
      else if (g.sign === 'mildNeg') negatives.push({ id: e.id, media: e.media, strong: false });
    }
    positives.sort(function (a, b) { return b.weight - a.weight; });
    return { positives: positives.slice(0, 8), negatives: negatives.slice(0, 6), ratedIds: ratedIds };
  }

  var dislikeCache = { sig: '', set: null };

  function negativeSignature(negatives) {
    var s = '', i;
    for (i = 0; i < negatives.length; i++) s += negatives[i].id + (negatives[i].strong ? 's' : 'm') + ',';
    return s;
  }

  // Build {strong:{id:true}, mild:{id:true}} from negatives' ids + their TMDB look-alikes.
  function buildDislikeSet(network, negatives, done) {
    var sig = negativeSignature(negatives);
    if (dislikeCache.set && dislikeCache.sig === sig) { done(dislikeCache.set); return; }
    var set = { strong: {}, mild: {} }, i;
    for (i = 0; i < negatives.length; i++) (negatives[i].strong ? set.strong : set.mild)[negatives[i].id] = true;
    if (!negatives.length) { dislikeCache = { sig: sig, set: set }; done(set); return; }
    var k = 0;
    function step() {
      if (k >= negatives.length) { dislikeCache = { sig: sig, set: set }; done(set); return; }
      var n = negatives[k], bucket = n.strong ? set.strong : set.mild;
      fetchResults(network, n.media + '/' + n.id + '/recommendations', n.media, function (results) {
        var j; for (j = 0; j < results.length && j < 20; j++) { if (results[j] && results[j].id != null) bucket[results[j].id] = true; }
        k++; step();
      });
    }
    step();
  }

  function dislikeRank(set, id) {
    if (!set || id == null) return 0;
    if (set.strong[id]) return 2;
    if (set.mild[id]) return 1;
    return 0;
  }

  // Stable de-prioritization: normals keep order, 😴 below them, 💩 last. Nothing removed.
  function reorderByDislike(results, set) {
    if (!set) return results;
    var ranked = [], i;
    for (i = 0; i < results.length; i++) ranked.push({ r: results[i], rank: dislikeRank(set, results[i] && results[i].id), i: i });
    ranked.sort(function (a, b) { return (a.rank - b.rank) || (a.i - b.i); });
    var out = []; for (i = 0; i < ranked.length; i++) out.push(ranked[i].r);
    return out;
  }

  var RECS_TITLE = 'Рекомендации для Вас';
  var recsCache = { sig: '', row: null };
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; dislikeCache.sig = ''; dislikeCache.set = null; }

  function recommendationsRow(results, errored, cold) {
    return { title: RECS_TITLE, personal: true, results: results, source: 'tmdb', __errored: !!errored, __cold: !!cold };
  }

  function positiveSignature(positives) {
    var s = '', i;
    for (i = 0; i < positives.length; i++) s += positives[i].id + ':' + positives[i].weight + ',';
    return s;
  }

  // Inject a «xx%» badge into each card of a personal row, via the 'line' event.
  function registerMatchBadge() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('line', function (e) {
      if (!e || (e.type !== 'append' && e.type !== 'visible')) return;
      if (!e.data || !e.data.personal || !e.items) return;
      var i, item, el, view, pct;
      for (i = 0; i < e.items.length; i++) {
        item = e.items[i];
        el = (item && item.render) ? item.render() : null;
        if (!el || !el.find) continue;
        view = el.find('.card__view');
        if (!view.length || view.find('.dorama-match').length) continue;
        pct = item.data && item.data.__match;
        if (!pct) continue;
        view.append('<div class="dorama-match" style="position:absolute;left:0.3em;top:0.3em;z-index:2;background:rgba(0,0,0,0.7);color:#7ed957;font-weight:700;padding:0.2em 0.5em;border-radius:1em;pointer-events:none">' + pct + '%</div>');
      }
    });
  }

  function promptCard() {
    return { __prompt: true, title: 'Лайкните дорамы, чтобы получить персональные рекомендации' };
  }

  function favGet(type) {
    return (Lampa.Favorite && Lampa.Favorite.get) ? (Lampa.Favorite.get({ type: type }) || []) : [];
  }

  function collectExcludeIds() {
    var ids = [], types = ['like', 'history', 'viewed'], t, i, list;
    for (t = 0; t < types.length; t++) {
      list = favGet(types[t]);
      for (i = 0; i < list.length; i++) { if (list[i] && list[i].id != null) ids.push(list[i].id); }
    }
    return ids;
  }

  function likedSignature(liked) {
    var s = '', i;
    for (i = 0; i < liked.length; i++) { s += (liked[i].id || '') + ','; }
    return s;
  }

  // Build the personalized row. done(row); row.results is [picks] or [] (cold/empty).
  // dislikeSet (or null) excludes disliked look-alikes.
  function loadRecommendations(network, dislikeSet, done) {
    var signals = collectSignals();
    var positives = signals.positives;
    var sig = positiveSignature(positives);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }
    if (!positives.length) { emit(recommendationsRow([], false, true)); return; }

    var profile = buildTasteProfile(positives);
    var exclude = collectExcludeIds(), key, ei;
    for (key in signals.ratedIds) if (signals.ratedIds.hasOwnProperty(key)) exclude.push(parseInt(key, 10));
    for (ei = 0; ei < positives.length; ei++) exclude.push(positives[ei].id);
    var coScore = {}, lists = [], errors = 0;

    function gather(path, weight, type, cb) {
      fetchResults(network, path, type, function (results, totalPages, err) {
        if (err) errors++;
        var seen = {}, i, r;
        for (i = 0; i < results.length; i++) { r = results[i]; if (!r || r.id == null) continue; if (!seen[r.id]) { seen[r.id] = true; coScore[r.id] = (coScore[r.id] || 0) + weight; } }
        lists.push(results); cb();
      });
    }
    function pass(endpoint, doneCb) {
      var k = 0;
      function step() {
        if (k >= positives.length) { doneCb(); return; }
        var s = positives[k];
        gather(s.media + '/' + s.id + '/' + endpoint, s.weight, s.media, function () { k++; step(); });
      }
      step();
    }
    pass('recommendations', function () {
      var distinct = mergeRecommendations(lists, exclude, 100000).length;
      if (distinct >= MIN_POOL) { finish(); return; }
      pass('similar', finish);
    });
    function finish() {
      var pool = mergeRecommendations(lists, exclude, 1000);
      var scored = [], i, c, sc;
      for (i = 0; i < pool.length; i++) {
        c = pool[i];
        if (!c.poster_path) continue;
        if (dislikeRank(dislikeSet, c.id) > 0) continue;
        sc = scoreCandidate(c, profile, coScore[c.id]);
        c.__score = sc; c.__match = predictionPercent(sc);
        scored.push(c);
      }
      scored.sort(function (a, b) { return b.__score - a.__score; });
      var top = scored.slice(0, 20);
      if (!top.length) { emit(recommendationsRow([], errors > 0, false)); return; }
      emit(recommendationsRow(top, false, false));
    }
    function emit(row) { recsCache = { sig: sig, row: row }; done(row); }
  }

  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M3 5.5C3 4.4 3.9 3.5 5 3.5H19C20.1 3.5 21 4.4 21 5.5V18.5C21 19.6 20.1 20.5 19 20.5H5C3.9 20.5 3 19.6 3 18.5V5.5Z" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor"/></svg>';

  function openCatalog() {
    Lampa.Activity.push({
      url: '', title: 'Дорама', component: 'dorama',
      source: 'tmdb', card_type: true, page: 1
    });
  }

  function addMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="dorama">' +
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">Дорама</div>' +
      '</li>'
    );
    item.on('hover:enter', openCatalog);
    $('.menu .menu__list').eq(0).append(item);
  }

  // Build an authenticated TMDB URL. Lampa.TMDB.api() only prepends the host
  // (and applies the proxy_tmdb setting) — it does NOT add api_key. So we append
  // api_key (Lampa.TMDB.key()) + language ourselves, exactly like Lampa's own
  // tmdb source, then api() wraps it with the correct host.
  function tmdbUrl(path) {
    var u = path;
    if (u.indexOf('api_key=') === -1 && Lampa.TMDB && Lampa.TMDB.key) {
      u += (u.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + Lampa.TMDB.key();
    }
    if (u.indexOf('language=') === -1) {
      var lang = (Lampa.Storage && Lampa.Storage.field && Lampa.Storage.field('tmdb_lang')) || 'ru';
      u += (u.indexOf('?') >= 0 ? '&' : '?') + 'language=' + lang;
    }
    return Lampa.TMDB.api(u);
  }

  // GET a TMDB path via Lampa. done(results, total_pages, errorStatus): errorStatus
  // is null on success (even with empty results), or the HTTP status (e.g. 401) on a
  // network/HTTP error — so callers can tell "failed" from "genuinely empty".
  function fetchResults(network, path, mediaType, done) {
    network.silent(tmdbUrl(path), function (json) {
      var res = (json && json.results) ? json.results : [];
      var i;
      if (mediaType) for (i = 0; i < res.length; i++) {
        if (res[i] && !res[i].media_type) res[i].media_type = mediaType;
      }
      done(res, (json && json.total_pages) || 1, null);
    }, function (xhr) {
      var status = (xhr && (xhr.status || xhr.decode_code)) || 0;
      done([], 1, status || -1); // truthy errorStatus marks a hard failure
    });
  }

  // Assemble the catalog: build the dislike set first, fetch curated rows
  // (de-prioritizing disliked look-alikes), then the personalized row first.
  function loadCatalog(network, onDone, onFail) {
    var rows = buildRows();
    var curated = [];
    var i = 0, errors = 0, lastStatus = 0;
    var signals = collectSignals();
    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    buildDislikeSet(network, signals.negatives, function (dislikeSet) {
      function nextRow() {
        if (i >= rows.length) { loadHead(dislikeSet); return; }
        var row = rows[i];
        fetchResults(network, row.url, row.method, function (results, totalPages, err) {
          note(err);
          if (results.length) curated.push({ title: row.title, results: reorderByDislike(results, dislikeSet), url: row.url, method: row.method, source: 'tmdb', total_pages: totalPages });
          i++; nextRow();
        });
      }
      nextRow();
    });

    function loadHead(dislikeSet) {
      loadRecommendations(network, dislikeSet, function (recRow) {
        if (recRow && recRow.__cold && !window.dorama_cold_noted) {
          window.dorama_cold_noted = true;
          if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Лайкните или оцените дорамы, чтобы получить персональные рекомендации');
        }
        var head = (recRow && recRow.results && recRow.results.length) ? [recRow] : [];
        var allRows = head.concat(curated);
        if (allRows.length) onDone(allRows);
        else onFail({ errored: errors > 0 || (recRow && recRow.__errored), status: lastStatus });
      });
    }
  }

  function componentDorama(object) {
    var comp = new Lampa.InteractionMain(object);
    var network = new Lampa.Reguest();
    if (network.timeout) network.timeout(1000 * 15);

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      loadCatalog(network, function (data) {
        self.build(data);
        self.activity.loader(false);
        self.activity.toggle();
      }, function (info) {
        self.showState(info);
      });
      return this.render();
    };

    // Show a visible end-state and ALWAYS resolve the activity, so a failed load can
    // never look like an endless spinner. Lampa has no this.empty(msg), so we render
    // Lampa.Empty manually (mirrors core feed.js): append it, rebind start, then
    // loader(false) + toggle.
    comp.showState = function (info) {
      var descr;
      if (info && info.errored) {
        descr = info.status === 401
          ? 'TMDB: ошибка авторизации (401). Проверьте ключ/прокси TMDB в настройках Lampa.'
          : 'TMDB: не удалось загрузить данные' + (info.status ? ' (' + info.status + ')' : '');
      } else {
        descr = 'Ничего не найдено';
      }
      var empty = new Lampa.Empty({ descr: descr });
      this.render().append(empty.render(true));
      this.start = empty.start.bind(empty);
      this.activity.loader(false);
      this.activity.toggle();
    };

    // Row "more" → open that row's full infinite-scroll grid (FR3 shape).
    comp.onMore = function (row) {
      // The recommendation row is a merged feed with no single Discover URL,
      // so it has no "more" grid — skip it instead of pushing url:undefined.
      if (!row || !row.url) return;
      Lampa.Activity.push({
        url: row.url, title: row.title,
        component: 'category_full', source: 'tmdb', card_type: true, page: 1
      });
    };

    var inheritedDestroy = comp.destroy ? comp.destroy.bind(comp) : function () {};
    comp.destroy = function () {
      network.clear();
      inheritedDestroy();
    };

    return comp;
  }

  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
    registerMatchBadge();
    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('state:changed', function (e) { if (e && e.target === 'favorite') setRecsDirty(); });
    }
    if (Lampa.Storage && Lampa.Storage.listener && Lampa.Storage.listener.follow) {
      Lampa.Storage.listener.follow('change', function (e) { if (e && e.name === 'mine_reactions') setRecsDirty(); });
    }
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

  // --- test export hook (inert in a browser: `module` is undefined there) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRows: buildRows,
      mergeRecommendations: mergeRecommendations,
      _collectSeeds: collectSeeds,
      _buildTasteProfile: buildTasteProfile,
      _scoreCandidate: scoreCandidate,
      _predictionPercent: predictionPercent,
      _gradeOf: gradeOf,
      _collectReactions: collectReactions,
      _collectSignals: collectSignals,
      _buildDislikeSet: buildDislikeSet,
      _reorderByDislike: reorderByDislike,
      _loadRecommendations: loadRecommendations,
      _tmdbUrl: tmdbUrl,
      _start: start,
      _addMenuItem: addMenuItem,
      _registerMatchBadge: registerMatchBadge,
      _component: componentDorama
    };
  }
})();
