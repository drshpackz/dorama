(function () {
  'use strict';

  // Kazakh cinema and series from TMDB. The pool is small — about 1,300 films
  // and 60 series carry origin_country KZ, and only ~40 films have ten or more
  // votes (measured 2026-09-11) — so, unlike the Korean catalog, every row is
  // gated on posters instead of vote counts, and only rows with a deep pool
  // rotate pages (`depth`). Most Kazakh films are Russian-language, which is
  // why rows are scoped by origin_country and not by original_language=kk.
  var KZ = 'with_origin_country=KZ';
  // Verified TMDB ids: Kazakhfilm under its six company records; Salem
  // (Entertainment ×2 + Social Media); Nurtas Production + 567 Cinema (the
  // popular comedies); people — Akan Satayev, Adilkhan Yerzhanov, Nurlan
  // Koyanbayev.
  var KAZAKHFILM = '3623|7334|117312|253811|232195|162790';
  var SALEM = '278127|266671|240295';
  var FOLK_COMEDY = '89502|86899';
  var SATAYEV = 236013, YERZHANOV = 1184875, KOYANBAYEV = 1927559;

  function row(title, method, query, depth) {
    return { title: title, method: method, source: 'tmdb', depth: depth || 1, url: 'discover/' + method + '?' + query };
  }

  // «Сейчас смотрят» + the all-time top — pinned right after the personal row.
  function popularRows() {
    return [
      row('Сейчас смотрят', 'movie', KZ + '&sort_by=popularity.desc&vote_count.gte=1', 3),
      row('Казахские сериалы', 'tv', KZ + '&sort_by=popularity.desc', 2),
      row('Самые популярные фильмы', 'movie', KZ + '&sort_by=vote_count.desc&vote_count.gte=10', 2)
    ];
  }

  // Newest first. `now` is injectable so tests are deterministic. Series get a
  // wider window than films: a 540-day window holds only a handful of them.
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function daysBefore(now, days) { return ymd(new Date(now.getTime() - days * 24 * 3600 * 1000)); }
  function buildDynamicRows(now) {
    now = now || new Date();
    var lte = ymd(now);
    return [
      row('Новинки: фильмы', 'movie', KZ + '&primary_release_date.lte=' + lte + '&primary_release_date.gte=' + daysBefore(now, 540) + '&sort_by=primary_release_date.desc', 2),
      row('Новинки: сериалы', 'tv', KZ + '&first_air_date.lte=' + lte + '&first_air_date.gte=' + daysBefore(now, 900) + '&sort_by=first_air_date.desc')
    ];
  }

  // Genre catalog. Movie rows only: 60 Kazakh series split by genre would be
  // rows of two. Thriller(53), History(36), War(10752), Romance(10749),
  // Horror(27) are movie-only genres anyway.
  function buildGenreRows() {
    return [
      row('Комедии', 'movie', KZ + '&with_genres=35&sort_by=popularity.desc&vote_count.gte=1', 2),
      row('Боевики и криминал', 'movie', KZ + '&with_genres=28|80&sort_by=popularity.desc&vote_count.gte=1', 2),
      row('Триллеры и детективы', 'movie', KZ + '&with_genres=53|9648&sort_by=popularity.desc&vote_count.gte=1'),
      row('Драмы', 'movie', KZ + '&with_genres=18&sort_by=popularity.desc&vote_count.gte=2', 3),
      row('Историческое и военное кино', 'movie', KZ + '&with_genres=36|10752&sort_by=popularity.desc&vote_count.gte=1'),
      row('Ужасы', 'movie', KZ + '&with_genres=27&sort_by=popularity.desc', 2),
      row('Мелодрамы', 'movie', KZ + '&with_genres=10749&sort_by=popularity.desc', 2),
      row('Семейное и мультфильмы', 'movie', KZ + '&with_genres=10751|16&sort_by=popularity.desc', 2),
      row('На казахском языке', 'movie', 'with_original_language=kk&sort_by=popularity.desc&vote_count.gte=2', 2),
      row('Документальное', 'movie', KZ + '&with_genres=99&sort_by=popularity.desc')
    ];
  }

  // Studios, directors and the canon. Kazakhfilm is split at 1992 so the
  // Soviet classics don't crowd out the studio's modern films.
  function buildCuratedRows() {
    return [
      row('Лучшее казахское кино', 'movie', KZ + '&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=10&vote_average.gte=6'),
      row('Классика «Казахфильма»', 'movie', 'with_companies=' + KAZAKHFILM + '&primary_release_date.lte=1991-12-31&sort_by=vote_count.desc', 3),
      row('«Казахфильм»: современное кино', 'movie', 'with_companies=' + KAZAKHFILM + '&primary_release_date.gte=1992-01-01&sort_by=popularity.desc', 2),
      row('Фильмы Акана Сатаева', 'movie', 'with_people=' + SATAYEV + '&sort_by=popularity.desc'),
      row('Адильхан Ержанов: авторское кино', 'movie', 'with_people=' + YERZHANOV + '&sort_by=popularity.desc'),
      row('Бизнес по-казахски: Нурлан Коянбаев', 'movie', 'with_people=' + KOYANBAYEV + '&sort_by=popularity.desc'),
      row('Народные комедии (Nurtas, 567 Cinema)', 'movie', 'with_companies=' + FOLK_COMEDY + '&sort_by=popularity.desc'),
      row('Salem: кино', 'movie', 'with_companies=' + SALEM + '&sort_by=popularity.desc'),
      row('Salem: веб-сериалы', 'tv', 'with_companies=' + SALEM + '&sort_by=popularity.desc')
    ];
  }

  // Hide BL / gay-themed content — the same keyword set as the Дорама plugin.
  // No Kazakh title on TMDB carries these keywords today (checked 2026-09-11),
  // so unlike Дорама there is no per-open id block for the recommendations
  // row; the discover filter stays because it costs nothing.
  var BL_KEYWORDS = '289844,365317,158718,363345,258533,10180,275157,271167';
  function appendWithoutKeywords(path) {
    if (path.indexOf('discover/') !== 0) return path;
    if (path.indexOf('without_keywords=') >= 0) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'without_keywords=' + BL_KEYWORDS;
  }

  function pinnedCount() { return popularRows().length + buildDynamicRows().length; }

  // Full catalog order: popular → newest (both pinned) → genres → curated.
  function buildCatalogRows() {
    var rows = popularRows().concat(buildDynamicRows()).concat(buildGenreRows()).concat(buildCuratedRows());
    var i; for (i = 0; i < rows.length; i++) rows[i].url = appendWithoutKeywords(rows[i].url);
    return rows;
  }

  // Per-open page rotation: the same row shows a different page each open,
  // and pages differ per category. Pure + injectable for tests.
  function rowHash(s) { var h = 0, i; s = s || ''; for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function rowPage(rowKey, seed, depth) {
    depth = depth || 1; if (depth <= 1) return 1;
    return 1 + ((rowHash(rowKey) + (seed || 0)) % depth);
  }

  // --- Kazakh-ness of a card ---
  function hasKZ(list) {
    var i, c; list = list || [];
    for (i = 0; i < list.length; i++) { c = list[i]; if (c === 'KZ' || (c && c.iso_3166_1 === 'KZ')) return true; }
    return false;
  }
  function isKazakh(card) {
    if (!card) return false;
    return card.original_language === 'kk' || hasKZ(card.origin_country) || hasKZ(card.production_countries);
  }

  // Every card this catalog shows is Kazakh by construction, but a movie list
  // item carries no country. Stamping origin_country lets a like taken here be
  // recognised later: Lampa keeps origin_country when it stores a favourite
  // (it is on Utils.clearCard's field whitelist), so the stamp travels with it.
  function stampKazakh(list) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && !(list[i].origin_country && list[i].origin_country.length)) list[i].origin_country = ['KZ'];
    }
    return list;
  }

  // The same dozen hits (Хакер, Томирис, Рэкетир…) match half the genre rows.
  // Walking the feed top-down, titles an earlier row already showed move to
  // the back of later rows, so each row opens on something new. Nothing is
  // dropped — a thin row keeps its repeats rather than vanishing.
  function spreadRepeats(rows) {
    var seen = {}, i, j, res, fresh, again;
    for (i = 0; i < rows.length; i++) {
      res = rows[i].results || []; fresh = []; again = [];
      for (j = 0; j < res.length; j++) (seen[res[j].id] ? again : fresh).push(res[j]);
      for (j = 0; j < res.length; j++) seen[res[j].id] = true;
      rows[i].results = fresh.concat(again);
    }
    return rows;
  }

  // --- personalized catalog ordering (rows float toward the top by taste) ---
  function rowFacetIds(url, facet) {
    var m = new RegExp(facet + '=([^&]*)').exec(url);
    if (!m) return [];
    var parts = m[1].split(/[|,]/), out = [], i, v;
    for (i = 0; i < parts.length; i++) { v = parseInt(parts[i], 10); if (v) out.push(v); }
    return out;
  }
  function rowAffinity(r, profile) {
    var a = 0, ids, i;
    ids = rowFacetIds(r.url, 'with_genres'); for (i = 0; i < ids.length; i++) a += profile.genreWeight[ids[i]] || 0;
    ids = rowFacetIds(r.url, 'with_companies'); for (i = 0; i < ids.length; i++) if (profile.companyWeight[ids[i]]) a += 0.4;
    return a;
  }
  function hasTaste(profile) {
    function any(o) { var k; for (k in o) if (o.hasOwnProperty(k)) return true; return false; }
    return !!profile && (any(profile.genreWeight) || any(profile.companyWeight));
  }
  // Keep the first `pin` rows fixed; sort the rest by taste affinity (stable).
  function orderCatalogRows(rows, profile, pin) {
    if (!hasTaste(profile)) return rows;
    var head = rows.slice(0, pin), tail = rows.slice(pin), ranked = [], i, out;
    for (i = 0; i < tail.length; i++) ranked.push({ r: tail[i], a: rowAffinity(tail[i], profile), i: i });
    ranked.sort(function (x, y) { return (y.a - x.a) || (x.i - y.i); });
    out = head.slice(); for (i = 0; i < ranked.length; i++) out.push(ranked[i].r);
    return out;
  }

  // Dedupe by id, drop `excludeIds`, cap at `cap`. Tolerates null lists.
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

  // --- personalized recommender ---
  var SCORE_MAX = 9.0;
  var MIN_POOL = 20;

  function topKeys(map, n) {
    var arr = [], k, i, out = [];
    for (k in map) if (map.hasOwnProperty(k)) arr.push([k, map[k]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    for (i = 0; i < arr.length && i < n; i++) out.push(parseInt(arr[i][0], 10));
    return out;
  }

  // Weighted taste profile from seeds ({card?, weight, detail?}); the detail
  // backfills genres for reaction-only seeds and adds studio / keyword taste.
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, compCount = {}, kwCount = {};
    var i, j, gids, g, ln, w, card, det;
    for (i = 0; i < seeds.length; i++) {
      card = seeds[i].card || {}; w = seeds[i].weight || 1; det = seeds[i].detail;
      gids = (card.genre_ids && card.genre_ids.length) ? card.genre_ids : (det && det.genre_ids ? det.genre_ids : []);
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + w; total += w; }
      ln = card.original_language || (det && det.original_language) || null;
      if (ln) langCount[ln] = (langCount[ln] || 0) + w;
      if (det) {
        for (j = 0; j < (det.companies || []).length; j++) compCount[det.companies[j]] = (compCount[det.companies[j]] || 0) + w;
        for (j = 0; j < (det.keywords || []).length; j++) kwCount[det.keywords[j]] = (kwCount[det.keywords[j]] || 0) + w;
      }
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang, companyWeight: compCount, keywordWeight: kwCount,
      topGenres: topKeys(genreCount, 3), topCompanies: topKeys(compCount, 2), topKeywords: topKeys(kwCount, 3) };
  }

  // Taste-first score: co-occurrence + genre overlap dominate, rating/votes
  // only break ties so a popular-but-off-taste title sinks.
  function scoreCandidate(c, profile, coScore) {
    var co = Math.min(coScore || 0, 6) / 6;
    var gids = c.genre_ids || [], over = 0, i;
    for (i = 0; i < gids.length; i++) { over += profile.genreWeight[gids[i]] || 0; }
    if (over > 1) over = 1;
    var lang = c.original_language;
    var langMatch = lang === profile.topLang ? 1 : (profile.langs[lang] ? 0.6 : 0);
    var rating = Math.max(0, Math.min(10, c.vote_average || 0)) / 10;
    var votesConf = (c.vote_count || 0) >= 100 ? 1 : (c.vote_count || 0) / 100;
    return 4.0 * co + 3.5 * over + 1.0 * langMatch + 0.5 * rating + 0.25 * votesConf;
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

  function favGet(type) {
    return (Lampa.Favorite && Lampa.Favorite.get) ? (Lampa.Favorite.get({ type: type }) || []) : [];
  }

  // { '<media>_<tmdbId>': ['fire'|'nice'|'think'|'bore'|'shit', ...] }
  function collectReactions() {
    var mine = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('mine_reactions', {}) || {}) : {};
    var out = [], k, us, id;
    for (k in mine) {
      if (!mine.hasOwnProperty(k)) continue;
      us = k.indexOf('_'); if (us < 0) continue;
      id = parseInt(k.slice(us + 1), 10);
      if (id) out.push({ media: k.slice(0, us), id: id, types: mine[k] || [] });
    }
    return out;
  }

  // Likes + reactions → positive seeds, negative seeds, all rated ids. A liked
  // card that isn't Kazakh was liked elsewhere in Lampa and is no seed here. A
  // reaction carries no card, so its Kazakh-ness is only known after the
  // detail call (kazakhSeeds); known-Kazakh likes sort first so a pile of
  // reactions to other films can't push them out of the seed cap.
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
      if (g.sign === 'pos') { if (!e.card || isKazakh(e.card)) positives.push({ id: e.id, media: e.media, weight: g.weight, card: e.card }); }
      else if (g.sign === 'strongNeg') negatives.push({ id: e.id, media: e.media, strong: true });
      else if (g.sign === 'mildNeg') negatives.push({ id: e.id, media: e.media, strong: false });
    }
    positives.sort(function (a, b) { return ((b.card ? 1 : 0) - (a.card ? 1 : 0)) || (b.weight - a.weight); });
    return { positives: positives.slice(0, 8), negatives: negatives.slice(0, 6), ratedIds: ratedIds };
  }

  var dislikeCache = { sig: '', set: null };
  function negativeSignature(negatives) {
    var s = '', i;
    for (i = 0; i < negatives.length; i++) s += negatives[i].id + (negatives[i].strong ? 's' : 'm') + ',';
    return s;
  }

  // {strong:{id:true}, mild:{id:true}} from negatives' ids + their TMDB look-alikes.
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

  // Stable de-prioritization: normals keep order, 😴 below them, 💩 last.
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
  var enrichCache = { sig: '', seeds: null };
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; dislikeCache.sig = ''; dislikeCache.set = null; enrichCache.sig = ''; enrichCache.seeds = null; }

  function recommendationsRow(results, errored, cold) {
    return { title: RECS_TITLE, personal: true, results: results, source: 'tmdb', __errored: !!errored, __cold: !!cold };
  }

  function positiveSignature(positives) {
    var s = '', i;
    for (i = 0; i < positives.length; i++) s += positives[i].id + ':' + positives[i].weight + ',';
    return s;
  }

  // «xx%» badge on each card of a personal row, via the 'line' event. The class
  // is the Дорама plugin's on purpose: both plugins listen to every personal
  // row, so whichever runs second finds the badge already there and skips.
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

  function collectExcludeIds() {
    var ids = [], types = ['like', 'history', 'viewed'], t, i, list;
    for (t = 0; t < types.length; t++) {
      list = favGet(types[t]);
      for (i = 0; i < list.length; i++) { if (list[i] && list[i].id != null) ids.push(list[i].id); }
    }
    return ids;
  }

  // A title's taste facets + whether it is Kazakh. done(null) on error.
  // TV exposes keywords under .results, movies under .keywords.
  function fetchDetail(network, media, id, done) {
    function ids(a) { var o = [], i; a = a || []; for (i = 0; i < a.length; i++) if (a[i] && a[i].id != null) o.push(a[i].id); return o; }
    network.silent(tmdbUrl(media + '/' + id + '?append_to_response=keywords'), function (d) {
      d = d || {};
      var kwObj = d.keywords || {}, kws = kwObj.results || kwObj.keywords || [];
      done({ genre_ids: ids(d.genres), companies: ids(d.production_companies), keywords: ids(kws),
        original_language: d.original_language, kazakh: isKazakh(d) });
    }, function () { done(null); });
  }

  // Detail facets for every positive seed, sequential, cached by signature.
  function enrichSeeds(network, positives, done) {
    var sig = positiveSignature(positives);
    if (enrichCache.seeds && enrichCache.sig === sig) { done(enrichCache.seeds); return; }
    var seeds = [], i;
    for (i = 0; i < positives.length; i++) seeds.push({ id: positives[i].id, media: positives[i].media, weight: positives[i].weight, card: positives[i].card, detail: null });
    var k = 0;
    function step() {
      if (k >= seeds.length) { enrichCache = { sig: sig, seeds: seeds }; done(seeds); return; }
      fetchDetail(network, seeds[k].media, seeds[k].id, function (det) { seeds[k].detail = det; k++; step(); });
    }
    step();
  }

  // Seeds that are Kazakh: a liked card already passed isKazakh; a reaction
  // passes once its detail says so.
  function kazakhSeeds(seeds) {
    var out = [], i;
    for (i = 0; i < seeds.length; i++) if (seeds[i].card || (seeds[i].detail && seeds[i].detail.kazakh)) out.push(seeds[i]);
    return out;
  }

  function countKazakh(list) { var n = 0, i; for (i = 0; i < list.length; i++) if (isKazakh(list[i])) n++; return n; }

  // Build the personalized row. done(row); row.results is [picks] or [] (cold/empty).
  function loadRecommendations(network, dislikeSet, done) {
    var signals = collectSignals();
    var positives = signals.positives;
    var sig = positiveSignature(positives);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }
    if (!positives.length) { emit(recommendationsRow([], false, true)); return; }

    enrichSeeds(network, positives, function (all) {
      var enriched = kazakhSeeds(all);
      if (!enriched.length) { emit(recommendationsRow([], false, true)); return; }
      var profile = buildTasteProfile(enriched);
      var exclude = collectExcludeIds(), key, ei;
      for (key in signals.ratedIds) if (signals.ratedIds.hasOwnProperty(key)) exclude.push(parseInt(key, 10));
      for (ei = 0; ei < positives.length; ei++) exclude.push(positives[ei].id);
      var coScore = {}, lists = [], errors = 0;
      var medias = [], mseen = {}, mi, mm;
      for (mi = 0; mi < enriched.length; mi++) { mm = enriched[mi].media; if (mm && !mseen[mm]) { mseen[mm] = true; medias.push(mm); } }

      // `kazakh` marks a source whose every result is Kazakh (a KZ-scoped
      // discover), so its movie cards get the country stamp before filtering.
      function gather(path, weight, type, kazakh, cb) {
        fetchResults(network, path, type, function (results, totalPages, err) {
          if (err) errors++;
          if (kazakh) stampKazakh(results);
          var seen = {}, i, r;
          for (i = 0; i < results.length; i++) { r = results[i]; if (!r || r.id == null) continue; if (!seen[r.id]) { seen[r.id] = true; coScore[r.id] = (coScore[r.id] || 0) + weight; } }
          lists.push(results); cb();
        });
      }
      function passSeeds(endpoint, doneCb) {
        var k = 0;
        function step() {
          if (k >= enriched.length) { doneCb(); return; }
          var s = enriched[k];
          gather(s.media + '/' + s.id + '/' + endpoint, s.weight, s.media, false, function () { k++; step(); });
        }
        step();
      }
      function runTasks(tasks, doneCb) {
        var k = 0;
        function step() {
          if (k >= tasks.length) { doneCb(); return; }
          gather(tasks[k].path, tasks[k].weight, tasks[k].type, true, function () { k++; step(); });
        }
        step();
      }
      // TMDB's own recommendations for a Kazakh film are mostly Russian and
      // Hollywood titles, so taste-driven KZ discovers carry most of the row.
      function discoverPath(media, facet, list) {
        return 'discover/' + media + '?' + KZ + '&' + facet + '=' + list.join('|') +
          '&without_keywords=' + BL_KEYWORDS + '&sort_by=popularity.desc';
      }
      function facetTasks() {
        var tasks = [], i;
        if (profile.topGenres.length) for (i = 0; i < medias.length; i++) tasks.push({ path: discoverPath(medias[i], 'with_genres', profile.topGenres), weight: 1.5, type: medias[i] });
        if (profile.topCompanies.length) tasks.push({ path: discoverPath('movie', 'with_companies', profile.topCompanies), weight: 2.0, type: 'movie' });
        if (profile.topKeywords.length) for (i = 0; i < medias.length; i++) tasks.push({ path: discoverPath(medias[i], 'with_keywords', profile.topKeywords), weight: 1.5, type: medias[i] });
        return tasks;
      }

      passSeeds('recommendations', function () {
        if (countKazakh(mergeRecommendations(lists, exclude, 100000)) >= MIN_POOL) { runTasks(facetTasks(), finish); return; }
        passSeeds('similar', function () { runTasks(facetTasks(), finish); });
      });

      function finish() {
        var pool = mergeRecommendations(lists, exclude, 1000);
        var hasGenreProfile = false, gk;
        for (gk in profile.genreWeight) { if (profile.genreWeight.hasOwnProperty(gk)) { hasGenreProfile = true; break; } }
        // Always Kazakh + not-disliked + poster. Genre overlap is required only
        // when a genre profile exists; relaxed if the strict pass is empty so
        // the row never silently vanishes for an active user.
        function collect(requireOverlap) {
          var out = [], i, c, sc, ov, gg, q;
          for (i = 0; i < pool.length; i++) {
            c = pool[i];
            if (!c.poster_path) continue;
            if (!isKazakh(c)) continue;
            if (dislikeRank(dislikeSet, c.id) > 0) continue;
            if (requireOverlap) {
              ov = false; gg = c.genre_ids || [];
              for (q = 0; q < gg.length; q++) { if (profile.genreWeight[gg[q]]) { ov = true; break; } }
              if (!ov) continue;
            }
            sc = scoreCandidate(c, profile, coScore[c.id]);
            c.__score = sc; c.__match = predictionPercent(sc);
            out.push(c);
          }
          return out;
        }
        var scored = collect(hasGenreProfile);
        if (!scored.length) scored = collect(false);
        scored.sort(function (a, b) { return b.__score - a.__score; });
        var top = scored.slice(0, 20);
        emit(recommendationsRow(top, !top.length && errors > 0, false));
      }
    });

    function emit(r) { recsCache = { sig: sig, row: r }; done(r); }
  }

  // Shanyrak — the crown of the yurt, the emblem's centre.
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M9.5 3.9C11 9 11 15 9.5 20.1M14.5 3.9C13 9 13 15 14.5 20.1M3.9 9.5C9 11 15 11 20.1 9.5M3.9 14.5C9 13 15 13 20.1 14.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  var MENU_TITLE = 'Казахское кино';

  function openCatalog() {
    Lampa.Activity.push({
      url: '', title: MENU_TITLE, component: 'kazakh',
      source: 'tmdb', card_type: true, page: 1
    });
  }

  function addMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="kazakh">' +
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">' + MENU_TITLE + '</div>' +
      '</li>'
    );
    item.on('hover:enter', openCatalog);
    $('.menu .menu__list').eq(0).append(item);
  }

  // Authenticated TMDB URL: Lampa.TMDB.api() only prepends the host (and the
  // proxy_tmdb setting), so api_key + language are appended here.
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

  // done(results, total_pages, errorStatus): errorStatus is null on success
  // (even when empty) or the HTTP status, so "failed" differs from "empty".
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
      done([], 1, status || -1);
    });
  }

  var ROW_CONCURRENCY = 4;
  // A rotated page shorter than this falls back to page 1: in a pool this
  // thin, page 2 is often a stub of three cards.
  var MIN_ROW = 6;

  function compactRows(arr) { var out = [], i; for (i = 0; i < arr.length; i++) if (arr[i]) out.push(arr[i]); return out; }
  function withPoster(list) { var out = [], i; for (i = 0; i < list.length; i++) if (list[i] && list[i].poster_path) out.push(list[i]); return out; }

  // Per-open rotation seed: an open counter mixed with the user's signals.
  function rotationSeed() {
    var seq = 0;
    if (Lampa.Storage && Lampa.Storage.get) seq = parseInt(Lampa.Storage.get('kazakh_open_seq', 0), 10) || 0;
    if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set('kazakh_open_seq', seq + 1);
    var sig = 0;
    try { sig = rowHash(positiveSignature(collectSignals().positives)); } catch (e) {}
    return (seq + sig) >>> 0;
  }

  // Fetch all rows with bounded concurrency, preserving catalog order. Every
  // row drops poster-less cards (a third of the KZ pool has none). row.url is
  // left untouched so "more" opens the full grid from page 1.
  function loadRowsConcurrent(network, rows, dislikeSet, seed, note, allDone) {
    var slots = new Array(rows.length);
    var launched = 0, finished = 0, n = rows.length, k;
    if (!n) { allDone([]); return; }
    function settle(idx, r, results, totalPages) {
      results = stampKazakh(withPoster(results));
      slots[idx] = results.length
        ? { title: r.title, results: reorderByDislike(results, dislikeSet), url: r.url, method: r.method, source: 'tmdb', total_pages: totalPages }
        : null;
      finished++;
      if (finished >= n) { allDone(spreadRepeats(compactRows(slots))); return; }
      launchNext();
    }
    function launchNext() {
      if (launched >= n) return;
      var idx = launched++, r = rows[idx];
      var p = rowPage(r.title, seed, r.depth);
      var url = p > 1 ? r.url + '&page=' + p : r.url;
      fetchResults(network, url, r.method, function (results, totalPages, err) {
        note(err);
        if (p > 1 && withPoster(results).length < MIN_ROW) {
          fetchResults(network, r.url, r.method, function (r2, tp2, e2) { note(e2); settle(idx, r, r2, tp2); });
        } else settle(idx, r, results, totalPages);
      });
    }
    for (k = 0; k < ROW_CONCURRENCY && k < n; k++) launchNext();
  }

  // Dislike set first, then all rows concurrently, then the personal row on top.
  function loadCatalog(network, onDone, onFail) {
    var baseRows = buildCatalogRows();
    var errors = 0, lastStatus = 0;
    var signals = collectSignals();
    var seed = rotationSeed();
    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    enrichSeeds(network, signals.positives, function (all) {
      var rows = orderCatalogRows(baseRows, buildTasteProfile(kazakhSeeds(all)), pinnedCount());
      buildDislikeSet(network, signals.negatives, function (dislikeSet) {
        loadRowsConcurrent(network, rows, dislikeSet, seed, note, function (curated) {
          loadRecommendations(network, dislikeSet, function (recRow) {
            if (recRow && recRow.__cold && !window.kazakh_cold_noted) {
              window.kazakh_cold_noted = true;
              if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Лайкните или оцените казахские фильмы, чтобы получить персональные рекомендации');
            }
            var head = (recRow && recRow.results && recRow.results.length) ? [recRow] : [];
            var allRows = head.concat(curated);
            if (allRows.length) onDone(allRows);
            else onFail({ errored: errors > 0 || (recRow && recRow.__errored), status: lastStatus });
          });
        });
      });
    });
  }

  function componentKazakh(object) {
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

    // A visible end-state that always resolves the activity, so a failed load
    // never looks like an endless spinner (mirrors core feed.js).
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

    // Row "more" → that row's full grid. The personal row has no single
    // discover URL, so it has no grid.
    comp.onMore = function (r) {
      if (!r || !r.url) return;
      Lampa.Activity.push({
        url: r.url, title: r.title,
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
    if (window.kazakh_plugin_ready) return; // guard against double init
    window.kazakh_plugin_ready = true;
    Lampa.Component.add('kazakh', componentKazakh);
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
      _popularRows: popularRows,
      _buildDynamicRows: buildDynamicRows,
      _buildGenreRows: buildGenreRows,
      _buildCuratedRows: buildCuratedRows,
      _buildCatalogRows: buildCatalogRows,
      _pinnedCount: pinnedCount,
      _rowPage: rowPage,
      _isKazakh: isKazakh,
      _stampKazakh: stampKazakh,
      _spreadRepeats: spreadRepeats,
      _orderCatalogRows: orderCatalogRows,
      _buildTasteProfile: buildTasteProfile,
      _collectSignals: collectSignals,
      _kazakhSeeds: kazakhSeeds,
      _loadRecommendations: loadRecommendations,
      _registerMatchBadge: registerMatchBadge,
      _tmdbUrl: tmdbUrl,
      _start: start,
      _component: componentKazakh,
      BL_KEYWORDS: BL_KEYWORDS
    };
  }
})();
