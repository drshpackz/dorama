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

  // Note: genre ids (numbers) are used as object keys; JS coerces them to strings
  // consistently on both write (here) and read (scoreCandidate), so lookups match.
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

  var RECS_TITLE = 'Рекомендации для Вас';
  var recsCache = { sig: '', row: null };
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; }

  function makePredictionCard(elem) { return new PredictionCard(elem); }

  // Stamp the verified per-item factory hook so the Line renders PredictionCard.
  function recommendationsRow(results, errored) {
    var i;
    for (i = 0; i < results.length; i++) {
      results[i].params = results[i].params || {};
      results[i].params.createInstance = makePredictionCard;
    }
    return { title: RECS_TITLE, personal: true, results: results, source: 'tmdb', __errored: !!errored };
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

  // Build the personalized row. done(row) — row.results is [picks], [prompt], or [].
  function loadRecommendations(network, done) {
    var liked = favGet('like');
    var sig = likedSignature(liked);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }

    var seeds = collectSeeds(liked, 8);
    if (!seeds.length) { emit(recommendationsRow([promptCard()], false)); return; }

    var profile = buildTasteProfile(seeds);
    var excludeIds = collectExcludeIds();
    var coCount = {}, lists = [], s = 0, errors = 0;

    function nextSeed() {
      if (s >= seeds.length) { finish(); return; }
      var seed = seeds[s], type = seedType(seed);
      fetchResults(network, type + '/' + seed.id + '/recommendations', type, function (results, totalPages, err) {
        if (err) errors++;
        var seen = {}, i, r;
        for (i = 0; i < results.length; i++) {
          r = results[i]; if (!r || r.id == null) continue;
          if (!seen[r.id]) { seen[r.id] = true; coCount[r.id] = (coCount[r.id] || 0) + 1; }
        }
        lists.push(results); s++; nextSeed();
      });
    }

    function finish() {
      var exclude = excludeIds.slice(), i;
      for (i = 0; i < seeds.length; i++) exclude.push(seeds[i].id);
      var pool = mergeRecommendations(lists, exclude, 1000);
      var scored = [], c, sc;
      for (i = 0; i < pool.length; i++) {
        c = pool[i]; if (!c.poster_path) continue;
        sc = scoreCandidate(c, profile, coCount[c.id]);
        c.__score = sc; c.__match = predictionPercent(sc);
        scored.push(c);
      }
      scored.sort(function (a, b) { return b.__score - a.__score; });
      var top = scored.slice(0, 20);
      if (!top.length) { emit(recommendationsRow([], errors > 0)); return; }
      emit(recommendationsRow(top, false));
    }

    function emit(row) { recsCache = { sig: sig, row: row }; done(row); }

    nextSeed();
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

  // Assemble the catalog: personalized recommendations row first, then curated.
  function loadCatalog(network, onDone, onFail) {
    var rows = buildRows();
    var curated = [];
    var i = 0, errors = 0, lastStatus = 0;

    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    function nextRow() {
      if (i >= rows.length) { loadHead(); return; }
      var row = rows[i];
      fetchResults(network, row.url, row.method, function (results, totalPages, err) {
        note(err);
        if (results.length) curated.push({ title: row.title, results: results, url: row.url, method: row.method, source: 'tmdb', total_pages: totalPages });
        i++; nextRow();
      });
    }

    function loadHead() {
      loadRecommendations(network, function (recRow) {
        var head = (recRow && recRow.results && recRow.results.length) ? [recRow] : [];
        var allRows = head.concat(curated);
        if (allRows.length) onDone(allRows);
        else onFail({ errored: errors > 0 || (recRow && recRow.__errored), status: lastStatus });
      });
    }

    nextRow();
  }

  // Escape user/TMDB text before injecting into a concatenated HTML string.
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Custom card for the «Рекомендации для Вас» row: a «Совпадение xx%» badge plus
  // self-wired detail (hover:enter) and native like (hover:long). The framework
  // instantiates it via item.params.createInstance (see recommendationsRow).
  function PredictionCard(data) {
    var card = data;

    this.create = function () {
      var html, self = this;
      if (card.__prompt) {
        html = '<div class="card selector card--dorama-prompt"><div class="card__view">' +
               '<div class="card__promo-text" style="padding:1.2em;text-align:center">' + (card.title || '') + '</div>' +
               '</div></div>';
      } else {
        var title = card.title || card.name || card.original_title || card.original_name || '';
        var rating = card.vote_average ? (Math.round(card.vote_average * 10) / 10) : '';
        var liked = (Lampa.Favorite && Lampa.Favorite.check && Lampa.Favorite.check(card).like) ? ' card--liked' : '';
        html = '<div class="card selector card--dorama-match' + liked + '"><div class="card__view">' +
               '<img class="card__img" src="" alt="" />' +
               '<div class="card__match" style="position:absolute;left:0.5em;top:0.5em;background:rgba(0,0,0,0.75);color:#7ed957;padding:0.2em 0.5em;border-radius:0.4em;font-weight:600">Совпадение ' + (card.__match || 0) + '%</div>' +
               (rating !== '' ? '<div class="card__vote">' + rating + '</div>' : '') +
               '</div><div class="card__title">' + escHtml(title) + '</div></div>';
      }
      this.card = $(html);
      this.card.on('hover:enter', function () { self.onEnterCard(); });
      this.card.on('hover:long', function () { self.onLong(); });
      if (!card.__prompt) this.image();
    };

    this.image = function () {
      if (card.poster_path && Lampa.Api && Lampa.Api.img && this.card && this.card.find) {
        var img = this.card.find('.card__img');
        if (img && img.attr) img.attr('src', Lampa.Api.img(card.poster_path, 'w300'));
      }
    };

    this.onEnterCard = function () {
      if (card.__prompt) { if (Lampa.Noty) Lampa.Noty.show('Лайкните дораму (удержание OK), чтобы получить рекомендации'); return; }
      Lampa.Activity.push({ component: 'full', id: card.id, method: card.media_type || 'movie', card: card, source: card.source || 'tmdb' });
    };

    this.onLong = function () {
      if (card.__prompt) return;
      if (!Lampa.Favorite || !Lampa.Favorite.toggle) return;
      var added = Lampa.Favorite.toggle('like', card);
      if (Lampa.Noty) Lampa.Noty.show(added ? 'Добавлено в «Нравится»' : 'Убрано из «Нравится»');
      if (this.card && this.card.toggleClass) this.card.toggleClass('card--liked', !!added);
    };

    this.visible = function () { this.image(); };
    this.use = function () { /* benign: PredictionCard self-wires its events */ };
    this.render = function (js) { return this.card; };
    this.destroy = function () { if (this.card && this.card.remove) this.card.remove(); this.card = null; };
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
    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('state:changed', function (e) { if (e && e.target === 'favorite') setRecsDirty(); });
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
      _loadRecommendations: loadRecommendations,
      _tmdbUrl: tmdbUrl,
      _start: start,
      _addMenuItem: addMenuItem,
      _PredictionCard: PredictionCard,
      _component: componentDorama
    };
  }
})();
