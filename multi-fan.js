(function () {
  'use strict';

  // ===================== Model: Multi-Fan → networks → series =====================
  // A network is a way to filter the catalog, not a UI button. `tmdb` is the set
  // of TMDB network ids whose animated series belong to it; `series` is the
  // curated list (TMDB tv ids) shown first on its page; `ages` the age levels
  // (see AGES) at which it has enough to show — three titles or more, measured
  // 2026-09-11. Curated membership wins over TMDB's, so a series sits where
  // fans look for it: TMDB files «Фионна и Кейк» under Max and «Побочные
  // квесты» under Hulu, here they are Adult Swim and Cartoon Network. A series
  // may belong to several networks (Футурама: FOX, Comedy Central, Hulu).
  // Tiles, rows and the continue-watching filter all read this model through
  // networksOf() / networksFor(); none of them owns it.
  //
  // No kids' titles: every curated series is rated 12+ by the rule in AGES
  // (checked against TMDB ratings 2026-09-11). Disney Channel is not here —
  // with kids' shows removed it has two animated series left.
  var NETWORKS = [
    { key: 'adult-swim', title: 'Adult Swim', tmdb: [80], logo: '/tHZPHOLc6iF27G34cAZGPsMtMSy.png', ages: ['12', '18'],
      series: [60625, 131378, 709, 61593, 96372, 202282, 74387, // Рик и Морти, Фионна и Кейк, Робоцып, Мистер Пиклз, Мама назвала меня Шерифом, Рик и Морти: Аниме, Крайний космос
        89456, 126506, 228878, 2604, 2723, 251, 2418, 653, 79356, // Первобытный, Задорные друзья, Частые побочные явления, Гетто, Самурай Джек, Команда Фастфуд, Братья Вентура, Металлопокалипсис, Тука и Берти
        416, 2798, 292, 3108, 334, 125928, 40064, 2073, 1542] }, // Харви Бердмэн, Космический Призрак, Моральный Орел, Тюряга, МорЛаб 2021, Мои приключения с Суперменом, Черный динамит, Мишн Хилл, Фриски Динго
    { key: 'cartoon-network', title: 'Cartoon Network', tmdb: [56], logo: '/c5OC6oVCg6QP4eqzW6XIq17CQjI.png', ages: ['12'],
      series: [15260, 256694, // Время приключений, Побочные квесты
        31132, 61617, 61175, 94280, 45140, 33217, 2723, 4194] }, // Обычный мультик, По ту сторону изгороди, Вселенная Стивена (+ Будущее), Юные Титаны вперёд!, Юная Лига Справедливости, Самурай Джек, Звёздные войны: Войны клонов
    { key: 'fox', title: 'FOX', tmdb: [19], logo: '/1DSpHrWyOORkL9N2QHX7Adt31mQ.png', ages: ['12', '18'],
      series: [456, 1434, 32726, 2122, 1433, 131033, 93292, 202224, 82653, 15632, 63039, // Симпсоны, Гриффины, Бургеры Боба, Царь горы, Американский папаша, Крапополис, Дунканвилль, Гримсбург, Благословите Хартов, Шоу Кливленда, Приграничный город
        615, 93221, 66844, 1839, 49008] }, // Футурама, Великий север, Сын Зорна, Кинокритик, Коп с топором
    { key: 'comedy-central', title: 'Comedy Central', tmdb: [47], logo: '/6ooPjtXufjsoskdJqj6pxuvHEno.png', ages: ['12', '18'],
      series: [2190, 615, 4336, 32351, 44169, 203489, 2, 2513, 210249, 67761, 60904] }, // Южный Парк, Футурама, Мультреалити, Гадкие американцы, Бриклберри, Бивис и Баттхед Майка Джаджа, Клерки, Доктор Катц, Дигман!, Legends of Chamberlain Heights, ТрипТанк
    { key: 'mtv', title: 'MTV', tmdb: [33], logo: '/w4qtv7xBkSVsbOQdSzjUjlyOuSr.png', ages: ['12'],
      series: [13943, 2131, 2423, 406, 1664, 56021, 3547] }, // Бивис и Батт-Хед, Дарья, Celebrity Deathmatch, Эон Флакс, Человек-паук (2003), The Maxx, Студенты
    { key: 'tbs', title: 'TBS', tmdb: [68], logo: '/65r0kR6MfOBYF0gEQsJGM6v5fEG.png', ages: ['12'],
      series: [1433, 74387, 32858] }, // Американский папаша, Крайний космос, Адские соседи
    { key: 'netflix', title: 'Netflix', tmdb: [213], logo: '/wwemzKWzjKYJFfCeiB57q3r4Bcm.png', ages: ['12', '18'],
      series: [61222, 86831, 94605, 71024, 73021, 74204, 97727, 96713, 225180, 81046, // Конь БоДжек, Любовь смерть и роботы, Аркейн, Кастлвания, Разочарование, Большой рот, Корпорация Заговор, Полночные откровения, Голубоглазый самурай, Принц драконов
        63522, 123548, 135918, 214603, 195339, 81983] }, // С значит Семья, Кастлвания: Ноктюрн, Линия отрыва, Этому миру меня не сломить, Пантеон, Полиция Парадайз
    { key: 'hulu', title: 'Hulu', tmdb: [453], logo: '/pqUTCleNUiTLAVlelGxUgWn1ELh.png', ages: ['12', '18'],
      series: [97645, 615, 2122, 256694, 133903, 111312, 121567, 104127, 107124] } // Обратная сторона Земли, Футурама, Царь горы, Побочные квесты, Хит-Манки, МОДОК, Koala Man, Скрестив мечи, Озорные анимашки
  ];

  // ===================== Age: the second filter axis =====================
  // Multi-Fan shows no kids' titles. '12' (the default) = 12 and older, '18' =
  // adults only. TMDB discover filters by one country's scale, and US ratings
  // are filled in far more often than Russian ones (325 vs 92 animated series
  // at the 12+ line), so rows filter by the US scale. The line was set against
  // the Russian ratings of the same titles: TV-PG series sit at RU 12+ (Время
  // приключений, Дарья, Вселенная Стивена), TV-Y7/TV-G at 6+/0+; for films US
  // PG is where RU 6+ sits (Шрек, Головоломка), so the film line is PG-13.
  // A title with no US rating falls back to its Russian one; with neither it
  // is not shown.
  var AGES = {
    '12': { key: '12', title: '12+', tv: 'TV-PG', movie: 'PG-13', ru: 12 },
    '18': { key: '18', title: '18+', tv: 'TV-MA', movie: 'R', ru: 18 }
  };
  var US_TV = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
  var US_MOVIE = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

  function ageOf(key) { return AGES[key] || AGES['12']; }
  function certQuery(method, age) { return '&certification_country=US&certification.gte=' + (method === 'tv' ? age.tv : age.movie); }
  // rating: { US, RU } as TMDB gives them ('TV-14', 'PG-13', '16+').
  function passesAge(rating, media, age) {
    var scale = media === 'tv' ? US_TV : US_MOVIE;
    var i = rating && rating.US ? scale.indexOf(rating.US) : -1;
    if (i >= 0) return i >= scale.indexOf(media === 'tv' ? age.tv : age.movie);
    var ru = rating ? parseInt(rating.RU, 10) : 0;
    return !!ru && ru >= age.ru;
  }

  function networkByKey(key) {
    var i; for (i = 0; i < NETWORKS.length; i++) if (NETWORKS[i].key === key) return NETWORKS[i];
    return null;
  }
  function networksFor(age) {
    var out = [], i; for (i = 0; i < NETWORKS.length; i++) if (NETWORKS[i].ages.indexOf(age.key) >= 0) out.push(NETWORKS[i]);
    return out;
  }

  // Keys of every network a series belongs to: curated lists first, then any
  // network whose TMDB ids the series' own networks (from its detail) hit.
  function networksOf(seriesId, tmdbNetworkIds) {
    var out = [], i, j, n, ids = tmdbNetworkIds || [];
    for (i = 0; i < NETWORKS.length; i++) {
      n = NETWORKS[i];
      if (n.series.indexOf(seriesId) >= 0) { out.push(n.key); continue; }
      for (j = 0; j < ids.length; j++) if (n.tmdb.indexOf(ids[j]) >= 0) { out.push(n.key); break; }
    }
    return out;
  }

  // ===================== Rows =====================
  // Western animation: the channels are American, and TMDB's animation genre
  // is otherwise dominated by anime, donghua and Korean webtoons. The catalog
  // rows narrow by origin country; every row drops the anime keyword, and the
  // loader drops ja/ko/zh originals that slip through a network's list.
  var WEST = 'US|CA|GB|FR|IE|AU|ES|DE|BE|DK|NZ|IT|NL|SE|NO|PL';
  var NO_ANIME = 'without_keywords=210024';
  var ANIMATION = 'with_genres=16&' + NO_ANIME;
  var ASIAN = { ja: 1, ko: 1, zh: 1 };

  function row(title, method, query, extra) {
    var r = { title: title, method: method, source: 'tmdb', url: 'discover/' + method + '?' + query }, k;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) r[k] = extra[k];
    return r;
  }
  function withAge(rows, age) {
    var i; for (i = 0; i < rows.length; i++) { rows[i].url += certQuery(rows[i].method, age); rows[i].age = age.key; }
    return rows;
  }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function daysBefore(now, days) { return ymd(new Date(now.getTime() - days * 24 * 3600 * 1000)); }
  function networkQuery(n) { return 'with_networks=' + n.tmdb.join('|') + '&' + ANIMATION; }

  // No network selected: the whole catalog at this age, series and films, and
  // a row per network whose «Ещё» opens that network's page. (Studio and
  // family rows are gone: at 12+ Pixar, Disney and DreamWorks have no films.)
  function catalogRows(now, age) {
    now = now || new Date(); age = age || AGES['12'];
    var lte = ymd(now), from = daysBefore(now, 730), W = ANIMATION + '&with_origin_country=' + WEST;
    var nets = networksFor(age), rows, i;
    rows = [
      row('Популярные мультсериалы', 'tv', W + '&sort_by=popularity.desc&vote_count.gte=20'),
      row('Популярные мультфильмы', 'movie', W + '&sort_by=popularity.desc&vote_count.gte=20'),
      row('Новые мультсериалы', 'tv', W + '&first_air_date.lte=' + lte + '&first_air_date.gte=' + from + '&sort_by=popularity.desc&vote_count.gte=3'),
      row('Новые мультфильмы', 'movie', W + '&primary_release_date.lte=' + lte + '&primary_release_date.gte=' + from + '&sort_by=popularity.desc&vote_count.gte=3')
    ];
    for (i = 0; i < nets.length; i++) rows.push(row(nets[i].title, 'tv', networkQuery(nets[i]) + '&sort_by=popularity.desc', { network: nets[i].key }));
    rows.push(row('Лучшие мультсериалы', 'tv', W + '&sort_by=vote_average.desc&vote_count.gte=200'));
    rows.push(row('Лучшие мультфильмы', 'movie', W + '&sort_by=vote_average.desc&vote_count.gte=200'));
    return withAge(rows, age);
  }

  // A network selected: only its animated series at this age. The first row is
  // the curated list (`pins`), topped up from TMDB; the rest are views of it.
  function channelRows(n, now, age) {
    now = now || new Date(); age = age || AGES['12'];
    var q = networkQuery(n);
    return withAge([
      row('Главное на ' + n.title, 'tv', q + '&sort_by=vote_count.desc', { pins: n.key }),
      row('Популярно сейчас', 'tv', q + '&sort_by=popularity.desc'),
      row('Новые', 'tv', q + '&first_air_date.lte=' + ymd(now) + '&sort_by=first_air_date.desc'),
      row('Лучшие по оценкам', 'tv', q + '&sort_by=vote_average.desc&vote_count.gte=30'),
      row('Классика', 'tv', q + '&first_air_date.lte=2005-12-31&sort_by=vote_count.desc')
    ], age);
  }

  // A small network (TBS has three 12+ animated series) would show the same
  // cards in every view; a row with nothing new is dropped.
  function dropRedundant(rows) {
    var seen = {}, out = [], i, j, res, fresh;
    for (i = 0; i < rows.length; i++) {
      res = rows[i].results || []; fresh = false;
      for (j = 0; j < res.length; j++) if (!seen[res[j].id]) fresh = true;
      for (j = 0; j < res.length; j++) seen[res[j].id] = true;
      if (fresh) out.push(rows[i]);
    }
    return out;
  }

  function cleanList(list) {
    var out = [], i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c && c.poster_path && !ASIAN[c.original_language]) out.push(c);
    }
    return out;
  }

  // ===================== TMDB =====================
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

  // done(results, total_pages, errorStatus) — errorStatus null on success.
  function fetchResults(network, path, mediaType, done) {
    network.silent(tmdbUrl(path), function (json) {
      var res = (json && json.results) ? json.results : [], i;
      for (i = 0; i < res.length; i++) if (res[i] && !res[i].media_type) res[i].media_type = mediaType;
      done(res, (json && json.total_pages) || 1, null);
    }, function (xhr) {
      done([], 1, (xhr && (xhr.status || xhr.decode_code)) || -1);
    });
  }

  // Title details, distilled to what the plugin reads: seasons (continue
  // row), networks (network filter), age rating (age filter), and a card for a
  // pinned series TMDB's network list lacks. One Storage object, written once
  // per screen, not once per title — TVs serialise Storage synchronously.
  // v2: entries carry the age rating; v1 entries (without it) are not reused.
  var DETAIL_KEY = 'multifan_details_v2', DETAIL_TTL = 3 * 24 * 3600 * 1000, DETAIL_MAX = 300;
  var detailCache = null, detailDirty = false;
  function cacheLoad() {
    if (!detailCache) detailCache = (Lampa.Storage && Lampa.Storage.get && Lampa.Storage.get(DETAIL_KEY, {})) || {};
    return detailCache;
  }
  function cacheFlush() {
    if (!detailDirty || !detailCache) return;
    var keys = [], k, i, kept = {};
    for (k in detailCache) if (detailCache.hasOwnProperty(k)) keys.push(k);
    if (keys.length > DETAIL_MAX) {
      keys.sort(function (a, b) { return detailCache[b].t - detailCache[a].t; });
      for (i = 0; i < DETAIL_MAX; i++) kept[keys[i]] = detailCache[keys[i]];
      detailCache = kept;
    }
    if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(DETAIL_KEY, detailCache);
    detailDirty = false;
  }
  function ids(list) { var o = [], i; list = list || []; for (i = 0; i < list.length; i++) if (list[i] && list[i].id != null) o.push(list[i].id); return o; }
  // US + RU ratings: a series' content_ratings, or a film's release
  // certifications (the first non-empty one per country).
  function ratingOf(d, media) {
    var out = { US: null, RU: null }, list, i, j, r, c;
    if (media === 'tv') {
      list = (d.content_ratings && d.content_ratings.results) || [];
      for (i = 0; i < list.length; i++) { r = list[i]; if (r && (r.iso_3166_1 === 'US' || r.iso_3166_1 === 'RU') && r.rating) out[r.iso_3166_1] = r.rating; }
    } else {
      list = (d.release_dates && d.release_dates.results) || [];
      for (i = 0; i < list.length; i++) {
        r = list[i];
        if (!r || (r.iso_3166_1 !== 'US' && r.iso_3166_1 !== 'RU')) continue;
        for (j = 0; j < (r.release_dates || []).length; j++) { c = r.release_dates[j] && r.release_dates[j].certification; if (c) { out[r.iso_3166_1] = c; break; } }
      }
    }
    return out;
  }
  function distill(d, media) {
    var seasons = [], s = d.seasons || [], i;
    for (i = 0; i < s.length; i++) if (s[i]) seasons.push([s[i].season_number, s[i].episode_count || 0]);
    return { id: d.id, media: media, name: d.name, original_name: d.original_name, title: d.title, original_title: d.original_title,
      poster_path: d.poster_path, backdrop_path: d.backdrop_path, vote_average: d.vote_average, vote_count: d.vote_count,
      first_air_date: d.first_air_date, release_date: d.release_date, original_language: d.original_language,
      origin_country: d.origin_country, genre_ids: ids(d.genres), networks: ids(d.networks), seasons: seasons, rating: ratingOf(d, media) };
  }
  function getDetail(network, media, id, done) {
    var cache = cacheLoad(), key = media + '/' + id, hit = cache[key];
    if (hit && Date.now() - hit.t < DETAIL_TTL) { done(hit.v); return; }
    network.silent(tmdbUrl(key + '?append_to_response=' + (media === 'tv' ? 'content_ratings' : 'release_dates')), function (d) {
      if (!d || d.id == null) { done(hit ? hit.v : null); return; }
      var v = distill(d, media);
      cache[key] = { t: Date.now(), v: v }; detailDirty = true;
      done(v);
    }, function () { done(hit ? hit.v : null); });
  }
  function cardFromDetail(v) {
    return { id: v.id, name: v.name, original_name: v.original_name, poster_path: v.poster_path, backdrop_path: v.backdrop_path,
      vote_average: v.vote_average, vote_count: v.vote_count, first_air_date: v.first_air_date, genre_ids: v.genre_ids,
      original_language: v.original_language, origin_country: v.origin_country, media_type: 'tv' };
  }

  // The curated row: the network's `series` in model order, then everything
  // else TMDB lists for it. Two pages cover most of a list; a pinned series
  // TMDB files elsewhere is fetched by id, cached, and shown only if its
  // rating clears the age (the discover pool is already filtered by it).
  function loadPinned(network, r, done) {
    var n = networkByKey(r.pins), age = ageOf(r.age);
    fetchResults(network, r.url, 'tv', function (p1, pages, err) {
      if (pages > 1) fetchResults(network, r.url + '&page=2', 'tv', function (p2) { order(p1.concat(p2), pages, err); });
      else order(p1, pages, err);
    });
    function order(pool, pages, err) {
      var byId = {}, i, missing = [], k = 0;
      for (i = 0; i < pool.length; i++) if (pool[i]) byId[pool[i].id] = pool[i];
      for (i = 0; i < n.series.length; i++) if (!byId[n.series[i]]) missing.push(n.series[i]);
      function step() {
        if (k >= missing.length) { finish(); return; }
        var id = missing[k++];
        getDetail(network, 'tv', id, function (v) { if (v && passesAge(v.rating, 'tv', age)) byId[id] = cardFromDetail(v); step(); });
      }
      function finish() {
        var out = [], pinned = {};
        for (i = 0; i < n.series.length; i++) if (byId[n.series[i]]) { out.push(byId[n.series[i]]); pinned[n.series[i]] = true; }
        for (i = 0; i < pool.length; i++) if (pool[i] && !pinned[pool[i].id]) out.push(pool[i]);
        done(out, pages, err);
      }
      step();
    }
  }

  var ROW_CONCURRENCY = 4;

  // All rows with bounded concurrency, in catalog order.
  function loadRowsConcurrent(network, rows, note, allDone) {
    var slots = new Array(rows.length), launched = 0, finished = 0, n = rows.length, k;
    if (!n) { allDone([]); return; }
    // `more`: Lampa draws «Ещё» only for rows of 20+ cards unless told; after
    // the poster/anime filter a deep row is often shorter, and a network row's
    // «Ещё» (its page) must always be there.
    function settle(idx, r, results, pages) {
      results = cleanList(results);
      slots[idx] = results.length ? { title: r.title, results: results, url: r.url, method: r.method, source: 'tmdb', total_pages: pages, network: r.network, more: !!r.network || pages > 1 } : null;
      finished++;
      if (finished >= n) { var out = [], i; for (i = 0; i < slots.length; i++) if (slots[i]) out.push(slots[i]); allDone(out); return; }
      launchNext();
    }
    function launchNext() {
      if (launched >= n) return;
      var idx = launched++, r = rows[idx];
      var cb = function (results, pages, err) { note(err); settle(idx, r, results, pages); };
      if (r.pins) loadPinned(network, r, cb);
      else fetchResults(network, r.url, r.method, cb);
    }
    for (k = 0; k < ROW_CONCURRENCY && k < n; k++) launchNext();
  }

  // ===================== Continue watching =====================
  // Lampa keeps progress per file in Timeline, keyed by a hash of
  // season/episode/original name, with the time it last changed (`updated`).
  // So «where did I stop» is the most recently updated episode, not the highest
  // numbered one; an episode seen to the end hands over to the next one.
  var CW_TV = 12, CW_MOVIE = 8, DONE_PERCENT = 90;

  function timelineReady() {
    return !!(Lampa.Timeline && Lampa.Timeline.view && Lampa.Utils && Lampa.Utils.hash && Lampa.Favorite && Lampa.Favorite.continues);
  }
  function episodeHash(season, episode, name) {
    return Lampa.Utils.hash([season, season > 10 ? ':' : '', episode, name].join(''));
  }
  function nextEpisode(seasons, s, e) {
    var i, best = null;
    for (i = 0; i < seasons.length; i++) if (seasons[i][0] === s && e < seasons[i][1]) return [s, e + 1];
    for (i = 0; i < seasons.length; i++) {
      if (seasons[i][0] > s && seasons[i][1] > 0 && (!best || seasons[i][0] < best[0])) best = [seasons[i][0], 1];
    }
    return best;
  }
  function seriesProgress(card, seasons) {
    var name = card.original_name || card.original_title || card.name, best = null, i, s, e, v, up;
    for (i = 0; i < (seasons || []).length; i++) {
      s = seasons[i][0]; if (s < 1) continue;
      for (e = 1; e <= seasons[i][1]; e++) {
        v = Lampa.Timeline.view(episodeHash(s, e, name));
        if (!v || !(v.percent || v.time)) continue;
        up = v.updated || 0;
        if (!best || up > best.updated || (up === best.updated && s * 10000 + e > best.season * 10000 + best.episode)) {
          best = { season: s, episode: e, time: v.time || 0, duration: v.duration || 0, percent: v.percent || 0, updated: up };
        }
      }
    }
    if (!best || best.percent < DONE_PERCENT) return best;
    var nx = nextEpisode(seasons, best.season, best.episode);
    return nx ? { season: nx[0], episode: nx[1], time: 0, duration: 0, percent: 0, next: true, updated: best.updated } : null;
  }
  function movieProgress(card) {
    var v = Lampa.Timeline.view(Lampa.Utils.hash(card.original_title || card.title || ''));
    if (!v || !v.percent || v.percent >= DONE_PERCENT) return null;
    return { time: v.time || 0, duration: v.duration || 0, percent: v.percent, updated: v.updated || 0 };
  }

  function clock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return h ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  }
  function continueLabel(p) {
    if (p.season) return 'Сезон ' + p.season + ' · Серия ' + p.episode + ' · ' + (p.next ? 'с начала' : clock(p.time));
    return clock(p.time) + (p.duration ? ' из ' + clock(p.duration) : '');
  }

  function isTv(c) { return !!(c.original_name || c.first_air_date || c.number_of_seasons); }
  function hasAnimation(gids) { return (gids || []).indexOf(16) >= 0; }
  function clone(o) { var c = {}, k; for (k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }

  // done(row|null). Only animation that clears the age; `n` limits the row to
  // one network's series (films have no network, so they only appear with
  // none selected). A title whose detail can't be fetched is left out — its
  // rating is unknown.
  function loadContinue(network, n, age, done) {
    if (!timelineReady()) { done(null); return; }
    var cands = (Lampa.Favorite.continues('tv') || []).slice(0, CW_TV);
    if (!n) cands = cands.concat((Lampa.Favorite.continues('movie') || []).slice(0, CW_MOVIE));
    var out = [], k = 0;
    function keep(c, p) {
      if (!p) return;
      var card = clone(c);
      card.__cw = { label: continueLabel(p), percent: p.percent || 0 };
      card.__updated = p.updated || 0;
      out.push(card);
    }
    function step() {
      if (k >= cands.length) { finish(); return; }
      var c = cands[k++];
      if (!c || c.id == null) { step(); return; }
      var media = isTv(c) ? 'tv' : 'movie';
      getDetail(network, media, c.id, function (v) {
        // A card stored from its full page carries `genres`, which Lampa's
        // clearCard drops, so the detail's genre_ids back it up.
        var gids = (c.genre_ids && c.genre_ids.length) ? c.genre_ids : (v ? v.genre_ids : []);
        if (v && hasAnimation(gids) && passesAge(v.rating, media, age)) {
          if (media === 'movie') keep(c, movieProgress(c));
          else if (!n || networksOf(c.id, v.networks).indexOf(n.key) >= 0) keep(c, seriesProgress(c, v.seasons));
        }
        step();
      });
    }
    function finish() {
      var ranked = [], i;
      for (i = 0; i < out.length; i++) ranked.push({ c: out[i], i: i });
      ranked.sort(function (a, b) { return (b.c.__updated - a.c.__updated) || (a.i - b.i); });
      out = []; for (i = 0; i < ranked.length; i++) out.push(ranked[i].c);
      done(out.length ? { title: 'Продолжить просмотр', results: out, source: 'tmdb', nomore: true, multifan_continue: true } : null);
    }
    step();
  }

  // Poster overlay «Сезон 2 · Серия 5 · 12:34» + progress bar on the continue
  // row's native cards (native, so enter/long-press behave like Lampa's own).
  function registerContinueOverlay() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('line', function (e) {
      if (!e || (e.type !== 'append' && e.type !== 'visible')) return;
      if (!e.data || !e.data.multifan_continue || !e.items) return;
      var i, item, el, view, cw;
      for (i = 0; i < e.items.length; i++) {
        item = e.items[i];
        el = (item && item.render) ? item.render() : null;
        if (!el || !el.find) continue;
        view = el.find('.card__view');
        cw = item.data && item.data.__cw;
        if (!cw || !view.length || view.find('.multifan-cw').length) continue;
        view.append('<div class="multifan-cw">' + esc(cw.label) +
          '<div class="multifan-cw__bar"><div style="width:' + Math.max(3, Math.min(100, cw.percent)) + '%"></div></div></div>');
      }
    });
  }

  // ===================== Tiles: «Все мульты» · «18+» · networks =====================
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function img(path) { return (Lampa.Api && Lampa.Api.img) ? Lampa.Api.img(path, 'w300') : path; }

  var ALL_TITLE = 'Все мульты';

  // The row mirrors the two filters: «Все мульты» clears the network, «18+»
  // toggles the age, a logo picks a network. Networks with too little at the
  // current age are not offered. Each tile carries the view it was drawn in,
  // so its enter knows what to keep.
  function tilesRow(networkKey, ageKey) {
    var age = ageOf(ageKey), nets = networksFor(age), view = { network: networkKey || '', age: age.key }, i;
    var items = [
      { kind: 'all', title: ALL_TITLE, __active: !networkKey, __view: view },
      { kind: 'age', title: AGES['18'].title, __active: age.key === '18', __view: view }
    ];
    for (i = 0; i < nets.length; i++) {
      items.push({ kind: 'net', key: nets[i].key, title: nets[i].title, logo: nets[i].logo, __active: nets[i].key === networkKey, __view: view });
    }
    // line_type only names the row's CSS class; the default 'cards' carries
    // `min-height: 24em` for posters, which left a band under the short tiles.
    return { title: 'Каналы', results: items, cardClass: makeTile, nomore: true, noimage: true, line_type: 'multifan-tiles', multifan_tiles: true };
  }

  function onTileEnter(t) {
    var v = t.__view || { network: '', age: '12' };
    if (t.kind === 'all') openView('', v.age);
    else if (t.kind === 'age') openView(v.network, v.age === '18' ? '12' : '18');
    else openView(t.key, v.age);
  }

  // A rectangular tile. It handles its own enter: the row's default enter
  // opens a card's full page, and a tile is a filter, not a title.
  // `layer--visible layer--render` + the 'visible' listener are the native
  // card's contract: a row appends cards lazily, and Lampa dispatches
  // 'visible' on those classes when one scrolls in — the row's onVisible then
  // adds it to the remote's focus collection. Without them the remote stops
  // at the last tile drawn on open (measured: the 6th of 10).
  function makeTile(data) { return new NetTile(data); }
  function NetTile(data) {
    var self = this;
    this.data = data;
    this.create = function () {
      var inner = data.logo
        ? '<img class="multifan-net__logo" src="' + esc(img(data.logo)) + '" alt="' + esc(data.title) + '" />'
        : '<div class="multifan-net__text">' + esc(data.title) + '</div>';
      var mod = data.kind === 'all' ? ' multifan-net--all' : data.kind === 'age' ? ' multifan-net--age' : '';
      this.el = $('<div class="multifan-net selector layer--visible layer--render' + mod + (data.__active ? ' multifan-net--active' : '') + '">' + inner + '</div>');
      this.el.on('hover:focus', function () { if (self.onFocus) self.onFocus(self.render(true), data); });
      this.el.on('hover:enter', function () { onTileEnter(data); });
      this.el.on('visible', function () { self.visible(); });
    };
    this.visible = function () { if (self.onVisible) self.onVisible(); };
    this.render = function (js) { return js ? ((this.el && this.el[0]) || this.el) : this.el; };
    this.destroy = function () { if (this.el && this.el.remove) this.el.remove(); this.el = null; };
  }

  function activeObject() { try { return Lampa.Activity.active(); } catch (e) { return null; } }
  function viewTitle(n, age) { return MENU_TITLE + (n ? ' · ' + n.title : '') + (age.key === '18' ? ' · ' + age.title : ''); }

  // Leaving the start page (all networks, 12+) opens a new page, so Back
  // returns to it; any other change replaces the page, so Back never walks
  // through every filter the user flicked past. A network with too little at
  // the new age falls back to all networks.
  function openView(key, ageKey) {
    var age = ageOf(ageKey), n = key ? networkByKey(key) : null;
    if (n && n.ages.indexOf(age.key) < 0) n = null;
    var cur = activeObject(), mine = cur && cur.component === 'multifan';
    if (mine && (cur.network || '') === (n ? n.key : '') && ageOf(cur.age).key === age.key) return;
    var obj = { url: '', title: viewTitle(n, age), component: 'multifan', network: n ? n.key : '', age: age.key, source: 'tmdb', card_type: true, page: 1 };
    var atStart = mine && !cur.network && ageOf(cur.age).key === '12';
    if (mine && !atStart && Lampa.Activity.replace) Lampa.Activity.replace(obj);
    else Lampa.Activity.push(obj);
  }

  var STYLE =
    '.multifan-net{flex-shrink:0;width:15em;height:7em;margin-right:1em;border-radius:1em;background:#f2f2f2;display:flex;align-items:center;justify-content:center;position:relative;transition:transform .15s}' +
    '.multifan-net__logo{max-width:72%;max-height:58%;object-fit:contain}' +
    '.multifan-net--all{background:linear-gradient(135deg,#6a3df0,#e0457b)}' +
    '.multifan-net--age{background:linear-gradient(135deg,#8e0e28,#ff4b2b)}' +
    '.multifan-net__text{color:#fff;font-weight:700;font-size:1.4em;text-align:center;padding:0 .5em}' +
    '.multifan-net--age .multifan-net__text{font-size:2.2em;letter-spacing:.02em}' +
    '.multifan-net.focus{transform:scale(1.06);box-shadow:0 0 0 .3em #fff}' +
    '.multifan-net--active::after{content:"";position:absolute;left:20%;right:20%;bottom:-.7em;height:.3em;border-radius:.3em;background:#ffd400}' +
    '.multifan-cw{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:2em .6em .55em;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.88));color:#fff;font-size:.9em;font-weight:600;line-height:1.3;border-radius:0 0 1em 1em;pointer-events:none}' +
    '.multifan-cw__bar{height:.25em;background:rgba(255,255,255,.3);border-radius:.2em;margin-top:.4em;overflow:hidden}' +
    '.multifan-cw__bar>div{height:100%;background:#ffd400}';
  function injectStyle() {
    if (typeof document === 'undefined' || !document.head || document.getElementById('multifan-style')) return;
    var s = document.createElement('style');
    s.id = 'multifan-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ===================== Screen =====================
  function loadView(network, n, age, onDone, onFail) {
    var rows = n ? channelRows(n, null, age) : catalogRows(null, age);
    var errors = 0, lastStatus = 0;
    function note(err) { if (err) { errors++; if (typeof err === 'number' && err > 0) lastStatus = err; } }
    loadRowsConcurrent(network, rows, note, function (loaded) {
      if (n) loaded = dropRedundant(loaded);
      loadContinue(network, n, age, function (cw) {
        cacheFlush();
        if (!loaded.length && !cw) { onFail({ errored: errors > 0, status: lastStatus }); return; }
        onDone([tilesRow(n ? n.key : '', age.key)].concat(cw ? [cw] : []).concat(loaded));
      });
    });
  }

  function componentMultiFan(object) {
    var comp = new Lampa.InteractionMain(object);
    var network = new Lampa.Reguest();
    if (network.timeout) network.timeout(1000 * 15);
    var age = ageOf(object && object.age);
    var n = object && object.network ? networkByKey(object.network) : null;
    if (n && n.ages.indexOf(age.key) < 0) n = null;

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      loadView(network, n, age, function (data) {
        self.build(data);
        self.activity.loader(false);
        self.activity.toggle();
        // On a network page the remote starts on its series, one row below the
        // tiles: left on the first tile, one more OK would bounce back to «Все
        // мульты». (Focusing the active tile itself fails on a TV — the row
        // appends tiles lazily, so the last ones may not exist yet.)
        if (n && self.down) self.down();
      }, function (info) { self.showState(info); });
      return this.render();
    };

    comp.showState = function (info) {
      var descr = info && info.errored
        ? (info.status === 401
          ? 'TMDB: ошибка авторизации (401). Проверьте ключ/прокси TMDB в настройках Lampa.'
          : 'TMDB: не удалось загрузить данные' + (info.status ? ' (' + info.status + ')' : ''))
        : 'Ничего не найдено';
      var empty = new Lampa.Empty({ descr: descr });
      this.render().append(empty.render(true));
      this.start = empty.start.bind(empty);
      this.activity.loader(false);
      this.activity.toggle();
    };

    // A network row's «Ещё» opens the network's page at this age; any other
    // row its grid (the row url carries the age filter).
    comp.onMore = function (r) {
      if (!r) return;
      if (r.network) { openView(r.network, age.key); return; }
      if (!r.url) return;
      Lampa.Activity.push({ url: r.url, title: r.title, component: 'category_full', source: 'tmdb', card_type: true, page: 1 });
    };

    var inheritedDestroy = comp.destroy ? comp.destroy.bind(comp) : function () {};
    comp.destroy = function () { network.clear(); inheritedDestroy(); };
    return comp;
  }

  var MENU_TITLE = 'Multi-Fan';
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="3" y="6.5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M8.5 2.5 12 6.5l3.5-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="9" cy="12.5" r="1.3" fill="currentColor"/><circle cx="15" cy="12.5" r="1.3" fill="currentColor"/>' +
    '<path d="M9.5 15.5c1.4 1.2 3.6 1.2 5 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  function addMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="multifan">' +
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">' + MENU_TITLE + '</div>' +
      '</li>'
    );
    item.on('hover:enter', function () {
      Lampa.Activity.push({ url: '', title: MENU_TITLE, component: 'multifan', network: '', age: '12', source: 'tmdb', card_type: true, page: 1 });
    });
    $('.menu .menu__list').eq(0).append(item);
  }

  function start() {
    if (window.multifan_plugin_ready) return;
    window.multifan_plugin_ready = true;
    injectStyle();
    Lampa.Component.add('multifan', componentMultiFan);
    addMenuItem();
    registerContinueOverlay();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

  // --- test export hook (inert in a browser) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      NETWORKS: NETWORKS,
      AGES: AGES,
      networkByKey: networkByKey,
      networksOf: networksOf,
      networksFor: networksFor,
      passesAge: passesAge,
      _certQuery: certQuery,
      _catalogRows: catalogRows,
      _channelRows: channelRows,
      _dropRedundant: dropRedundant,
      _tilesRow: tilesRow,
      _seriesProgress: seriesProgress,
      _movieProgress: movieProgress,
      _nextEpisode: nextEpisode,
      _continueLabel: continueLabel,
      _clock: clock,
      _openView: openView,
      _registerContinueOverlay: registerContinueOverlay,
      _component: componentMultiFan,
      _start: start
    };
  }
})();
