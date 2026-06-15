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

  // GET a TMDB path via Lampa, stamp media_type onto each result, return results
  // (+ total_pages) through `done`. Network errors degrade to an empty list.
  function fetchResults(network, path, mediaType, done) {
    network.silent(Lampa.TMDB.api(path), function (json) {
      var res = (json && json.results) ? json.results : [];
      var i;
      if (mediaType) for (i = 0; i < res.length; i++) {
        if (res[i] && !res[i].media_type) res[i].media_type = mediaType;
      }
      done(res, (json && json.total_pages) || 1);
    }, function () { done([], 1); });
  }

  // Assemble the whole catalog: recommendation row first, then curated rows.
  // Sequential requests keep one Reguest instance safe on old WebViews.
  function loadCatalog(network, onDone, onEmpty) {
    var rows = buildRows();
    var curated = [];
    var i = 0;

    function nextRow() {
      if (i >= rows.length) { loadRecos(); return; }
      var row = rows[i];
      fetchResults(network, row.url, row.method, function (results, totalPages) {
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
        fetchResults(network, a.type + '/' + a.id + '/recommendations', a.type, function (results) {
          lists.push(results); k++; nextAnchor();
        });
      }
      function finish() {
        var merged = mergeRecommendations(lists, anchorIds, 40);
        var out = [];
        if (merged.length) out.push({ title: 'В духе «Паразитов»', results: merged, source: 'tmdb' });
        var allRows = out.concat(curated);
        if (allRows.length) onDone(allRows); else onEmpty();
      }
      nextAnchor();
    }

    nextRow();
  }

  function componentDorama(object) {
    var comp = new Lampa.InteractionMain(object);
    var network = new Lampa.Reguest();

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      loadCatalog(network, function (data) {
        self.build(data);
        self.activity.loader(false);
        self.activity.toggle();
      }, function () {
        self.activity.loader(false);
        self.empty();
      });
      return this.render();
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
      _start: start,
      _addMenuItem: addMenuItem,
      _component: componentDorama
    };
  }
})();
