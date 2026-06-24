(function () {
  'use strict';

  // --- Anime collections (verified TMDB ids + cover poster paths) ---
  // group: 'studio' | 'franchise' | 'theme'
  // source.type: 'company' | 'collection' | 'discover'  (derived from url where needed)
  // url: a TMDB path; studios/themes use discover (paginated), franchises use collection/<id>.
  var KW = '210024';        // TMDB "anime" keyword
  var ST = '&sort_by=popularity.desc&vote_count.gte=5';

  var ANIME_COLLECTIONS = [
    // Студии (company) — Ghibli is film-only, the rest are TV-led.
    { group: 'studio', title: 'Studio Ghibli',   poster: '/8i4s1mb3T3C0HHhSNR4nDMqRDgm.jpg', url: 'discover/movie?with_companies=10342' + ST },
    { group: 'studio', title: 'MAPPA',           poster: '/23oJaeBh0FDk2mQ2P240PU9Xxfh.jpg', url: 'discover/tv?with_companies=21444' + ST },
    { group: 'studio', title: 'ufotable',        poster: '/h8Rb9gBr48ODIwYUttZNYeMWeUU.jpg', url: 'discover/tv?with_companies=5887' + ST },
    { group: 'studio', title: 'Madhouse',        poster: '/qDhbGqjZ7yFwa7FMIzuiQTQMfEQ.jpg', url: 'discover/tv?with_companies=3464' + ST },
    { group: 'studio', title: 'BONES',           poster: '/kdovrjrKighUFEh9ZRQul0Evx6L.jpg', url: 'discover/tv?with_companies=2849' + ST },
    { group: 'studio', title: 'Kyoto Animation', poster: '/bajajkoErDst0JxdFyBkABiF9rW.jpg', url: 'discover/tv?with_companies=5438' + ST },
    { group: 'studio', title: 'Toei Animation',  poster: '/8ibfhe4P7rhmn3lrPhOZzIJHA2B.jpg', url: 'discover/tv?with_companies=5542' + ST },
    { group: 'studio', title: 'Production I.G',  poster: '/9gC88zYUBARRSThcG93MvW14sqx.jpg', url: 'discover/tv?with_companies=529' + ST },
    { group: 'studio', title: 'WIT STUDIO',      poster: '/k4E04qJvSTQYUPOpYp5YYvdrdcc.jpg', url: 'discover/tv?with_companies=31058' + ST },
    { group: 'studio', title: 'TRIGGER',         poster: '/cCVRivpiVUJ4Wn6gHm8pLXppXla.jpg', url: 'discover/tv?with_companies=50908' + ST },
    { group: 'studio', title: 'Sunrise',         poster: '/34H5bsNc0EPILVr49TfOYXj50qV.jpg', url: 'discover/tv?with_companies=3153' + ST },
    { group: 'studio', title: 'A-1 Pictures',    poster: '/2szdEK0Mr0RG0nWGFVTseNQHbnP.jpg', url: 'discover/tv?with_companies=13113' + ST },

    // Франшизы (collection) — native TMDB collections (real posters, finite parts).
    { group: 'franchise', title: 'Dragon Ball',   poster: '/8N1nLnRbwErhuIMekAqER0uBuf0.jpg', url: 'collection/386410' },
    { group: 'franchise', title: 'Naruto',        poster: '/cmKBGxVSAykHsnCL27wX4PIjNZI.jpg', url: 'collection/23616' },
    { group: 'franchise', title: 'One Piece',     poster: '/89eVIW6qPr2x6DrsphrqKQAoMRM.jpg', url: 'collection/23456' },
    { group: 'franchise', title: 'Demon Slayer',  poster: '/3exjjYTseefny9nYjSbkIblZZdK.jpg', url: 'collection/925155' },
    { group: 'franchise', title: 'Evangelion',    poster: '/1FHZmNWcyz5zzGH2PQf1w0S4JZ1.jpg', url: 'collection/96850' },
    { group: 'franchise', title: 'Pokémon',       poster: '/9h52kFaxgNobfotNhM72odDpUEk.jpg', url: 'collection/34055' },
    { group: 'franchise', title: 'Doraemon',      poster: '/4TLSP1KD1uAlp2q1rTrc6SFlktX.jpg', url: 'collection/148065' },

    // Подборки (discover) — anime keyword + Japanese original language.
    { group: 'theme', title: 'Топ аниме',    poster: '/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg', url: 'discover/tv?with_keywords=' + KW + '&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=8' },
    { group: 'theme', title: 'Новинки',      poster: '/dqZENchTd7lp5zht7BdlqM7RBhD.jpg', url: 'discover/tv?with_keywords=' + KW + '&with_original_language=ja&sort_by=first_air_date.desc&vote_count.gte=10' },
    { group: 'theme', title: 'Аниме-фильмы', poster: '/q719jXXEzOoYaps6babgKnONONX.jpg', url: 'discover/movie?with_keywords=' + KW + '&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=10' },
    { group: 'theme', title: 'Сёнен',        poster: '/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg', url: 'discover/tv?with_keywords=' + KW + '&with_genres=16,10759&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=10' },
    { group: 'theme', title: 'Классика',     poster: '/xDiXDfZwC6XYC6fxHI1jl3A3Ill.jpg', url: 'discover/tv?with_keywords=' + KW + '&with_original_language=ja&first_air_date.lte=2010-01-01&sort_by=vote_average.desc&vote_count.gte=100&vote_average.gte=8' }
  ];

  function img(path) { return (Lampa.Api && Lampa.Api.img) ? Lampa.Api.img(path, 'w300') : (path || ''); }
  function isCollectionUrl(url) { return !!url && url.indexOf('collection/') === 0; }
  function methodOf(item) { return item && (item.name || item.first_air_date) ? 'tv' : 'movie'; }

  // Authenticated TMDB URL (Lampa.TMDB.api only adds the host; we add api_key+language).
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

  // Hub rows: Студии / Франшизы / Подборки, each a line of cover cards (custom CoverCard).
  function buildHubRows() {
    var groups = [
      { key: 'studio', title: 'Студии' },
      { key: 'franchise', title: 'Франшизы' },
      { key: 'theme', title: 'Подборки' }
    ];
    var rows = [], g, i, e, items;
    for (g = 0; g < groups.length; g++) {
      items = [];
      for (i = 0; i < ANIME_COLLECTIONS.length; i++) {
        e = ANIME_COLLECTIONS[i];
        if (e.group === groups[g].key) items.push({ title: e.title, poster_path: e.poster, _entry: e });
      }
      if (items.length) rows.push({ title: groups[g].title, results: items, collection: true, cardClass: makeCoverCard });
    }
    return rows;
  }

  // Normalize a view fetch into { results, total_pages }. Collections expose .parts (finite),
  // discover/company expose .results (paginated). Stamp media_type for correct detail routing.
  function parseItems(json, collection) {
    var list = (collection ? (json && json.parts) : (json && json.results)) || [];
    var i;
    for (i = 0; i < list.length; i++) { if (list[i] && !list[i].media_type) list[i].media_type = methodOf(list[i]); }
    return { results: list, total_pages: collection ? 1 : ((json && json.total_pages) || 1) };
  }

  function openView(entry) {
    Lampa.Activity.push({
      url: entry.url, title: entry.title,
      component: 'anime_collections_view', source: 'tmdb', card_type: true, page: 1
    });
  }

  // Custom cover card — uses the real .card / .card__view markup so it inherits Lampa's
  // poster sizing; binds its own hover:enter to open the collection view (prisma pattern).
  function makeCoverCard(data) { return new CoverCard(data); }
  function CoverCard(data) {
    this.create = function () {
      var self = this;
      this.card = $(
        '<div class="card selector card--collection">' +
        '<div class="card__view"><img class="card__img" src="" alt="" /></div>' +
        '<div class="card__title">' + (data.title || '') + '</div>' +
        '</div>'
      );
      if (data.poster_path && this.card.find) {
        var im = this.card.find('.card__img');
        if (im && im.attr) im.attr('src', img(data.poster_path));
      }
      this.card.on('hover:enter', function () { openView(data._entry); });
    };
    this.image = function () {};
    this.visible = function () {};
    this.use = function () {};
    this.render = function () { return this.card; };
    this.destroy = function () { if (this.card && this.card.remove) this.card.remove(); this.card = null; };
  }

  // GET a page of a collection/discover url; deliver {results,total_pages,page}.
  function fetchPage(network, url, page, onComplete, onError) {
    var collection = isCollectionUrl(url), u = url;
    if (!collection) u = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + (page || 1);
    network.silent(tmdbUrl(u), function (json) {
      var parsed = parseItems(json, collection);
      if (!parsed.results.length) { onError(); return; }
      onComplete({ results: parsed.results, total_pages: parsed.total_pages, page: page || 1 });
    }, function () { onError(); });
  }

  // Tier 1 — hub of grouped cover rows.
  function hubComponent(object) {
    var comp = new Lampa.InteractionMain(object);
    comp.create = function () {
      var self = this;
      this.build(buildHubRows());
      if (this.activity) { if (this.activity.loader) this.activity.loader(false); if (this.activity.toggle) this.activity.toggle(); }
      return this.render();
    };
    return comp;
  }

  // Tier 2 — 6-column grid of one collection's titles.
  function viewComponent(object) {
    var comp = new Lampa.InteractionCategory(object);
    var network = new Lampa.Reguest();
    if (network.timeout) network.timeout(1000 * 15);
    var collection = isCollectionUrl(object.url);

    comp.create = function () {
      var self = this;
      fetchPage(network, object.url, 1, function (data) {
        self.build(data);
        if (self.render && self.render().find) self.render().find('.category-full').addClass('mapping--grid cols--6');
      }, this.empty.bind(this));
      return this.render();
    };

    comp.nextPageReuest = function (obj, resolve, reject) {
      if (collection) { reject.call(comp); return; } // collections are finite
      fetchPage(network, object.url, obj.page, resolve.bind(comp), reject.bind(comp));
    };

    comp.cardRender = function (obj, element, card) {
      card.onMenu = false;
      card.onEnter = function () {
        Lampa.Activity.push({
          component: 'full', id: element.id, method: element.media_type || methodOf(element),
          card: element, source: 'tmdb'
        });
      };
    };

    var inheritedDestroy = comp.destroy ? comp.destroy.bind(comp) : function () {};
    comp.destroy = function () { network.clear(); inheritedDestroy(); };
    return comp;
  }

  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H10C10.8 4 11.5 4.7 11.5 5.5V10C11.5 10.8 10.8 11.5 10 11.5H5.5C4.7 11.5 4 10.8 4 10V5.5Z" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M12.5 5.5C12.5 4.7 13.2 4 14 4H18.5C19.3 4 20 4.7 20 5.5V10C20 10.8 19.3 11.5 18.5 11.5H14C13.2 11.5 12.5 10.8 12.5 10V5.5Z" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M4 14C4 13.2 4.7 12.5 5.5 12.5H10C10.8 12.5 11.5 13.2 11.5 14V18.5C11.5 19.3 10.8 20 10 20H5.5C4.7 20 4 19.3 4 18.5V14Z" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M12.5 14C12.5 13.2 13.2 12.5 14 12.5H18.5C19.3 12.5 20 13.2 20 14V18.5C20 19.3 19.3 20 18.5 20H14C13.2 20 12.5 19.3 12.5 18.5V14Z" stroke="currentColor" stroke-width="1.6"/></svg>';

  function addMenuItem() {
    var item = $(
      '<li class="menu__item selector" data-action="anime_collections">' +
      '<div class="menu__ico">' + ICON + '</div>' +
      '<div class="menu__text">Аниме коллекции</div>' +
      '</li>'
    );
    item.on('hover:enter', function () {
      Lampa.Activity.push({ url: '', title: 'Аниме коллекции', component: 'anime_collections_main', page: 1 });
    });
    $('.menu .menu__list').eq(0).append(item);
  }

  function start() {
    if (window.anime_collections_ready) return;
    window.anime_collections_ready = true;
    Lampa.Component.add('anime_collections_main', hubComponent);
    Lampa.Component.add('anime_collections_view', viewComponent);
    addMenuItem();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

  // --- test export hook (inert in a browser) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ANIME_COLLECTIONS: ANIME_COLLECTIONS,
      buildHubRows: buildHubRows,
      parseItems: parseItems,
      isCollectionUrl: isCollectionUrl,
      methodOf: methodOf,
      _tmdbUrl: tmdbUrl,
      _CoverCard: CoverCard,
      _hub: hubComponent,
      _view: viewComponent,
      _start: start,
      _addMenuItem: addMenuItem
    };
  }
})();
