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

  // 20 verified anchor titles (spec v2 §4). type routes to the correct
  // TMDB recommendations endpoint (movie/{id} vs tv/{id}).
  var ANCHORS = [
    { id: 496243, type: 'movie' }, { id: 1269208, type: 'movie' }, { id: 740441, type: 'movie' },
    { id: 729854, type: 'movie' }, { id: 396535, type: 'movie' }, { id: 670, type: 'movie' },
    { id: 11423, type: 'movie' }, { id: 491584, type: 'movie' }, { id: 110415, type: 'movie' },
    { id: 575604, type: 'movie' },
    { id: 93405, type: 'tv' }, { id: 89959, type: 'tv' }, { id: 106651, type: 'tv' },
    { id: 99489, type: 'tv' }, { id: 96648, type: 'tv' }, { id: 135340, type: 'tv' },
    { id: 84327, type: 'tv' }, { id: 99494, type: 'tv' }, { id: 119769, type: 'tv' },
    { id: 156484, type: 'tv' }
  ];

  // Pick `count` anchors starting at `offset`, wrapping around the pool.
  function pickAnchors(all, count, offset) {
    var out = [], n = all.length, i;
    for (i = 0; i < count && i < n; i++) out.push(all[(offset + i) % n]);
    return out;
  }

  // Merge recommendation result arrays: dedupe by id, drop the seed anchors,
  // cap at `cap` items. Tolerates null/empty lists.
  function mergeRecommendations(lists, anchorIds, cap) {
    var seen = {}, out = [], i, j, items, it;
    if (cap <= 0) return out;
    for (i = 0; i < anchorIds.length; i++) seen[anchorIds[i]] = true;
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

  function isAsianDrama(card) {
    if (!card) return false;
    if (card.original_language && ASIAN_LANGS[card.original_language]) return true;
    var oc = card.origin_country || [], i;
    for (i = 0; i < oc.length; i++) { if (ASIAN_COUNTRIES[oc[i]]) return true; }
    return false;
  }

  // Liked cards filtered to Asian dramas, most-recent-first, capped at `limit`.
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

  // Normalized genre preference + language distribution across seeds (no API calls).
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, i, j, gids, g, ln;
    for (i = 0; i < seeds.length; i++) {
      gids = seeds[i].genre_ids || [];
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + 1; total++; }
      ln = seeds[i].original_language; if (ln) langCount[ln] = (langCount[ln] || 0) + 1;
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang };
  }

  // Weighted content+collaborative score for one candidate.
  function scoreCandidate(c, profile, coCount) {
    var co = Math.min(coCount || 0, 3) / 3;
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

  // Assemble the whole catalog: recommendation row first, then curated rows.
  // Sequential requests keep one Reguest instance safe on old WebViews.
  // onFail({errored, status}) fires only when NO row produced content.
  function loadCatalog(network, onDone, onFail) {
    var rows = buildRows();
    var curated = [];
    var i = 0;
    var errors = 0;
    var lastStatus = 0;

    function note(errStatus) {
      if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; }
    }

    function nextRow() {
      if (i >= rows.length) { loadRecos(); return; }
      var row = rows[i];
      fetchResults(network, row.url, row.method, function (results, totalPages, err) {
        note(err);
        if (results.length) curated.push({
          title: row.title, results: results, url: row.url,
          method: row.method, source: 'tmdb', total_pages: totalPages
        });
        i++; nextRow();
      });
    }

    function loadRecos() {
      var offset = Math.floor((window.dorama_reco_offset || 0)) % ANCHORS.length;
      window.dorama_reco_offset = (offset + 7) % ANCHORS.length; // step 7 is coprime with 20 -> seed mix varies widely across opens (clamped)
      var picked = pickAnchors(ANCHORS, 5, offset);
      var anchorIds = [], lists = [], k = 0, p;
      for (p = 0; p < picked.length; p++) anchorIds.push(picked[p].id);

      function nextAnchor() {
        if (k >= picked.length) { finish(); return; }
        var a = picked[k];
        fetchResults(network, a.type + '/' + a.id + '/recommendations', a.type, function (results, totalPages, err) {
          note(err); lists.push(results); k++; nextAnchor();
        });
      }
      function finish() {
        var merged = mergeRecommendations(lists, anchorIds, 40);
        var out = [];
        if (merged.length) out.push({ title: 'В духе «Паразитов»', results: merged, source: 'tmdb' });
        var allRows = out.concat(curated);
        if (allRows.length) onDone(allRows);
        else onFail({ errored: errors > 0, status: lastStatus });
      }
      nextAnchor();
    }

    nextRow();
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
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

  // --- test export hook (inert in a browser: `module` is undefined there) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRows: buildRows,
      ANCHORS: ANCHORS,
      pickAnchors: pickAnchors,
      mergeRecommendations: mergeRecommendations,
      _collectSeeds: collectSeeds,
      _buildTasteProfile: buildTasteProfile,
      _scoreCandidate: scoreCandidate,
      _predictionPercent: predictionPercent,
      _tmdbUrl: tmdbUrl,
      _start: start,
      _addMenuItem: addMenuItem,
      _component: componentDorama
    };
  }
})();
