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

  // «Сейчас смотрят» + «Самые популярные» — placed right after the personal row.
  // popularity.desc = what's hot now; vote_count.desc = the all-time top.
  function popularRows() {
    return [
      { title: 'Сейчас смотрят', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&sort_by=popularity.desc&vote_count.gte=20' },
      { title: 'Самые популярные: фильмы', method: 'movie', source: 'tmdb', depth: 2,
        url: 'discover/movie?with_original_language=ko&sort_by=vote_count.desc&vote_count.gte=300' },
      { title: 'Самые популярные: сериалы', method: 'tv', source: 'tmdb', depth: 2,
        url: 'discover/tv?with_original_language=ko&sort_by=vote_count.desc&vote_count.gte=150' }
    ];
  }

  // Newest-first rows. `now` is injectable so tests are deterministic; production
  // passes nothing (real `new Date()`). today upper-bound drops future stubs; a
  // 540-day floor keeps the row "new" without going empty; poster-gated.
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function buildDynamicRows(now) {
    now = now || new Date();
    var lte = ymd(now), gte = ymd(new Date(now.getTime() - 540 * 24 * 3600 * 1000));
    return [
      { title: 'Корейские новинки: сериалы', method: 'tv', source: 'tmdb', depth: 2, posterRequired: true,
        url: 'discover/tv?with_original_language=ko&first_air_date.lte=' + lte + '&first_air_date.gte=' + gte + '&sort_by=first_air_date.desc&vote_count.gte=3' },
      { title: 'Корейские новинки: фильмы', method: 'movie', source: 'tmdb', depth: 2, posterRequired: true,
        url: 'discover/movie?with_original_language=ko&primary_release_date.lte=' + lte + '&primary_release_date.gte=' + gte + '&sort_by=primary_release_date.desc&vote_count.gte=3' }
    ];
  }

  // Extra catalog: user-requested thematic rows (keyword-narrowed, poster-gated,
  // rotation off) + a broad all-genre catalog. ko-only. Thriller(53) is
  // MOVIE-ONLY — never appears in a discover/tv url; History(36) and Romance
  // (10749) are movie-only too, so sageuk is a movie row and TV romance uses the
  // Drama genre + romance keyword. Pool sizes verified live against TMDB; thin
  // keyword combos broadened with verified ids: 12565 psychological-thriller,
  // 295907 psychological-horror, 235847 psychological-terror, 272553
  // psychological, 326438 twist-ending, 184312 mind-game, 275311 plot-twist,
  // 10854 time-loop, 9748 revenge, 9840 romance.
  function buildExtraRows() {
    return [
      { title: 'Психологический хоррор (сериалы)', method: 'tv', source: 'tmdb', rotate: false, posterRequired: true,
        url: 'discover/tv?with_original_language=ko&with_genres=9648|10765|18&with_keywords=12565|295907|235847|272553&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Психологический хоррор (фильмы)', method: 'movie', source: 'tmdb', rotate: false, posterRequired: true,
        url: 'discover/movie?with_original_language=ko&with_genres=27&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Триллер-головоломка (сериалы)', method: 'tv', source: 'tmdb', rotate: false, posterRequired: true,
        url: 'discover/tv?with_original_language=ko&with_genres=9648|10765&with_keywords=12565|326438|184312|275311|10854|9748&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Триллер-головоломка: игра со зрителем', method: 'movie', source: 'tmdb', rotate: false, posterRequired: true,
        url: 'discover/movie?with_original_language=ko&with_genres=53|9648&with_keywords=12565|326438|184312|275311|10854|9748&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Романтические дорамы', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=18&with_keywords=9840&sort_by=popularity.desc&vote_count.gte=20' },
      { title: 'Корейские комедии', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=35&sort_by=popularity.desc&vote_count.gte=20' },
      { title: 'Korean drama: драмы', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=18&sort_by=popularity.desc&vote_count.gte=30' },
      { title: 'Боевики и экшен', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=28|12&sort_by=popularity.desc&vote_count.gte=30' },
      { title: 'Исторические фильмы (сагык)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_genres=36&sort_by=popularity.desc&vote_count.gte=10' },
      { title: 'Фэнтези и мистика', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_genres=10765|9648&sort_by=popularity.desc&vote_count.gte=20' },
      { title: 'Лучшее корейское кино', method: 'movie', source: 'tmdb', depth: 2,
        url: 'discover/movie?with_original_language=ko&without_genres=99,10770&sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=7' },
      { title: 'Лучшие корейские сериалы', method: 'tv', source: 'tmdb', depth: 2,
        url: 'discover/tv?with_original_language=ko&without_genres=99,10763,10767&sort_by=vote_average.desc&vote_count.gte=100&vote_average.gte=7.5' },
      // Networks / studios (verified TMDB ids). Reordered toward the top when the
      // user's likes/reactions favour that network/studio (see orderCatalogRows).
      { title: 'Дорамы tvN', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_networks=866&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Дорамы JTBC', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_networks=885&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Дорамы SBS', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_networks=156&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Netflix Корея', method: 'tv', source: 'tmdb',
        url: 'discover/tv?with_original_language=ko&with_networks=213&sort_by=popularity.desc&vote_count.gte=5' },
      { title: 'Большое корейское кино (студии)', method: 'movie', source: 'tmdb',
        url: 'discover/movie?with_original_language=ko&with_companies=3491|7036|128404|7819|91505|20064&sort_by=popularity.desc&vote_count.gte=10' }
    ];
  }

  // Hide BL / gay-themed content (verified TMDB keyword ids): boys' love (bl),
  // boy's love, lgbt, gay, gay theme, male homosexuality, homosexuality,
  // same sex relationship. Applied as without_keywords on every discover row.
  var BL_KEYWORDS = '289844,365317,158718,363345,258533,10180,275157,271167';
  function appendWithoutKeywords(path) {
    if (path.indexOf('discover/') !== 0) return path;
    if (path.indexOf('without_keywords=') >= 0) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'without_keywords=' + BL_KEYWORDS;
  }

  // Full catalog order: popular → newest → 7 curated (unchanged) → extra. Every
  // discover row gets the BL/gay content exclusion (also flows into "more" grids
  // since onMore reuses row.url). The recommendations row is prepended in loadHead.
  function buildCatalogRows() {
    var rows = popularRows().concat(buildDynamicRows()).concat(buildRows()).concat(buildExtraRows());
    var i; for (i = 0; i < rows.length; i++) rows[i].url = appendWithoutKeywords(rows[i].url);
    return rows;
  }

  // Per-open page rotation so the feed isn't identical every time. The same row
  // shows a slightly different page each open (seed advances per open), and pages
  // differ per category (hash of the row title). Pure + injectable for tests.
  function rowHash(s) { var h = 0, i; s = s || ''; for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function rowPage(rowKey, seed, depth) {
    depth = depth || 1; if (depth <= 1) return 1;
    return 1 + ((rowHash(rowKey) + (seed || 0)) % depth);
  }

  // --- personalized catalog ordering (rows float toward the top by taste) ---
  function rowFacetIds(url, facet) {
    var m = new RegExp(facet + '=([^&]*)').exec(url);
    if (!m) return [];
    var parts = m[1].split(/[|,]/), out = [], i, v;
    for (i = 0; i < parts.length; i++) { v = parseInt(parts[i], 10); if (v) out.push(v); }
    return out;
  }
  // Affinity of a row to the taste profile: genre weight + bonuses for matching
  // a favoured network / studio / keyword.
  function rowAffinity(row, profile) {
    var a = 0, ids, i;
    ids = rowFacetIds(row.url, 'with_genres'); for (i = 0; i < ids.length; i++) a += profile.genreWeight[ids[i]] || 0;
    ids = rowFacetIds(row.url, 'with_networks'); for (i = 0; i < ids.length; i++) if (profile.networkWeight[ids[i]]) a += 0.4;
    ids = rowFacetIds(row.url, 'with_companies'); for (i = 0; i < ids.length; i++) if (profile.companyWeight[ids[i]]) a += 0.4;
    ids = rowFacetIds(row.url, 'with_keywords'); for (i = 0; i < ids.length; i++) if (profile.keywordWeight[ids[i]]) a += 0.3;
    return a;
  }
  function hasTaste(profile) {
    function any(o) { var k; for (k in o) if (o.hasOwnProperty(k)) return true; return false; }
    return !!profile && (any(profile.genreWeight) || any(profile.networkWeight) || any(profile.companyWeight) || any(profile.keywordWeight));
  }
  // Keep the first `pin` rows (popular + newest) fixed; sort the rest by taste
  // affinity (stable for ties). No taste signals → original order untouched.
  function orderCatalogRows(rows, profile, pin) {
    if (!hasTaste(profile)) return rows;
    var head = rows.slice(0, pin), tail = rows.slice(pin), ranked = [], i, out;
    for (i = 0; i < tail.length; i++) ranked.push({ r: tail[i], a: rowAffinity(tail[i], profile), i: i });
    ranked.sort(function (x, y) { return (y.a - x.a) || (x.i - y.i); });
    out = head.slice(); for (i = 0; i < ranked.length; i++) out.push(ranked[i].r);
    return out;
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

  // Top-N keys of a weight map (numbers), highest weight first.
  function topKeys(map, n) {
    var arr = [], k, i, out = [];
    for (k in map) if (map.hasOwnProperty(k)) arr.push([k, map[k]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    for (i = 0; i < arr.length && i < n; i++) out.push(parseInt(arr[i][0], 10));
    return out;
  }

  // Weighted taste profile. Seeds may be plain cards (weight 1), {card, weight}
  // objects, or enriched seeds carrying a `detail` ({genre_ids, networks,
  // companies, keywords, original_language} from a TMDB detail call) — the detail
  // backfills genres for reaction-only seeds and adds network/studio/keyword taste.
  function buildTasteProfile(seeds) {
    var genreCount = {}, total = 0, langCount = {}, netCount = {}, compCount = {}, kwCount = {};
    var i, j, gids, g, ln, w, card, det;
    for (i = 0; i < seeds.length; i++) {
      card = seeds[i].card || seeds[i]; w = seeds[i].weight || seeds[i].__weight || 1; det = seeds[i].detail;
      gids = (card.genre_ids && card.genre_ids.length) ? card.genre_ids : (det && det.genre_ids ? det.genre_ids : []);
      for (j = 0; j < gids.length; j++) { g = gids[j]; genreCount[g] = (genreCount[g] || 0) + w; total += w; }
      ln = card.original_language || (det && det.original_language) || null;
      if (ln) langCount[ln] = (langCount[ln] || 0) + w;
      if (det) {
        for (j = 0; j < (det.networks || []).length; j++) netCount[det.networks[j]] = (netCount[det.networks[j]] || 0) + w;
        for (j = 0; j < (det.companies || []).length; j++) compCount[det.companies[j]] = (compCount[det.companies[j]] || 0) + w;
        for (j = 0; j < (det.keywords || []).length; j++) kwCount[det.keywords[j]] = (kwCount[det.keywords[j]] || 0) + w;
      }
    }
    var genreWeight = {}, langs = {}, topLang = '', topN = -1, l;
    for (g in genreCount) { if (genreCount.hasOwnProperty(g)) genreWeight[g] = total ? genreCount[g] / total : 0; }
    for (l in langCount) { if (langCount.hasOwnProperty(l)) { langs[l] = true; if (langCount[l] > topN) { topN = langCount[l]; topLang = l; } } }
    return { genreWeight: genreWeight, langs: langs, topLang: topLang,
      networkWeight: netCount, companyWeight: compCount, keywordWeight: kwCount,
      topGenres: topKeys(genreCount, 3), topNetworks: topKeys(netCount, 2), topCompanies: topKeys(compCount, 2), topKeywords: topKeys(kwCount, 3) };
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
    // Taste-first: co-occurrence + genre overlap dominate (7.5 of the total);
    // rating/votes are minor tie-breakers so popular-but-off-taste titles sink.
    // Max ≈ 9.25, absorbed by the predictionPercent clamp (SCORE_MAX = 9.0).
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
  function setRecsDirty() { recsCache.sig = ''; recsCache.row = null; dislikeCache.sig = ''; dislikeCache.set = null; enrichCache.sig = ''; enrichCache.seeds = null; }

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

  // Fetch a title's detail (+keywords) and distill the taste-relevant facets.
  // done(detail) with {genre_ids, networks, companies, keywords, original_language}
  // or done(null) on error. TV exposes keywords under .results, movies under .keywords.
  function fetchDetail(network, media, id, done) {
    function ids(a) { var o = [], i; a = a || []; for (i = 0; i < a.length; i++) if (a[i] && a[i].id != null) o.push(a[i].id); return o; }
    network.silent(tmdbUrl(media + '/' + id + '?append_to_response=keywords'), function (d) {
      d = d || {};
      var kwObj = d.keywords || {}, kws = kwObj.results || kwObj.keywords || [];
      done({ genre_ids: ids(d.genres), networks: ids(d.networks), companies: ids(d.production_companies), keywords: ids(kws), original_language: d.original_language });
    }, function () { done(null); });
  }

  var enrichCache = { sig: '', seeds: null };

  // Enrich positive seeds with detail facets (genres for reaction-only seeds,
  // plus networks/studios/keywords for everyone). Sequential + bounded by the
  // seed cap; cached by the positive signature.
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

  // Build the personalized row. done(row); row.results is [picks] or [] (cold/empty).
  // dislikeSet (or null) excludes disliked look-alikes.
  function loadRecommendations(network, dislikeSet, done) {
    var signals = collectSignals();
    var positives = signals.positives;
    var sig = positiveSignature(positives);
    if (recsCache.row && recsCache.sig === sig) { done(recsCache.row); return; }
    if (!positives.length) { emit(recommendationsRow([], false, true)); return; }

    enrichSeeds(network, positives, function (enriched) {
      var profile = buildTasteProfile(enriched);
      var exclude = collectExcludeIds(), key, ei;
      for (key in signals.ratedIds) if (signals.ratedIds.hasOwnProperty(key)) exclude.push(parseInt(key, 10));
      for (ei = 0; ei < positives.length; ei++) exclude.push(positives[ei].id);
      var coScore = {}, lists = [], errors = 0;
      var medias = [], mseen = {}, mi, mm;
      for (mi = 0; mi < enriched.length; mi++) { mm = enriched[mi].media; if (mm && !mseen[mm]) { mseen[mm] = true; medias.push(mm); } }
      if (!medias.length) medias.push('tv');

      function gather(path, weight, type, cb) {
        fetchResults(network, path, type, function (results, totalPages, err) {
          if (err) errors++;
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
          gather(s.media + '/' + s.id + '/' + endpoint, s.weight, s.media, function () { k++; step(); });
        }
        step();
      }
      function runTasks(tasks, doneCb) {
        var k = 0;
        function step() {
          if (k >= tasks.length) { doneCb(); return; }
          gather(tasks[k].path, tasks[k].weight, tasks[k].type, function () { k++; step(); });
        }
        step();
      }
      // Taste-driven discover sources: candidates surfaced by the user's top
      // genres / networks / studios / keywords feed coScore, so a title that
      // matches several taste facets ranks high — collaborative + content blended.
      function discoverPath(media, facet, list) {
        return 'discover/' + media + '?with_original_language=ko&' + facet + '=' + list.join('|') +
          '&without_keywords=' + BL_KEYWORDS + '&sort_by=popularity.desc&vote_count.gte=5';
      }
      function facetTasks() {
        var tasks = [], i;
        if (profile.topGenres.length) for (i = 0; i < medias.length; i++) tasks.push({ path: discoverPath(medias[i], 'with_genres', profile.topGenres), weight: 1.5, type: medias[i] });
        if (profile.topNetworks.length) tasks.push({ path: discoverPath('tv', 'with_networks', profile.topNetworks), weight: 2.0, type: 'tv' });
        if (profile.topCompanies.length) tasks.push({ path: discoverPath('movie', 'with_companies', profile.topCompanies), weight: 1.5, type: 'movie' });
        if (profile.topKeywords.length) for (i = 0; i < medias.length; i++) tasks.push({ path: discoverPath(medias[i], 'with_keywords', profile.topKeywords), weight: 1.5, type: medias[i] });
        return tasks;
      }

      passSeeds('recommendations', function () {
        var distinct = mergeRecommendations(lists, exclude, 100000).length;
        if (distinct >= MIN_POOL) { runTasks(facetTasks(), finish); return; }
        passSeeds('similar', function () { runTasks(facetTasks(), finish); });
      });

      function finish() {
        var pool = mergeRecommendations(lists, exclude, 1000);
        var hasGenreProfile = false, gk;
        for (gk in profile.genreWeight) { if (profile.genreWeight.hasOwnProperty(gk)) { hasGenreProfile = true; break; } }
        // Always Asian-only + not-disliked + not-BL + poster. Genre overlap is
        // required only when a genre profile exists; if the strict pass yields
        // nothing, relax it so the row never silently vanishes for an active user.
        function collect(requireOverlap) {
          var out = [], i, c, sc, ov, gg, q;
          for (i = 0; i < pool.length; i++) {
            c = pool[i];
            if (!c.poster_path) continue;
            if (!isAsianDrama(c)) continue;
            if (dislikeRank(dislikeSet, c.id) > 0) continue;
            if (currentBLBlock[c.id]) continue;             // hide BL/gay content
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
        if (!top.length) { emit(recommendationsRow([], errors > 0, false)); return; }
        emit(recommendationsRow(top, false, false));
      }
    });

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

  var ROW_CONCURRENCY = 4;

  function compactRows(arr) { var out = [], i; for (i = 0; i < arr.length; i++) if (arr[i]) out.push(arr[i]); return out; }
  function withPoster(list) { var out = [], i; for (i = 0; i < list.length; i++) if (list[i] && list[i].poster_path) out.push(list[i]); return out; }

  // Per-open rotation seed: a counter that advances each catalog open (persisted
  // in Storage), mixed with a hash of the user's signals so the rotation pattern
  // also tracks their past ratings.
  function rotationSeed() {
    var seq = 0;
    if (Lampa.Storage && Lampa.Storage.get) seq = parseInt(Lampa.Storage.get('dorama_open_seq', 0), 10) || 0;
    if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set('dorama_open_seq', seq + 1);
    var sig = 0;
    try { sig = rowHash(positiveSignature(collectSignals().positives)); } catch (e) {}
    return (seq + sig) >>> 0;
  }

  // Fetch all rows with bounded concurrency, preserving catalog order (slot per
  // index). Each row fetches its rotated preview page (rotation on unless
  // row.rotate === false); an empty rotated page falls back to page 1 so thin
  // rows never vanish. posterRequired rows drop poster-less cards. row.url is
  // left untouched so "more" still opens the full grid from page 1.
  function loadRowsConcurrent(network, rows, dislikeSet, seed, note, allDone) {
    var slots = new Array(rows.length);
    var launched = 0, finished = 0, n = rows.length, k;
    if (!n) { allDone([]); return; }
    function settle(idx, row, results, totalPages) {
      if (row.posterRequired) results = withPoster(results);
      slots[idx] = results.length
        ? { title: row.title, results: reorderByDislike(results, dislikeSet), url: row.url, method: row.method, source: 'tmdb', total_pages: totalPages }
        : null;
      finished++;
      if (finished >= n) { allDone(compactRows(slots)); return; }
      launchNext();
    }
    function launchNext() {
      if (launched >= n) return;
      var idx = launched++, row = rows[idx];
      var p = (row.rotate === false) ? 1 : rowPage(row.title, seed, row.depth || 3);
      var url = p > 1 ? row.url + '&page=' + p : row.url;
      fetchResults(network, url, row.method, function (results, totalPages, err) {
        note(err);
        if (!results.length && p > 1) {
          fetchResults(network, row.url, row.method, function (r2, tp2, e2) { note(e2); settle(idx, row, r2, tp2); });
        } else settle(idx, row, results, totalPages);
      });
    }
    for (k = 0; k < ROW_CONCURRENCY && k < n; k++) launchNext();
  }

  // BL/gay content block for the recommendations row: the /recommendations and
  // /similar endpoints don't accept without_keywords, so collect the ids of the
  // most popular Korean BL/gay titles via discover and exclude them by id.
  // Content policy (not user-specific), so cached for the whole session.
  var BL_BLOCK_PAGES = 2;
  var blContentCache = { set: null };
  var currentBLBlock = {};
  function buildBLBlock(network, done) {
    if (blContentCache.set) { done(blContentCache.set); return; }
    var set = {}, tasks = [], p;
    for (p = 1; p <= BL_BLOCK_PAGES; p++) {
      tasks.push({ url: 'discover/movie?with_original_language=ko&with_keywords=' + BL_KEYWORDS + '&sort_by=popularity.desc&page=' + p, media: 'movie' });
      tasks.push({ url: 'discover/tv?with_original_language=ko&with_keywords=' + BL_KEYWORDS + '&sort_by=popularity.desc&page=' + p, media: 'tv' });
    }
    var k = 0;
    function step() {
      if (k >= tasks.length) { blContentCache.set = set; done(set); return; }
      fetchResults(network, tasks[k].url, tasks[k].media, function (results) {
        var j; for (j = 0; j < results.length; j++) if (results[j] && results[j].id != null) set[results[j].id] = true;
        k++; step();
      });
    }
    step();
  }

  // Assemble the catalog: build the dislike set first, fetch all rows
  // concurrently (de-prioritizing disliked look-alikes), then prepend the
  // personalized row.
  function loadCatalog(network, onDone, onFail) {
    var baseRows = buildCatalogRows();
    var errors = 0, lastStatus = 0;
    var signals = collectSignals();
    var seed = rotationSeed();
    var pin = popularRows().length + buildDynamicRows().length; // popular + newest stay on top
    function note(errStatus) { if (errStatus) { errors++; if (typeof errStatus === 'number' && errStatus > 0) lastStatus = errStatus; } }

    // Enrich seeds once → taste profile drives both the row order and the recs.
    enrichSeeds(network, signals.positives, function (enriched) {
      var rows = orderCatalogRows(baseRows, buildTasteProfile(enriched), pin);
      buildDislikeSet(network, signals.negatives, function (dislikeSet) {
        loadRowsConcurrent(network, rows, dislikeSet, seed, note, function (curated) {
          // BL block is only needed by the recommendations row, so skip it cold.
          if (signals.positives.length) {
            buildBLBlock(network, function (block) { currentBLBlock = block; loadHead(dislikeSet, curated); });
          } else loadHead(dislikeSet, curated);
        });
      });
    });

    function loadHead(dislikeSet, curated) {
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

  // ======================= Shorts (CUB clip feed) =======================
  // Public read-only Shots API (see docs/shots-research.md). lampa.mx is
  // TLS-unreachable from some networks, so we talk to the CUB mirrors directly.
  var SHOTS_MIRRORS = [
    'https://cub.rip/api/shots/',
    'https://cubnotrip.top/api/shots/'
  ];

  function shotsLentaUrl(base, query) {
    var parts = [], keys = ['sort', 'page', 'id', 'limit'], i;
    for (i = 0; i < keys.length; i++) {
      if (query[keys[i]] !== undefined) parts.push(keys[i] + '=' + encodeURIComponent(query[keys[i]]));
    }
    return base + 'lenta?' + parts.join('&');
  }

  // done(results[]) on success (possibly empty), done(null) if BOTH mirrors fail.
  function fetchLenta(network, query, done) {
    function attempt(idx) {
      if (idx >= SHOTS_MIRRORS.length) { done(null); return; }
      network.silent(shotsLentaUrl(SHOTS_MIRRORS[idx], query), function (json) {
        done((json && json.results) ? json.results : []);
      }, function () {
        attempt(idx + 1);
      });
    }
    attempt(0);
  }

  function filterReadyShots(shots) {
    var out = [], i;
    for (i = 0; i < shots.length; i++) {
      if (shots[i] && shots[i].status === 'ready' && shots[i].file) out.push(shots[i]);
    }
    return out;
  }

  function dedupeById(shots) {
    var out = [], seen = {}, i;
    for (i = 0; i < shots.length; i++) {
      if (!seen[shots[i].id]) { seen[shots[i].id] = 1; out.push(shots[i]); }
    }
    return out;
  }

  function minShortId(shots) {
    var min = shots[0].id, i;
    for (i = 1; i < shots.length; i++) if (shots[i].id < min) min = shots[i].id;
    return min;
  }

  function shortsCardKey(shot) {
    return (shot.card_type === 'tv' ? 'tv' : 'movie') + '_' + shot.card_id;
  }

  var SHORTS_META_CACHE_MAX = 500;
  var SHORTS_LOOKUP_CONCURRENCY = 4;

  // done(metaMap): cardKey -> { lang, genres:[ids] }. Language and genres come
  // from the SAME TMDB detail response, so genres cost zero extra requests.
  // A title's language/genres never change, so the Storage cache has no TTL —
  // only a size guard. Migrates the older language-only cache in memory;
  // persists (under the new key) only when a fetch dirties the cache.
  function resolveShortsMeta(network, shots, done) {
    var cache = Lampa.Storage.get('dorama_shorts_meta', null);
    if (!cache) {
      cache = {};
      var old = Lampa.Storage.get('dorama_shorts_lang', null), ok;
      if (old) { for (ok in old) { if (old.hasOwnProperty(ok)) cache[ok] = { lang: old[ok], genres: [] }; } }
    }
    var map = {}, pending = [], seen = {}, i, key;
    for (i = 0; i < shots.length; i++) {
      key = shortsCardKey(shots[i]);
      if (cache[key]) map[key] = cache[key];
      else if (!seen[key]) {
        seen[key] = 1;
        pending.push({ key: key, path: (shots[i].card_type === 'tv' ? 'tv/' : 'movie/') + shots[i].card_id });
      }
    }
    if (!pending.length) { done(map); return; }
    var launched = 0, finished = 0, dirty = false;
    function finish() {
      if (dirty) {
        var count = 0, k;
        for (k in cache) count++;
        if (count > SHORTS_META_CACHE_MAX) {
          cache = {};
          for (k in map) cache[k] = map[k];
        }
        Lampa.Storage.set('dorama_shorts_meta', cache);
      }
      done(map);
    }
    function settle(item, json) {
      var lang = json && json.original_language;
      if (lang) {
        var gids = [], gs = json.genres || [], g;
        for (g = 0; g < gs.length; g++) { if (gs[g] && gs[g].id) gids.push(gs[g].id); }
        var entry = { lang: lang, genres: gids };
        map[item.key] = entry; cache[item.key] = entry; dirty = true;
      }
      finished++;
      if (finished >= pending.length) { finish(); return; }
      launchNext();
    }
    function launchNext() {
      if (launched >= pending.length) return;
      var item = pending[launched++];
      network.silent(tmdbUrl(item.path), function (json) {
        settle(item, json);
      }, function () {
        settle(item, null);
      });
    }
    var burst = Math.min(SHORTS_LOOKUP_CONCURRENCY, pending.length);
    for (i = 0; i < burst; i++) launchNext();
  }

  var SHORTS_TASTE_MAX = 100;
  var SHORTS_GENRE_ADJ_STEP = 0.5;
  var SHORTS_GENRE_ADJ_CLAMP = 1.5;

  function shortsTasteGet() {
    var t = Lampa.Storage.get('dorama_shorts_taste', {}) || {};
    return { up: t.up || [], down: t.down || [] };
  }

  // kind: 'up' | 'down'. Toggles cardKey in that list; adding to one list
  // removes it from the other (❤ and 👎 are mutually exclusive). Returns true
  // when the key is active in `kind` after the call.
  function shortsTasteToggle(kind, cardKey) {
    var t = shortsTasteGet();
    var list = t[kind], other = t[kind === 'up' ? 'down' : 'up'];
    var oi = other.indexOf(cardKey);
    if (oi >= 0) other.splice(oi, 1);
    var i = list.indexOf(cardKey), active;
    if (i >= 0) { list.splice(i, 1); active = false; }
    else {
      list.push(cardKey);
      if (list.length > SHORTS_TASTE_MAX) list.shift();
      active = true;
    }
    Lampa.Storage.set('dorama_shorts_taste', t);
    return active;
  }

  // Shorts feed taste: boost/sink card sets + a genre adjustment map.
  // boost = dorama recommendation positives (liked/reacted titles) + Shorts ❤;
  // sink = Shorts 👎 (sink evicts boost). genreAdj uses ONLY the Shorts store
  // (±0.5 per genre occurrence, clamped ±1.5) — the liked-title tier already
  // carries the main dorama signal, so the profile is not recomputed here.
  function buildShortsTaste(metaMap) {
    var t = shortsTasteGet();
    var boost = {}, sink = {}, adj = {}, i, sig;
    try { sig = collectSignals(); } catch (e) { sig = { positives: [] }; }
    for (i = 0; i < sig.positives.length; i++) boost[sig.positives[i].media + '_' + sig.positives[i].id] = 1;
    for (i = 0; i < t.up.length; i++) boost[t.up[i]] = 1;
    for (i = 0; i < t.down.length; i++) { sink[t.down[i]] = 1; delete boost[t.down[i]]; }
    function apply(list, step) {
      var a, b, gids, g;
      for (a = 0; a < list.length; a++) {
        gids = (metaMap[list[a]] || {}).genres || [];
        for (b = 0; b < gids.length; b++) {
          g = gids[b];
          adj[g] = (adj[g] || 0) + step;
          if (adj[g] > SHORTS_GENRE_ADJ_CLAMP) adj[g] = SHORTS_GENRE_ADJ_CLAMP;
          if (adj[g] < -SHORTS_GENRE_ADJ_CLAMP) adj[g] = -SHORTS_GENRE_ADJ_CLAMP;
        }
      }
    }
    apply(t.up, SHORTS_GENRE_ADJ_STEP);
    apply(t.down, -SHORTS_GENRE_ADJ_STEP);
    return { boostCards: boost, sinkCards: sink, genreAdj: adj };
  }

  var SHORTS_ASIAN_FILL = { ja: 1, zh: 1, th: 1 };
  var SHORTS_VIEWED_MAX = 500;

  // Taste-tiered ordering, language grouping ko-first as the outer rule:
  // 0) boosted cards' clips, 1) ko with genre score > 0 (score desc),
  // 2) ko rest, 3) asian (ja/zh/th) score > 0, 4) asian rest,
  // 5) sunk cards' clips dead last (sink beats boost, defensively).
  // Viewed clips sink WITHIN their tier; incoming order is preserved on ties
  // via an index tie-break — Array.sort stability is not guaranteed on old
  // TV engines. Unknown languages are dropped.
  function orderShortsV2(shots, metaMap, viewedIds, taste) {
    taste = taste || {};
    var boost = taste.boostCards || {}, sink = taste.sinkCards || {}, adj = taste.genreAdj || {};
    var viewed = {}, i, j;
    for (i = 0; i < (viewedIds || []).length; i++) viewed[viewedIds[i]] = 1;
    var fresh = [[], [], [], [], [], []];
    var seen = [[], [], [], [], [], []];
    for (i = 0; i < shots.length; i++) {
      var key = shortsCardKey(shots[i]);
      var entry = metaMap[key] || {};
      var lang = entry.lang;
      var isKo = lang === 'ko';
      if (!isKo && !SHORTS_ASIAN_FILL[lang]) continue;
      var gids = entry.genres || [], score = 0;
      for (j = 0; j < gids.length; j++) score += adj[gids[j]] || 0;
      var tier;
      if (sink[key]) tier = 5;
      else if (boost[key]) tier = 0;
      else if (isKo) tier = score > 0 ? 1 : 2;
      else tier = score > 0 ? 3 : 4;
      (viewed[shots[i].id] ? seen : fresh)[tier].push({ s: score, v: shots[i] });
    }
    function flatten(list, sortByScore) {
      if (sortByScore) {
        var dec = [], k;
        for (k = 0; k < list.length; k++) dec.push({ s: list[k].s, i: k, v: list[k].v });
        dec.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
        list = dec;
      }
      var out = [], m;
      for (m = 0; m < list.length; m++) out.push(list[m].v);
      return out;
    }
    var result = [], t;
    for (t = 0; t < 6; t++) {
      var scored = (t === 1 || t === 3);
      result = result.concat(flatten(fresh[t], scored), flatten(seen[t], scored));
    }
    return result;
  }

  function markShortViewed(id) {
    var arr = Lampa.Storage.get('dorama_shorts_viewed', []) || [];
    if (arr.indexOf(id) >= 0) return;
    arr.push(id);
    if (arr.length > SHORTS_VIEWED_MAX) arr = arr.slice(arr.length - SHORTS_VIEWED_MAX);
    Lampa.Storage.set('dorama_shorts_viewed', arr);
  }

  var SHORTS_PAGE_LIMIT = 50;
  var SHORTS_EXTRA_PAGES = 2;

  // done(items, cursor): the final ordered feed and the smallest RAW id seen
  // across all fetched pages (or null if page 1 was empty). done(null) only
  // when the very first request can't reach any mirror; a failed DEEPER page
  // just stops the walk. The cursor is tracked over RAW pages (before
  // readiness/language filtering) so a page whose items all get filtered out
  // still advances the pager instead of getting the walk stuck re-fetching it.
  function buildShortsFeedData(network, done) {
    var cursor = null;
    function track(page) {
      if (!page || !page.length) return;
      var m = minShortId(page);
      if (cursor === null || m < cursor) cursor = m;
    }
    fetchLenta(network, { sort: 'new', page: 1, limit: SHORTS_PAGE_LIMIT }, function (first) {
      if (first === null) { done(null); return; }
      track(first);
      walk(SHORTS_EXTRA_PAGES, dedupeById(filterReadyShots(first)));
    });
    function walk(left, acc) {
      if (left <= 0 || !acc.length) { finish(acc); return; }
      fetchLenta(network, { sort: 'from_id', id: cursor, limit: SHORTS_PAGE_LIMIT }, function (more) {
        if (!more || !more.length) { finish(acc); return; }
        track(more);
        walk(left - 1, dedupeById(acc.concat(filterReadyShots(more))));
      });
    }
    function finish(acc) {
      if (!acc.length) { done([], cursor); return; }
      resolveShortsMeta(network, acc, function (metaMap) {
        done(orderShortsV2(acc, metaMap, Lampa.Storage.get('dorama_shorts_viewed', []) || [], buildShortsTaste(metaMap)), cursor);
      });
    }
  }

  // One deeper history page for feed paging. done({ items: [], next: null })
  // on an exhausted/failed page. next is always the RAW page's smallest id
  // (even when items filters down to []) so the cursor keeps advancing instead
  // of dead-ending on a page with no Asian clips.
  function shortsLoadMore(network, lastId, done) {
    fetchLenta(network, { sort: 'from_id', id: lastId, limit: SHORTS_PAGE_LIMIT }, function (more) {
      if (!more || !more.length) { done({ items: [], next: null }); return; }
      var rawNext = minShortId(more);
      var ready = dedupeById(filterReadyShots(more));
      if (!ready.length) { done({ items: [], next: rawNext }); return; }
      resolveShortsMeta(network, ready, function (metaMap) {
        done({ items: orderShortsV2(ready, metaMap, Lampa.Storage.get('dorama_shorts_viewed', []) || [], buildShortsTaste(metaMap)), next: rawNext });
      });
    });
  }

  function openShorts(feedFactory) {
    var factory = feedFactory || createShortsFeed;
    var network = new Lampa.Reguest();
    if (Lampa.Loading && Lampa.Loading.start) Lampa.Loading.start(function () { network.clear(); });
    buildShortsFeedData(network, function (items, cursor) {
      if (Lampa.Loading && Lampa.Loading.stop) Lampa.Loading.stop();
      if (items === null) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Shorts: сервер недоступен, попробуйте позже');
        return;
      }
      if (!items.length) {
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Пока нет коротких роликов по дорамам');
        return;
      }
      var exhausted = !cursor;
      factory(items, function (cb) {
        if (exhausted) { cb([]); return; }
        shortsLoadMore(network, cursor, function (result) {
          if (result.next && result.next < cursor) cursor = result.next;
          else exhausted = true;
          cb(result.items);
        });
      });
    });
  }

  var SHORTS_CSS_ID = 'dorama-shorts-css';
  var SHORTS_CSS =
    '.dorama-shorts{position:fixed;left:0;top:0;width:100%;height:100%;z-index:500;background:#000}' +
    '.dorama-shorts video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;background:#000}' +
    '.dorama-shorts__progress{position:absolute;left:1em;right:1em;bottom:1em;height:.3em;background:rgba(255,255,255,.3);border-radius:1em;z-index:2}' +
    '.dorama-shorts__progress>div{height:100%;width:0;background:#fff;border-radius:1em}' +
    '.dorama-shorts__panel{position:absolute;left:0;right:0;bottom:0;padding:1.5em;padding-bottom:2.5em;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0));transition:opacity .3s;z-index:1}' +
    '.dorama-shorts--idle .dorama-shorts__panel{opacity:.35}' +
    '.dorama-shorts__card{display:flex;align-items:flex-end}' +
    '.dorama-shorts__poster{width:6.5em;height:9.5em;border-radius:.4em;overflow:hidden;background:rgba(255,255,255,.1);flex-shrink:0;border:.15em solid transparent}' +
    '.dorama-shorts__poster img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s}' +
    '.dorama-shorts__poster--loaded img{opacity:1}' +
    '.dorama-shorts__poster--hidden{display:none}' +
    '.dorama-shorts__poster.focus{border-color:#fff}' +
    '.dorama-shorts__info{padding-left:1.2em;min-width:0}' +
    '.dorama-shorts__year{font-size:1em;opacity:.8}' +
    '.dorama-shorts__title{font-size:1.7em;line-height:1.3;margin-top:.2em;text-shadow:0 0 .2em rgba(0,0,0,.5)}' +
    '.dorama-shorts__tags{margin-top:.6em}' +
    '.dorama-shorts__tags span{display:inline-block;background:rgba(0,0,0,.4);border-radius:.4em;padding:.2em .6em;margin-right:.4em;font-size:.9em}' +
    '.dorama-shorts__actions{margin-top:.8em}' +
    '.dorama-shorts__btn{display:inline-block;background:rgba(255,255,255,.14);border-radius:2em;padding:.45em 1em;margin-right:.5em;font-size:.95em}' +
    '.dorama-shorts__btn.focus{background:#fff;color:#000}' +
    '.dorama-shorts__btn--active{background:rgba(255,255,255,.35)}' +
    '.dorama-shorts__btn--active.focus{background:#fff}' +
    '.dorama-shorts__hint{position:absolute;right:1.5em;bottom:2.5em;font-size:.85em;opacity:.6;z-index:1}';

  function injectShortsCss() {
    if (document.getElementById(SHORTS_CSS_ID)) return;
    var style = document.createElement('style');
    style.id = SHORTS_CSS_ID;
    style.textContent = SHORTS_CSS;
    document.body.appendChild(style);
  }

  // A minimal Lampa card built from CUB shot fields — enough for
  // Favorite.toggle/check and the bookmarks UI (duck-typed like the rest of
  // the plugin: `name` marks tv, `title` marks movie).
  function shortsShotCard(shot) {
    if (shot.card_type === 'tv') {
      return {
        id: parseInt(shot.card_id, 10), name: shot.card_title || '', original_name: shot.card_title || '',
        poster_path: shot.card_poster || '', first_air_date: shot.card_year || ''
      };
    }
    return {
      id: parseInt(shot.card_id, 10), title: shot.card_title || '', original_title: shot.card_title || '',
      poster_path: shot.card_poster || '', release_date: shot.card_year || ''
    };
  }

  function createShortsFeed(items, loadMore) {
    injectShortsCss();
    var position = 0, loadingMore = false, wheelTime = 0, touchY = null, idleTimer = null, destroyed = false;
    var root = document.createElement('div');
    root.className = 'dorama-shorts';
    root.innerHTML =
      '<video autoplay loop playsinline></video>' +
      '<div class="dorama-shorts__panel">' +
      '<div class="dorama-shorts__card">' +
      '<div class="dorama-shorts__poster" data-act="poster"><img alt=""></div>' +
      '<div class="dorama-shorts__info">' +
      '<div class="dorama-shorts__year"></div>' +
      '<div class="dorama-shorts__title"></div>' +
      '<div class="dorama-shorts__tags"></div>' +
      '<div class="dorama-shorts__actions">' +
      '<div class="dorama-shorts__btn" data-act="like">❤ Нравится</div>' +
      '<div class="dorama-shorts__btn" data-act="book">🔖 Позже</div>' +
      '<div class="dorama-shorts__btn" data-act="less">👎 Меньше такого</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dorama-shorts__hint">OK — выбрать • ←→ — кнопки • ↑↓ — ролики</div>' +
      '<div class="dorama-shorts__progress"><div></div></div>';
    var video = root.querySelector('video');
    var bar = root.querySelector('.dorama-shorts__progress div');
    var elYear = root.querySelector('.dorama-shorts__year');
    var elTitle = root.querySelector('.dorama-shorts__title');
    var elTags = root.querySelector('.dorama-shorts__tags');
    var elPoster = root.querySelector('.dorama-shorts__poster');
    var elPosterImg = elPoster.querySelector('img');
    var btnLike = root.querySelector('[data-act="like"]');
    var btnBook = root.querySelector('[data-act="book"]');
    var btnLess = root.querySelector('[data-act="less"]');
    var hasFavorite = !!(Lampa.Favorite && Lampa.Favorite.toggle && Lampa.Favorite.check);
    if (!hasFavorite) { btnLike.style.display = 'none'; btnBook.style.display = 'none'; }
    var focusIndex = 0;

    elPosterImg.onload = function () { elPoster.classList.add('dorama-shorts__poster--loaded'); };
    elPosterImg.onerror = function () {
      elPoster.classList.add('dorama-shorts__poster--hidden');
      // The focusables list just shrank — snap focus to the first control so
      // the ring stays visible and the index can't skip a button.
      focusIndex = 0;
      applyFocus();
    };

    function focusables() {
      var list = [];
      if (!elPoster.classList.contains('dorama-shorts__poster--hidden')) list.push(elPoster);
      if (hasFavorite) { list.push(btnLike); list.push(btnBook); }
      list.push(btnLess);
      return list;
    }

    function applyFocus() {
      var list = focusables(), i;
      if (focusIndex >= list.length) focusIndex = list.length - 1;
      if (focusIndex < 0) focusIndex = 0;
      for (i = 0; i < list.length; i++) list[i].classList.toggle('focus', i === focusIndex);
    }

    function moveFocus(dir) {
      focusIndex += dir;
      applyFocus();
      wake();
    }

    function syncButtons() {
      var shot = current();
      var key = shortsCardKey(shot);
      var taste = shortsTasteGet();
      btnLess.classList.toggle('dorama-shorts__btn--active', taste.down.indexOf(key) >= 0);
      if (hasFavorite) {
        var check = Lampa.Favorite.check(shortsShotCard(shot));
        btnLike.classList.toggle('dorama-shorts__btn--active', !!check.like);
        btnBook.classList.toggle('dorama-shorts__btn--active', !!check.book);
      }
    }

    function activate() {
      var list = focusables();
      var el = list[focusIndex] || list[0];
      var act = el ? el.getAttribute('data-act') : 'poster';
      var shot = current();
      var key = shortsCardKey(shot);
      if (act === 'poster') { openCard(); return; }
      if (act === 'like') {
        Lampa.Favorite.toggle('like', shortsShotCard(shot));
        shortsTasteToggle('up', key); // mirror into the Shorts boost list
      }
      if (act === 'book') Lampa.Favorite.toggle('book', shortsShotCard(shot));
      if (act === 'less') shortsTasteToggle('down', key);
      syncButtons();
      wake();
    }

    function current() { return items[position]; }

    function wake() {
      root.classList.remove('dorama-shorts--idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { root.classList.add('dorama-shorts--idle'); }, 5000);
    }

    function show(shot) {
      elYear.textContent = shot.card_year || '';
      elTitle.textContent = shot.card_title || '';
      var tags = [];
      if (shot.season) tags.push('S-' + shot.season);
      if (shot.episode) tags.push('E-' + shot.episode);
      if (shot.voice_name) tags.push(shot.voice_name);
      elTags.innerHTML = '';
      for (var i = 0; i < tags.length; i++) {
        var span = document.createElement('span');
        span.textContent = tags[i];
        elTags.appendChild(span);
      }
      elPoster.classList.remove('dorama-shorts__poster--loaded');
      elPoster.classList.remove('dorama-shorts__poster--hidden');
      if (shot.card_poster && Lampa.Api && Lampa.Api.img) {
        elPosterImg.src = Lampa.Api.img(shot.card_poster, 'w200');
      } else {
        elPoster.classList.add('dorama-shorts__poster--hidden');
      }
      focusIndex = 0;
      applyFocus();
      syncButtons();
      bar.style.width = '0%';
      video.poster = shot.screen || '';
      video.src = shot.file;
      var p = video.play();
      if (p && p['catch']) p['catch'](function () {});
      wake();
    }

    function move(dir) {
      var next = position + dir;
      if (next < 0 || next >= items.length) { wake(); return; }
      markShortViewed(current().id);
      position = next;
      show(current());
      if (position >= items.length - 3 && !loadingMore) {
        loadingMore = true;
        loadMore(function (more) {
          loadingMore = false;
          for (var i = 0; i < more.length; i++) {
            var dupe = false;
            for (var j = 0; j < items.length; j++) if (items[j].id === more[i].id) { dupe = true; break; }
            if (!dupe) items.push(more[i]);
          }
        });
      }
    }

    function openCard() {
      var shot = current();
      destroy();
      Lampa.Activity.push({
        component: 'full', source: 'tmdb',
        id: parseInt(shot.card_id, 10),
        method: shot.card_type === 'tv' ? 'tv' : 'movie',
        card: { id: parseInt(shot.card_id, 10) }
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      markShortViewed(current().id);
      clearTimeout(idleTimer);
      video.pause();
      // removeAttribute + load (not src='') — an empty src assignment queues a
      // late 'error' event that would re-enter the handler below after teardown.
      video.removeAttribute('src');
      video.load();
      if (root.parentNode) root.parentNode.removeChild(root);
      Lampa.Controller.toggle('content');
    }

    video.addEventListener('timeupdate', function () {
      if (video.duration) bar.style.width = (video.currentTime / video.duration * 100) + '%';
    });
    // A clip whose mp4 404s or can't decode is dropped and skipped over.
    video.addEventListener('error', function () {
      if (destroyed) return;
      if (items.length <= 1) { destroy(); return; }
      items.splice(position, 1);
      if (position >= items.length) position = items.length - 1;
      show(current());
    });
    root.addEventListener('wheel', function (e) {
      if (Date.now() - wheelTime < 500) return;
      wheelTime = Date.now();
      move(e.deltaY > 0 ? 1 : -1);
    });
    // Taps on the panel belong to its buttons — an ES5-safe closest() walk
    // (Element.closest is missing on old TV engines).
    function inPanel(node) {
      while (node && node !== root) {
        if (node.className && String(node.className).indexOf('dorama-shorts__panel') >= 0) return true;
        node = node.parentNode;
      }
      return false;
    }
    root.addEventListener('touchstart', function (e) {
      if (inPanel(e.target)) { touchY = null; return; }
      touchY = (e.touches[0] || e.changedTouches[0]).clientY;
    });
    root.addEventListener('touchend', function (e) {
      if (touchY === null) return;
      var dy = touchY - (e.changedTouches[0] || e.touches[0]).clientY;
      touchY = null;
      if (dy > 80) move(1);
      else if (dy < -80) move(-1);
      else if (video.paused) {
        var p = video.play();
        if (p && p['catch']) p['catch'](function () {});
      } else video.pause();
    });

    Lampa.Controller.add('dorama_shorts', {
      toggle: function () { wake(); },
      up: function () { move(-1); },
      down: function () { move(1); },
      left: function () { moveFocus(-1); },
      right: function () { moveFocus(1); },
      enter: activate,
      back: destroy
    });
    var clickables = [elPoster, btnLike, btnBook, btnLess], ci;
    for (ci = 0; ci < clickables.length; ci++) {
      (function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var list = focusables(), k;
          for (k = 0; k < list.length; k++) if (list[k] === el) focusIndex = k;
          applyFocus();
          activate();
        });
      })(clickables[ci]);
    }
    document.body.appendChild(root);
    show(current());
    Lampa.Controller.toggle('dorama_shorts');
  }

  var SHORTS_ICON =
    '<svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M253.266 512a19.166 19.166 0 0 1-19.168-19.168V330.607l-135.071-.049a19.164 19.164 0 0 1-16.832-28.32L241.06 10.013a19.167 19.167 0 0 1 36.005 9.154v162.534h135.902a19.167 19.167 0 0 1 16.815 28.363L270.078 502.03a19.173 19.173 0 0 1-16.812 9.97z" fill="currentColor"/></svg>';

  function addShortsMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="dorama_shorts">' +
      '<div class="menu__ico">' + SHORTS_ICON + '</div>' +
      '<div class="menu__text">Shorts</div>' +
      '</li>'
    );
    item.on('hover:enter', function () { openShorts(); });
    $('.menu .menu__list').eq(0).append(item);
  }
  // ===================== end Shorts (CUB clip feed) =====================

  function start() {
    if (window.dorama_plugin_ready) return; // guard against double init
    window.dorama_plugin_ready = true;
    Lampa.Component.add('dorama', componentDorama);
    addMenuItem();
    addShortsMenuItem();
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
      _popularRows: popularRows,
      _buildExtraRows: buildExtraRows,
      _buildDynamicRows: buildDynamicRows,
      _buildCatalogRows: buildCatalogRows,
      _rowPage: rowPage,
      _rowAffinity: rowAffinity,
      _orderCatalogRows: orderCatalogRows,
      mergeRecommendations: mergeRecommendations,
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
      _component: componentDorama,
      _shotsLentaUrl: shotsLentaUrl,
      _fetchLenta: fetchLenta,
      _filterReadyShots: filterReadyShots,
      _dedupeById: dedupeById,
      _minShortId: minShortId,
      _shortsCardKey: shortsCardKey,
      _resolveShortsMeta: resolveShortsMeta,
      _shortsTasteGet: shortsTasteGet,
      _shortsTasteToggle: shortsTasteToggle,
      _buildShortsTaste: buildShortsTaste,
      _orderShortsV2: orderShortsV2,
      _markShortViewed: markShortViewed,
      _buildShortsFeedData: buildShortsFeedData,
      _shortsLoadMore: shortsLoadMore,
      _openShorts: openShorts,
      _addShortsMenuItem: addShortsMenuItem,
      _shortsShotCard: shortsShotCard
    };
  }
})();
