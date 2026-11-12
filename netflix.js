(function () {
  'use strict';

  // netflix.js — «Netflix Топ-10»: ряды карточек TMDB из готовых данных Netflix Top 10.
  // Спека: docs/superpowers/specs/2026-11-12-netflix-plugin-design.md. Данные (контракт §3) собирает
  // tools/netflix/ в папку netflix/, плагин их только читает и считает подборы на ТВ.
  // Карта файла: константы → формат → данные → тайтлы и чарты → подбор (nf) → зал славы и списки
  // сеток → ряды → плитки и метки → меню → применение → экраны (netflix, сетка, история, зал славы) →
  // трейлеры (мост netflix-trailer.html, оверлей, кнопка ▶) → отсчёт 10→1 → досье и «Похожие» →
  // страница карточки → шапка и меню → старт.

  // ======================= Константы =======================
  var DATA_BASE = 'https://drshpackz.github.io/dorama/netflix/';
  var BRIDGE_URL = 'https://drshpackz.github.io/dorama/netflix-trailer.html'; // мост трейлеров (§8.4)
  var SCHEMA = 1;
  var MENU_TITLE = 'Netflix Топ-10';
  var T_MANIFEST = 10000;        // мс, манифест без кэша
  var T_FILE = 20000;            // мс, остальные файлы
  var CACHE_LIFE = 43200;        // минуты: 30 дней кэша Reguest (адрес с ?v=хеш)
  var WAIT_MAX = 20000;          // сколько действие или пачка ждут данных
  var RETRY_AFTER = 30000;       // упавший файл не перезапрашивать чаще
  var MANIFEST_TTL = 3600000;    // манифест перечитывается не чаще раза в час
  var STALE_DAYS = 16;           // данные старше — одно уведомление за сессию
  var ROW_MAX = 20;              // карточек в ряду, остальное — в сетке «Ещё» (B3)
  var NO_RU = 'нет данных: Netflix ушёл из России в марте 2022';

  // §14.1 — 94 страны чарта: код|название|«в …»|«чего». Внутри региона — по алфавиту.
  var REGIONS = [
    { key: 'eu', title: 'Европа', list:
      'AT|Австрия|в Австрии|Австрии;BE|Бельгия|в Бельгии|Бельгии;BG|Болгария|в Болгарии|Болгарии;' +
      'GB|Великобритания|в Великобритании|Великобритании;HU|Венгрия|в Венгрии|Венгрии;DE|Германия|в Германии|Германии;' +
      'GR|Греция|в Греции|Греции;DK|Дания|в Дании|Дании;IE|Ирландия|в Ирландии|Ирландии;IS|Исландия|в Исландии|Исландии;' +
      'ES|Испания|в Испании|Испании;IT|Италия|в Италии|Италии;CY|Кипр|на Кипре|Кипра;LV|Латвия|в Латвии|Латвии;' +
      'LT|Литва|в Литве|Литвы;LU|Люксембург|в Люксембурге|Люксембурга;MT|Мальта|на Мальте|Мальты;' +
      'NL|Нидерланды|в Нидерландах|Нидерландов;NO|Норвегия|в Норвегии|Норвегии;PL|Польша|в Польше|Польши;' +
      'PT|Португалия|в Португалии|Португалии;RU|Россия|в России|России;RO|Румыния|в Румынии|Румынии;' +
      'RS|Сербия|в Сербии|Сербии;SK|Словакия|в Словакии|Словакии;SI|Словения|в Словении|Словении;' +
      'TR|Турция|в Турции|Турции;UA|Украина|в Украине|Украины;FI|Финляндия|в Финляндии|Финляндии;' +
      'FR|Франция|во Франции|Франции;HR|Хорватия|в Хорватии|Хорватии;CZ|Чехия|в Чехии|Чехии;' +
      'CH|Швейцария|в Швейцарии|Швейцарии;SE|Швеция|в Швеции|Швеции;EE|Эстония|в Эстонии|Эстонии' },
    { key: 'asia', title: 'Азия и Океания', list:
      'AU|Австралия|в Австралии|Австралии;BD|Бангладеш|в Бангладеш|Бангладеш;VN|Вьетнам|во Вьетнаме|Вьетнама;' +
      'HK|Гонконг|в Гонконге|Гонконга;IN|Индия|в Индии|Индии;ID|Индонезия|в Индонезии|Индонезии;' +
      'MY|Малайзия|в Малайзии|Малайзии;MV|Мальдивы|на Мальдивах|Мальдив;NZ|Новая Зеландия|в Новой Зеландии|Новой Зеландии;' +
      'NC|Новая Каледония|в Новой Каледонии|Новой Каледонии;PK|Пакистан|в Пакистане|Пакистана;SG|Сингапур|в Сингапуре|Сингапура;' +
      'TH|Таиланд|в Таиланде|Таиланда;TW|Тайвань|на Тайване|Тайваня;PH|Филиппины|на Филиппинах|Филиппин;' +
      'LK|Шри-Ланка|в Шри-Ланке|Шри-Ланки;KR|Южная Корея|в Южной Корее|Южной Кореи;JP|Япония|в Японии|Японии' },
    { key: 'latam', title: 'Латинская Америка', list:
      'AR|Аргентина|в Аргентине|Аргентины;BO|Боливия|в Боливии|Боливии;BR|Бразилия|в Бразилии|Бразилии;' +
      'VE|Венесуэла|в Венесуэле|Венесуэлы;GT|Гватемала|в Гватемале|Гватемалы;HN|Гондурас|в Гондурасе|Гондураса;' +
      'DO|Доминикана|в Доминикане|Доминиканы;CO|Колумбия|в Колумбии|Колумбии;CR|Коста-Рика|в Коста-Рике|Коста-Рики;' +
      'MX|Мексика|в Мексике|Мексики;NI|Никарагуа|в Никарагуа|Никарагуа;PA|Панама|в Панаме|Панамы;' +
      'PY|Парагвай|в Парагвае|Парагвая;PE|Перу|в Перу|Перу;SV|Сальвадор|в Сальвадоре|Сальвадора;' +
      'UY|Уругвай|в Уругвае|Уругвая;CL|Чили|в Чили|Чили;EC|Эквадор|в Эквадоре|Эквадора' },
    { key: 'nam', title: 'Северная Америка и Карибы', list:
      'BS|Багамы|на Багамах|Багам;GP|Гваделупа|на Гваделупе|Гваделупы;CA|Канада|в Канаде|Канады;' +
      'MQ|Мартиника|на Мартинике|Мартиники;US|США|в США|США;TT|Тринидад и Тобаго|в Тринидаде и Тобаго|Тринидада и Тобаго;' +
      'JM|Ямайка|на Ямайке|Ямайки' },
    { key: 'mea', title: 'Ближний Восток и Африка', list:
      'BH|Бахрейн|в Бахрейне|Бахрейна;EG|Египет|в Египте|Египта;IL|Израиль|в Израиле|Израиля;' +
      'JO|Иордания|в Иордании|Иордании;QA|Катар|в Катаре|Катара;KE|Кения|в Кении|Кении;KW|Кувейт|в Кувейте|Кувейта;' +
      'LB|Ливан|в Ливане|Ливана;MU|Маврикий|на Маврикии|Маврикия;MA|Марокко|в Марокко|Марокко;' +
      'NG|Нигерия|в Нигерии|Нигерии;AE|ОАЭ|в ОАЭ|ОАЭ;OM|Оман|в Омане|Омана;RE|Реюньон|на Реюньоне|Реюньона;' +
      'SA|Саудовская Аравия|в Саудовской Аравии|Саудовской Аравии;ZA|ЮАР|в ЮАР|ЮАР' }
  ];
  // Страны производства вне чарта (поле oc), иначе показывается код ISO.
  var EXTRA_NAMES =
    'CN|Китай;IR|Иран;IQ|Ирак;SY|Сирия;KH|Камбоджа;MM|Мьянма;NP|Непал;KZ|Казахстан;BY|Беларусь;GE|Грузия;' +
    'AM|Армения;AZ|Азербайджан;UZ|Узбекистан;CU|Куба;PR|Пуэрто-Рико;GH|Гана;SN|Сенегал;CM|Камерун;TN|Тунис;' +
    'DZ|Алжир;ET|Эфиопия;TZ|Танзания;UG|Уганда;ZW|Зимбабве;LI|Лихтенштейн;MC|Монако;BA|Босния и Герцеговина;' +
    'MK|Северная Македония;ME|Черногория;AL|Албания;MD|Молдова;XK|Косово;PS|Палестина;MN|Монголия;KP|КНДР;' +
    'MO|Макао;LA|Лаос;BT|Бутан;FJ|Фиджи;SU|СССР;XC|Чехословакия;YU|Югославия;DD|ГДР;CI|Кот-д’Ивуар;ML|Мали';
  var SHORT_NAMES = { KR: 'Корея', AE: 'ОАЭ', GB: 'Великобритания', US: 'США' };
  // Меню «Чарт» → «Часто» (§6.2) и ряд «Сейчас №1 по странам» (§5.2, ряд 4).
  var FREQUENT = ['KR', 'JP', 'US', 'GB', 'TR', 'IN', 'UA', 'DE', 'ES', 'BR', 'MX', 'RU'];
  var NOW_TILES = ['KR', 'JP', 'US', 'GB', 'TR', 'IN', 'ES', 'MX', 'BR', 'FR', 'DE', 'IT', 'PL', 'UA', 'TH', 'PH', 'TW', 'ID', 'AR', 'CO'];

  var COUNTRY = {};   // XX → {code, name, prep, gen, region}
  var EXTRA = {};
  function initCountries() {
    var r, parts, i, f, k;
    if (COUNTRY.KR) return;
    for (r = 0; r < REGIONS.length; r++) {
      parts = REGIONS[r].list.split(';');
      REGIONS[r].codes = [];
      for (i = 0; i < parts.length; i++) {
        f = parts[i].split('|');
        COUNTRY[f[0]] = { code: f[0], name: f[1], prep: f[2], gen: f[3], region: REGIONS[r].key };
        REGIONS[r].codes.push(f[0]);
      }
    }
    parts = EXTRA_NAMES.split(';');
    for (k = 0; k < parts.length; k++) { f = parts[k].split('|'); EXTRA[f[0]] = f[1]; }
  }
  function countryName(code) { return COUNTRY[code] ? COUNTRY[code].name : (EXTRA[code] || code || ''); }
  function countryShort(code) { return SHORT_NAMES[code] || countryName(code); }
  function countryPrep(code) { return COUNTRY[code] ? COUNTRY[code].prep : 'в ' + countryName(code); }
  function countryGen(code) { return COUNTRY[code] ? COUNTRY[code].gen : countryName(code); }

  // §4.2 — группы жанров: id TMDB (маска g по index.genres), ключевое слово (маска kw по index.kws).
  var GENRES = [
    { key: 'drama', title: 'Драма', ids: [18] },
    { key: 'comedy', title: 'Комедия', ids: [35] },
    { key: 'crime', title: 'Криминал', ids: [80] },
    { key: 'thriller', title: 'Триллер и детектив', short: 'Триллер', ids: [53, 9648] },
    { key: 'action', title: 'Боевик и приключения', short: 'Боевик', ids: [28, 12, 10759] },
    { key: 'scifi', title: 'Фантастика и фэнтези', short: 'Фантастика', ids: [878, 14, 10765] },
    { key: 'horror', title: 'Ужасы', ids: [27], note: 'только фильмы' },
    { key: 'romance', title: 'Мелодрама', ids: [10749], kw: 9840 },
    { key: 'anim', title: 'Мультфильмы', ids: [16] },
    { key: 'anime', title: 'Аниме', ids: [], kw: 210024, animeJa: true },
    { key: 'doc', title: 'Документальное', short: 'Документалка', ids: [99] },
    { key: 'reality', title: 'Реалити и шоу', short: 'Реалити', ids: [10764, 10767] },
    { key: 'family', title: 'Семейное и детское', short: 'Семейное', ids: [10751, 10762] },
    { key: 'history', title: 'История и война', short: 'История', ids: [36, 10752, 10768] },
    { key: 'soap', title: 'Мыльная опера', ids: [10766] },
    { key: 'music', title: 'Музыка', ids: [10402] },
    { key: 'western', title: 'Вестерн', ids: [37] }
  ];
  // Порядок групп для «Похожих в топе» (B5): Драма — только если других нет.
  var GENRE_PRIORITY = ['anime', 'horror', 'scifi', 'action', 'crime', 'thriller', 'romance', 'comedy', 'reality', 'doc', 'family', 'history', 'drama'];

  // §4.3 — группы «Откуда»: oc — первая страна производства, ol — язык оригинала.
  var ORIGINS = [
    { key: 'kr', title: 'Корея', oc: 'KR', ol: 'ko' },
    { key: 'jp', title: 'Япония', oc: 'JP', ol: 'ja' },
    { key: 'cn', title: 'Китай, Тайвань, Гонконг', short: 'Китай и др.', oc: 'CN TW HK', ol: 'zh cn' },
    { key: 'th', title: 'Таиланд', oc: 'TH', ol: 'th' },
    { key: 'in', title: 'Индия', oc: 'IN', ol: 'hi ta te ml kn bn mr pa' },
    { key: 'asia', title: 'Вся Азия', oc: 'KR JP CN TW HK TH IN ID PH VN MY SG', ol: 'ko ja zh cn th hi ta te ml kn bn mr pa id tl vi ms' },
    { key: 'tr', title: 'Турция', oc: 'TR', ol: 'tr' },
    { key: 'es', title: 'Испания', oc: 'ES' },
    { key: 'latam', title: 'Латинская Америка', short: 'Лат. Америка', oc: 'AR BO BR CL CO CR DO EC SV GT HN MX NI PA PY PE UY VE' },
    { key: 'les', title: 'Испанский язык', short: 'На испанском', ol: 'es' },
    { key: 'us', title: 'США', oc: 'US' },
    { key: 'gb', title: 'Великобритания', oc: 'GB' },
    { key: 'fr', title: 'Франция', oc: 'FR' },
    { key: 'de', title: 'Германия', oc: 'DE' },
    { key: 'it', title: 'Италия', oc: 'IT' },
    { key: 'pl', title: 'Польша', oc: 'PL' },
    { key: 'nordic', title: 'Скандинавия', oc: 'SE NO DK FI IS' }
  ];

  // §4.1 — тип: k по категории Netflix (0 фильм, 1 сериал), lg — язык списка, list — номер в cats.
  var TYPES = [
    { key: '', title: 'Фильмы и сериалы' },
    { key: 'f', title: 'Фильмы', k: 0 },
    { key: 's', title: 'Сериалы', k: 1 },
    { key: 'fe', title: 'Фильмы на английском', k: 0, lg: 0, list: 0 },
    { key: 'fn', title: 'Фильмы на других языках', k: 0, lg: 1, list: 1 },
    { key: 'se', title: 'Сериалы на английском', k: 1, lg: 0, list: 2 },
    { key: 'sn', title: 'Сериалы на других языках', k: 1, lg: 1, list: 3 }
  ];
  // Подписи четырёх списков Netflix (cats) в строке фокуса и на карточках.
  var LIST_GEN = ['фильмов на англ.', 'фильмов не на англ.', 'сериалов на англ.', 'сериалов не на англ.'];
  var LIST_SHORT = ['фильм, англ.', 'фильм, не англ.', 'сериал, англ.', 'сериал, не англ.'];
  // Бейдж позиции в сетке недели (§5.5, wkNNN): «Сериалы · не англ. №2»; тип подбора одного списка.
  var LIST_BADGE = ['Фильмы · англ.', 'Фильмы · не англ.', 'Сериалы · англ.', 'Сериалы · не англ.'];
  var LIST_KEYS = ['fe', 'fn', 'se', 'sn'];

  // §4.1 — год выхода.
  var RELEASES = [
    { key: '', title: 'Любой' },
    { key: '2025', title: '2025–2026', chip: 'вып. 2025–26', from: 2025, to: 9999 },
    { key: '2020', title: '2020–2024', chip: 'вып. 2020–24', from: 2020, to: 2024 },
    { key: '2010', title: '2010–2019', chip: 'вып. 2010-е', from: 2010, to: 2019 },
    { key: '2000', title: '2000–2009', chip: 'вып. 2000-е', from: 2000, to: 2009 },
    { key: 'old', title: 'До 2000', chip: 'вып. до 2000', from: 1, to: 1999 }
  ];

  // §4.5 — сортировки. by — хвост заголовка ряда «… · по популярности».
  var SORTS = [
    { key: 'pop', title: 'Популярность', by: 'по популярности' },
    { key: 'hours', title: 'Часы просмотра', by: 'по часам просмотра' },
    { key: 'views', title: 'Просмотры (с июня 2023)', by: 'по просмотрам' },
    { key: 'weeks', title: 'Недель в топе', by: 'по неделям в топе' },
    { key: 'top1', title: 'Недель на №1', by: 'по неделям на №1' },
    { key: 'streak', title: 'Дольше всех №1 подряд', by: 'по серии №1 подряд' },
    { key: 'best', title: 'Лучшее место', by: 'по лучшему месту' },
    { key: 'countries', title: 'Стран в топе', by: 'по числу стран' },
    { key: 'c1', title: '№1 в странах', by: 'по №1 в странах' },
    { key: 'new', title: 'Новые в топе', by: 'по новизне в топе' },
    { key: 'rating', title: 'Рейтинг TMDB', by: 'по рейтингу TMDB' },
    { key: 'ynew', title: 'Год выхода: новые', by: 'по году выхода' },
    { key: 'yold', title: 'Год выхода: старые', by: 'по году выхода, старые' }
  ];

  // §5.7 — списки Зала славы. Первые места восьми из них — плитки-рекорды главного экрана.
  var HALL = [
    { key: 'streak', title: 'Дольше всех №1 подряд' },
    { key: 'whours', title: 'Рекорд недели · часы' },
    { key: 'wviews', title: 'Рекорд недели · просмотры' },
    { key: 'runs', title: 'Долгожители чарта' },
    { key: 'c1', title: '№1 во многих странах' },
    { key: 'sleep', title: 'Медленный старт' },
    { key: 'comet', title: 'Кометы' },
    { key: 'franch', title: 'Франшизы, которые не отпускают' },
    { key: 'ever', title: 'Вечнозелёные' },
    { key: 'back', title: 'Вернулись через годы' },
    { key: 'jump', title: 'Взлёт за неделю' },
    { key: 'at', title: 'Официальный топ всех времён' }
  ];
  var HALL_HOME = ['streak', 'whours', 'wviews', 'runs', 'c1', 'sleep', 'franch', 'back'];

  // §5.2.1 — готовые подборки (строки nf). act — плитка открывает экран или сетку (list), а не подбор.
  var COLLECTIONS = [
    { title: 'Дорамы', nf: 't=s;o=kr' },
    { title: 'Что смотрит Корея', nf: 'c=KR' },
    { title: 'Аниме', nf: 'g=anime' },
    { title: 'Сериалы на испанском', nf: 't=s;o=les' },
    { title: 'Детям', nf: 'g=family,anim' },
    { title: 'Старое кино в топе', nf: 't=f;r=old' },
    { title: 'Россия до 2022', nf: 'c=RU' },
    { title: 'Рекорды №1', act: 'grid', list: 'hall:streak' },
    { title: 'История топа', act: 'weeks' },
    { title: 'Зал славы', act: 'hall' }
  ];
  var TILE_COLORS = ['#e50914,#6d0b2e', '#3a1c71,#d76d77', '#134e5e,#71b280', '#1f4037,#99f2c8', '#4b134f,#c94b4b',
    '#0f2027,#2c5364', '#c31432,#240b36', '#355c7d,#c06c84', '#232526,#66605a', '#42275a,#734b6d', '#141e30,#243b55'];

  var GENRE = {}, ORIGIN = {}, TYPE = {}, RELEASE = {}, SORT = {}, HALL_T = {};
  function initTables() {
    var i, o, j, a;
    initCountries();
    for (i = 0; i < GENRES.length; i++) GENRE[GENRES[i].key] = GENRES[i];
    for (i = 0; i < ORIGINS.length; i++) {
      o = ORIGINS[i]; o.ocSet = {}; o.olSet = {};
      a = (o.oc || '').split(' '); for (j = 0; j < a.length; j++) if (a[j]) o.ocSet[a[j]] = 1;
      a = (o.ol || '').split(' '); for (j = 0; j < a.length; j++) if (a[j]) o.olSet[a[j]] = 1;
      ORIGIN[o.key] = o;
    }
    for (i = 0; i < TYPES.length; i++) TYPE[TYPES[i].key] = TYPES[i];
    for (i = 0; i < RELEASES.length; i++) RELEASE[RELEASES[i].key] = RELEASES[i];
    for (i = 0; i < SORTS.length; i++) SORT[SORTS[i].key] = SORTS[i];
    for (i = 0; i < HALL.length; i++) HALL_T[HALL[i].key] = HALL[i];
  }

  // ======================= Формат =======================
  var MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MON_SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
  var MON_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MON_EN = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  var DAY = 86400000;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function comma(s) { return String(s).replace('.', ','); }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b > 1 && b < 5) return few;
    return many;
  }
  // «3 581» — неразрывный пробел между тысячами.
  function fmtInt(n) {
    var s = String(Math.round(n || 0)), out = '', i;
    for (i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) out += ' '; out += s.charAt(i); }
    return out;
  }
  // §14.2: значения в единицах unit (10 000). Не Utils.bigNumberToShort: тот врёт на миллиардах.
  function fmtUnits(u) {
    var n = (u || 0) * unit();
    if (n >= 1e9) return comma((n / 1e9).toFixed(2)) + ' млрд';
    if (n >= 1e6) return comma((n / 1e6).toFixed(1)) + ' млн';
    if (n >= 1e3) return Math.round(n / 1e3) + ' тыс.';
    return String(n);
  }
  function hoursLabel(u) { return fmtUnits(u) + ' ч'; }
  function viewsLabel(u) { return fmtUnits(u) + ' просм.'; }

  // Недели: W = (воскресенье − w0) / 7, неделя идёт с понедельника по воскресенье (§3.1, §14.2).
  function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
  function w0() { var t = parseDay(D.man && D.man.w0); return isNaN(t) ? Date.UTC(2021, 6, 4) : t; }
  function weekSun(W) { return new Date(w0() + W * 7 * DAY); }
  function weekYear(W) { return weekSun(W).getUTCFullYear(); }
  // «2–8 ноября 2026» · «26 окт. – 1 нояб. 2026» · «29 дек. 2025 – 4 янв. 2026»; short — «3–9 нояб. 2025».
  function weekLabel(W, opt) {
    var sun = weekSun(W), mon = new Date(sun.getTime() - 6 * DAY);
    var d1 = mon.getUTCDate(), m1 = mon.getUTCMonth(), y1 = mon.getUTCFullYear();
    var d2 = sun.getUTCDate(), m2 = sun.getUTCMonth(), y2 = sun.getUTCFullYear();
    var tail = opt && opt.noYear ? '' : ' ' + y2;
    if (m1 === m2) return d1 + '–' + d2 + ' ' + (opt && opt.short ? MON_SHORT : MON_GEN)[m2] + tail;
    if (y1 === y2) return d1 + ' ' + MON_SHORT[m1] + ' – ' + d2 + ' ' + MON_SHORT[m2] + tail;
    return d1 + ' ' + MON_SHORT[m1] + ' ' + y1 + ' – ' + d2 + ' ' + MON_SHORT[m2] + ' ' + y2;
  }
  function monthYear(W) { var d = weekSun(W); return MON_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function dayLabel(str, noYear) {
    var t = parseDay(str), d;
    if (isNaN(t)) return str || '';
    d = new Date(t);
    return d.getUTCDate() + ' ' + MON_GEN[d.getUTCMonth()] + (noYear ? '' : ' ' + d.getUTCFullYear());
  }
  function weekDots(W) { var d = weekSun(W); return pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear(); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  // «November 2, 2026» → {day, mon}.
  function parseEnDate(s) {
    var m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(s || ''), mon;
    if (!m) return null;
    mon = MON_EN[m[1].toLowerCase()];
    return mon === undefined ? null : { day: +m[2], mon: mon, year: +m[3] };
  }

  // Подпись сезона на карточке (§7, .card__type): «С2», «Ч. 4», «Мини», «Т. 2», «2 нояб.» у WWE.
  function seasonShort(label) {
    var s = label || '', m, d;
    if (!s) return '';
    if ((m = /^(?:Season|Series|Temporada|S)\s?(\d+)(?:\s*:?\s*Part\s*(\d+))?/i.exec(s))) return 'С' + m[1] + (m[2] ? ' Ч.' + m[2] : '');
    if ((m = /^(\d+)(?:st|nd|rd|th) Season/i.exec(s))) return 'С' + m[1];
    if ((m = /^Part (\d+)/i.exec(s))) return 'Ч. ' + m[1];
    if (/^Limited Series/i.test(s)) return 'Мини';
    if ((m = /^Volume (\d+)/i.exec(s))) return 'Т. ' + m[1];
    if ((m = /^Chapter (\d+)/i.exec(s))) return 'Гл. ' + m[1];
    if ((m = /^Book (\d+)/i.exec(s))) return 'Кн. ' + m[1];
    if ((d = parseEnDate(s))) return d.day + ' ' + MON_SHORT[d.mon];
    if (/^\d{1,2}$/.test(s)) return 'С' + s;
    return s.length > 10 ? s.slice(0, 10) : s;
  }
  // То же полностью — для строки фокуса: «Сезон 2», «Часть 4», «Мини-сериал».
  function seasonLong(label) {
    var s = label || '', m, d;
    if (!s) return '';
    if ((m = /^(?:Season|Series|Temporada|S)\s?(\d+)(?:\s*:?\s*Part\s*(\d+))?/i.exec(s))) return 'Сезон ' + m[1] + (m[2] ? ', часть ' + m[2] : '');
    if ((m = /^(\d+)(?:st|nd|rd|th) Season/i.exec(s))) return 'Сезон ' + m[1];
    if ((m = /^Part (\d+)/i.exec(s))) return 'Часть ' + m[1];
    if (/^Limited Series/i.test(s)) return 'Мини-сериал';
    if ((m = /^Volume (\d+)/i.exec(s))) return 'Том ' + m[1];
    if ((d = parseEnDate(s))) return d.day + ' ' + MON_GEN[d.mon] + ' ' + d.year;
    if (/^\d{1,2}$/.test(s)) return 'Сезон ' + s;
    return s;
  }

  function noty(text) { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text); }
  function storageGet(name, def) { try { return Lampa.Storage.get(name, def); } catch (e) { return def; } }
  function storageSet(name, value) { try { Lampa.Storage.set(name, value); } catch (e) {} }
  function activeObj() { try { return Lampa.Activity.active(); } catch (e) { return null; } }
  function log() { try { console.log.apply(console, ['Netflix'].concat(Array.prototype.slice.call(arguments))); } catch (e) {} }

  // ======================= Данные =======================
  // Всё в памяти модуля, не в объектах активности (§10.2). Общие файлы грузит один Reguest модуля:
  // экран, закрытый посреди загрузки, не должен оборвать её другим экранам.
  var D = {
    net: null, man: null, manAt: 0, offline: false,
    files: {},    // 'home' | 'index' | 'global' | 'country/XX' → true, когда разобран
    wait: {},     // файл → колбэки, ждущие загрузки
    err: {},      // файл → {code, at}
    fm: null,     // имя поля → номер колонки в строке тайтла
    T: {},        // n → тайтл (объект с полями §3.3 и n)
    home: null, index: null, global: null, cty: {},
    agg: {}, hall: null, yearW: null, now: null,
    sids: null,   // n → номера сезонов (из index.so), для досье
    byTmdb: null, // 'tv:93405' → n, для страницы карточки Lampa
    subs: []      // слушатели «данные пришли» (экраны обновляют фишки)
  };

  function base() {
    var b = String(storageGet('netflix_base', '') || DATA_BASE);
    return b.charAt(b.length - 1) === '/' ? b : b + '/';
  }
  function network() { if (!D.net) D.net = new Lampa.Reguest(); return D.net; }
  function errCode(xhr) { return (xhr && (xhr.status || xhr.decode_code)) || -1; }
  // « (код 404)» или « (нет ответа)» — для сообщений об ошибке.
  function codeNote(code) { return typeof code === 'number' && code > 0 ? ' (код ' + code + ')' : code === 'parse' ? ' (файл повреждён)' : ' (нет ответа)'; }
  function nw() { return (D.man && D.man.nw) || 0; }
  function lastW() { return nw() - 1; }
  function vf() { return (D.man && D.man.vf) || 102; }
  function unit() { return (D.global && D.global.unit) || (D.home && D.home.unit) || 10000; }
  function years() { return (D.man && D.man.years) || []; }

  // Сбросить всё загруженное (новая сборка данных).
  function resetData() {
    D.files = {}; D.err = {}; D.T = {}; D.fm = null;
    D.home = null; D.index = null; D.global = null; D.cty = {};
    D.agg = {}; D.hall = null; D.yearW = null; D.now = null; D.sids = null; D.byTmdb = null;
  }

  // Манифест: ?t=<мс> без кэша; при ошибке — последний удачный из netflix_ver (работа без сети, §9).
  function loadManifest(done) {
    network().silent(base() + 'manifest.json?t=' + Date.now(), function (json) {
      if (!json || typeof json !== 'object') { fallback(500); return; }
      setManifest(json, false);
      if (json.schema === SCHEMA) storageSet('netflix_ver', json);
      done(0);
    }, function (xhr) { fallback(errCode(xhr)); }, false, { timeout: T_MANIFEST });
    function fallback(code) {
      var saved = storageGet('netflix_ver', '');
      if (saved && typeof saved === 'object' && saved.files) { setManifest(saved, true); done(0); }
      else done(code);
    }
  }
  function setManifest(json, offline) {
    if (D.man && D.man.b !== json.b) resetData();
    D.man = json; D.manAt = Date.now(); D.offline = offline;
    if (offline) D.offlineNoted = false;
  }

  // Манифест + home: всё, что нужно первому показу. done(err): 0, код HTTP или 'schema'.
  function boot(done) {
    if (D.man && Date.now() - D.manAt < MANIFEST_TTL) { afterManifest(); return; }
    loadManifest(function (code) {
      if (code) { done(code); return; }
      afterManifest();
    });
    function afterManifest() {
      if (D.man.schema !== SCHEMA) { done('schema'); return; }
      load('home', function (err) {
        if (err) { done(err); return; }
        fillStubs(D.homeStubs || [], STUB_WAIT, function () { done(0); });
      });
    }
  }

  // Один файл с ?v=<хеш> и кэшем на 30 дней. cb(err) после разбора.
  function load(file, cb) {
    var e = D.err[file], hash, b0;
    if (D.files[file]) { cb(0); return; }
    if (D.wait[file]) { D.wait[file].push(cb); return; }
    if (e && Date.now() - e.at < RETRY_AFTER) { cb(e.code); return; }
    if (!D.man) { cb(-1); return; }
    D.wait[file] = [cb];
    b0 = D.man.b;
    hash = (D.man.files && D.man.files[file + '.json']) || b0 || '0';
    network().silent(base() + file + '.json?v=' + hash, function (json) {
      var err = 0, list;
      // Пока файл шёл, пришёл манифест новой сборки: этот файл уже чужой — грузим заново.
      if (D.man && D.man.b !== b0) {
        list = D.wait[file] || []; delete D.wait[file];
        load(file, function (e2) { var i; for (i = 0; i < list.length; i++) list[i](e2); });
        return;
      }
      if (!json || typeof json !== 'object') err = 500;
      else if (json.schema !== SCHEMA) err = 'schema';
      else {
        try { parseFile(file, json); } catch (ex) { log('parse', file, ex && ex.message); err = 'parse'; }
      }
      finish(err);
    }, function (xhr) { finish(errCode(xhr)); }, false, { timeout: T_FILE, cache: { life: CACHE_LIFE } });
    function finish(err) {
      var list = D.wait[file] || [], i;
      delete D.wait[file];
      if (err) D.err[file] = { code: err, at: Date.now() }; else delete D.err[file];
      for (i = 0; i < list.length; i++) list[i](err);
      if (!err) emitData(file);
    }
  }
  // Несколько файлов сразу. done(первая ошибка или 0).
  function need(files, done) {
    var left = files.length, first = 0, i;
    if (!left) { done(0); return; }
    function one(err) { if (err && !first) first = err; left--; if (!left) done(first); }
    for (i = 0; i < files.length; i++) load(files[i], one);
  }
  // То же с пределом ожидания (408 — не дождались).
  function waitFor(files, ms, ok, fail) {
    var over = false, timer = setTimeout(function () { if (over) return; over = true; fail(408); }, ms);
    need(files, function (err) {
      if (over) return;
      over = true; clearTimeout(timer);
      if (err) fail(err); else ok();
    });
  }
  function loaded(files) { var i; for (i = 0; i < files.length; i++) if (!D.files[files[i]]) return false; return true; }
  // После первого показа — тихо индекс и все недели мира (§5.2, §10.1).
  function loadBackground() { need(['index', 'global'], function () {}); }

  function onData(fn) {
    D.subs.push(fn);
    return function () { var i = D.subs.indexOf(fn); if (i >= 0) D.subs.splice(i, 1); };
  }
  function emitData(file) { var list = D.subs.slice(), i; for (i = 0; i < list.length; i++) { try { list[i](file); } catch (e) { log('sub', e && e.message); } } }

  function parseFile(file, json) {
    if (file === 'home') parseHome(json);
    else if (file === 'index') parseIndex(json);
    else if (file === 'global') parseGlobal(json);
    else if (file.indexOf('country/') === 0) parseCountry(file.slice(8), json);
    D.agg = {}; D.hall = null; D.now = null;
    D.files[file] = true;
  }
  function fieldMap(fields) { var m = {}, i; for (i = 0; i < (fields || []).length; i++) m[fields[i]] = i; return m; }
  // Строка тайтла → объект по именам полей (§3.3: B читает поля по имени).
  function addTitle(n, row) {
    var t = { n: n }, k, fm = D.fm;
    if (!row || !fm) return null;
    for (k in fm) if (fm.hasOwnProperty(k)) t[k] = row[fm[k]];
    if (D.T[n] && D.T[n].inIdx) t.inIdx = true;
    applyStub(t);
    D.T[n] = t;
    return t;
  }

  function parseHome(j) {
    var n, t;
    D.fm = fieldMap(j.fields);
    D.homeStubs = [];
    for (n in j.cards) if (j.cards.hasOwnProperty(n)) { t = addTitle(+n, j.cards[n]); if (t && !t.id) D.homeStubs.push(t); }
    D.home = { v: j.v, w: j.w, unit: j.unit, weeks: j.weeks || {}, c: j.c || {}, alltime: j.alltime || [], local: j.local || [], ss: j.ss || {} };
  }

  function parseIndex(j) {
    var t = j.t || [], list = [], n, i, g, x, gm = {}, km = {};
    if (j.fields) D.fm = fieldMap(j.fields);
    D.sids = null; D.byTmdb = null;
    for (n = 0; n < t.length; n++) if (t[n]) { x = addTitle(n, t[n]); x.inIdx = true; list.push(n); }
    D.index = { list: list, so: j.so || [], s: j.s || [], genres: j.genres || [], kws: j.kws || [] };
    // Маски групп §4.2: бит i маски g — index.genres[i], бит i маски kw — index.kws[i].
    for (i = 0; i < D.index.genres.length; i++) gm[D.index.genres[i]] = 1 << i;
    for (i = 0; i < D.index.kws.length; i++) km[D.index.kws[i]] = 1 << i;
    for (i = 0; i < GENRES.length; i++) {
      x = GENRES[i]; x.mask = 0;
      for (g = 0; g < x.ids.length; g++) x.mask |= gm[x.ids[g]] || 0;
      x.kwBit = x.kw ? (km[x.kw] || 0) : 0;
    }
    D.animMask = gm[16] || 0;
  }

  // global.w[W][cat][место−1] = [sid, h, v, cw]; bySid — все позиции сезона по порядку недель.
  function parseGlobal(j) {
    var w = j.w || [], bySid = {}, W, c, p, e, list;
    for (W = 0; W < w.length; W++) {
      for (c = 0; c < 4; c++) {
        list = (w[W] && w[W][c]) || [];
        for (p = 0; p < list.length; p++) {
          e = list[p];
          if (e) (bySid[e[0]] || (bySid[e[0]] = [])).push({ W: W, cat: c, pl: p + 1, h: e[1] || 0, v: e[2] || 0, cw: e[3] || 0 });
        }
      }
    }
    D.global = { w: w, unit: j.unit, bySid: bySid };
  }

  // country/XX: f[i], t[i] — фильмы и сериалы недели w1 + i; cards — тайтлы страны вне индекса.
  function parseCountry(code, j) {
    var C = { c: code, w1: j.w1 || 0, f: j.f || [], t: j.t || [], local: [], idx: null }, n;
    for (n in j.cards) if (j.cards.hasOwnProperty(n)) { if (addTitle(+n, j.cards[n])) C.local.push(+n); }
    D.cty[code] = C;
  }

  // Владелец и подпись сезона: из индекса, а до него — из home.ss.
  function owner(sid) {
    var n, ss;
    if (D.index && D.index.so.length > sid) { n = D.index.so[sid]; return n >= 0 ? n : null; }
    ss = D.home && D.home.ss[sid];
    return ss ? ss[0] : null;
  }
  function slabel(sid) {
    var ss;
    if (sid == null) return '';
    if (D.index && D.index.s.length > sid) return D.index.s[sid] || '';
    ss = D.home && D.home.ss[sid];
    return ss ? ss[1] || '' : '';
  }
  function titleName(T) { return T ? (T.ru || T.t || '') : ''; }
  function isTv(T) { return T.mt === 1 || ((T.mt === null || T.mt === undefined) && T.k === 1); }

  // §3.3: карточка Lampa из тайтла. Новый объект на каждую позицию: старый ряд второй раз не рисует.
  function makeCard(T, sid, extra) {
    var c = { id: T.id, source: 'tmdb', poster_path: T.p || '', vote_average: T.va ? T.va / 10 : 0 }, k;
    if (isTv(T)) { c.name = T.ru || T.t; c.original_name = T.t; c.first_air_date = T.yr ? String(T.yr) : ''; }
    else { c.title = T.ru || T.t; c.original_title = T.t; c.release_date = T.yr ? String(T.yr) : ''; }
    c.nf = { n: T.n, sid: sid == null ? null : sid };
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) c.nf[k] = extra[k];
    return c;
  }

  // ======================= Заглушки недели: TMDB через сам Lampa =======================
  // Еженедельная сборка на GitHub идёт без ключа TMDB, поэтому новые тайтлы недели приходят заглушками
  // (id null). Плагин находит их сам через встроенный в Lampa TMDB (TMDB.api + TMDB.key, как dorama.js)
  // и помнит находку в Storage: при следующем открытии карточка сразу с постером и русским названием.
  // Ищем только то, что на экране: карточки home и две последние недели открытой страны. Промах
  // повторяется не чаще раза в неделю.
  var STUB_KEY = 'netflix_stub_tmdb', STUB_MAX = 400, STUB_WAIT = 3000, STUB_RETRY = 7 * 24 * 3600 * 1000, STUB_PAR = 3;
  var STUB = { cache: null, busy: {}, net: null };
  function stubKey(T) { return (isTv(T) ? 'tv:' : 'movie:') + String(T.t || '').toLowerCase(); }
  function stubCache() {
    if (!STUB.cache) { STUB.cache = storageGet(STUB_KEY, {}); if (!STUB.cache || typeof STUB.cache !== 'object') STUB.cache = {}; }
    return STUB.cache;
  }
  function genreMask(ids) {
    var table = (D.index && D.index.genres) || [], m = 0, i, x;
    for (i = 0; i < (ids || []).length; i++) { x = table.indexOf(ids[i]); if (x >= 0) m |= 1 << x; }
    return m;
  }
  function applyStub(T) {
    var e;
    if (!T || T.id || !T.t) return;
    e = stubCache()[stubKey(T)];
    if (!e || !e.id) return;
    T.id = e.id; T.mt = e.mt;
    if (e.ru) T.ru = e.ru;
    if (e.p) T.p = e.p;
    if (e.yr) T.yr = e.yr;
    if (e.va) T.va = e.va;
    if (e.oc) T.oc = e.oc;
    if (e.ol) T.ol = e.ol;
    if (e.g && !T.g) T.g = genreMask(e.g);
  }
  // Год, когда тайтл впервые попал в топ: мир (gf), иначе первый год с очками (py).
  function stubYear(T) {
    var ys = years(), i;
    if (typeof T.gf === 'number' && T.gf >= 0) return weekYear(T.gf);
    for (i = 0; i < (T.py || []).length; i++) if (T.py[i]) return ys[i] || 0;
    return 0;
  }
  function normTitle(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-ɏЀ-ӿ]+/g, ''); }
  // Поиск en-US по английскому названию: только точное совпадение имени, вышедшее не позже года попадания
  // в топ, ближайшее к нему; затем детали ru-RU — русское название, постер, жанры, страна.
  function stubFind(T, done) {
    var tv = isTv(T), want = normTitle(T.t), y = stubYear(T), key = '&api_key=' + Lampa.TMDB.key();
    function year(r) { return parseInt(String((tv ? r.first_air_date : r.release_date) || '').slice(0, 4), 10) || 0; }
    STUB.net.silent(Lampa.TMDB.api('search/' + (tv ? 'tv' : 'movie') + '?query=' + encodeURIComponent(T.t) + '&language=en-US' + key), function (json) {
      var list = (json && json.results) || [], best = null, i, r, ry, d;
      for (i = 0; i < list.length; i++) {
        r = list[i];
        if (normTitle(tv ? r.name : r.title) !== want && normTitle(tv ? r.original_name : r.original_title) !== want) continue;
        ry = year(r);
        if (y && ry && ry > y) continue;
        d = y && ry ? y - ry : 99;
        if (!best || d < best.d) best = { r: r, d: d };
      }
      if (!best) { done(null); return; }
      STUB.net.silent(Lampa.TMDB.api((tv ? 'tv/' : 'movie/') + best.r.id + '?language=ru-RU' + key), function (det) {
        done(stubEntry(best.r, det, tv, year(best.r)));
      }, function () { done(stubEntry(best.r, null, tv, year(best.r))); }, false, { timeout: 8000 });
    }, function () { done(false); }, false, { timeout: 8000 });
  }
  function stubEntry(r, det, tv, yr) {
    var e = { id: r.id, mt: tv ? 1 : 0, p: (det && det.poster_path) || r.poster_path || '', yr: yr,
      va: Math.round((r.vote_average || 0) * 10), ol: r.original_language || '', g: r.genre_ids || [] }, ru = det && (tv ? det.name : det.title), i;
    if (ru && /[а-яё]/i.test(ru)) e.ru = ru;
    if (det && det.genres) { e.g = []; for (i = 0; i < det.genres.length; i++) e.g.push(det.genres[i].id); }
    if (tv && r.origin_country && r.origin_country.length) e.oc = r.origin_country[0];
    else if (det && det.production_countries && det.production_countries.length) e.oc = det.production_countries[0].iso_3166_1;
    return e;
  }
  // Запомнить находку (или промах) и поджать кэш до STUB_MAX — выбрасываются самые старые.
  function stubSave(k, e) {
    var cache = stubCache(), keys = [], i;
    cache[k] = e || { at: Date.now() };
    if (e) cache[k].at = Date.now();
    for (i in cache) if (cache.hasOwnProperty(i)) keys.push(i);
    if (keys.length > STUB_MAX) {
      keys.sort(function (a, b) { return (cache[a].at || 0) - (cache[b].at || 0); });
      for (i = 0; i < keys.length - STUB_MAX; i++) delete cache[keys[i]];
    }
    storageSet(STUB_KEY, cache);
  }
  // Найти заглушки из списка по STUB_PAR разом. done() — когда нашлось всё или прошло wait мс; остальное
  // дорабатывает тихо и попадёт на экран при следующем открытии.
  function fillStubs(list, wait, done) {
    var todo = [], cache = stubCache(), now = Date.now(), pos = 0, running = 0, over = false, timer, i, T, k, e;
    function finish() { if (over) return; over = true; clearTimeout(timer); if (done) done(); }
    if (!Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) { finish(); return; }
    for (i = 0; i < list.length; i++) {
      T = list[i];
      if (!T || T.id || !T.t) continue;
      k = stubKey(T); e = cache[k];
      if (STUB.busy[k] || (e && (e.id || now - (e.at || 0) < STUB_RETRY))) continue;
      STUB.busy[k] = true; todo.push(T);
    }
    if (!todo.length) { finish(); return; }
    if (!STUB.net) STUB.net = new Lampa.Reguest();
    timer = setTimeout(finish, wait);
    function next() {
      var T1, k1;
      if (pos >= todo.length) { if (!running) finish(); return; }
      T1 = todo[pos++]; k1 = stubKey(T1); running++;
      stubFind(T1, function (found) {
        running--;
        delete STUB.busy[k1];
        if (found !== false) stubSave(k1, found);
        applyStub(T1);
        applyStub(D.T[T1.n]);
        next();
      });
    }
    for (i = 0; i < STUB_PAR; i++) next();
  }
  // Заглушки двух последних недель открытых стран (files вида 'country/XX').
  function countryStubs(files) {
    var out = [], i, j, p, C, lists, n, T;
    for (i = 0; i < files.length; i++) {
      if (files[i].indexOf('country/') !== 0 || !(C = D.cty[files[i].slice(8)])) continue;
      lists = [C.f[C.f.length - 1], C.f[C.f.length - 2], C.t[C.t.length - 1], C.t[C.t.length - 2]];
      for (j = 0; j < lists.length; j++) {
        for (p = 0; p < (lists[j] || []).length; p++) {
          n = owner(lists[j][p]); T = n == null ? null : D.T[n];
          if (T && !T.id && out.indexOf(T) < 0) out.push(T);
        }
      }
    }
    return out;
  }

  // Сейчас (последняя неделя, home.c): в скольких странах тайтл №1 и в топе.
  function nowCountries(n) {
    var map = D.now, cc, list, k, kind, p, o, x, seen;
    if (!map) {
      map = D.now = {};
      cc = (D.home && D.home.c) || {};
      for (k in cc) {
        if (!cc.hasOwnProperty(k)) continue;
        seen = {};
        for (kind = 0; kind < 2; kind++) {
          list = (cc[k] && cc[k][kind]) || [];
          for (p = 0; p < list.length; p++) {
            o = owner(list[p]);
            if (o == null) continue;
            x = map[o] || (map[o] = { top: 0, one: 0 });
            if (!seen[o]) { seen[o] = true; x.top++; }
            if (p === 0) x.one++;
          }
        }
      }
    }
    return map[n] || { top: 0, one: 0 };
  }

  // Годы и недели: год недели — год её воскресенья (§3.1).
  function yearRange(Y) {
    var W, y, out;
    if (!D.yearW) {
      out = {};
      for (W = 0; W < nw(); W++) { y = weekYear(W); if (!out[y]) out[y] = [W, W]; else out[y][1] = W; }
      D.yearW = out;
    }
    return D.yearW[Y] || null;
  }
  function yearIdx(Y) { return years().indexOf(Y); }
  // Недели данных чарта: мир — 0…nw−1, страна — manifest.cc[XX].
  function chartRange(c) {
    var r;
    if (!c) return nw() ? [0, lastW()] : null;
    r = D.man && D.man.cc && D.man.cc[c];
    return r ? [r[0], r[1]] : null;
  }
  function yearInChart(Y, c) {
    var yr = yearRange(Y), r = chartRange(c), a, b;
    if (!yr || !r) return null;
    a = Math.max(yr[0], r[0]); b = Math.min(yr[1], r[1]);
    return a <= b ? [a, b] : null;
  }
  // Неделя p (w, wNNN, yYYYY) в пределах чарта → [from, to] или null.
  function periodRange(c, p) {
    var r = chartRange(c), m, W;
    if (!r) return null;
    if (!p) return r;
    if (p === 'w') return [r[1], r[1]];
    if ((m = /^w(\d+)$/.exec(p))) { W = +m[1]; return W >= r[0] && W <= r[1] ? [W, W] : null; }
    if ((m = /^y(\d{4})$/.exec(p))) return yearInChart(+m[1], c);
    return null;
  }
  function periodWeek(c, p) { var r = /^w/.test(p || '') ? periodRange(c, p) : null; return r ? r[0] : -1; }

  // ======================= Чарты =======================
  function weekData(W) {
    if (D.global && D.global.w[W]) return D.global.w[W];
    return (D.home && D.home.weeks[String(W)]) || null;
  }
  function hasWeek(W) { return W >= 0 && !!weekData(W); }
  function metricRaw(e, W) { return W >= vf() ? (e[2] || 0) : (e[1] || 0); }

  // Позиции недели W в списках cats; два списка сливаются по метрике места (§3.1, §1.2).
  function mergedWeek(W, cats) {
    var wd = weekData(W), out = [], i, p, e, list;
    if (!wd) return out;
    for (i = 0; i < cats.length; i++) {
      list = wd[cats[i]] || [];
      for (p = 0; p < list.length; p++) {
        e = list[p];
        if (e) out.push({ sid: e[0], h: e[1] || 0, v: e[2] || 0, cw: e[3] || 0, cat: cats[i], pl: p + 1, m: metricRaw(e, W), W: W });
      }
    }
    if (cats.length > 1) out.sort(function (a, b) { return (b.m - a.m) || (b.h - a.h) || (a.pl - b.pl) || (a.cat - b.cat); });
    for (i = 0; i < out.length; i++) out[i].rank = i + 1;
    return out;
  }
  // Ключ движения: прямые эфиры (WWE) сравниваются по шоу, остальные — по сезону.
  function moveKey(sid) { var n = owner(sid), T = D.T[n]; return T && T.lv === 1 ? 'n' + n : 's' + sid; }
  function rankMap(list) {
    var m = {}, i, k;
    for (i = 0; i < list.length; i++) { k = moveKey(list[i].sid); if (!m[k]) m[k] = list[i].rank; }
    return m;
  }
  // ▲▼ на разницу мест; не был на прошлой неделе — НОВОЕ или ВОЗВРАТ; на первой неделе данных — ничего.
  function moveOf(prev, key, rank, isNew) {
    var k;
    if (!prev) return '';
    k = prev[key];
    if (k) return k > rank ? 'u' + (k - rank) : k < rank ? 'd' + (rank - k) : '';
    return isNew ? 'new' : 'back';
  }
  // Какие списки Netflix идут в ряд kind (0 фильмы, 1 сериалы) при типе подбора.
  function chartCats(kind, o) {
    var tp = o && o.t ? TYPE[o.t] : null;
    if (tp && tp.list !== undefined) return tp.k === kind ? [tp.list] : [];
    if (tp && tp.k !== undefined && tp.k !== kind) return [];
    return kind ? [2, 3] : [0, 1];
  }
  // §7: «★ №1 · 2-я нед. · 17,2 млн просм.»; до 18.06.2023 — часы.
  function chartAge(e) {
    var s = (e.pl === 1 ? '★ №1 · ' : '') + e.cw + '-я нед.';
    var val = e.W >= vf() && e.v ? viewsLabel(e.v) : (e.h ? hoursLabel(e.h) : '');
    return val ? s + ' · ' + val : s;
  }
  // Мировой топ-10 недели W (§5.2, ряды 1–2). С подбором o позиции фильтруются, номера остаются.
  function worldTop(W, kind, o) {
    var cats = chartCats(kind, o), list, prev, out = [], i, e, T;
    if (!cats.length) return out;
    list = mergedWeek(W, cats);
    prev = hasWeek(W - 1) ? rankMap(mergedWeek(W - 1, cats)) : null;
    for (i = 0; i < list.length && i < 10; i++) {
      e = list[i]; T = D.T[owner(e.sid)];
      if (!T || (o && !passFacets(T, o, '', true))) continue;
      out.push(makeCard(T, e.sid, { rank: e.rank, mv: moveOf(prev, moveKey(e.sid), e.rank, e.cw === 1),
        wk: W, cat: e.cat, pl: e.pl, cw: e.cw, h: e.h, v: e.v, tp: seasonShort(slabel(e.sid)), age: chartAge(e) }));
    }
    return out;
  }
  // Новинки недели (§5.2, ряд 3): все позиции W с cw = 1, по метрике. У прямых эфиров (WWE) каждый эфир —
  // свой сезон с cw = 1: шоу, которое было в чарте раньше W, — не новинка.
  function worldNew(W, o) {
    var list = mergedWeek(W, [0, 1, 2, 3]), out = [], i, e, T;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.cw !== 1) continue;
      T = D.T[owner(e.sid)];
      if (!T || (o && !passFacets(T, o, '', true))) continue;
      if (T.lv === 1 && typeof T.gf === 'number' && T.gf >= 0 && T.gf < W) continue;
      out.push(makeCard(T, e.sid, { meta: '№' + e.pl, wk: W, cat: e.cat, pl: e.pl, cw: e.cw, h: e.h, v: e.v,
        tp: seasonShort(slabel(e.sid)), age: LIST_SHORT[e.cat] + ' · ' + (e.W >= vf() && e.v ? viewsLabel(e.v) : hoursLabel(e.h)) }));
    }
    return out;
  }
  // №1 недели: позиция с наибольшей метрикой среди четырёх №1 (для подписей недель).
  function weekLeader(W, c) {
    var C, list, e, T;
    if (c) {
      C = D.cty[c];
      list = C ? countryList(C, W, 1) : [];
      T = list.length ? D.T[owner(list[0])] : null;
      return T ? titleName(T) : '';
    }
    list = mergedWeek(W, [0, 1, 2, 3]);
    e = list[0]; T = e ? D.T[owner(e.sid)] : null;
    return T ? titleName(T) : '';
  }
  // №1 слитого топа недели W: сериал (kind 1) или фильм (0).
  function worldNumberOne(W, kind) { var list = mergedWeek(W, kind ? [2, 3] : [0, 1]); return list[0] || null; }

  // Страна: позиции по неделям w1 + i, f — фильмы, t — сериалы.
  function countryList(C, W, kind) { var i = W - C.w1; return ((kind ? C.t : C.f)[i]) || []; }
  // Недели каждого ключа движения в стране (по возрастанию) — для НОВОЕ и «3-я нед.».
  function countryIdx(C) {
    var idx = C.idx, i, kind, p, list, key, a;
    if (idx) return idx;
    idx = C.idx = { weeks: {} };
    for (i = 0; i < C.f.length || i < C.t.length; i++) {
      for (kind = 0; kind < 2; kind++) {
        list = (kind ? C.t[i] : C.f[i]) || [];
        for (p = 0; p < list.length; p++) {
          key = moveKey(list[p]);
          a = idx.weeks[key] || (idx.weeks[key] = []);
          if (a[a.length - 1] !== i) a.push(i);
        }
      }
    }
    return idx;
  }
  function weeksUpTo(a, i) { var c = 0, j; for (j = 0; j < a.length && a[j] <= i; j++) c++; return c; }
  function worldRanks(W, kind) { return hasWeek(W) ? rankMap(mergedWeek(W, kind ? [2, 3] : [0, 1]).slice(0, 10)) : {}; }
  // Топ-10 страны (§5.3): движение против прошлой недели страны, НОВОЕ — первое появление в ней.
  function countryTop(C, W, kind, o) {
    var i = W - C.w1, list = countryList(C, W, kind), prev = null, idx = countryIdx(C), wr = worldRanks(W, kind), out = [], p, sid, T, key, a;
    if (i > 0) {
      prev = {};
      a = countryList(C, W - 1, kind);
      for (p = 0; p < a.length; p++) { key = moveKey(a[p]); if (!prev[key]) prev[key] = p + 1; }
    }
    for (p = 0; p < list.length; p++) {
      sid = list[p]; T = D.T[owner(sid)];
      if (!T || (o && !passFacets(T, o, '', true))) continue;
      key = moveKey(sid); a = idx.weeks[key] || [i];
      out.push(makeCard(T, sid, { rank: p + 1, mv: moveOf(prev, key, p + 1, a[0] === i), wk: W, cc: C.c, cpl: p + 1,
        tp: seasonShort(slabel(sid)), age: weeksUpTo(a, i) + '-я нед.' + (wr[key] ? ' · в мире №' + wr[key] : '') }));
    }
    return out;
  }
  // Новинки недели страны: позиции, впервые попавшие в её чарт; сериалы и фильмы вперемешку по месту.
  function countryNew(C, W, o) {
    var i = W - C.w1, idx = countryIdx(C), out = [], p, kind, list, sid, T, key;
    for (p = 0; p < 10; p++) {
      for (kind = 1; kind >= 0; kind--) {
        list = countryList(C, W, kind); sid = list[p];
        if (sid == null) continue;
        key = moveKey(sid);
        if ((idx.weeks[key] || [])[0] !== i) continue;
        T = D.T[owner(sid)];
        if (!T || (o && !passFacets(T, o, '', true))) continue;
        out.push(makeCard(T, sid, { meta: '№' + (p + 1), wk: W, cc: C.c, cpl: p + 1, tp: seasonShort(slabel(sid)), age: kind ? 'сериал' : 'фильм' }));
      }
    }
    return out;
  }

  // ======================= Подбор: строка nf (§4.6) =======================
  function emptyNf() { return { c: '', t: '', g: [], gm: '', o: '', p: '', r: '', lv: '', s: '' }; }
  function parseNf(str) {
    var o = emptyNf(), parts = String(str || '').split(';'), i, kv, k, v, gs, j;
    for (i = 0; i < parts.length; i++) {
      kv = parts[i].split('='); k = kv[0]; v = kv.slice(1).join('=');
      if (!k || !v) continue;
      if (k === 'c' && /^[A-Z]{2}$/.test(v)) o.c = v;
      else if (k === 't' && TYPE[v]) o.t = v;
      else if (k === 'g') { gs = v.split(','); for (j = 0; j < gs.length; j++) if (GENRE[gs[j]] && o.g.indexOf(gs[j]) < 0) o.g.push(gs[j]); }
      else if (k === 'gm' && v === 'and') o.gm = 'and';
      else if (k === 'o' && (ORIGIN[v] || /^c:[A-Z]{2}$/.test(v))) o.o = v;
      else if (k === 'p' && /^(w|w\d+|y\d{4})$/.test(v)) o.p = v;
      else if (k === 'r' && RELEASE[v]) o.r = v;
      else if (k === 'lv' && v === '1') o.lv = '1';
      else if (k === 's' && SORT[v]) o.s = v === 'pop' ? '' : v;
    }
    return o;
  }
  // Ключи в каноническом порядке c, t, g, gm, o, p, r, lv, s; жанры — в порядке таблицы: одинаковые
  // подборы дают одинаковые строки. Сортировка по умолчанию (pop) не пишется.
  function buildNf(o) {
    var out = [], g = [], i;
    for (i = 0; i < GENRES.length; i++) if (o.g.indexOf(GENRES[i].key) >= 0) g.push(GENRES[i].key);
    if (o.c) out.push('c=' + o.c);
    if (o.t) out.push('t=' + o.t);
    if (g.length) out.push('g=' + g.join(','));
    if (g.length && o.gm === 'and') out.push('gm=and');
    if (o.o) out.push('o=' + o.o);
    if (o.p) out.push('p=' + o.p);
    if (o.r) out.push('r=' + o.r);
    if (o.lv) out.push('lv=1');
    if (o.s && o.s !== 'pop') out.push('s=' + o.s);
    return out.join(';');
  }
  function copyNf(o) { return parseNf(buildNf(o)); }
  function withNf(o, key, value) { var x = copyNf(o); x[key] = value; if (key === 'g' && !value.length) x.gm = ''; return x; }
  // Режим экрана (§4.6): «Мир» — ни чарта, ни фасетов; «Страна» — только c; иначе «Подбор». s не в счёт.
  function nfMode(o) {
    if (o.t || o.g.length || o.o || o.r || o.lv || o.p) return 'pick';
    return o.c ? 'country' : 'world';
  }

  function genreText(o, chip) {
    var names = [], i, G;
    for (i = 0; i < GENRES.length; i++) {
      G = GENRES[i];
      if (o.g.indexOf(G.key) >= 0) names.push(chip ? (G.short || G.title) : G.title);
    }
    if (!names.length) return '';
    if (chip || names.length > 2) return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
    return names.join(o.gm === 'and' ? ' и ' : ', ');
  }
  function originText(v, chip) {
    var O;
    if (!v) return '';
    if (v.indexOf('c:') === 0) return countryName(v.slice(2));
    O = ORIGIN[v];
    return O ? (chip && O.short ? O.short : O.title) : v;
  }
  function periodText(o, chip) {
    var m;
    if (!o.p) return '';
    if (o.p === 'w') return chip ? 'Эта неделя' : 'эта неделя';
    if ((m = /^w(\d+)$/.exec(o.p))) return weekLabel(+m[1], { short: true });
    if ((m = /^y(\d{4})$/.exec(o.p))) return m[1];
    return '';
  }
  function releaseText(o) { return o.r && RELEASE[o.r] ? RELEASE[o.r].chip : ''; }
  // Сводка подбора без сортировки: «Сериалы · Южная Корея · 2024».
  function nfSummary(o) {
    var parts = [];
    if (o.t) parts.push(TYPE[o.t].title);
    if (o.c) parts.push(countryName(o.c));
    if (o.g.length) parts.push(genreText(o));
    if (o.o) parts.push(originText(o.o));
    if (o.p) parts.push(periodText(o));
    if (o.r) parts.push(releaseText(o));
    if (o.lv) parts.push('с эфирами');
    return parts.join(' · ');
  }
  // Заголовок активности (§4.6): «Netflix · Сериалы · Южная Корея · 2024».
  function nfTitle(o) {
    var sum = nfSummary(o), by = o.s && SORT[o.s] ? SORT[o.s].by : '';
    if (!sum) return by ? MENU_TITLE + ' · ' + by : MENU_TITLE;
    return 'Netflix · ' + sum;
  }

  // ======================= Предикат тайтла (§4.1–4.4) =======================
  function groupMatch(T, G) {
    var g = T.g || 0, kw = T.kw || 0;
    if (G.mask && (g & G.mask)) return true;
    if (G.kwBit && (kw & G.kwBit)) return true;
    if (G.animeJa && D.animMask && (g & D.animMask) && T.ol === 'ja') return true;
    return false;
  }
  // ИЛИ внутри жанра, при gm=and — И.
  function passGenres(T, keys, all) {
    var i, ok;
    for (i = 0; i < keys.length; i++) {
      ok = GENRE[keys[i]] ? groupMatch(T, GENRE[keys[i]]) : false;
      if (all && !ok) return false;
      if (!all && ok) return true;
    }
    return !!all;
  }
  function passOrigin(T, v) {
    var O;
    if (v.indexOf('c:') === 0) return T.oc === v.slice(2);
    O = ORIGIN[v];
    return !O || !!((T.oc && O.ocSet[T.oc]) || (T.ol && O.olSet[T.ol]));
  }
  function passRelease(T, v) { var R = RELEASE[v]; return !R || !R.to || (!!T.yr && T.yr >= R.from && T.yr <= R.to); }
  // Фасеты тайтла. skip — фасет, который не проверять (живые счётчики); chart — недельный чарт:
  // прямые эфиры в нём остаются (§4.1, lv). Без TMDB тайтл скрыт, если задан жанр, «Откуда» или год выхода.
  function passFacets(T, o, skip, chart) {
    var tp;
    if (!T) return false;
    if (!chart && skip !== 'lv' && T.lv === 1 && !o.lv) return false;
    if (o.t && skip !== 't') {
      tp = TYPE[o.t];
      if (T.k !== tp.k) return false;
      if (tp.lg !== undefined && T.lg !== tp.lg) return false;
    }
    if (!T.id && ((o.g.length && skip !== 'g') || (o.o && skip !== 'o') || (o.r && skip !== 'r'))) return false;
    if (o.g.length && skip !== 'g' && !passGenres(T, o.g, o.gm === 'and')) return false;
    if (o.o && skip !== 'o' && !passOrigin(T, o.o)) return false;
    if (o.r && skip !== 'r' && !passRelease(T, o.r)) return false;
    return true;
  }

  // ======================= Агрегаты периода (§4.4–4.5) =======================
  var ZERO = { pts: 0, h: 0, v: 0, m: 0, wk: 0, top1: 0, streak: 0, best: 99, first: -1, last: -1 };
  // По тайтлам чарта c за период p: очки Σ(11 − место), часы, просмотры, метрика, недели, недели на №1,
  // серия №1, лучшее место, первая и последняя неделя. Запоминается по ключу чарта и периода.
  // list — вселенная: тайтлы с позицией в периоде; мир за всё время — весь индекс.
  function periodAgg(c, p) {
    var key = (c || '*') + '|' + (p || ''), A = D.agg[key], r, a = {}, list = [], W, i, kind, cat, pl, e, wd, lst, C, n;
    if (A) return A;
    function acc(n, W, pl, h, v) {
      var x = a[n];
      if (!x) { x = a[n] = { pts: 0, h: 0, v: 0, m: 0, wk: 0, top1: 0, streak: 0, run: 0, best: 99, first: W, last: W, lw: -1, l1: -9 }; list.push(n); }
      x.pts += 11 - pl; x.h += h; x.v += v; x.m += W >= vf() ? v : h;
      if (x.lw !== W) { x.wk++; x.lw = W; }
      if (pl < x.best) x.best = pl;
      if (pl === 1 && x.l1 !== W) { x.run = x.l1 === W - 1 ? x.run + 1 : 1; x.l1 = W; x.top1++; if (x.run > x.streak) x.streak = x.run; }
      x.last = W;
    }
    r = periodRange(c, p);
    if (r && !c && D.global) {
      for (W = r[0]; W <= r[1]; W++) {
        wd = D.global.w[W] || [];
        for (cat = 0; cat < 4; cat++) {
          lst = wd[cat] || [];
          for (pl = 0; pl < lst.length; pl++) { e = lst[pl]; n = e ? owner(e[0]) : null; if (n != null) acc(n, W, pl + 1, e[1] || 0, e[2] || 0); }
        }
      }
    } else if (r && c && D.cty[c]) {
      C = D.cty[c];
      for (W = r[0]; W <= r[1]; W++) {
        i = W - C.w1;
        for (kind = 0; kind < 2; kind++) {
          lst = (kind ? C.t[i] : C.f[i]) || [];
          for (pl = 0; pl < lst.length; pl++) { n = owner(lst[pl]); if (n != null) acc(n, W, pl + 1, 0, 0); }
        }
      }
    }
    if (!c && !p && D.index) list = D.index.list;
    A = D.agg[key] = { a: a, list: list, range: r };
    return A;
  }

  // ======================= Сортировка и бейджи (§4.5) =======================
  // Пусто — сортировка доступна, иначе причина для приглушённого пункта меню.
  function sortAvail(key, o) {
    if ((key === 'hours' || key === 'views') && o.c) return key === 'hours' ? 'у чартов стран нет часов' : 'у чартов стран нет просмотров';
    if ((key === 'countries' || key === 'c1') && (o.c || o.p)) return o.c ? 'только для мирового чарта' : 'только за всё время';
    return '';
  }
  function effSort(o) { return o.s && SORT[o.s] && !sortAvail(o.s, o) ? o.s : 'pop'; }
  function sortCtx(o, key) {
    var m = /^y(\d{4})$/.exec(o.p || '');
    return { c: o.c, p: o.p, A: periodAgg(o.c, o.p), sort: key || effSort(o), yi: m ? yearIdx(+m[1]) : -1, wa: !o.c && !o.p };
  }
  // Значение сортировки: больше — выше. Мир за всё время — поля строки, иначе — агрегаты периода.
  function sortVal(T, key, ctx) {
    var x = ctx.A.a[T.n] || ZERO, wa = ctx.wa, b;
    switch (key) {
      case 'hours': return wa ? T.gh || 0 : x.h;
      case 'views': return wa ? T.gv || 0 : x.v;
      case 'weeks': return wa ? T.gw || 0 : x.wk;
      case 'top1': return x.top1;
      case 'streak': return x.streak;
      case 'best': b = wa ? T.gb : (x.best < 99 ? x.best : 0); return b ? -b : -999;
      case 'countries': return T.nc || 0;
      case 'c1': return T.c1 || 0;
      case 'new': b = wa ? T.gf : x.first; return b != null && b >= 0 ? b : -1;
      case 'rating': return T.va || 0;
      case 'ynew': return T.yr || -1;
      case 'yold': return T.yr ? -T.yr : -99999;
    }
    if (ctx.c) return x.pts;                                  // страна: очки в ней за период
    if (wa) return T.pts || 0;                                // мир, всё время: очки по странам
    if (ctx.yi >= 0) return (T.py && T.py[ctx.yi]) || 0;      // мир, год: очки года
    return x.m;                                               // мир, неделя: метрика места
  }
  function sortTitles(list, ctx) {
    var arr = [], i;
    for (i = 0; i < list.length; i++) arr.push({ T: list[i], a: sortVal(list[i], ctx.sort, ctx), b: ctx.sort === 'pop' ? 0 : sortVal(list[i], 'pop', ctx) });
    arr.sort(function (x, y) { return (y.a - x.a) || (y.b - x.b) || (x.T.n - y.T.n); });
    for (i = 0; i < arr.length; i++) arr[i] = arr[i].T;
    return arr;
  }
  // Тайтлы подбора: вселенная чарта и периода → фасеты (§4.1–4.4).
  function resultTitles(o, skip) {
    var A = periodAgg(o.c, o.p), out = [], i, T;
    for (i = 0; i < A.list.length; i++) { T = D.T[A.list[i]]; if (passFacets(T, o, skip)) out.push(T); }
    return out;
  }
  function countNf(o) { return resultTitles(o).length; }
  function sortedResult(o) { return sortTitles(resultTitles(o), sortCtx(o)); }
  // Бейдж .nf-meta по активной сортировке (§4.5).
  function sortBadge(T, ctx) {
    var x = ctx.A.a[T.n] || ZERO, wa = ctx.wa, v, w;
    switch (ctx.sort) {
      case 'hours': v = wa ? T.gh : x.h; return v ? hoursLabel(v) : '—';
      case 'views': v = wa ? T.gv : x.v; return v ? fmtUnits(v) : '—';
      case 'weeks': return (wa ? T.gw || 0 : x.wk) + ' нед.';
      case 'top1': return x.top1 ? '№1 ×' + x.top1 : '—';
      case 'streak': return x.streak ? x.streak + ' подряд' : '—';
      case 'best': v = wa ? T.gb : (x.best < 99 ? x.best : 0); return v ? '№' + v : '—';
      case 'countries': return (T.nc || 0) + ' стр.';
      case 'c1': return T.c1 ? '№1 в ' + T.c1 : '—';
      case 'new': v = wa ? T.gf : x.first; return v != null && v >= 0 ? 'с ' + monthYear(v) : '—';
      case 'rating': return T.va ? '★ ' + comma((T.va / 10).toFixed(1)) : '—';
      case 'ynew': case 'yold': return T.yr ? String(T.yr) : '—';
    }
    v = wa ? T.gb : (x.best < 99 ? x.best : 0); w = wa ? T.gw : x.wk;
    return v ? '№' + v + ' · ' + (w || 0) + ' нед.' : '';
  }
  // Подпись в тайтловых списках (§7): «2021 · Корея», без TMDB — «Netflix».
  function listAge(T) {
    if (!T.id) return 'Netflix';
    return [T.yr ? String(T.yr) : '', T.oc ? countryShort(T.oc) : ''].filter(Boolean).join(' · ');
  }
  // Карточка тайтлового списка (ряд или сетка): бейдж сортировки и «2021 · Корея».
  function titleCard(T, ctx) { return makeCard(T, null, { meta: sortBadge(T, ctx), age: listAge(T) }); }

  // ======================= Зал славы (§5.7) =======================
  // Двенадцать списков из global, индекса и home.alltime — раз за сессию. Фасеты — при показе.
  // Элемент: {n, sid, W, a, b, badge}; a, b — ключи порядка. B3 строит из них экран netflix_hall.
  function hallLists() {
    var H = D.hall, w, bySid, sid, list, i, j, e, T, cat, W, cur, best, top, x, n, fr, yrs, gap, prev;
    if (H) return H;
    if (!D.global || !D.index || !D.home) return null;
    w = D.global.w; bySid = D.global.bySid;
    H = { streak: [], whours: [], wviews: [], runs: [], c1: [], sleep: [], comet: [], franch: [], ever: [], back: [], jump: [], at: [] };
    function add(key, s, a, b, W, badge, nn) {
      var o = nn != null ? nn : owner(s);
      if (o == null || !D.T[o]) return;
      H[key].push({ n: o, sid: s, W: W, a: a, b: b || 0, badge: badge });
    }
    // Серии №1: по (sid, список) самая длинная серия недель на месте 1, от двух.
    best = {};
    for (cat = 0; cat < 4; cat++) {
      cur = null;
      for (W = 0; W < w.length; W++) {
        e = w[W] && w[W][cat] && w[W][cat][0];
        if (!e) { cur = null; continue; }
        if (cur && cur.sid === e[0]) { cur.len++; cur.sum += metricRaw(e, W); } else cur = { sid: e[0], len: 1, sum: metricRaw(e, W), W: W };
        x = best[cur.sid];
        if (cur.len >= 2 && (!x || cur.len > x.len || (cur.len === x.len && cur.sum > x.sum))) best[cur.sid] = { len: cur.len, sum: cur.sum, W: cur.W };
      }
    }
    for (sid in best) if (best.hasOwnProperty(sid)) add('streak', +sid, best[sid].len, best[sid].sum, best[sid].W, best[sid].len + ' нед. подряд');
    fr = {};
    for (sid in bySid) {
      if (!bySid.hasOwnProperty(sid)) continue;
      list = bySid[sid]; n = owner(+sid); T = D.T[n];
      if (!T) continue;
      // Рекорды недели: лучшая неделя сезона по часам и по просмотрам (просмотры — с vf).
      top = null; x = null;
      for (i = 0; i < list.length; i++) {
        if (!top || list[i].h > top.h) top = list[i];
        if (list[i].W >= vf() && (!x || list[i].v > x.v)) x = list[i];
      }
      add('whours', +sid, top.h, 0, top.W, hoursLabel(top.h), n);
      if (x && x.v) add('wviews', +sid, x.v, 0, x.W, viewsLabel(x.v), n);
      // Долгожители: наибольший cw сезона, без эфиров.
      if (T.lv !== 1) { top = 0; for (i = 0; i < list.length; i++) if (list[i].cw > top) top = list[i].cw; add('runs', +sid, top, 0, list[list.length - 1].W, top + ' нед.', n); }
      // Медленный старт: первый непрерывный забег, вход ≥ 4, пик ≤ вход − 3, подъём ≥ 2 недель.
      e = list[0]; cur = { pl: e.pl, W: e.W };
      for (j = 1; j < list.length && list[j].W === list[j - 1].W + 1; j++) if (list[j].pl < cur.pl) cur = { pl: list[j].pl, W: list[j].W };
      if (e.pl >= 4 && cur.pl <= e.pl - 3 && cur.W - e.W >= 2) add('sleep', +sid, -cur.pl, e.pl - cur.pl, e.W, e.pl + '→' + cur.pl, n);
      // Кометы: был №1, всего ≤ 2 недель, давно выбыл, есть карточка.
      top = null;
      for (i = 0; i < list.length; i++) if (list[i].pl === 1) top = list[i];
      if (top && list.length <= 2 && list[list.length - 1].W < lastW() - 1 && T.id) add('comet', +sid, top.W >= vf() ? top.v : top.h, 0, top.W, list.length + ' нед.', n);
      // Вечнозелёные: в чарте в ≥ 4 календарных годах. Вернулись: разрыв ≥ 52 недель.
      yrs = {}; x = 0; gap = 0; prev = -1; top = -1;
      for (i = 0; i < list.length; i++) {
        W = list[i].W;
        if (!yrs[weekYear(W)]) { yrs[weekYear(W)] = 1; x++; }
        if (prev >= 0 && W - prev > gap) { gap = W - prev; top = W; }
        prev = W;
      }
      if (x >= 4) add('ever', +sid, x, list.length, list[0].W, x + plural(x, ' год', ' года', ' лет'), n);
      if (gap >= 52) add('back', +sid, gap, top, top, 'через ' + gap + ' нед.', n);
      // Франшизы: разные сезоны тайтла в чарте.
      if (T.lv !== 1) (fr[n] || (fr[n] = [])).push(+sid);
    }
    for (n in fr) if (fr.hasOwnProperty(n) && fr[n].length >= 3) add('franch', null, fr[n].length, D.T[n].gh || 0, -1, fr[n].length + plural(fr[n].length, ' сезон', ' сезона', ' сезонов'), +n);
    // №1 во многих странах — из индекса.
    for (i = 0; i < D.index.list.length; i++) { T = D.T[D.index.list[i]]; if (T && T.c1 >= 50) add('c1', null, T.c1, T.pts || 0, -1, '№1 в ' + T.c1, T.n); }
    // Взлёт за неделю: (место прошлой недели − место) в том же списке, лучший у каждого сезона.
    best = {};
    for (W = 1; W < w.length; W++) {
      for (cat = 0; cat < 4; cat++) {
        prev = {}; list = (w[W - 1] && w[W - 1][cat]) || [];
        for (i = 0; i < list.length; i++) if (list[i]) prev[list[i][0]] = i + 1;
        list = (w[W] && w[W][cat]) || [];
        for (i = 0; i < list.length; i++) {
          e = list[i]; j = e && prev[e[0]];
          if (j && j - (i + 1) > 0 && (!best[e[0]] || j - (i + 1) >= best[e[0]].a)) best[e[0]] = { a: j - (i + 1), W: W, badge: j + '→' + (i + 1) };
        }
      }
    }
    for (sid in best) if (best.hasOwnProperty(sid)) add('jump', +sid, best[sid].a, best[sid].W, best[sid].W, best[sid].badge);
    // Официальный топ всех времён: четыре списка most-popular, слитые по просмотрам за 91 день.
    list = alltimeList();
    for (i = 0; i < list.length; i++) add('at', list[i].e[0], -i, 0, -1, fmtUnits(list[i].e[2]));
    // Порядок каждого списка: a ↓, затем b ↓, затем новее.
    for (x in H) if (H.hasOwnProperty(x)) H[x].sort(function (p1, p2) { return (p2.a - p1.a) || (p2.b - p1.b) || (p2.W - p1.W); });
    D.hall = H;
    return H;
  }
  // Список Зала славы с фасетами подбора o (Рекорды подбора, сетка hall:<ключ> в B3).
  function hallFiltered(key, o, limit) {
    var H = hallLists(), out = [], list = H ? H[key] || [] : [], i;
    for (i = 0; i < list.length && (!limit || out.length < limit); i++) if (passFacets(D.T[list[i].n], o)) out.push(list[i]);
    return out;
  }
  // home.alltime: четыре списка most-popular, слитые по просмотрам за 91 день: [{e: [sid, h, v], cat}].
  function alltimeList() {
    var at = (D.home && D.home.alltime) || [], list = [], cat, i;
    for (cat = 0; cat < at.length; cat++) for (i = 0; i < (at[cat] || []).length; i++) if (at[cat][i]) list.push({ e: at[cat][i], cat: cat });
    list.sort(function (a, b) { return (b.e[2] - a.e[2]) || (b.e[1] - a.e[1]); });
    return list;
  }

  // ======================= Списки сеток «Ещё» (§5.5) =======================
  // Тайтловый список по ключу nf_list: {list, ctx} или null. Ряды берут те же списки, поэтому сетка
  // продолжает ряд с того же места. Сортировка s действует на всё, кроме lg (недели №1 в стране).
  function titleList(o, key) {
    var m, o2, ctx, all, list = [], C, i, T;
    if (key === 'res') { ctx = sortCtx(o); return { list: sortTitles(resultTitles(o), ctx), ctx: ctx }; }
    if ((m = /^(?:xp:p:)?(y\d{4})$/.exec(key))) {
      o2 = withNf(o, 'p', m[1]); ctx = sortCtx(o2);
      return { list: sortTitles(resultTitles(o2), ctx), ctx: ctx };
    }
    if ((m = /^xp:([got]):(.+)$/.exec(key))) {
      ctx = sortCtx(o); all = resultTitles(o);
      for (i = 0; i < all.length; i++) if (xpMatch(all[i], m[1], m[2])) list.push(all[i]);
      return { list: sortTitles(list, ctx), ctx: ctx };
    }
    if (key === 'cl' || key === 'cx' || key === 'lg') {
      C = o.c ? D.cty[o.c] : null;
      if (!C) return { list: [], ctx: sortCtx(o) };
      if (key !== 'lg') {
        // Местные тайтлы файла страны (их нет в мировом индексе). cl — «Только в стране»: в топе были только
        // здесь или почти только здесь (на страну приходится не меньше половины их страно-недель); cx — остальные,
        // «Не попали в мировой топ», с подписью «ещё в N странах».
        ctx = sortCtx(o); all = periodAgg(o.c, '').a;
        for (i = 0; i < C.local.length; i++) {
          T = D.T[C.local[i]];
          if (!T || T.inIdx || !passFacets(T, o)) continue;
          if (((T.nc || 0) <= 1 || 2 * (all[T.n] || ZERO).wk >= (T.cw || 0)) === (key === 'cl')) list.push(T);
        }
        if (key === 'cx') ctx.age = function (T2) { var k = Math.max(1, (T2.nc || 1) - 1); return 'ещё в ' + k + ' ' + plural(k, 'стране', 'странах', 'странах'); };
      } else {
        // Легенды страны: больше всего недель №1, свой порядок.
        ctx = sortCtx(o, 'top1'); all = resultTitles(o);
        for (i = 0; i < all.length; i++) if ((ctx.A.a[all[i].n] || ZERO).top1 > 0) list.push(all[i]);
      }
      return { list: sortTitles(list, ctx), ctx: ctx };
    }
    if (key === 'ru') {
      o2 = withNf(o, 'c', 'RU'); o2.p = ''; ctx = sortCtx(o2);
      return { list: sortTitles(resultTitles(o2), ctx), ctx: ctx };
    }
    if ((m = /^sim:(\d+)$/.exec(key))) return similarList(+m[1], o);
    return null;
  }
  // Ряд развёртки (§5.4): жанр, «Откуда» или тип; без TMDB тайтл не знает жанра и страны.
  function xpMatch(T, dim, val) {
    if (dim === 'g') return !!T.id && !!GENRE[val] && groupMatch(T, GENRE[val]);
    if (dim === 'o') return !!T.id && passOrigin(T, val);
    return T.k === (val === 's' ? 1 : 0);
  }
  // Все карточки сетки. null — ключ неизвестен или данных для него нет.
  function gridCards(o, key) {
    var L = titleList(o, key), out = [], m, list, i;
    if (L) {
      for (i = 0; i < L.list.length; i++) {
        out.push(titleCard(L.list[i], L.ctx));
        if (L.ctx.age) out[i].nf.age = L.ctx.age(L.list[i]);
      }
      return out;
    }
    if ((m = /^wk(\d+)(f?)$/.exec(key))) return weekAllCards(o, +m[1], !!m[2]);
    if (key === 'at') return alltimeCards(o);
    if ((m = /^hall:(\w+)$/.exec(key)) && HALL_T[m[1]]) {
      list = hallFiltered(m[1], o);
      for (i = 0; i < list.length; i++) out.push(hallCard(m[1], list[i], false));
      return out;
    }
    return null;
  }
  // Все позиции недели: мир — четыре списка Netflix по 10 (сериалы, затем фильмы), страна — её 20.
  // films — сетка из ряда фильмов (ключ wk<W>f): фильмы первыми. Подбор фильтрует позиции по тайтлу,
  // настоящие места остаются.
  function weekAllCards(o, W, films) {
    var out = [], cats = films ? [0, 1, 2, 3] : [2, 3, 0, 1], kinds = films ? [0, 1] : [1, 0], wd, C, i, j, k, list, e, T, cards;
    if (o.c) {
      C = D.cty[o.c];
      if (!C) return null;
      for (k = 0; k < kinds.length; k++) {
        i = kinds[k];
        cards = countryTop(C, W, i, o);
        for (j = 0; j < cards.length; j++) {
          cards[j].nf.meta = (i ? 'Сериалы' : 'Фильмы') + ' №' + cards[j].nf.rank;
          cards[j].nf.rank = 0; cards[j].nf.mv = '';
          out.push(cards[j]);
        }
      }
      return out;
    }
    wd = weekData(W);
    if (!wd) return null;
    for (i = 0; i < cats.length; i++) {
      list = wd[cats[i]] || [];
      for (j = 0; j < list.length; j++) {
        e = list[j]; T = e ? D.T[owner(e[0])] : null;
        if (!T || !passFacets(T, o, '', true)) continue;
        out.push(makeCard(T, e[0], { meta: LIST_BADGE[cats[i]] + ' №' + (j + 1), wk: W, cat: cats[i], pl: j + 1, cw: e[3] || 0, h: e[1] || 0, v: e[2] || 0,
          tp: seasonShort(slabel(e[0])), age: chartAge({ pl: 0, cw: e[3] || 0, W: W, h: e[1] || 0, v: e[2] || 0 }) }));
      }
    }
    return out;
  }
  // Сколько позиций недели W проходит подбор: число на плитке «Все 40 →».
  function weekAllCount(o, W) {
    var wd = weekData(W), n = 0, c, p, list, T;
    if (!wd) return 0;
    for (c = 0; c < 4; c++) {
      list = wd[c] || [];
      for (p = 0; p < list.length; p++) { T = list[p] ? D.T[owner(list[p][0])] : null; if (T && passFacets(T, o, '', true)) n++; }
    }
    return n;
  }
  // Все 40 позиций рейтинга за 91 день, слитые по просмотрам; места настоящие.
  function alltimeCards(o) {
    var list = alltimeList(), out = [], i, e, T;
    for (i = 0; i < list.length; i++) {
      e = list[i].e; T = D.T[owner(e[0])];
      if (!T || !passFacets(T, o, '', true)) continue;
      out.push(makeCard(T, e[0], { meta: '№' + (i + 1) + ' · ' + fmtUnits(e[2]), tp: seasonShort(slabel(e[0])), age: '91 день · ' + hoursLabel(e[1]) }));
    }
    return out;
  }
  // Сводка фасетов тайтла без чарта и периода: История, Зал славы, сетки недели.
  function facetSummary(o) { var x = copyNf(o); x.c = ''; x.p = ''; return nfSummary(x); }
  function xpName(dim, val) {
    if (dim === 'g') return GENRE[val] ? GENRE[val].title : val;
    if (dim === 'o') return originText(val);
    return val === 's' ? 'Сериалы' : 'Фильмы';
  }
  // Заголовок сетки по nf и nf_list; пересчитывается, когда на самой сетке меняют сортировку или подбор.
  function gridTitle(o, key) {
    var m, sum = nfSummary(o), fs = facetSummary(o), by = SORT[effSort(o)].by, S;
    function tail(s) { return fs ? s + ' · ' + fs : s; }
    if (key === 'res') {
      if (nfMode(o) === 'world') return 'Лучшее с июля 2021 · ' + by;
      if (nfMode(o) === 'country') return 'Лучшее ' + countryPrep(o.c) + ' с июля 2021 · ' + by;
      return sum + ' · ' + by;
    }
    if ((m = /^y(\d{4})$/.exec(key))) return tail(hitsTitle(+m[1], o.c)) + ' · ' + SORT[effSort(withNf(o, 'p', key))].by;
    if ((m = /^xp:p:y(\d{4})$/.exec(key))) return (sum ? sum + ' · ' : '') + m[1] + ' · ' + SORT[effSort(withNf(o, 'p', 'y' + m[1]))].by;
    if ((m = /^xp:([got]):(.+)$/.exec(key))) return (sum ? sum + ' · ' : '') + xpName(m[1], m[2]) + ' · ' + by;
    if (key === 'cl') return tail('Только ' + (o.c ? countryPrep(o.c) : 'в стране')) + ' · ' + by;
    if (key === 'cx') return tail('Не попали в мировой топ' + (o.c ? ' · ' + countryName(o.c) : '')) + ' · ' + by;
    if (key === 'lg') return tail('Легенды: больше всего недель №1' + (o.c ? ' · ' + countryName(o.c) : ''));
    if (key === 'ru') return tail('Россия до марта 2022') + ' · ' + SORT[effSort(withNf(o, 'c', 'RU'))].by;
    if ((m = /^sim:(\d+)$/.exec(key))) { S = similarSpec(D.T[+m[1]]); return S ? S.title : 'Похожие в топе'; }
    // Мир: столько списков Netflix, сколько их оставляет тип подбора (Сериалы — два, «Фильмы на английском» — один).
    if ((m = /^wk(\d+)f?$/.exec(key))) return tail(weekLabel(+m[1]) + ' · ' + (o.c ? countryName(o.c) : ['', 'список Netflix', 'два списка Netflix', 'три списка Netflix', 'четыре списка Netflix'][chartCats(0, o).length + chartCats(1, o).length]));
    if (key === 'at') return tail('Лучшие за всё время · рейтинг Netflix');
    if ((m = /^hall:(\w+)$/.exec(key)) && HALL_T[m[1]]) return tail(HALL_T[m[1]].title);
    return '';
  }

  // ======================= Ряды =======================
  // nf_row — ряд плагина: метки карточек (§7) и строка фокуса. card_events — меню карточки (трейлеры, досье).
  function cardRow(title, cards, extra) {
    var row = { title: title, results: cards, nf_row: true, nomore: true, card_events: cardEvents() }, k;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) row[k] = extra[k];
    return row;
  }
  function tileRow(title, items, type) {
    return { title: title, results: items, cardClass: makeTile, nomore: true, noimage: true, line_type: type || 'nf-tiles', nf_row: true };
  }
  // Плитка в конце ряда карточек («История →», «Все 40 →»): своя cardClass у элемента. Заголовок сетки,
  // которую открывает плитка, — в extra.gtitle: title и sub — подпись самой плитки.
  function tailTile(title, sub, extra) {
    var d = { tile: 'tail', cardClass: makeTile }, k;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
    d.title = title; d.sub = sub || '';
    return d;
  }
  // «Ещё →» с размером списка — своя плитка вместо родной карточки «Ещё» старого ряда: та запоминает в фокусе
  // событие, а не элемент (line.js:198-205), и после «Назад» из сетки фокуса нет, а ← открывает боковое меню.
  function moreTail(n, list, gtitle) { return tailTile('Ещё →', 'всего ' + fmtInt(n), { act: 'grid', list: list, gtitle: gtitle }); }
  // Тайтловый ряд: 20 первых по сортировке, бейдж сортировки; «Ещё →» → сетка gridList (§5.5). Ряд результата
  // (res) кончается плиткой «Случайный хит». ctx.age — своя строка под названием (cx: «ещё в 3 странах»).
  function titlesRow(title, list, o, ctx, gridList) {
    var cards = [], i;
    for (i = 0; i < list.length && cards.length < ROW_MAX; i++) {
      cards.push(titleCard(list[i], ctx));
      if (ctx.age) cards[i].nf.age = ctx.age(list[i]);
    }
    if (gridList && list.length > ROW_MAX && hasScreen('netflix_grid')) cards.push(moreTail(list.length, gridList, title));
    if (gridList === 'res' && cards.length) cards.push(tailTile('Случайный хит', 'трейлер наугад', { act: 'random' }));
    return cardRow(title, cards, { nf_list: gridList || '' });
  }
  function dayOfWeek(W) { var d = weekSun(W); return d.getUTCDate() + ' ' + MON_GEN[d.getUTCMonth()]; }
  // «Хиты 2026 (по 8 ноября)», «Хиты 2025», «Хиты 2021 (с июля)»; у страны — «Хиты Южной Кореи 2026».
  function hitsTitle(Y, c) {
    var r = chartRange(c), head = 'Хиты ' + (c ? countryGen(c) + ' ' : '') + Y;
    if (r && weekYear(r[1]) === Y) return head + ' (по ' + dayOfWeek(r[1]) + ')';
    if (r && r[0] === 0 && weekYear(0) === Y) return head + ' (с июля)';
    return head;
  }

  // Ряд 0 — шесть фишек подбора (§6.1).
  function chipsRow(o) {
    var mode = nfMode(o), cnt = D.index && (!o.c || D.cty[o.c]) ? fmtInt(countNf(o)) : '…';
    return tileRow('Подбор · данные по ' + dayLabel(D.man.v), [
      { tile: 'chip', act: 'chip', key: 'all', label: 'Фильтры', value: cnt, active: mode === 'pick' },
      { tile: 'chip', act: 'chip', key: 'c', label: 'Чарт', value: o.c ? countryName(o.c) : 'Весь мир', active: !!o.c },
      { tile: 'chip', act: 'chip', key: 't', label: 'Тип', value: (o.t ? TYPE[o.t].title : 'Фильмы и сериалы') + (o.lv ? ' + эфиры' : ''), active: !!(o.t || o.lv) },
      { tile: 'chip', act: 'chip', key: 'g', label: 'Жанр', value: genreText(o, true) || 'Любой', active: !!o.g.length },
      { tile: 'chip', act: 'chip', key: 'o', label: 'Откуда', value: originText(o.o, true) || 'Любая страна', active: !!o.o },
      { tile: 'chip', act: 'chip', key: 'pr', label: 'Год', value: yearChip(o), active: !!(o.p || o.r) }
    ], 'nf-chips');
  }
  function yearChip(o) {
    var p = periodText(o, true), r = releaseText(o);
    if (p && r) return p + ' · ' + r;
    return p || r || 'Всё время';
  }
  // Хвост топ-10: «▶ Отсчёт 10→1» с числом трейлеров (§8.7; нет ни одного — нет и плитки) и «История →».
  function topTails(W, kind, cards) {
    var out = [], sub = countdownSub(cards || []);
    if (sub) out.push(tailTile('▶ Отсчёт 10→1', sub, { act: 'countdown', W: W, kind: kind }));
    return out.concat(historyTail(W));
  }
  // «История →» открывает ленту недель на неделе ряда (§5.6), в чарте экрана.
  function historyTail(W) { return hasScreen('netflix_weeks') ? [tailTile('История →', weekLabel(W, { short: true }), { act: 'weeks', W: W })] : []; }
  function withTail(cards, tail) { return cards.length ? cards.concat(tail) : cards; }
  // Ряд 4 — «Сейчас №1 по странам»: недавние страны, затем список §5.2; постер — №1 сериал страны.
  // Ряд строится один раз, а при возврате на «Мир» плитки переписываются на месте (refreshCountries).
  function countryOrder() {
    var order = recentCountries().concat(NOW_TILES), seen = {}, out = [], i, code, list;
    for (i = 0; i < order.length; i++) {
      code = order[i];
      if (seen[code]) continue;
      seen[code] = 1;
      list = D.home.c[code];
      if (list && list[1] && list[1].length) out.push(code);
    }
    return out;
  }
  function countryTile(code, d) {
    var T = D.T[owner(D.home.c[code][1][0])];
    d = d || { tile: 'country', act: 'country' };
    d.code = code; d.title = countryName(code); d.sub = T ? '№1: ' + titleName(T) : ''; d.img = T ? T.p : '';
    return d;
  }
  function countriesRow() {
    var codes = countryOrder(), items = [], i, row;
    for (i = 0; i < codes.length; i++) items.push(countryTile(codes[i]));
    items.push({ tile: 'tail', act: 'chartMenu', title: 'Все страны →', short: true });
    row = tileRow('Сейчас №1 по странам', items);
    row.nf_cc = true;
    return row;
  }
  function refreshCountries(row) {
    var codes = countryOrder(), list = row.results, i, d;
    for (i = 0; i < list.length && i < codes.length; i++) {
      d = list[i];
      if (d.tile !== 'country' || d.code === codes[i]) continue;
      countryTile(codes[i], d);
      if (d.__tile) d.__tile.update();
    }
  }
  // «Мои подборы» — до SHELF_MAX последних подборов (Storage netflix_filter_hist, новые первыми) в начале
  // «Подборок». Первый — «↩ Прошлый подбор»: netflix_filter, его пишет remember(). За ними, пока их меньше
  // SHELF_MAX, — «Свой подбор», он открывает «Фильтры». Ряд строится один раз: при возврате на «Мир»
  // плитки переписываются на месте (refreshShelf; новый подбор занимает место «Своего подбора» или
  // вытесняет самый старый), и OK применяет ровно то, что на плитке.
  var SHELF_MAX = 5;
  function filterHist() {
    var a = storageGet('netflix_filter_hist', '[]'), last = String(storageGet('netflix_filter', '') || ''), out = [], i;
    if (Object.prototype.toString.call(a) !== '[object Array]') a = [];
    if (last && nfMode(parseNf(last)) !== 'world') out.push(buildNf(parseNf(last)));
    for (i = 0; i < a.length && out.length < SHELF_MAX; i++) if (typeof a[i] === 'string' && a[i] && out.indexOf(a[i]) < 0) out.push(a[i]);
    return out;
  }
  // Подбор показан (экран netflix не в виде «Мир») — он первый в истории.
  function addFilterHist(canon) {
    var a = filterHist(), i = a.indexOf(canon);
    if (i >= 0) a.splice(i, 1);
    a.unshift(canon);
    storageSet('netflix_filter_hist', a.slice(0, SHELF_MAX));
  }
  function shelfTile(nf, k, d) {
    var o = nf ? parseNf(nf) : null, by = o && o.s && SORT[o.s] ? ' · ' + SORT[o.s].by : '';
    d = d || { tile: 'col', color: 0 };
    if (!o) { d.act = 'filters'; d.nf = ''; d.title = 'Свой подбор'; d.sub = 'тип, жанр, страна, год'; return d; }
    d.act = 'nf'; d.exact = true; d.nf = nf;
    d.title = k ? nfSummary(o) : '↩ Прошлый подбор';
    d.sub = (k ? 'мой подбор' : nfSummary(o)) + by;
    return d;
  }
  function refreshShelf(row) {
    var hist = filterHist(), list = row.results, i, d, was;
    storageSet('netflix_filter_hist', hist);
    for (i = 0; i < list.length && list[i].nf_shelf; i++) {
      d = list[i];
      was = d.act + '|' + d.nf + '|' + d.title + '|' + d.sub;
      shelfTile(hist[i] || '', i, d);
      if (d.__tile && was !== d.act + '|' + d.nf + '|' + d.title + '|' + d.sub) d.__tile.update();
    }
  }
  // Ряд 5 — «Мои подборы» и подборки §5.2.1.
  function collectionsRow() {
    var hist = filterHist(), items = [], i, C, row;
    storageSet('netflix_filter_hist', hist);
    for (i = 0; i < Math.min(SHELF_MAX, hist.length + 1); i++) { items.push(shelfTile(hist[i] || '', i)); items[i].nf_shelf = true; }
    for (i = 0; i < COLLECTIONS.length; i++) {
      C = COLLECTIONS[i];
      if (C.act === 'weeks' && !hasScreen('netflix_weeks')) continue;
      if (C.act === 'hall' && !hasScreen('netflix_hall')) continue;
      if (C.act === 'grid' && !hasScreen('netflix_grid')) continue;
      items.push({ tile: 'col', act: C.act || 'nf', nf: C.nf || '', list: C.list || '', title: C.title, color: i + 1 });
    }
    row = tileRow('Подборки', items);
    row.nf_shelf = true;
    return row;
  }
  // Плитки-рекорды: первое место списков Зала славы среди прошедших подбор (§5.2, ряд 7; §5.4, ряд 11).
  // Тайтл — только в одной плитке: если он уже стоит в ряду, плитку берёт следующий в списке (иначе
  // «Игра в кальмара» заняла бы четыре плитки из восьми).
  function recordsRow(title, o) {
    var items = [], used = {}, i, j, key, list;
    for (i = 0; i < HALL_HOME.length; i++) {
      key = HALL_HOME[i];
      list = hallFiltered(key, o);
      for (j = 0; j < list.length; j++) {
        if (used[list[j].n]) continue;
        used[list[j].n] = true;
        items.push(hallCard(key, list[j], true));
        break;
      }
    }
    if (!items.length) return null;
    if (hasScreen('netflix_hall')) items.push(tailTile('Весь зал славы →', '', { act: 'hall' }));
    return cardRow(title, items);
  }
  // Карточка списка Зала славы. tile — плитка-рекорд главного экрана: OK на ней открывает сетку
  // списка (rec); в рядах и сетке Зала славы OK ведёт на страницу тайтла (hk — только для подписи).
  function hallCard(key, e, tile) {
    var x = { meta: e.badge, wk: e.W >= 0 ? e.W : null, tp: e.sid != null ? seasonShort(slabel(e.sid)) : '', age: HALL_T[key].title };
    x[tile ? 'rec' : 'hk'] = key;
    return makeCard(D.T[e.n], e.sid, x);
  }
  // «Эта неделя в прошлые годы» (§5.2, ряд 8; §5.3, ряд 7): №1 сериалов и фильмов недели W − 52k.
  function pastYearsRow(o, c) {
    var C = c ? D.cty[c] : null, r = chartRange(c), items = [], k, Wk, kind, e, sid, T;
    if (!r) return null;
    for (k = 1; k <= 5; k++) {
      Wk = r[1] - 52 * k;
      if (Wk < r[0]) break;
      for (kind = 1; kind >= 0; kind--) {
        if (C) sid = countryList(C, Wk, kind)[0];
        else { e = worldNumberOne(Wk, kind); sid = e ? e.sid : null; }
        if (sid == null) continue;
        T = D.T[owner(sid)];
        if (!T || !passFacets(T, o, '', true)) continue;
        items.push(makeCard(T, sid, { meta: String(weekYear(Wk)), wk: Wk, tp: seasonShort(slabel(sid)),
          age: '№1 ' + (kind ? 'сериалов' : 'фильмов') + ' · ' + weekLabel(Wk, { short: true, noYear: true }) }));
      }
    }
    return items.length ? cardRow('Эта неделя в прошлые годы' + (c ? ' · ' + countryName(c) : ''), items) : null;
  }
  // Ряд 9 — «Хиты, которых не знает мир»: home.local как в файле.
  function localRow() {
    var loc = D.home.local || [], items = [], i, e, T;
    for (i = 0; i < loc.length; i++) {
      e = loc[i]; T = D.T[e[0]];
      if (!T) continue;
      // e[2] — страно-недели: у тайтла из одной страны это недели, у нескольких — «стр.-нед.».
      items.push(makeCard(T, null, { meta: e[3] ? '№1 ×' + e[3] : '', age: String(e[1] || '').split(' ').map(countryShort).join(', ') + ' · ' + (e[2] || 0) +
        (/ /.test(String(e[1] || '')) ? ' стр.-нед.' : ' нед.') }));
    }
    return items.length ? cardRow('Хиты, которых не знает мир', items) : null;
  }
  // Ряд 10 — «Лучшие за всё время»: home.alltime, слитый по просмотрам за 91 день, первые 10.
  function alltimeRow() {
    var list = alltimeList(), items = [], i, e, T, title = 'Лучшие за всё время · рейтинг Netflix';
    for (i = 0; i < list.length && i < 10; i++) {
      e = list[i].e; T = D.T[owner(e[0])];
      if (T) items.push(makeCard(T, e[0], { rank: i + 1, meta: viewsLabel(e[2]), tp: seasonShort(slabel(e[0])), age: '91 день · ' + hoursLabel(e[1]) }));
    }
    if (!items.length) return null;
    if (hasScreen('netflix_grid')) items.push(tailTile('Все 40 →', '', { act: 'grid', list: 'at', gtitle: title }));
    return cardRow(title, items, { line_type: 'nf-top' });
  }
  // Ряд 11 — «Россия до марта 2022»: тайтлы country/RU, по умолчанию по очкам в России.
  function russiaRow(o) { var L = titleList(o, 'ru'); return titlesRowOrNull('Россия до марта 2022', L.list, o, L.ctx, 'ru'); }
  function titlesRowOrNull(title, list, o, ctx, gridList) { return list.length ? titlesRow(title, list, o, ctx, gridList) : null; }
  function pushRow(rows, row) { if (row && row.results && row.results.length) rows.push(row); }

  // --- «Мир» (§5.2) ---
  function worldRows1(o) {
    var W = D.home.w, rows = [chipsRow(o)], cards;
    cards = worldTop(W, 1);
    if (cards.length) rows.push(cardRow('Топ-10 сериалов · ' + weekLabel(W), cards.concat(topTails(W, 1, cards)), { line_type: 'nf-top' }));
    cards = worldTop(W, 0);
    if (cards.length) rows.push(cardRow('Топ-10 фильмов · ' + weekLabel(W), cards.concat(topTails(W, 0, cards)), { line_type: 'nf-top' }));
    pushRow(rows, cardRow('Новинки недели', worldNew(W)));
    rows.push(countriesRow());
    rows.push(collectionsRow());
    return rows;
  }
  function worldRows2(o) {
    var rows = [], ctx = sortCtx(o);
    pushRow(rows, titlesRowOrNull('Лучшее с июля 2021 · ' + SORT[ctx.sort].by, sortTitles(resultTitles(o), ctx), o, ctx, 'res'));
    pushRow(rows, recordsRow('Рекорды', o));
    pushRow(rows, pastYearsRow(o, ''));
    pushRow(rows, localRow());
    pushRow(rows, alltimeRow());
    if (D.cty.RU) pushRow(rows, russiaRow(o));
    return rows;
  }
  // Пачка 3 и «Хиты страны»: по годам от новых, сортировка s (pop → очки года в мире или в стране).
  function yearRows(o) {
    var rows = [], ys = years(), i, L;
    for (i = ys.length - 1; i >= 0; i--) {
      if (!yearInChart(ys[i], o.c)) continue;
      L = titleList(o, 'y' + ys[i]);
      pushRow(rows, titlesRowOrNull(hitsTitle(ys[i], o.c), L.list, o, L.ctx, 'y' + ys[i]));
    }
    return rows;
  }

  // --- «Страна» (§5.3) ---
  function countryRows1(o) {
    var c = o.c, C = D.cty[c], W = chartRange(c)[1], rows = [chipsRow(o)], name = countryName(c), L;
    var when = c === 'RU' ? 'последний чарт: ' + weekLabel(W) : weekLabel(W);
    pushRow(rows, cardRow('Топ-10 сериалов · ' + name + ' · ' + when, withTail(countryTop(C, W, 1), historyTail(W)), { line_type: 'nf-top' }));
    pushRow(rows, cardRow('Топ-10 фильмов · ' + name + ' · ' + when, withTail(countryTop(C, W, 0), historyTail(W)), { line_type: 'nf-top' }));
    pushRow(rows, cardRow('Новинки недели · ' + name, countryNew(C, W)));
    // Только здесь: местные тайтлы (нет в мировом индексе), бывшие в топе только или почти только здесь,
    // по умолчанию по очкам в стране. Остальные местные — ряд «Не попали в мировой топ» после «Лучшего».
    L = titleList(o, 'cl');
    pushRow(rows, titlesRowOrNull('Только ' + countryPrep(c), L.list, o, L.ctx, 'cl'));
    L = titleList(o, 'res');
    pushRow(rows, titlesRowOrNull('Лучшее ' + countryPrep(c) + ' с июля 2021', L.list, o, L.ctx, 'res'));
    L = titleList(o, 'cx');
    pushRow(rows, titlesRowOrNull('Не попали в мировой топ · ' + name, L.list, o, L.ctx, 'cx'));
    return rows;
  }
  function countryRows2(o) {
    var rows = [], L = titleList(o, 'lg');
    pushRow(rows, titlesRowOrNull('Легенды: больше всего недель №1 · ' + countryName(o.c), L.list, o, L.ctx, 'lg'));
    pushRow(rows, pastYearsRow(o, o.c));
    return rows;
  }

  // --- «Подбор» (§5.4) ---
  function pickRows1(o) {
    var rows = [chipsRow(o)], ctx = sortCtx(o), list = sortTitles(resultTitles(o), ctx), W, sum = nfSummary(o);
    if (list.length) rows.push(titlesRow(sum + ' · ' + fmtInt(list.length) + ' · ' + SORT[ctx.sort].by, list, o, ctx, 'res'));
    else rows.push(hintRow(o));
    pushRow(rows, pickChartRow(o, 1));
    pushRow(rows, pickChartRow(o, 0));
    W = periodWeek(o.c, o.p);
    if (W >= 0) pushRow(rows, cardRow('Новинки недели' + (o.c ? ' · ' + countryName(o.c) : '') + ' · ' + weekLabel(W, { short: true }),
      o.c ? countryNew(D.cty[o.c], W, o) : worldNew(W, o)));
    return rows;
  }
  function pickRows2(o) {
    var rows = expansionRows(o);
    if (!o.c && !o.p) pushRow(rows, recordsRow('Рекорды подбора', o));
    return rows;
  }
  // Ряды 2–3: неделя — настоящие места с фильтром; год — топ-10 сезонов года среди прошедших фильтр.
  function pickChartRow(o, kind) {
    var name = kind ? 'Топ-10 сериалов' : 'Топ-10 фильмов', where = o.c ? ' · ' + countryName(o.c) : '', r = periodRange(o.c, o.p), W, cards;
    if (!r || !chartCats(kind, o).length) return null;
    if (/^y/.test(o.p)) return cardRow(name + where + ' · ' + periodText(o), yearTopSeasons(o, kind, r), { line_type: 'nf-top' });
    W = r[1];
    cards = o.c ? countryTop(D.cty[o.c], W, kind, o) : worldTop(W, kind, o);
    return cardRow(name + where + ' · ' + weekLabel(W), cards, { line_type: 'nf-top' });
  }
  // Топ-10 сезонов периода r: в мире по Σ часов, в стране по Σ(11 − место); номера 1…10.
  function yearTopSeasons(o, kind, r) {
    var sums = {}, weeks = {}, order = [], cats = chartCats(kind, o), out = [], W, i, j, list, e, sid, T, C = o.c ? D.cty[o.c] : null;
    function acc(s, v) { if (!sums.hasOwnProperty(s)) { sums[s] = 0; weeks[s] = 0; order.push(s); } sums[s] += v; weeks[s]++; }
    for (W = r[0]; W <= r[1]; W++) {
      if (C) { list = countryList(C, W, kind); for (i = 0; i < list.length; i++) acc(list[i], 10 - i); }
      else for (j = 0; j < cats.length; j++) {
        list = (D.global.w[W] && D.global.w[W][cats[j]]) || [];
        for (i = 0; i < list.length; i++) { e = list[i]; if (e) acc(e[0], e[1] || 0); }
      }
    }
    order.sort(function (a, b) { return sums[b] - sums[a]; });
    for (i = 0; i < order.length && out.length < 10; i++) {
      sid = order[i]; T = D.T[owner(sid)];
      if (!T || !passFacets(T, o, '', true)) continue;
      out.push(makeCard(T, sid, { rank: out.length + 1, meta: C ? sums[sid] + ' очк.' : hoursLabel(sums[sid]), tp: seasonShort(slabel(sid)),
        age: weeks[sid] + ' нед. в топе ' + periodText(o) }));
    }
    return out;
  }
  // Ряды 5–10: развёртка по первому незаданному измерению: год → жанр → «Откуда» → тип; в ряду ≥ 5.
  function expansionRows(o) {
    var rows = [], sum = nfSummary(o), base, ctx, groups = [], i, j, list, G, ys = years(), o2;
    if (!o.p) {
      for (i = ys.length - 1; i >= 0 && rows.length < 6; i--) {
        if (!yearInChart(ys[i], o.c)) continue;
        o2 = withNf(o, 'p', 'y' + ys[i]);
        ctx = sortCtx(o2);
        list = sortTitles(resultTitles(o2), ctx);
        if (list.length >= 5) rows.push(titlesRow(sum + ' · ' + ys[i], list, o, ctx, 'xp:p:y' + ys[i]));
      }
      return rows;
    }
    base = resultTitles(o); ctx = sortCtx(o);
    function byGroup(dim, defs, test) {
      for (j = 0; j < defs.length; j++) {
        G = defs[j]; list = [];
        if (G.key === 'asia') continue;
        for (i = 0; i < base.length; i++) if (test(base[i], G)) list.push(base[i]);
        if (list.length >= 5) groups.push({ key: G.key, title: G.title, list: list });
      }
      groups.sort(function (a, b) { return b.list.length - a.list.length; });
      for (j = 0; j < groups.length && j < 6; j++) rows.push(titlesRow(sum + ' · ' + groups[j].title, sortTitles(groups[j].list, ctx), o, ctx, 'xp:' + dim + ':' + groups[j].key));
    }
    // Те же условия, что у сеток xp:<измерение>:<значение> (xpMatch).
    if (!o.g.length) byGroup('g', GENRES, function (T, Gr) { return xpMatch(T, 'g', Gr.key); });
    else if (!o.o) byGroup('o', ORIGINS, function (T, Gr) { return xpMatch(T, 'o', Gr.key); });
    else if (!o.t) byGroup('t', [{ key: 'f', title: 'Фильмы' }, { key: 's', title: 'Сериалы' }], function (T, Gr) { return xpMatch(T, 't', Gr.key); });
    return rows;
  }
  // §9 — подбор дал 0: «Без «Жанр» → 41» (подбор без одного фасета) и «Сбросить всё».
  function hintRow(o) {
    var items = [], facets = [['c', 'Чарт'], ['t', 'Тип'], ['g', 'Жанр'], ['o', 'Откуда'], ['p', 'Год в топе'], ['r', 'Год выхода']], i, f, o2, n;
    for (i = 0; i < facets.length; i++) {
      f = facets[i];
      if (f[0] === 'g' ? !o.g.length : !o[f[0]]) continue;
      o2 = withNf(o, f[0], f[0] === 'g' ? [] : '');
      n = countNf(o2);
      if (n > 0) items.push({ tile: 'col', act: 'nf', nf: buildNf(o2), title: 'Без «' + f[1] + '»', sub: '→ ' + fmtInt(n), color: 9 });
    }
    o2 = emptyNf(); o2.s = o.s;
    items.push({ tile: 'col', act: 'nf', nf: buildNf(o2), title: 'Сбросить всё', sub: 'вид «Мир»', color: 8 });
    return tileRow('Ничего не нашлось · ослабьте подбор', items);
  }

  // План экрана по режиму: первый показ и пачки для comp.next (need — какие файлы ждать).
  function planScreen(o) {
    var mode = nfMode(o), files = ['index', 'global'], cfile = o.c ? ['country/' + o.c] : [];
    if (mode === 'world') return {
      need: [], first: worldRows1,
      next: [{ need: files, opt: ['country/RU'], build: worldRows2 }, { need: files, build: yearRows }]
    };
    if (mode === 'country') return {
      need: files.concat(cfile), first: countryRows1,
      next: [{ need: files.concat(cfile), build: countryRows2 }, { need: files.concat(cfile), build: yearRows }]
    };
    return { need: files.concat(cfile), first: pickRows1, next: [{ need: files.concat(cfile), build: pickRows2 }] };
  }

  // ======================= Плитки (cardClass) =======================
  // Контракт плиток multi-fan (multi-fan.js:465-491): корень selector layer--visible layer--render,
  // hover:focus → onFocus, событие visible → onVisible: иначе пульт не дойдёт до плиток, дорисованных позже.
  // Свой hover:enter: OK на плитке — подбор или экран, а не страница карточки.
  function makeTile(data) { return new Tile(data); }
  function Tile(data) {
    var self = this;
    this.data = data;
    this.create = function () {
      this.el = $(tileHtml(data));
      this.el[0].nf_tile = data;   // кнопка ▶ находит плитку «Отсчёт» в фокусе по DOM
      data.__tile = this;
      this.el.on('hover:focus', function () { if (self.onFocus) self.onFocus(self.render(true), data); });
      this.el.on('hover:enter', function () { tileEnter(data); });
      this.el.on('hover:long', function () { tileLong(data); });
      this.el.on('visible', function () { self.visible(); });
    };
    function loadImg() {
      var img = self.el.find('img')[0];
      self.imgDone = true; self.imgSrc = data.img;
      if (!img) return;
      $(img).removeClass('nf-tile__img--on');
      img.onload = function () { $(img).addClass('nf-tile__img--on'); };
      img.onerror = function () { img.onerror = null; };
      img.src = Lampa.Api.img(data.img, 'w300');
    }
    this.visible = function () {
      if (data.img && !self.imgDone && self.el && Lampa.Api && Lampa.Api.img) loadImg();
      if (self.onVisible) self.onVisible();
    };
    // Данные плитки переписаны на месте (фишка — число, год — подчёркивание, «Мои подборы» и страны при
    // возврате на «Мир» — подпись, код и постер): обновить её вид.
    this.update = function () {
      var el = this.el, sub;
      if (!el) return;
      if (data.tile === 'chip') { el.find('.nf-chip__value').text(data.value); return; }
      if (data.tile === 'year') { el.toggleClass('nf-chip--active', !!data.active); return; }
      el.find('.nf-tile__title').text(data.title || '');
      if (data.tile === 'country') el.find('.nf-tile__code').text(data.code || '');
      sub = el.find('.nf-tile__sub');
      if (!sub.length && data.sub) { el.append('<div class="nf-tile__sub"></div>'); sub = el.find('.nf-tile__sub'); }
      sub.text(data.sub || '');
      if (self.imgDone && data.img !== self.imgSrc) {
        if (data.img) loadImg();
        else { self.imgSrc = ''; el.find('img').removeClass('nf-tile__img--on'); }
      }
    };
    this.render = function (js) { return js ? (this.el && this.el[0]) : this.el; };
    this.destroy = function () { if (this.el) this.el.remove(); this.el = null; data.__tile = null; };
  }
  function tileHtml(d) {
    var cls = 'nf-tile selector layer--visible layer--render', sub = d.sub ? '<div class="nf-tile__sub">' + esc(d.sub) + '</div>' : '', col;
    if (d.tile === 'chip') {
      return '<div class="nf-chip selector layer--visible layer--render' + (d.active ? ' nf-chip--active' : '') + '">' +
        '<div class="nf-chip__label">' + esc(d.label) + '</div><div class="nf-chip__value">' + esc(d.value) + '</div></div>';
    }
    if (d.tile === 'year') {
      return '<div class="nf-chip nf-chip--year selector layer--visible layer--render' + (d.active ? ' nf-chip--active' : '') + '">' +
        '<div class="nf-chip__value">' + esc(d.value) + '</div><div class="nf-chip__label">' + esc(d.label) + '</div></div>';
    }
    if (d.tile === 'country') {
      return '<div class="' + cls + ' nf-tile--country"><img class="nf-tile__img" alt="" />' +
        '<div class="nf-tile__code">' + esc(d.code) + '</div><div class="nf-tile__title">' + esc(d.title) + '</div>' + sub + '</div>';
    }
    if (d.tile === 'tail') return '<div class="' + cls + ' nf-tile--tail' + (d.short ? ' nf-tile--tail-short' : '') + '"><div class="nf-tile__title">' + esc(d.title) + '</div>' + sub + '</div>';
    col = TILE_COLORS[(d.color || 0) % TILE_COLORS.length].split(',');
    return '<div class="' + cls + '" style="background:linear-gradient(135deg,' + col[0] + ',' + col[1] + ')"><div class="nf-tile__title">' + esc(d.title) + '</div>' + sub + '</div>';
  }
  // OK на плитке. exact — плитка «Мои подборы»: её подбор применяется как есть, без сортировки экрана.
  function tileEnter(d) {
    var cur = currentNf(), o2;
    if (d.act === 'chip') { openChip(d.key, cur, 'content'); return; }
    if (d.act === 'filters') { openChip('all', cur, 'content'); return; }
    if (d.act === 'nf') { o2 = parseNf(d.nf); if (!d.exact && !o2.s && cur.s) o2.s = cur.s; applyNf(o2); return; }
    if (d.act === 'country') { o2 = emptyNf(); o2.s = cur.s; o2.c = d.code; applyNf(o2); return; }
    if (d.act === 'chartMenu') { openChip('c', cur, 'content'); return; }
    if (d.act === 'weeks') { openWeeks(cur, d.W); return; }
    if (d.act === 'wyear') { Lampa.Activity.replace({ nf_w: String(d.W), nf_focus: '' }); return; }   // §5.6: плитка года
    if (d.act === 'hall') { openHall(cur); return; }
    if (d.act === 'grid') { openGrid(cur, d.list, d.gtitle); return; }
    if (d.act === 'random') { randomHit(); return; }
    if (d.act === 'countdown') countdown(d.W, d.kind);
  }
  // «Случайный хит» в конце ряда результата: тайтл подбора наугад, вес — корень популярности (очки),
  // чтобы выпадали не только три главных хита; тот же тайтл два раза подряд не выпадает, заглушки без
  // TMDB (ни трейлера, ни страницы) — только если других нет. Есть ключи трейлера — трейлер, нет —
  // страница тайтла. Следующее OK — новый бросок.
  var RANDOM_LAST = -1;
  function randomHit() {
    var o = currentNf(), ctx = sortCtx(o), list = resultTitles(o), w = [], sum = 0, ids = false, i, r, T;
    if (!list.length) return;
    for (i = 0; i < list.length && !ids; i++) ids = !!list[i].id;
    for (i = 0; i < list.length; i++) {
      w.push((list.length > 1 && list[i].n === RANDOM_LAST) || (ids && !list[i].id) ? 0 : Math.sqrt(Math.max(1, sortVal(list[i], 'pop', ctx))));
      sum += w[i];
    }
    if (!sum) { w[0] = sum = 1; }
    r = Math.random() * sum;
    for (i = 0; i < list.length - 1 && (r >= w[i] || !w[i]); i++) r -= w[i];
    T = list[i];
    RANDOM_LAST = T.n;
    if (trailerList(T, '').length) playTrailer(T, '');
    else openTitle(titleCard(T, ctx));
  }
  // Долгое OK на фишке сбрасывает её фасет (§6.1).
  function tileLong(d) {
    var cur, o2;
    if (d.act !== 'chip') return;
    cur = currentNf(); o2 = copyNf(cur);
    if (d.key === 'c') o2.c = '';
    else if (d.key === 't') { o2.t = ''; o2.lv = ''; }
    else if (d.key === 'g') { o2.g = []; o2.gm = ''; }
    else if (d.key === 'o') o2.o = '';
    else if (d.key === 'pr') { o2.p = ''; o2.r = ''; }
    else return;
    if (buildNf(o2) !== buildNf(cur)) applyNf(o2);
  }

  // ======================= Метки на карточках (§7) =======================
  function metaHtml(nf) {
    var m;
    if (nf.mv === 'new') return '<div class="nf-meta nf-meta--new">НОВОЕ</div>';
    if (nf.mv === 'back') return '<div class="nf-meta nf-meta--back">ВОЗВРАТ</div>';
    if (nf.mv && (m = /^([ud])(\d+)$/.exec(nf.mv))) return '<div class="nf-meta nf-meta--' + (m[1] === 'u' ? 'up' : 'down') + '"><i></i>' + m[2] + '</div>';
    if (nf.meta) return '<div class="nf-meta">' + esc(nf.meta) + '</div>';
    return '';
  }
  // Место, движение или бейдж, подпись сезона, строка под названием. HTML — только через jQuery:
  // Lampa переопределяет Element.append. В рядах зовётся по событию line, в сетке (B3) — из cardRender.
  function decorateCard(el, nf) {
    var view, ty, age, html;
    if (!el || !el.find || !nf || el.hasClass('nf-dec')) return;
    el.addClass('nf-dec');
    view = el.find('.card__view');
    if (nf.rank) {
      view.append('<div class="nf-rank' + (nf.rank === 1 ? ' nf-rank--1' : '') + '">' + nf.rank + '</div>');
      el.addClass(nf.rank >= 10 ? 'nf-card--r10' : 'nf-card--r');
    }
    html = metaHtml(nf);
    if (html) view.append(html);
    if (nf.tp) {
      ty = el.find('.card__type');
      if (ty.length) ty.text(nf.tp); else view.append('<div class="card__type">' + esc(nf.tp) + '</div>');
    }
    if (nf.age) {
      age = el.find('.card__age');
      if (!age.length) { el.append('<div class="card__age"></div>'); age = el.find('.card__age'); }
      age.text(nf.age);
    }
  }
  function registerBadges() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('line', function (e) {
      var i, item;
      if (!e || (e.type !== 'append' && e.type !== 'visible') || !e.data || !e.data.nf_row || !e.items) return;
      for (i = 0; i < e.items.length; i++) {
        item = e.items[i];
        if (item && item.data && item.data.nf && item.render) decorateCard(item.render(), item.data.nf);
      }
    });
  }
  // Строка фокуса в шапке (§7): «Dead-End Job · №1 сериалов не на англ. · 2-я нед. · 8,7 млн просм. ·
  // 44,4 млн ч · №1 в 22 странах · в топе 76 · трейлер: англ.». Активность вернёт свой заголовок при старте.
  function focusLine(card, object) {
    var nf = card && card.nf, T, parts, lab, cs;
    if (!Lampa.Head || !Lampa.Head.title) return;
    if (!nf) { Lampa.Head.title(object.title || MENU_TITLE); return; }
    T = D.T[nf.n];
    if (!T) return;
    lab = seasonLong(slabel(nf.sid));
    parts = [titleName(T) + (lab ? ' · ' + lab : '')];
    if (nf.rec || nf.hk) parts.push(HALL_T[nf.rec || nf.hk].title + ': ' + nf.meta);
    if (nf.pl && nf.cat != null) parts.push('№' + nf.pl + ' ' + LIST_GEN[nf.cat]);
    if (nf.cpl && nf.cc) parts.push('№' + nf.cpl + ' ' + countryPrep(nf.cc));
    if (nf.cw) parts.push(nf.cw + '-я нед.');
    if (nf.v) parts.push(viewsLabel(nf.v));
    if (nf.h) parts.push(hoursLabel(nf.h));
    if (!nf.pl && !nf.cpl && T.gw) parts.push('в мировом топе ' + T.gw + ' нед.' + (T.gb ? ' · лучшее №' + T.gb : ''));
    cs = nowCountries(T.n);
    if (cs.one) parts.push('№1 в ' + cs.one + ' ' + plural(cs.one, 'стране', 'странах', 'странах'));
    if (cs.top) parts.push('в топе ' + cs.top);
    lab = trailerNote(T);
    if (lab) parts.push(lab);
    Lampa.Head.title(parts.join(' · '));
  }
  function trailerNote(T) {
    if (T.tr === '') return 'трейлера нет';
    if (!T.tr) return '';
    return /(^| )ru:/.test(T.tr) ? 'трейлер: рус.' : 'трейлер: англ.';
  }
  // OK на карточке в ряду: плитка-рекорд — сетка списка Зала славы, остальное — страница тайтла.
  function cardSelect(card) {
    var nf = card && card.nf;
    if (!card) return;
    if (nf && nf.rec && hasScreen('netflix_grid')) { openGrid(currentNf(), 'hall:' + nf.rec); return; }
    openTitle(card);
  }
  // Страница TMDB; заглушка без id — поиск Lampa по английскому названию (§7).
  function openTitle(card) {
    var nf = card.nf, T;
    if (!card.id) {
      T = nf ? D.T[nf.n] : null;
      searchTitle(T ? T.t : (card.original_title || card.original_name || card.title || card.name));
      return;
    }
    Lampa.Activity.push({ url: card.url, component: 'full', id: card.id, method: card.name ? 'tv' : 'movie', card: card, source: card.source || 'tmdb' });
  }
  function searchTitle(text) {
    if (Lampa.Search && Lampa.Search.open) Lampa.Search.open({ input: text });
    else noty('Нет карточки TMDB: ' + text);
  }
  // Меню долгого OK (interaction/card.js:448, 474; §8.3): сверху трейлеры, «Netflix: путь в чартах»,
  // «Похожие в топе», у карточки недели — «Открыть неделю …», разделитель, дальше меню Lampa.
  // У заглушки без id меню Lampa (закладки, лайки) бессмысленно: вместо него — поиск.
  function cardMenuShow(menu, el, data) {
    var nf = data && data.nf, T = nf ? D.T[nf.n] : null, a = activeObj(), top, i;
    if (!T) return;
    if (!data.id) menu.splice(0, menu.length, { title: 'Найти в Lampa', subtitle: 'нет карточки TMDB', nf_act: 'search' });
    top = trailerItems(T);
    top.push({ title: 'Netflix: путь в чартах', subtitle: T.gw ? T.gw + ' нед. в мировом топе' : 'только чарты стран', nf_act: 'dossier' });
    if (similarSpec(T)) top.push({ title: 'Похожие в топе', nf_act: 'similar' });
    if (nf.wk != null && nf.wk >= 0 && !(a && a.component === 'netflix_weeks')) top.push({ title: 'Открыть неделю ' + weekLabel(nf.wk, { short: true }), nf_act: 'week', w: nf.wk });
    top.push({ title: '', separator: true });
    for (i = top.length - 1; i >= 0; i--) menu.unshift(top[i]);
  }
  function cardMenuSelect(a, el, data) {
    var nf, T;
    if (!a || !a.nf_act) return;
    nf = (data && data.nf) || {};
    T = D.T[nf.n];
    // Карточка сразу после выбора отдаёт пульт себе (card.js:476) — действие после неё.
    setTimeout(function () {
      if (a.nf_act === 'search') { openTitle(data); return; }
      if (!T) return;
      if (a.nf_act === 'dossier') showDossier(T);
      else if (a.nf_act === 'similar') openSimilar(T);
      // Неделя ряда — в чарте экрана; рекорды Зала славы считаются по миру.
      else if (a.nf_act === 'week') openWeeks(nf.rec || nf.hk ? withNf(currentNf(), 'c', '') : currentNf(), a.w, nf.n);
      else if (a.nf_act === 'trailer') playTrailer(T, a.lang);
    }, 0);
  }
  function cardEvents() { return { onMenuShow: cardMenuShow, onMenuSelect: cardMenuSelect }; }

  // ======================= Меню фишек (§6.2) и сводное меню (§6.3) =======================
  // cfg: {from: 'content' | 'head', back(), pick(o2)}. У фишки pick сразу применяет подбор (§4.6),
  // у сводного меню — возвращает в него с изменённым черновиком, без пересборки экрана.
  function currentNf() { var a = activeObj(); return parseNf(a && /^netflix/.test(a.component || '') ? a.nf : ''); }
  // Живой счётчик в подписи: «Сериалы · 1 305». Ноль — приглушён и не нажимается (текущее значение — всегда).
  function liveItem(item, o2, isCur) {
    var n = countNf(o2);
    item.subtitle = (item.subtitle ? item.subtitle + ' · ' : '') + fmtInt(n);
    if (!n && !isCur) { item.ghost = true; item.noenter = true; }
    return item;
  }
  // §4.1: «ещё N без данных TMDB» — тайтлы, которые скроет любой жанр, «Откуда» или год выхода.
  function pushNoTmdb(items, o) {
    var o2 = copyNf(o), list, n = 0, i;
    o2.g = []; o2.gm = ''; o2.o = ''; o2.r = '';
    list = resultTitles(o2);
    for (i = 0; i < list.length; i++) if (!list[i].id) n++;
    if (n) items.push({ title: 'ещё ' + fmtInt(n) + ' без данных TMDB', subtitle: 'с этим фильтром они скрыты', ghost: true, noenter: true });
  }
  function chipCfg(cur, from) {
    return {
      from: from,
      back: function () { Lampa.Controller.toggle(from); },
      pick: function (o2) { if (buildNf(o2) === buildNf(cur)) Lampa.Controller.toggle(from); else applyNf(o2, { from: from }); }
    };
  }
  // OK на фишке: меню открывается, когда индекс (и файл страны) в памяти (§9, очередь ожидания).
  function openChip(key, cur, from) {
    var files = ['index', 'global'].concat(cur.c ? ['country/' + cur.c] : []);
    ensure(files, function () {
      var cfg = chipCfg(cur, from);
      if (key === 'all') showSummary(copyNf(cur), cur, from, '');
      else if (key === 'pr') showYearMenu(cur, cfg, true, true);
      else facetMenu(key, cur, cfg);
    }, { from: from });
  }
  function facetMenu(key, o, cfg) {
    if (key === 'c') showChartMenu(o, cfg);
    else if (key === 't') showTypeMenu(o, cfg);
    else if (key === 'g') showGenreMenu(o, cfg);
    else if (key === 'o') showOriginMenu(o, cfg);
    else if (key === 'p') showYearMenu(o, cfg, true, false);
    else if (key === 'r') showYearMenu(o, cfg, false, true);
    else if (key === 's') showSortMenu(o, cfg);
  }

  // «Чарт»: Весь мир · Недавние · Часто · регионы ›. Подпись страны — её №1 сериал этой недели.
  function countrySub(code) {
    var list, T, r;
    if (code === 'RU') { r = chartRange('RU'); return 'чарт до ' + weekDots(r ? r[1] : 34); }
    list = D.home && D.home.c[code];
    T = list && list[1] && list[1].length ? D.T[owner(list[1][0])] : null;
    return T ? 'сейчас №1: ' + titleName(T) : '';
  }
  function showChartMenu(o, cfg) {
    var items = [{ title: 'Весь мир', subtitle: '4 списка, часы и просмотры', cc: '', selected: !o.c }], recent = recentCountries(), i;
    function country(code) { items.push({ title: countryName(code), subtitle: countrySub(code), cc: code, selected: code === o.c }); }
    if (recent.length) { items.push({ title: 'Недавние', separator: true }); for (i = 0; i < recent.length; i++) country(recent[i]); }
    items.push({ title: 'Часто', separator: true });
    for (i = 0; i < FREQUENT.length; i++) country(FREQUENT[i]);
    items.push({ title: 'Все страны', separator: true });
    for (i = 0; i < REGIONS.length; i++) items.push({ title: REGIONS[i].title + ' ›', region: i });
    Lampa.Select.show({
      title: 'Чарт', items: items,
      onSelect: function (a) { if (a.region != null) showRegionMenu(REGIONS[a.region], o, cfg); else pickCountry(a.cc, o, cfg); },
      onBack: cfg.back
    });
  }
  // Подменю региона возвращается в «Чарт» через onBack (приём content_filter/menu.js:242-253).
  function showRegionMenu(R, o, cfg) {
    var items = [], i;
    for (i = 0; i < R.codes.length; i++) items.push({ title: countryName(R.codes[i]), subtitle: countrySub(R.codes[i]), cc: R.codes[i], selected: R.codes[i] === o.c });
    Lampa.Select.show({
      title: R.title, items: items,
      onSelect: function (a) { pickCountry(a.cc, o, cfg); },
      onBack: function () { showChartMenu(o, cfg); }
    });
  }
  // Страна: файл грузится под индикатором; ошибка — Noty «Не удалось загрузить чарт: …», подбор прежний.
  function pickCountry(code, o, cfg) {
    var o2 = withNf(o, 'c', code || '');
    if (!code) { cfg.pick(o2); return; }
    ensure(['index', 'global', 'country/' + code], function () { addRecent(code); cfg.pick(o2); }, { fail: cfg.back });
  }
  // «Тип»: всё · фильмы · сериалы · «Списки Netflix» · галочка «Включать прямые эфиры».
  function showTypeMenu(o, cfg) {
    var items = [], lv = o.lv, i, tp, cur;
    for (i = 0; i < TYPES.length; i++) {
      tp = TYPES[i]; cur = (o.t || '') === tp.key;
      if (tp.key === 'fe') items.push({ title: 'Списки Netflix', separator: true });
      items.push(liveItem({ title: tp.title, tv: tp.key, selected: cur }, withNf(o, 't', tp.key), cur));
    }
    items.push({ title: '', separator: true });
    items.push({ title: 'Включать прямые эфиры', subtitle: 'WWE, бокс, NFL — в списках тайтлов', checkbox: true, checked: !!o.lv, lvbox: true });
    Lampa.Select.show({
      title: 'Тип', items: items,
      onSelect: function (a) { var o2 = withNf(o, 't', a.tv); o2.lv = lv; cfg.pick(o2); },
      onCheck: function (a) { if (a.lvbox) lv = a.checked ? '1' : ''; },
      onBack: function () { if (lv !== o.lv) cfg.pick(withNf(o, 'lv', lv)); else cfg.back(); }
    });
  }
  // «Жанр»: галочки копятся, меню не закрывается (select.js:113-121); «Готово» или «Назад» применяют.
  function showGenreMenu(o, cfg) {
    var sel = o.g.slice(), gm = o.gm, items = [{ title: 'Готово', done: true }], i, G, n, on, o2;
    items.push({ title: 'Нужны все отмеченные', subtitle: 'иначе — любой из отмеченных', checkbox: true, checked: gm === 'and', gmbox: true });
    items.push({ title: 'Жанры', separator: true });
    for (i = 0; i < GENRES.length; i++) {
      G = GENRES[i]; on = sel.indexOf(G.key) >= 0;
      o2 = withNf(o, 'g', [G.key]); o2.gm = '';
      n = countNf(o2);
      items.push({ title: G.title, subtitle: (G.note ? G.note + ' · ' : '') + fmtInt(n), gkey: G.key, checkbox: true, checked: on, ghost: !n && !on, noenter: !n && !on });
    }
    pushNoTmdb(items, o);
    function finish() {
      var o3 = withNf(o, 'g', sel);
      o3.gm = sel.length ? gm : '';
      if (buildNf(o3) === buildNf(o)) cfg.back(); else cfg.pick(o3);
    }
    Lampa.Select.show({
      title: 'Жанр', items: items,
      onSelect: function (a) { if (a.done) finish(); },
      onCheck: function (a) {
        var p;
        if (a.gmbox) { gm = a.checked ? 'and' : ''; return; }
        p = sel.indexOf(a.gkey);
        if (a.checked && p < 0) sel.push(a.gkey);
        if (!a.checked && p >= 0) sel.splice(p, 1);
      },
      onBack: finish
    });
  }
  // «Откуда»: любая · группы §4.3 · «Все страны производства ›».
  function showOriginMenu(o, cfg) {
    var items = [], i, O, cur;
    items.push(liveItem({ title: 'Любая страна', ov: '', selected: !o.o }, withNf(o, 'o', ''), !o.o));
    for (i = 0; i < ORIGINS.length; i++) {
      O = ORIGINS[i]; cur = o.o === O.key;
      items.push(liveItem({ title: O.title, ov: O.key, selected: cur }, withNf(o, 'o', O.key), cur));
    }
    items.push({ title: 'Все страны производства ›', all: true, subtitle: /^c:/.test(o.o) ? originText(o.o) : '', selected: /^c:/.test(o.o) });
    pushNoTmdb(items, o);
    Lampa.Select.show({
      title: 'Откуда', items: items,
      onSelect: function (a) { if (a.all) showOriginCountries(o, cfg); else cfg.pick(withNf(o, 'o', a.ov)); },
      onBack: cfg.back
    });
  }
  // Страны производства — по частоте oc в индексе.
  function showOriginCountries(o, cfg) {
    var freq = {}, codes = [], items = [], i, T, k;
    for (i = 0; i < D.index.list.length; i++) {
      T = D.T[D.index.list[i]];
      if (!T || !T.oc) continue;
      if (!freq[T.oc]) { freq[T.oc] = 0; codes.push(T.oc); }
      freq[T.oc]++;
    }
    codes.sort(function (a, b) { return freq[b] - freq[a]; });
    for (i = 0; i < codes.length; i++) { k = 'c:' + codes[i]; items.push(liveItem({ title: countryName(codes[i]), ov: k, selected: o.o === k }, withNf(o, 'o', k), o.o === k)); }
    if (!items.length) items.push({ title: 'Нет данных TMDB о странах производства', ghost: true, noenter: true });
    Lampa.Select.show({
      title: 'Все страны производства', items: items,
      onSelect: function (a) { if (a.ov) cfg.pick(withNf(o, 'o', a.ov)); },
      onBack: function () { showOriginMenu(o, cfg); }
    });
  }
  // «Год»: «Когда был в топе» (p) и «Год выхода» (r); в сводном меню — по отдельности.
  function showYearMenu(o, cfg, withP, withR) {
    var items = [], r = chartRange(o.c), ys = years(), cur = o.p || '', curW = /^w\d+$/.test(cur) ? +cur.slice(1) : -1, i, Y, yr, n, isCur;
    if (withP) {
      if (withR) items.push({ title: 'Когда был в топе', separator: true });
      items.push(liveItem({ title: 'Всё время', pv: '', selected: !cur }, withNf(o, 'p', ''), !cur));
      items.push(liveItem({ title: 'Эта неделя', subtitle: r ? weekLabel(r[1], { noYear: r[1] === lastW() }) : '', pv: 'w', selected: cur === 'w' }, withNf(o, 'p', 'w'), cur === 'w'));
      items.push({ title: 'Выбрать неделю…', subtitle: curW >= 0 ? weekLabel(curW, { short: true }) : '', week: true, selected: curW >= 0 });
      for (i = ys.length - 1; i >= 0; i--) {
        Y = ys[i]; yr = yearInChart(Y, o.c); isCur = cur === 'y' + Y;
        if (!yr) { items.push({ title: String(Y), subtitle: o.c === 'RU' ? NO_RU : 'нет данных', ghost: true, noenter: true }); continue; }
        n = yr[1] - yr[0] + 1;
        items.push(liveItem({ title: String(Y), subtitle: yr[0] === 0 ? 'с июля' : n + ' ' + plural(n, 'неделя', 'недели', 'недель'), pv: 'y' + Y, selected: isCur }, withNf(o, 'p', 'y' + Y), isCur));
      }
    }
    if (withR) {
      if (withP) items.push({ title: 'Год выхода', separator: true });
      for (i = 0; i < RELEASES.length; i++) {
        isCur = (o.r || '') === RELEASES[i].key;
        items.push(liveItem({ title: RELEASES[i].title, rv: RELEASES[i].key, selected: isCur }, withNf(o, 'r', RELEASES[i].key), isCur));
      }
      pushNoTmdb(items, o);
    }
    Lampa.Select.show({
      title: withP && withR ? 'Год' : withP ? 'Год в топе' : 'Год выхода', items: items,
      onSelect: function (a) {
        if (a.week) showWeekPicker(o, curW >= 0 ? curW : (r ? r[1] : 0), { from: cfg.from, back: function () { showYearMenu(o, cfg, withP, withR); }, pick: cfg.pick });
        else if (a.pv !== undefined) cfg.pick(withNf(o, 'p', a.pv));
        else if (a.rv !== undefined) cfg.pick(withNf(o, 'r', a.rv));
      },
      onBack: cfg.back
    });
  }
  // Выбор недели (§6.2): «Год: 2026 ›», «Год назад · 3–9 нояб. 2025», недели года с подписью-№1.
  // Фокус — на текущей неделе (selected); ↑ с неё — «Год назад».
  function showWeekPicker(o, W, cfg) {
    var r = chartRange(o.c), items = [], Y, yr, w, cap;
    if (!r) { cfg.back(); return; }
    W = Math.max(r[0], Math.min(r[1], W));
    Y = weekYear(W); yr = yearInChart(Y, o.c);
    items.push({ title: 'Год: ' + Y + ' ›', year: true });
    if (W - 52 >= r[0]) items.push({ title: 'Год назад', subtitle: weekLabel(W - 52, { short: true }), w: W - 52 });
    // Неделя, которой ещё нет, в списке не пункт, а подпись: разделитель фокус не получает.
    cap = yr[1] === lastW() && r[1] === lastW() ? weekLabel(yr[1] + 1, { noYear: true }) + ' — выйдет после обновления во вторник' : 'Недели ' + Y;
    items.push({ title: cap, separator: true });
    for (w = yr[1]; w >= yr[0]; w--) items.push({ title: weekLabel(w, { noYear: true }), subtitle: weekLeader(w, o.c), w: w, selected: w === W });
    Lampa.Select.show({
      title: 'Неделя · ' + (o.c ? countryName(o.c) : 'мир'), items: items,
      onSelect: function (a) { if (a.year) showYearPick(o, W, cfg); else if (a.w != null) cfg.pick(withNf(o, 'p', 'w' + a.w)); },
      onBack: cfg.back
    });
  }
  // Годы с подписью «45 недель · KPop Demon Hunters» (лидер года по очкам). После выбора — снова
  // недели, отмечена та же неделя года.
  function showYearPick(o, W, cfg) {
    var ys = years(), items = [], i, Y, yr, n, lead;
    for (i = ys.length - 1; i >= 0; i--) {
      Y = ys[i]; yr = yearInChart(Y, o.c);
      if (!yr) continue;
      n = yr[1] - yr[0] + 1; lead = yearLeader(Y, o.c);
      items.push({ title: String(Y), subtitle: n + ' ' + plural(n, 'неделя', 'недели', 'недель') + (yr[0] === 0 ? ', с июля' : '') + (lead ? ' · ' + lead : ''), y: Y, selected: Y === weekYear(W) });
    }
    Lampa.Select.show({
      title: 'Год', items: items,
      onSelect: function (a) {
        var yr2 = yearInChart(a.y, o.c), w2 = W + 52 * (a.y - weekYear(W));
        showWeekPicker(o, Math.max(yr2[0], Math.min(yr2[1], w2)), cfg);
      },
      onBack: function () { showWeekPicker(o, W, cfg); }
    });
  }
  function yearLeader(Y, c) {
    var o2 = emptyNf(), ctx, best = null, bv = 0, i, T, v;
    o2.c = c || ''; o2.p = 'y' + Y;
    ctx = sortCtx(o2, 'pop');
    for (i = 0; i < ctx.A.list.length; i++) {
      T = D.T[ctx.A.list[i]];
      v = T ? sortVal(T, 'pop', ctx) : 0;
      if (v > bv) { bv = v; best = T; }
    }
    return best ? titleName(best) : '';
  }
  // Сортировка: недоступные приглушены, в подписи — причина (§4.5).
  function showSortMenu(o, cfg) {
    var cur = effSort(o), items = [], i, S, why;
    for (i = 0; i < SORTS.length; i++) {
      S = SORTS[i]; why = sortAvail(S.key, o);
      items.push({ title: S.title, subtitle: why, sk: S.key, selected: S.key === cur, ghost: !!why, noenter: !!why });
    }
    Lampa.Select.show({
      title: 'Сортировка', items: items,
      onSelect: function (a) { cfg.pick(withNf(o, 's', a.sk === 'pop' ? '' : a.sk)); },
      onBack: cfg.back
    });
  }
  // Сводное меню «Фильтры» (§6.3): подбор копится без пересборки; «Показать N» или «Назад» применяют.
  // Только что изменённый раздел — selected: фокус возвращается на него, а не на «Показать».
  function showSummary(draft, orig, from, changed) {
    var n = countNf(draft), showEl = null, items;
    function sec(key, title, value) { return { title: title, subtitle: value, sec: key, selected: changed === key }; }
    items = [
      { title: 'Показать ' + fmtInt(n), show: true, ghost: !n, noenter: !n },
      sec('c', 'Чарт', draft.c ? countryName(draft.c) : 'весь мир'),
      sec('t', 'Тип', draft.t ? TYPE[draft.t].title : 'фильмы и сериалы'),
      sec('g', 'Жанр', genreText(draft) || 'любой'),
      sec('o', 'Откуда', originText(draft.o) || 'любая'),
      sec('p', 'Год в топе', periodText(draft) || 'всё время'),
      sec('r', 'Год выхода', draft.r ? RELEASE[draft.r].title : 'любой'),
      sec('s', 'Сортировка', SORT[effSort(draft)].title.toLowerCase()),
      { title: 'Прямые эфиры', subtitle: 'WWE, бокс, NFL в списках тайтлов', checkbox: true, checked: !!draft.lv, lvbox: true },
      { title: '', separator: true },
      { title: 'Сбросить всё', reset: true }
    ];
    Lampa.Select.show({
      title: 'Подбор · найдено ' + fmtInt(n), items: items,
      onDraw: function (item, el) { if (el.show) showEl = item; },
      onSelect: function (a) {
        var o2;
        if (a.show) {
          if (countNf(draft)) applyNf(draft, { from: from });
          else { noty('0 результатов — подбор не изменён'); showSummary(draft, orig, from, ''); }
          return;
        }
        if (a.reset) { o2 = emptyNf(); o2.s = draft.s; applyNf(o2, { from: from }); return; }
        facetMenu(a.sec, draft, {
          from: from,
          back: function () { showSummary(draft, orig, from, a.sec); },
          pick: function (o3) { showSummary(o3, orig, from, a.sec); }
        });
      },
      onCheck: function (a) {
        var k;
        if (!a.lvbox) return;
        draft.lv = a.checked ? '1' : '';
        k = fmtInt(countNf(draft));
        if (showEl) showEl.find('.selectbox-item__title').text('Показать ' + k);
        try { Lampa.Select.render().find('.selectbox__title').text('Подбор · найдено ' + k); } catch (e) {}
      },
      onBack: function () {
        if (buildNf(draft) === buildNf(orig)) { Lampa.Controller.toggle(from); return; }
        if (!countNf(draft)) { noty('0 результатов — подбор не изменён'); Lampa.Controller.toggle(from); return; }
        applyNf(draft, { from: from });
      }
    });
  }

  // ======================= Применение подбора (§4.6) =======================
  function recentCountries() {
    var a = storageGet('netflix_cc_recent', '[]'), out = [], i;
    if (Object.prototype.toString.call(a) !== '[object Array]') return out;
    for (i = 0; i < a.length && out.length < 3; i++) if (COUNTRY[a[i]]) out.push(a[i]);
    return out;
  }
  function addRecent(code) {
    var a = recentCountries(), i = a.indexOf(code);
    if (i >= 0) a.splice(i, 1);
    a.unshift(code);
    storageSet('netflix_cc_recent', a.slice(0, 3));
  }
  function remember(o, canon, mode) {
    if (mode !== 'world') storageSet('netflix_filter', canon);
    storageSet('netflix_sort', o.s || '');
    if (o.c) addRecent(o.c);
  }
  function loaderOn(act, on) { try { if (act && act.activity) act.activity.loader(on); } catch (e) {} }
  // Действию нужны файлы: сразу, если всё в памяти; иначе ждём до 20 с (§9). Файл страны — под
  // индикатором активности, индекс — с Noty «Загружаю каталог Netflix…». Действует последнее нажатие
  // и только на той же активности.
  var PENDING = 0;
  function ensure(files, go, opts) {
    var token, act, country = '', i;
    for (i = 0; i < files.length; i++) if (files[i].indexOf('country/') === 0) country = files[i].slice(8);
    if (loaded(files)) { go(); return; }
    token = ++PENDING; act = activeObj();
    if (country && D.files.index && D.files.global) loaderOn(act, true);
    else noty('Загружаю каталог Netflix…');
    waitFor(files, WAIT_MAX, function () {
      loaderOn(act, false);
      if (token !== PENDING || activeObj() !== act) return;
      go();
    }, function (code) {
      loaderOn(act, false);
      if (token !== PENDING) return;
      if (country && D.err['country/' + country]) noty('Не удалось загрузить чарт: ' + countryName(country));
      else noty('Каталог не загрузился' + codeNote(code));
      if (opts && opts.fail) opts.fail();
      else if (activeObj() === act) Lampa.Controller.toggle((opts && opts.from) || 'content');
    });
  }
  // Из «Мира» — push («Назад» вернёт к нему), из любого другого вида — replace, чтобы «Назад» не ходил
  // по каждому щелчку (multi-fan.js:500-509). Значок сортировки в шапке — всегда replace (dorama.js:631-645).
  function applyNf(o, opts) {
    var canon = buildNf(o), mode = nfMode(o), files = mode === 'world' ? [] : ['index', 'global'];
    if (o.c) files.push('country/' + o.c);
    ensure(files, function () {
      var cur = activeObj(), obj = { url: '', title: nfTitle(o), component: 'netflix', source: 'tmdb', page: 1, nf: canon }, all, prev;
      remember(o, canon, mode);
      // Сетка, История топа и Зал славы: подбор и сортировка в шапке перестраивают сам этот экран (§5.5–5.7).
      if (cur && /^netflix_/.test(cur.component || '')) {
        if ((cur.nf || '') === canon) Lampa.Controller.toggle((opts && opts.from) || 'content');
        else Lampa.Activity.replace({ title: screenTitle(cur, o), nf: canon });
        return;
      }
      if (!cur || cur.component !== 'netflix') { Lampa.Activity.push(obj); return; }
      if ((cur.nf || '') === canon) { Lampa.Controller.toggle((opts && opts.from) || 'content'); return; }
      if (nfMode(parseNf(cur.nf)) === 'world' && !(opts && opts.replace)) { Lampa.Activity.push(obj); return; }
      // Подбор → «Мир», который уже лежит под ним, — шаг назад, а не второй «Мир» в стеке.
      if (mode === 'world') {
        all = Lampa.Activity.all ? Lampa.Activity.all() : null;
        prev = all && all.length > 1 ? all[all.length - 2] : null;
        if (prev && prev.component === 'netflix' && (prev.nf || '') === canon && Lampa.Activity.backward) { Lampa.Activity.backward(); return; }
      }
      Lampa.Activity.replace(obj);
    }, opts);
  }

  // ======================= Экраны =======================
  // Экраны регистрируются через registerScreen(): пока экрана нет, ведущие к нему плитки не рисуются,
  // а «Ещё» в рядах выключено.
  var SCREENS = {};
  function registerScreen(name, factory) { Lampa.Component.add(name, factory); SCREENS[name] = true; }
  function hasScreen(name) { return !!SCREENS[name]; }
  // Сетка «Ещё» (§5.5): список строится заново по nf и nf_list, заголовок — по ним же.
  function openGrid(o, list, title) {
    if (!hasScreen('netflix_grid')) return;
    Lampa.Activity.push({ url: '', title: gridTitle(o, list) || title || MENU_TITLE, component: 'netflix_grid', source: 'tmdb', page: 1, nf: buildNf(o), nf_list: list });
  }
  // История топа (§5.6) на неделе W; без W — последняя неделя чарта. focusN — тайтл, чья карточка недели
  // получит фокус (неделя открыта из досье или меню карточки).
  function openWeeks(o, W, focusN) {
    var r = chartRange(o.c);
    if (!hasScreen('netflix_weeks')) return;
    Lampa.Activity.push({ url: '', title: weeksTitle(o), component: 'netflix_weeks', source: 'tmdb', page: 1,
      nf: buildNf(o), nf_w: String(W >= 0 ? W : (r ? r[1] : lastW())), nf_focus: focusN != null ? String(focusN) : '' });
  }
  // Зал славы (§5.7).
  function openHall(o) {
    if (!hasScreen('netflix_hall')) return;
    Lampa.Activity.push({ url: '', title: hallTitle(o), component: 'netflix_hall', source: 'tmdb', page: 1, nf: buildNf(o) });
  }
  // Заголовок своего экрана после смены подбора на нём самом.
  function screenTitle(cur, o) {
    if (cur.component === 'netflix_grid') return gridTitle(o, String(cur.nf_list || '')) || cur.title;
    if (cur.component === 'netflix_weeks') return weeksTitle(o);
    if (cur.component === 'netflix_hall') return hallTitle(o);
    return nfTitle(o);
  }
  // Первый вход — однократная подсказка про ▶ (§5.1).
  function firstHint() {
    if (storageGet('netflix_hint', false)) return;
    storageSet('netflix_hint', true);
    noty('▶ на пульте — трейлер. Нет кнопки ▶ — долгое OK');
  }

  // ======================= Экран netflix (§5.2–5.4) =======================
  // Lampa.InteractionMain во всех трёх режимах. Пачка 1 — первый показ, пачки 2–3 — через comp.next,
  // когда прокрутка дошла до конца (main.js:49-65): ждут данные до 20 с, пустую пачку не отдают.
  var NOTED = { stale: false };
  function notices() {
    var days;
    if (D.offline && !D.offlineNoted) { D.offlineNoted = true; noty('Нет связи — данные на ' + dayLabel(D.man.v)); }
    days = Math.floor((Date.now() - parseDay(D.man.v)) / DAY);
    if (days > STALE_DAYS && !NOTED.stale) { NOTED.stale = true; noty('Чарты Netflix не обновлялись ' + days + ' ' + plural(days, 'день', 'дня', 'дней')); }
    firstHint();
  }
  // Плитка, переписанная на месте, и её прежнее содержимое: страна или подбор. Фокус — на плитку с тем же
  // содержимым; на полке «Мои подборы» без такой — на первую: там подбор, с которого вернулись.
  function tileKey(d) { return d.tile === 'country' ? 'c:' + d.code : d.act + ':' + (d.nf || ''); }
  function refocusTile(row, key) {
    var list = row ? row.results : [], i, k = -1, el;
    for (i = 0; i < list.length && k < 0; i++) if (list[i].__tile && tileKey(list[i]) === key) k = i;
    if (k < 0 && list[0] && list[0].nf_shelf) k = 0;
    el = k >= 0 && list[k].__tile ? list[k].__tile.render(true) : null;
    if (el) Lampa.Controller.collectionFocus(el, el.parentNode);
  }
  // Данные пришли, а зритель мог уже уйти с экрана или открыть поверх него поиск, настройки, Select.
  // Пульт экран берёт, только если он активен и пульт у его «content». Иначе build идёт тихо: без
  // activity.toggle (тот закрыл бы поиск: Controller.toggle('content') → toContent, controller.js),
  // а ряд получает фокус, когда экран снова стартует (comp.start).
  function ownsRemote(object) {
    var c = null;
    if (activeObj() !== object) return false;
    try { c = Lampa.Controller.enabled(); } catch (e) {}
    return !c || !c.name || c.name === 'content';
  }
  function buildQuiet(comp, object, rows) {
    var act = comp.activity;
    act.toggle = function () {};
    try { comp.build(rows); } finally { delete act.toggle; }
    // Экран активен под окном: окно, закрываясь, вернёт пульт в «content» — тогда экран и стартует.
    if (activeObj() === object) Lampa.Controller.add('content', { invisible: true, toggle: function () { comp.start(); }, back: function () { Lampa.Activity.backward(); } });
  }
  function componentNetflix(object) {
    var comp = new Lampa.InteractionMain(object), o = parseNf(object.nf), plan = planScreen(o), next = 0, dead = false, unsub = null, chips = null;
    var inherited = comp.destroy ? comp.destroy.bind(comp) : function () {}, started = comp.start.bind(comp);
    var built = false, pending = false, noteLater = false, failed = false, failNoted = false, shelf = null, ccRow = null, seen = null;

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      D.err = {};   // новый экран или «Обновить» — упавшие файлы пробуем заново
      if (nfMode(o) !== 'world') addFilterHist(buildNf(o));   // «Мои подборы» (§5.2.1)
      // Всегда через setTimeout: при данных в памяти boot отвечает сразу, а build и down() должны идти
      // после старта активности, как в multi-fan.
      setTimeout(function () {
        if (dead) return;
        boot(function (err) {
          if (dead) return;
          if (err) { self.nfState(err, ''); return; }
          waitFor(plan.need, WAIT_MAX, function () {
            var rows, i, own;
            if (dead) return;
            try { rows = plan.first(o); } catch (e) { log('build', e && e.stack); self.nfState('build', ''); return; }
            if (rows[0] && rows[0].line_type === 'nf-chips') chips = rows[0];
            for (i = 0; i < rows.length; i++) {
              if (rows[i].nf_shelf) shelf = rows[i];
              if (rows[i].nf_cc) ccRow = rows[i];
            }
            own = ownsRemote(object);
            if (own) {
              self.build(rows);
              if (self.down) self.down();   // фокус на ряд 1, как multi-fan.js:564
            } else { buildQuiet(self, object, rows); pending = true; }
            built = true;
            afterShow(own);
          }, function (code) { if (!dead) self.nfState(code, o.c); });
        });
      }, 0);
      return this.render();
    };
    // Старт экрана: первый, после тихой сборки или возврат «Назад». Тихо собранный экран ставит фокус на
    // ряд 1 только сейчас; «Мир» переписывает «Мои подборы» и недавние страны на месте, а фокус идёт
    // за плиткой, с которой ушли (выбранная страна теперь первая).
    comp.start = function () {
      var d = seen, keep = d && d.__tile && (d.tile === 'country' || d.nf_shelf) ? tileKey(d) : '';
      if (built && !dead) {
        if (shelf) refreshShelf(shelf);
        if (ccRow) refreshCountries(ccRow);
      }
      started();
      if (!built || dead) return;
      if (pending) { pending = false; if (comp.down) comp.down(); }
      if (keep && tileKey(d) !== keep) refocusTile(d.tile === 'country' ? ccRow : shelf, keep);
      if (noteLater) { noteLater = false; notices(); }
    };

    // Индекс и недели мира — тихо после первого показа (§10.1); уведомления — только на видимом экране.
    function afterShow(own) {
      need(['index', 'global'], function (err) { if (err) catalogFailed(err); });
      refreshChips();
      unsub = onData(function (file) { if (file === 'index' || file === 'country/' + o.c) refreshChips(); });
      if (own) notices(); else noteLater = true;
    }
    // Каталог не загрузился: фишка «Фильтры» — «!», одно уведомление на экран (§9), пачки 2–3 ждут
    // следующей прокрутки (повтор не чаще RETRY_AFTER).
    function catalogFailed(code) {
      if (dead) return;
      failed = true;
      refreshChips();
      if (failNoted || activeObj() !== object) return;
      failNoted = true;
      noty('Каталог не загрузился' + codeNote(code));
    }
    // Фишка «Фильтры» показывает «…», пока нет индекса, затем число результата; каталог не загрузился — «!».
    function refreshChips() {
      var d = chips && chips.results[0];
      if (!d || dead) return;
      if (!D.index || (o.c && !D.cty[o.c])) {
        if (failed && d.value !== '!') { d.value = '!'; if (d.__tile) d.__tile.update(); }
        return;
      }
      d.value = fmtInt(countNf(o));
      if (d.__tile) d.__tile.update();
    }

    comp.nfState = function (code, c) { screenEmpty(this, code, c); };

    comp.next = function (resolve, reject) {
      var b;
      if (dead || next >= plan.next.length) { reject(); return; }
      b = plan.next[next];
      waitFor(b.need, WAIT_MAX, function () {
        function go() {
          var rows = [];
          if (dead) { reject(); return; }
          next++;
          try { rows = b.build(o); } catch (e) { log('next', e && e.stack); }
          if (rows.length) resolve(rows); else comp.next(resolve, reject);
        }
        if (b.opt) need(b.opt, go); else go();
      }, function (code) { catalogFailed(code); reject(); });
    };

    // seen — последняя карточка или плитка в фокусе на этом экране.
    comp.onAppend = function (line, row) {
      var focus;
      rowEvents(line, row, object);
      focus = line.onFocus;
      line.onFocus = function (card) { seen = card; if (focus) focus(card); };
    };

    comp.destroy = function () {
      dead = true;
      if (unsub) unsub();
      inherited();
    };
    return comp;
  }

  // ======================= Общее для экранов =======================
  // Строка фокуса (§7) и OK на карточке ряда: страница TMDB, поиск для заглушки, сетка для плитки-рекорда.
  function rowEvents(line, row, object) {
    if (!row || !row.nf_row) return;
    line.onFocus = function (card) { noteFocus(card); focusLine(card, object); };
    line.onSelect = function (target, card) { cardSelect(card); };
  }
  // Последняя карточка или плитка в фокусе — запасной путь кнопки ▶, если класс focus не стоит
  // (Lampa ставит его только на ТВ, controller.js:396-403).
  var FOCUS = { data: null, act: null };
  function noteFocus(data) { FOCUS.data = data; FOCUS.act = activeObj(); }
  // Данные экрана: манифест и home, затем files (ждём до 20 с). done(0 | код ошибки).
  function loadScreen(files, done) {
    boot(function (err) {
      if (err) { done(err); return; }
      waitFor(files, WAIT_MAX, function () { fillStubs(countryStubs(files), STUB_WAIT, function () { done(0); }); }, done);
    });
  }
  // §9: своё пустое состояние, не comp.empty() (там кнопка CUB, main.js:21-48, category.js:30-56).
  // Empty в 3.4.6 сам добавляет «Обновить» с Activity.replace().
  function stateDescr(code, c) {
    if (code === 'schema') return 'Обновите плагин netflix.js: данные Netflix пришли в новом формате.';
    if (c && D.err['country/' + c]) return 'Не удалось загрузить чарт: ' + countryName(c) + codeNote(D.err['country/' + c].code) + '. Данные лежат на drshpackz.github.io — проверьте интернет.';
    if (code === 'build') return 'Не удалось собрать экран из данных Netflix. Попробуйте обновить.';
    if (code === 'empty') return 'Здесь пусто: подбор не оставил ни одной позиции. Ослабьте его значком «Фильтры» в шапке.';
    return 'Не удалось загрузить чарты' + codeNote(code) + '. Данные лежат на drshpackz.github.io — проверьте интернет.';
  }
  function screenEmpty(comp, code, c) {
    var empty = new Lampa.Empty({ title: MENU_TITLE, descr: stateDescr(code, c) });
    comp.render().append(empty.render(true));
    comp.start = empty.start.bind(empty);
    comp.activity.loader(false);
    comp.activity.toggle();
  }

  // ======================= Сетка «Ещё» — netflix_grid (§5.5) =======================
  // Lampa.InteractionCategory по образцу anime-collections.js:144-177. Весь список считается из данных
  // в памяти по nf и nf_list; страницы по 20 режутся из готового списка (category.js:58-80).
  // card_events сетка не применяет — меню, метки и OK ставит cardRender (category.js:141).
  function gridFiles(o, key) {
    var f = ['index', 'global'];
    if (o.c) f.push('country/' + o.c);
    if (key === 'ru' && o.c !== 'RU') f.push('country/RU');
    return f;
  }
  function componentGrid(object) {
    var comp = new Lampa.InteractionCategory(object), o = parseNf(object.nf), key = String(object.nf_list || ''), all = [], dead = false;
    var inherited = comp.destroy ? comp.destroy.bind(comp) : function () {};

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      D.err = {};
      setTimeout(function () {
        if (dead) return;
        loadScreen(gridFiles(o, key), function (err) {
          if (dead) return;
          if (err) { screenEmpty(self, err, key === 'ru' ? 'RU' : o.c); return; }
          try { all = gridCards(o, key); } catch (e) { log('grid', e && e.stack); all = null; }
          if (!all) { all = []; screenEmpty(self, 'build', ''); return; }
          if (!all.length) { screenEmpty(self, 'empty', ''); return; }
          // Пустой список build не получает: там встроенный empty() с кнопкой CUB.
          object.page = 1;
          self.build({ results: all.slice(0, ROW_MAX), total_pages: Math.ceil(all.length / ROW_MAX) });
          self.render().find('.category-full').addClass('mapping--grid cols--6');
          notices();
        });
      }, 0);
      return this.render();
    };
    comp.nextPageReuest = function (obj, resolve, reject) {
      var from = ((obj.page || 1) - 1) * ROW_MAX, part = all.slice(from, from + ROW_MAX);
      if (part.length) resolve({ results: part }); else reject();
    };
    comp.cardRender = function (obj, element, card) {
      var focus = card.onFocus;
      if (element.nf) decorateCard(card.render(), element.nf);
      card.onFocus = function (target, data) { if (focus) focus(target, data); noteFocus(data); focusLine(data, object); };
      card.onEnter = function (target, data) { openTitle(data); };
      card.onMenuShow = cardMenuShow;
      card.onMenuSelect = cardMenuSelect;
    };
    comp.destroy = function () { dead = true; inherited(); };
    return comp;
  }

  // ======================= История топа — netflix_weeks (§5.6) =======================
  // Лента недель назад: ряд 0 — плитки лет, дальше по два ряда на неделю (сериалы, фильмы). 4 недели
  // сразу, следующие 4 — через comp.next, до первой недели чарта. Недели без позиций пропускаются.
  var WEEKS_PACK = 4;
  function weeksTitle(o) { var fs = facetSummary(o); return 'История топа · ' + (o.c ? countryName(o.c) : 'Мир') + (fs ? ' · ' + fs : ''); }
  // Плитки лет; OK — Activity.replace на последнюю неделю года. У России — только 2022 и 2021. Подчёркнут
  // год недели W; когда ряд получает пульт, фокус встаёт на него (componentWeeks), а не на первую плитку.
  function weekYearsRow(o, W) {
    var ys = years(), items = [], i, yr, n;
    for (i = ys.length - 1; i >= 0; i--) {
      yr = yearInChart(ys[i], o.c);
      if (!yr) continue;
      n = yr[1] - yr[0] + 1;
      items.push({ tile: 'year', act: 'wyear', W: yr[1], value: String(ys[i]), active: ys[i] === weekYear(W),
        label: yr[0] === 0 ? 'с июля' : n + ' ' + plural(n, 'неделя', 'недели', 'недель') });
    }
    return tileRow('Годы · ' + (o.c ? countryName(o.c) : 'мир'), items, 'nf-chips');
  }
  function weekKindTitle(kind, o) { var tp = o.t ? TYPE[o.t] : null; return tp && tp.list !== undefined ? tp.title : kind ? 'Сериалы' : 'Фильмы'; }
  // Ряды недели W: мир — слитые десятки с движением или один список Netflix, страна — её два списка.
  // Подбор фильтрует позиции по тайтлу, настоящие номера остаются; хвост мирового ряда — «Все 40 →»:
  // из ряда фильмов — сетка wk<W>f, где фильмы первыми.
  function weekRows(o, W) {
    var rows = [], C = o.c ? D.cty[o.c] : null, kind, cards, n;
    for (kind = 1; kind >= 0; kind--) {
      cards = C ? countryTop(C, W, kind, o) : worldTop(W, kind, o);
      if (!cards.length) continue;
      if (!C && hasScreen('netflix_grid') && (n = weekAllCount(o, W)) > cards.length) cards.push(tailTile('Все ' + n + ' →', '', { act: 'grid', list: 'wk' + W + (kind ? '' : 'f') }));
      rows.push(cardRow(weekLabel(W) + ' · ' + weekKindTitle(kind, o), cards, { line_type: 'nf-top', nf_wk: W }));
    }
    return rows;
  }
  // Следующие недели от st.cur вниз до st.end: до WEEKS_PACK недель с позициями (не больше 8 рядов).
  function weeksPack(o, st) {
    var rows = [], got = 0, wr;
    while (st.cur >= st.end && got < WEEKS_PACK) {
      wr = weekRows(o, st.cur);
      st.cur--;
      if (wr.length) { got++; rows = rows.concat(wr); }
    }
    return rows;
  }
  function componentWeeks(object) {
    var comp = new Lampa.InteractionMain(object), o = parseNf(object.nf), st = { cur: -1, end: 0 }, dead = false;
    var inherited = comp.destroy ? comp.destroy.bind(comp) : function () {}, started = comp.start.bind(comp);
    var built = false, pending = false, noteLater = false, years = null, target = null;

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      D.err = {};
      setTimeout(function () {
        if (dead) return;
        loadScreen(['index', 'global'].concat(o.c ? ['country/' + o.c] : []), function (err) {
          var r, W, rows, own;
          if (dead) return;
          if (err) { screenEmpty(self, err, o.c); return; }
          try {
            r = chartRange(o.c);
            if (!r) { screenEmpty(self, 'build', ''); return; }
            W = parseInt(object.nf_w, 10);
            W = isNaN(W) ? r[1] : Math.max(r[0], Math.min(r[1], W));
            st.cur = W; st.end = r[0];
            years = weekYearsRow(o, W);
            rows = [years].concat(weeksPack(o, st));
            // Подбор не оставил ни одной позиции ни в одной неделе: подсказка вместо пустой ленты.
            if (rows.length === 1) rows.push(tileRow('Ни одной позиции под этот подбор', [{ tile: 'col', act: 'nf', nf: buildNf(withNf(emptyNf(), 'c', o.c)), title: 'Сбросить подбор', sub: o.c ? 'весь чарт: ' + countryName(o.c) : 'весь чарт мира', color: 8 }]));
            target = focusTarget(rows, parseInt(object.nf_focus, 10), W);
          } catch (e) { log('weeks', e && e.stack); screenEmpty(self, 'build', ''); return; }
          own = ownsRemote(object);
          if (own) self.build(rows); else buildQuiet(self, object, rows);
          built = true;
          if (own) { focusFirst(); notices(); } else { pending = true; noteLater = true; }
        });
      }, 0);
      return this.render();
    };
    // Тихо собранный экран (§9) ставит фокус, только когда снова стартует.
    comp.start = function () {
      started();
      if (!built || dead) return;
      if (pending) { pending = false; focusFirst(); }
      if (noteLater) { noteLater = false; notices(); }
    };
    // Неделя открыта из досье или меню карточки (nf_focus): карточка этого тайтла в ряду недели W,
    // иначе — первая неделя, как multi-fan.js:564.
    function focusTarget(rows, n, W) {
      var i, p, list;
      if (isNaN(n)) return null;
      for (i = 1; i < rows.length; i++) {
        if (rows[i].nf_wk !== W) continue;
        list = rows[i].results;
        for (p = 0; p < list.length; p++) if (list[p].nf && list[p].nf.n === n) return { ri: i, p: p, row: rows[i], line: null };
      }
      return null;
    }
    function focusFirst() {
      var t = target, list, k, el = null, nodes;
      target = null;
      if (!t || !t.line) { if (comp.down) comp.down(); return; }
      // Старый ряд рисует сначала 6–12 карточек (line.js:61-72): дорисовать до нужной.
      list = t.row.results;
      for (k = 0; k <= t.p && k < list.length; k++) if (!list[k].ready) t.line.append(list[k]);
      for (k = 0; k < t.ri; k++) comp.down();
      nodes = t.line.render(true).querySelectorAll('.selector');
      for (k = 0; k < nodes.length && !el; k++) if (nodes[k].card_data === list[t.p]) el = nodes[k];
      if (el) Lampa.Controller.collectionFocus(el, t.line.render(true));
      if (Lampa.Layer && Lampa.Layer.visible) Lampa.Layer.visible(t.line.render(true));
    }
    // Ряд лет получает пульт — фокус на подчёркнутый год (иначе Lampa ставит его на первую плитку).
    function focusYear(line) {
      var list = years.results, i;
      for (i = 0; i < list.length; i++) {
        if (list[i].active && list[i].__tile && list[i].__tile.render(true)) { Lampa.Controller.collectionFocus(list[i].__tile.render(true), line.render(true)); return; }
      }
    }
    // Прокрутка вниз — шаг назад во времени (main.js:49-65). Пустую пачку не отдаём.
    comp.next = function (resolve, reject) {
      var rows = [];
      if (dead || st.cur < st.end) { reject(); return; }
      try { rows = weeksPack(o, st); } catch (e) { log('weeks next', e && e.stack); }
      if (rows.length) resolve(rows); else reject();
    };
    comp.onAppend = function (line, row) {
      rowEvents(line, row, object);
      if (row === years) line.onToggle = focusYear;
      if (target && row === target.row) target.line = line;
    };
    // Неделя открыта из «Истории по неделям» досье: «Назад» возвращает в этот список (nf_ret).
    comp.back = function () {
      var ret = object.nf_ret;
      Lampa.Activity.backward();
      if (typeof ret === 'function') ret();
    };
    comp.destroy = function () { dead = true; inherited(); };
    return comp;
  }

  // ======================= Зал славы — netflix_hall (§5.7) =======================
  // Двенадцать списков hallLists(); фасеты тайтла t, g, o, r, lv фильтруют, порядок у каждого свой.
  // 6 рядов сразу, остальные — через comp.next. В ряду 20 карточек и «Ещё» → сетка hall:<ключ>.
  var HALL_FIRST = 6;
  function hallTitle(o) { var fs = facetSummary(o); return 'Зал славы' + (fs ? ' · ' + fs : ''); }
  function hallRow(key, o) {
    var list = hallFiltered(key, o), cards = [], i;
    for (i = 0; i < list.length && i < ROW_MAX; i++) cards.push(hallCard(key, list[i], false));
    if (!cards.length) return null;
    if (list.length > ROW_MAX && hasScreen('netflix_grid')) cards.push(moreTail(list.length, 'hall:' + key, HALL_T[key].title));
    return cardRow(HALL_T[key].title, cards, { nf_list: 'hall:' + key });
  }
  function hallRows(o, from, to) {
    var rows = [], i;
    for (i = from; i < to && i < HALL.length; i++) pushRow(rows, hallRow(HALL[i].key, o));
    return rows;
  }
  function componentHall(object) {
    var comp = new Lampa.InteractionMain(object), o = parseNf(object.nf), next = HALL_FIRST, dead = false;
    var inherited = comp.destroy ? comp.destroy.bind(comp) : function () {};

    comp.create = function () {
      var self = this;
      this.activity.loader(true);
      D.err = {};
      setTimeout(function () {
        if (dead) return;
        loadScreen(['index', 'global'], function (err) {
          var rows;
          if (dead) return;
          if (err) { screenEmpty(self, err, ''); return; }
          try {
            rows = hallRows(o, 0, next);
            if (!rows.length) { rows = hallRows(o, next, HALL.length); next = HALL.length; }
          } catch (e) { log('hall', e && e.stack); screenEmpty(self, 'build', ''); return; }
          if (!rows.length) { screenEmpty(self, 'empty', ''); return; }
          self.build(rows);
          notices();
        });
      }, 0);
      return this.render();
    };
    comp.next = function (resolve, reject) {
      var rows = [];
      if (dead || next >= HALL.length) { reject(); return; }
      try { rows = hallRows(o, next, HALL.length); } catch (e) { log('hall next', e && e.stack); }
      next = HALL.length;
      if (rows.length) resolve(rows); else reject();
    };
    comp.onAppend = function (line, row) { rowEvents(line, row, object); };
    comp.destroy = function () { dead = true; inherited(); };
    return comp;
  }

  // ======================= Трейлеры (§8) =======================
  // Ключи YouTube лежат в строке тайтла (tr, §3.4). Правило владельца: русская озвучка, если ролик есть,
  // иначе английский; русские субтитры — всегда, когда они есть у ролика. Дорожку звука внутри ролика
  // YouTube выбрать не даёт, поэтому язык звука — это выбор ролика (§8.1). Играет свой мост
  // netflix-trailer.html в оверлее: он просит у YouTube русские субтитры (§8.4–8.5). Запасные пути — §8.6.
  var TR_KIND = { T: 'Трейлер', Z: 'Тизер', C: 'Ролик' };
  var TR_TYPE = { Trailer: 'T', Teaser: 'Z', Clip: 'C' };   // вид ролика TMDB → буква в tr
  var TR_RANK = { Trailer: 0, Teaser: 1, Clip: 2 };
  var TR_WAIT = 10000;     // мс до ready моста, иначе — плеер Lampa (§8.6 п. 3)
  var TR_NUDGE = 8000;     // мс после ready: ролик не пошёл сам — подсказка «нажмите OK»
  var TR_IDLE = 5000;      // мс игры, после которых подписи оверлея прячутся
  var CAP_TEXT = {
    ru: 'Субтитры: русские',
    auto: 'Субтитры: автоперевод (не гарантирован)',
    none: 'Русских субтитров у ролика нет',
    unknown: 'Русские субтитры — если есть у ролика'
  };
  var TR = null;           // открытый оверлей
  var TR_WANT = 0;         // номер последнего запроса трейлера: опоздавший ответ TMDB оверлей не откроет
  var TR_NET = null;
  var TR_FIND = {};        // n → колбэки, пока идёт поиск роликов в TMDB

  // §3.4: «ru:T:KEY en:T:KEY» → {ru: {lang, type, key}, en: {…}}.
  function trailerKeys(T) {
    var out = {}, parts = String((T && T.tr) || '').split(' '), i, f;
    for (i = 0; i < parts.length; i++) {
      f = parts[i].split(':');
      if (f.length >= 3 && (f[0] === 'ru' || f[0] === 'en') && !out[f[0]] && /^[A-Za-z0-9_-]{11}$/.test(f[2])) out[f[0]] = { lang: f[0], type: f[1], key: f[2] };
    }
    return out;
  }
  function trailerLabel(k) { return (TR_KIND[k.type] || 'Трейлер') + ' · ' + (k.lang === 'ru' ? 'русская озвучка' : 'английский'); }
  // «английский», «русская озвучка»; у тизера и ролика — с видом: «тизер, английский».
  function langLabel(k) { return (k.type !== 'T' && TR_KIND[k.type] ? TR_KIND[k.type].toLowerCase() + ', ' : '') + (k.lang === 'ru' ? 'русская озвучка' : 'английский'); }
  // Ключи в порядке попытки (§8.2): русский, при ошибке ролика — английский; «английский» из меню — только он.
  function trailerList(T, lang) {
    var k = trailerKeys(T), out = [];
    if (lang !== 'en' && k.ru) out.push(k.ru);
    if (k.en) out.push(k.en);
    return out;
  }
  // Пункты меню (§8.3): русская озвучка первой; tr = null — поиск в TMDB; искали и не нашли — «Трейлера нет».
  // Подписи честные: русская озвучка в YouTube почти всегда любительская (r1), субтитры — только у ролика.
  function trailerItems(T) {
    var k = trailerKeys(T), how = trailerPlayer(), out = [];
    if (k.ru) out.push({ title: '▶ ' + trailerLabel(k.ru), subtitle: 'обычно любительская', nf_act: 'trailer', lang: 'ru' });
    if (k.en) out.push({ title: '▶ ' + trailerLabel(k.en), nf_act: 'trailer', lang: 'en',
      subtitle: how === 'bridge' ? 'рус. субтитры, если есть у ролика' : how === 'android' ? 'в приложении YouTube' : 'плеер Lampa, без субтитров' });
    if (T.tr == null && T.id) out.push({ title: '▶ Трейлер', subtitle: 'найду в TMDB: русская озвучка, иначе английский', nf_act: 'trailer', lang: '' });
    if (T.tr === '') out.push({ title: 'Трейлера нет', ghost: true, noenter: true });
    return out;
  }

  // §8.6 п. 5: tr = null — ролики ещё не искали. TMDB /videos на ru-RU и en-US по правилу §3.4: YouTube,
  // язык ролика, Trailer → Teaser → Clip, внутри вида официальный, потом новее. Адрес — только через
  // TMDB.api: для РФ Lampa подставляет прокси (r2 §4.2). Ответ без ошибок сети запоминается в строке
  // тайтла до новой сборки данных.
  function bestVideo(list, lang) {
    var best = null, i, v;
    for (i = 0; i < (list || []).length; i++) {
      v = list[i];
      if (!v || v.site !== 'YouTube' || v.iso_639_1 !== lang || !TR_TYPE[v.type] || !/^[A-Za-z0-9_-]{11}$/.test(v.key || '')) continue;
      if (!best || TR_RANK[v.type] < TR_RANK[best.type] || (v.type === best.type &&
        (!!v.official !== !!best.official ? !!v.official : String(v.published_at || '') > String(best.published_at || '')))) best = v;
    }
    return best;
  }
  function findTrailer(T, done) {
    var n = T.n, got = {}, left = 2, failed = 0, path;
    if (TR_FIND[n]) { TR_FIND[n].push(done); return; }
    TR_FIND[n] = [done];
    if (!TR_NET) TR_NET = new Lampa.Reguest();
    path = (isTv(T) ? 'tv' : 'movie') + '/' + T.id + '/videos?api_key=' + Lampa.TMDB.key() + '&language=';
    function one(lang, loc) {
      TR_NET.silent(Lampa.TMDB.api(path + loc), function (json) { got[lang] = bestVideo(json && json.results, lang); fin(); },
        function () { failed++; fin(); }, false, { timeout: 10000 });
    }
    function fin() {
      var tr = [], list, i;
      if (--left) return;
      if (got.ru) tr.push('ru:' + TR_TYPE[got.ru.type] + ':' + got.ru.key);
      if (got.en) tr.push('en:' + TR_TYPE[got.en.type] + ':' + got.en.key);
      if (tr.length || !failed) T.tr = tr.join(' ');
      list = TR_FIND[n] || [];
      delete TR_FIND[n];
      for (i = 0; i < list.length; i++) list[i](failed);
    }
    one('ru', 'ru-RU');
    one('en', 'en-US');
  }
  // Ключи известны — сразу; tr = null и есть TMDB id — после поиска. cb(failed) — только для последнего
  // запроса и на той же активности: пока шёл поиск, пользователь мог уйти.
  function withTrailerKeys(T, cb) {
    var my = ++TR_WANT, act = activeObj();
    if (T.tr != null || !T.id) { cb(0); return; }
    if (!Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) { cb(1); return; }
    noty('Ищу трейлер…');
    findTrailer(T, function (failed) { if (my === TR_WANT && activeObj() === act && !TR) cb(failed); });
  }

  // Плеер (§8.6): Android с «Плеер для трейлеров = YouTube» — приложение YouTube; своя настройка
  // «Плеер Lampa» — он; иначе свой мост.
  function trailerPlayer() {
    try { if (Lampa.Platform.is('android') && Lampa.Storage.field('player_launch_trailers') == 'youtube') return 'android'; } catch (e) {}
    return storageGet('netflix_trailer_player', 'bridge') === 'lampa' ? 'lampa' : 'bridge';
  }
  // items: [{keys: [{lang, type, key}] в порядке попытки, cap(k, plain) — подпись пункта}]. Приложение
  // YouTube берёт один ролик, поэтому отсчёт на Android идёт мостом. back — куда вернуть пульт, когда
  // вызов пришёл из закрытого Select (досье); иначе пульт вернётся туда, где он был.
  function runTrailers(items, countdown, back) {
    var how = trailerPlayer();
    if (how === 'android' && !countdown && Lampa.Android && Lampa.Android.openYoutube) {
      if (back) back();
      Lampa.Android.openYoutube(items[0].keys[0].key);
      return;
    }
    if (how === 'lampa') { if (back) back(); lampaTrailers(items); return; }
    openOverlay(items, countdown, back);
  }
  // §8.6 п. 4: плеер Lampa, у отсчёта — ещё и плейлист (как trailers.js:97-100). Звук верный: ролик выбран
  // по правилу. Русские субтитры не навязываются — мост Lampa их не передаёт.
  function lampaTrailers(items) {
    var list = [], i, k;
    for (i = 0; i < items.length; i++) {
      k = items[i].keys[0];
      list.push({ title: items[i].cap(k, true), url: 'https://www.youtube.com/watch?v=' + k.key });
    }
    if (!list.length) return;
    Lampa.Player.play(list[0]);
    if (list.length > 1) Lampa.Player.playlist(list);
  }
  // Один трейлер тайтла (входы §8.3: ▶, долгое OK, досье, страница карточки).
  function playTrailer(T, lang, back) {
    // Поиск в TMDB идёт секунды: пульт из закрытого Select возвращается сразу, а не после ответа.
    if (back && T.tr == null && T.id) { back(); back = null; }
    withTrailerKeys(T, function (failed) {
      var keys = trailerList(T, lang);
      if (!keys.length) {
        noty(failed ? 'Не удалось найти трейлер: нет связи с TMDB' : 'У «' + titleName(T) + '» нет трейлера');
        if (back) back();
        return;
      }
      runTrailers([{ keys: keys, cap: function (k, plain) { var s = titleName(T) + ' · ' + trailerLabel(k); return plain ? s : esc(s); } }], false, back);
    });
  }

  // --- Оверлей и пульт (§8.5) ---
  // Рамка моста — с тем же allow, что у Lampa (player/youtube.js:205), и без указателя и табуляции:
  // фокус и клавиши остаются у Lampa. Lampa.Iframe не годится: там с пульта работает только «Назад».
  function openOverlay(items, countdown, back) {
    var list = [], from = '', el, i, j, ks, id;
    closeTrailer(true);
    try { from = Lampa.Controller.enabled().name; } catch (e) {}
    if (!from || from === 'select' || from === 'netflix_trailer') from = 'content';
    for (i = 0; i < items.length; i++) {
      ks = [];
      for (j = 0; j < items[i].keys.length; j++) ks.push(items[i].keys[j].key);
      list.push(ks.join('~'));
    }
    id = 'nf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    el = $('<div class="nf-trailer"><iframe frameborder="0" tabindex="-1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
      '<div class="nf-trailer__bar"><div class="nf-trailer__cap"></div><div class="nf-trailer__subs"></div><div class="nf-trailer__hint"></div></div></div>');
    TR = { id: id, el: el, frame: el.find('iframe'), items: items, countdown: !!countdown, back: back || null, from: from,
      idx: 0, key: items[0].keys[0], state: -1, played: false, ready: false, caps: '', note: 'Загрузка…' };
    el.find('.nf-trailer__hint').text('OK — пауза · ←/→ — 10 с' + (countdown ? ' · ↓ — следующий' : '') + ' · Назад — выход');
    el.on('click', function () { trCmd('toggle'); });   // мышь и касание: рамка без указателя, щелчок приходит сюда
    window.addEventListener('message', trMessage, false);
    $('body').append(el);
    TR.frame.attr('src', BRIDGE_URL + '?id=' + id + '&list=' + encodeURIComponent(list.join(',')) + '&i=0');
    trController();
    Lampa.Controller.toggle('netflix_trailer');
    TR.wait = setTimeout(trNoBridge, TR_WAIT);
    // Скринсейвер Lampa не знает про оверлей: пока ролик идёт, сбрасываем его таймер, как плеер Lampa.
    TR.saver = setInterval(function () { try { if (TR && TR.state === 1) Lampa.Screensaver.resetTimer(); } catch (e) {} }, 30000);
    trDraw();
    trWake(true);
  }
  // Пульт: OK — пауза, ←/→ — 10 с, ↓/↑ — следующий и предыдущий в отсчёте, «Назад» — выход. Медиаклавиши
  // Lampa шлёт активному контроллеру (keypad.js:138-168). Долгое OK — пусто: иначе оно откроет меню
  // карточки под оверлеем (controller.js:114-117).
  function trController() {
    Lampa.Controller.add('netflix_trailer', {
      toggle: function () {},
      update: function () {},
      enter: function () { trCmd('toggle'); },
      long: function () {},
      left: function () { trCmd('seek', -10); },
      right: function () { trCmd('seek', 10); },
      up: function () { if (TR && TR.countdown) trCmd('prev'); else trWake(true); },
      down: function () { if (TR && TR.countdown) trCmd('next'); else trWake(true); },
      playpause: function () { trCmd('toggle'); },
      play: function () { trCmd('play'); },
      pause: function () { trCmd('pause'); },
      rewindBack: function () { trCmd('seek', -10); },
      rewindForward: function () { trCmd('seek', 10); },
      stop: function () { closeTrailer(); },
      back: function () { closeTrailer(); },
      // Пульт забрал кто-то другой (тройное «Назад», плеер Lampa): закрыться, фокус не трогать.
      gone: function (name) { if (TR && name !== 'netflix_trailer') closeTrailer(true); }
    });
  }
  function trCmd(cmd, by) {
    var S = TR, w;
    if (!S) return;
    try { w = S.frame[0].contentWindow; if (w) w.postMessage(by ? { nf: S.id, cmd: cmd, by: by } : { nf: S.id, cmd: cmd }, '*'); } catch (e) {}
    trWake(true);
  }
  // Сообщения моста (§8.4): {nf, ev: bridge | ready | item | state | captions | error | end}.
  function trMessage(e) {
    var S = TR, d = e && e.data;
    if (!S || !d || typeof d !== 'object' || d.nf !== S.id) return;
    if (d.ev === 'bridge') {
      // Страница моста загрузилась: YouTube ждём ещё 10 с, а не остаток первых.
      clearTimeout(S.wait);
      S.wait = setTimeout(trNoBridge, TR_WAIT);
    } else if (d.ev === 'ready') {
      S.ready = true;
      clearTimeout(S.wait);
      S.nudge = setTimeout(function () {
        if (TR === S && !S.played && S.state !== 3) { S.note = 'Не запустился сам — нажмите OK'; trDraw(); trWake(true); }
      }, TR_NUDGE);
    } else if (d.ev === 'item') {
      S.idx = d.i >= 0 && d.i < S.items.length ? d.i : 0;
      S.key = keyOf(S.items[S.idx], d.key);
      S.caps = ''; S.state = -1; S.note = 'Загрузка…';
      trDraw();
      trWake(true);
    } else if (d.ev === 'state') {
      S.state = d.s;
      if (d.s === 1) { S.played = true; S.note = ''; clearTimeout(S.nudge); }
      trDraw();
      // Пауза показывает подписи; игра прячет их через 5 с, если они видны. Буфер их не трогает.
      if (d.s === 2) trWake(true);
      else if (d.s === 1) trWake(false);
    } else if (d.ev === 'captions') {
      S.caps = CAP_TEXT[d.mode] ? d.mode : 'unknown';
      trDraw();
    } else if (d.ev === 'error' && d.fatal) {
      // Одиночный трейлер не заиграл ни одним ключом — плеер Lampa (§8.6 п. 3); в отсчёте мост идёт дальше сам.
      if (!S.countdown && !S.played) trFallback('Ролик не играет во встроенном плеере — открываю плеер Lampa');
      else { S.note = 'Ролик недоступен' + (S.idx < S.items.length - 1 ? ' — дальше следующий' : ''); trDraw(); trWake(true); }
    } else if (d.ev === 'end') closeTrailer();
  }
  function keyOf(it, key) {
    var ks = (it && it.keys) || [], i;
    for (i = 0; i < ks.length; i++) if (ks[i].key === key) return ks[i];
    return ks[0] || { lang: 'en', type: 'T', key: key };
  }
  // Подписи (§8.5): строка пункта — по ключу, который играет сейчас; вторая — состояние или субтитры.
  function trDraw() {
    var S = TR, it, line;
    if (!S) return;
    it = S.items[S.idx] || S.items[0];
    S.el.find('.nf-trailer__cap').html(it.cap(S.key, false));
    if (S.note) line = S.note;
    else if (S.state === 2) line = 'Пауза' + (S.caps ? ' · ' + CAP_TEXT[S.caps] : '');
    else line = S.caps ? CAP_TEXT[S.caps] : '';
    S.el.find('.nf-trailer__subs').text(line);
  }
  // Подписи видны при открытии, смене пункта, паузе и любой клавише (show) и прячутся через 5 с игры.
  // Без show спрятанные подписи остаются спрятанными, у видимых заново идёт отсчёт.
  function trWake(show) {
    var S = TR;
    if (!S) return;
    if (show) S.el.removeClass('nf-trailer--idle');
    else if (S.el.hasClass('nf-trailer--idle')) return;
    clearTimeout(S.idle);
    if (S.state === 1 && !S.note) S.idle = setTimeout(function () { if (TR === S) S.el.addClass('nf-trailer--idle'); }, TR_IDLE);
  }
  // §8.6 п. 3: мост не прислал ready — оверлей закрывается, играет плеер Lampa.
  function trNoBridge() { if (TR && !TR.ready) trFallback('Мост трейлеров не ответил — открываю плеер Lampa'); }
  function trFallback(text) {
    var S = TR;
    if (!S) return;
    closeTrailer();
    noty(text);
    lampaTrailers(S.items);
  }
  // Закрытие: destroy мосту, снять слушатель, убрать DOM, вернуть пульт (controller.js:457-462). silent —
  // пульт уже у другого контроллера.
  function closeTrailer(silent) {
    var S = TR;
    if (!S) return;
    TR = null;
    clearTimeout(S.wait); clearTimeout(S.nudge); clearTimeout(S.idle); clearInterval(S.saver);
    try { S.frame[0].contentWindow.postMessage({ nf: S.id, cmd: 'destroy' }, '*'); } catch (e) {}
    window.removeEventListener('message', trMessage, false);
    try { S.frame.attr('src', 'about:blank'); } catch (e) {}
    S.el.remove();
    if (silent) return;
    if (S.back) S.back();
    else Lampa.Controller.toggle(S.from);
  }

  // --- Кнопка ▶ на пульте (§8.3 п. 1) ---
  // Lampa шлёт keydown до своей обработки и потом смотрит defaultPrevented (keypad.js:70-73). Только на
  // экранах плагина, когда пульт в рядах или сетке, а оверлей закрыт. Карточка в фокусе отдаёт card_data
  // (card.js:49); плитка «Отсчёт» — nf_tile. Коды пультов владельца не проверены.
  var PLAY_KEYS = { 415: 1, 71: 1, 179: 1, 10252: 1 };
  function registerPlayKey() {
    var g = ['VK_PLAY', 'VK_PLAY_PAUSE', 'KEYCODE_MEDIA_PLAY', 'KEYCODE_MEDIA_PLAY_PAUSE'], i;
    if (!Lampa.Keypad || !Lampa.Keypad.listener || !Lampa.Keypad.listener.follow) return;
    for (i = 0; i < g.length; i++) if (typeof window[g[i]] === 'number') PLAY_KEYS[window[g[i]]] = 1;   // Philips, как keypad.js:6-11
    Lampa.Keypad.listener.follow('keydown', function (e) {
      // Нажатие уже забрал другой слушатель (например, оно будило скринсейвер) — не наше.
      if (!e || !PLAY_KEYS[e.code] || TR || !e.event || e.event.defaultPrevented || e.enabled === false) return;
      // Исключение здесь оборвало бы чужих слушателей клавиш (Subscribe.send идёт одним циклом).
      try { playKey(e.event); } catch (x) { log('play key', x && x.message); }
    });
  }
  function playKey(ev) {
    var a = activeObj(), name = '', el, d, T;
    if (!a || !/^netflix/.test(a.component || '') || !a.activity || !a.activity.render) return;
    try { name = Lampa.Controller.enabled().name; } catch (x) {}
    if (name !== 'items_line' && name !== 'content') return;   // меню, шапка, Select — не наш случай
    el = a.activity.render().find('.card.focus, .nf-tile.focus')[0];
    d = el ? el.nf_tile || el.card_data : FOCUS.act === a ? FOCUS.data : null;
    if (!d) return;
    if (d.tile) {
      if (d.act !== 'countdown') return;
      ev.preventDefault();
      countdown(d.W, d.kind);
      return;
    }
    T = d.nf ? D.T[d.nf.n] : null;
    if (!T) return;
    ev.preventDefault();
    playTrailer(T, '');
  }
  // Настройка «Плеер трейлеров» (§8.6) в своём разделе настроек Lampa.
  function registerSettings() {
    if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent || !Lampa.SettingsApi.addParam) return;
    Lampa.SettingsApi.addComponent({ component: 'netflix', name: MENU_TITLE, icon: ICON });
    Lampa.SettingsApi.addParam({
      component: 'netflix',
      param: { name: 'netflix_trailer_player', type: 'select', values: { bridge: 'Свой (рус. субтитры)', lampa: 'Плеер Lampa' }, default: 'bridge' },
      field: { name: 'Плеер трейлеров', description: 'Свой включает русские субтитры, если они есть у ролика' }
    });
  }

  // ======================= «Отсчёт 10→1» (§8.7) =======================
  // Трейлеры ряда топ-10 от №10 к №1 одним списком моста. Позиции без ролика пропускаются, одинаковые
  // ключи (Lupin, Ч. 1 и Ч. 4: ролик берётся на уровне шоу) играют один раз, на лучшем месте.
  function countdownPlan(cards) {
    var seen = {}, own = [], items = [], i, T, keys;
    for (i = 0; i < cards.length; i++) {          // от №1 вниз: ключ достаётся лучшему месту
      T = D.T[cards[i].nf.n];
      keys = T ? trailerList(T, '') : [];
      own.push(keys.length && !seen[keys[0].key] ? keys : null);
      if (keys.length) seen[keys[0].key] = 1;
    }
    for (i = cards.length - 1; i >= 0; i--) if (own[i]) items.push(countdownItem(cards[i], own[i]));
    return items;
  }
  // «№7 · Black Doves · Сезон 2 · НОВОЕ · английский»; язык — по ключу, который играет.
  function countdownItem(card, keys) {
    var nf = card.nf, T = D.T[nf.n];
    return { keys: keys, cap: function (k, plain) {
      var e = plain ? String : esc, out = ['№' + nf.rank, e(titleName(T))], lab = seasonLong(slabel(nf.sid)), mv = moveText(nf.mv, plain);
      if (lab) out.push(e(lab));
      if (mv) out.push(mv);
      out.push(e(langLabel(k)));
      return out.join(' · ');
    } };
  }
  // Движение места в подписи: CSS-треугольник, как у .nf-meta (шрифты ТВ не проверены); в плеере Lampa — «+3».
  function moveText(mv, plain) {
    var m = /^([ud])(\d+)$/.exec(mv || '');
    if (mv === 'new') return plain ? 'НОВОЕ' : '<span class="nf-mv nf-mv--new">НОВОЕ</span>';
    if (mv === 'back') return plain ? 'ВОЗВРАТ' : '<span class="nf-mv nf-mv--back">ВОЗВРАТ</span>';
    if (!m) return '';
    if (plain) return (m[1] === 'u' ? '+' : '−') + m[2];
    return '<span class="nf-mv nf-mv--' + (m[1] === 'u' ? 'up' : 'down') + '"><i></i>' + m[2] + '</span>';
  }
  // Подпись плитки: «9 трейлеров». Пока у части тайтлов ролики не искали (tr = null) — «до 9 трейлеров».
  function countdownSub(cards) {
    var seen = {}, n = 0, maybe = 0, i, T, keys;
    for (i = 0; i < cards.length; i++) {
      T = cards[i].nf ? D.T[cards[i].nf.n] : null;
      if (!T) continue;
      if (T.tr == null) { if (T.id) maybe++; continue; }
      keys = trailerList(T, '');
      if (keys.length && !seen[keys[0].key]) { seen[keys[0].key] = 1; n++; }
    }
    n += maybe;
    return n ? (maybe ? 'до ' : '') + n + ' ' + plural(n, 'трейлер', 'трейлера', 'трейлеров') : '';
  }
  // Позиции те же, что в ряду (worldTop недели W). Ролики с tr = null ищутся в TMDB все сразу.
  function countdown(W, kind) {
    var cards = worldTop(W, kind), need = [], my = ++TR_WANT, act = activeObj(), left, i, T;
    function go() {
      var items;
      if (my !== TR_WANT || activeObj() !== act || TR) return;
      items = countdownPlan(cards);
      if (!items.length) { noty('У этого топа нет трейлеров'); return; }
      runTrailers(items, true);
    }
    for (i = 0; i < cards.length; i++) {
      T = D.T[cards[i].nf.n];
      if (T && T.tr == null && T.id && need.indexOf(T) < 0) need.push(T);
    }
    left = need.length;
    if (!left || !Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) { go(); return; }
    noty('Ищу трейлеры…');
    for (i = 0; i < need.length; i++) findTrailer(need[i], function () { if (!--left) go(); });
  }

  // ======================= Досье тайтла (§5.8) =======================
  // Номера сезонов тайтла из index.so — раз за сборку данных.
  function sidsOf(n) {
    var m = D.sids, so, i;
    if (!m) {
      m = D.sids = {};
      so = (D.index && D.index.so) || [];
      for (i = 0; i < so.length; i++) if (so[i] >= 0) (m[so[i]] || (m[so[i]] = [])).push(i);
    }
    return m[n] || [];
  }
  // Позиции тайтла в мировом топе по порядку недель: [{sid, W, cat, pl, h, v, cw}].
  function titlePositions(n) {
    var sids = sidsOf(n), out = [], i, j, list, p;
    if (!D.global) return out;
    for (i = 0; i < sids.length; i++) {
      list = D.global.bySid[sids[i]] || [];
      for (j = 0; j < list.length; j++) { p = list[j]; out.push({ sid: sids[i], W: p.W, cat: p.cat, pl: p.pl, h: p.h, v: p.v, cw: p.cw }); }
    }
    out.sort(function (a, b) { return (a.W - b.W) || (a.cat - b.cat) || (a.pl - b.pl); });
    return out;
  }
  // Сезоны в мировом топе по первой неделе: недели, лучшее место, самая длинная серия на №1.
  function seasonStats(n) {
    var pos = titlePositions(n), by = {}, out = [], i, p, s;
    for (i = 0; i < pos.length; i++) {
      p = pos[i]; s = by[p.sid];
      if (!s) { s = by[p.sid] = { sid: p.sid, weeks: 0, best: 99, streak: 0, run: 0, l1: -9 }; out.push(s); }
      s.weeks++;
      if (p.pl < s.best) s.best = p.pl;
      if (p.pl === 1) { s.run = s.l1 === p.W - 1 ? s.run + 1 : 1; s.l1 = p.W; if (s.run > s.streak) s.streak = s.run; }
    }
    return out;
  }
  function seasonName(sid, T) { return seasonLong(slabel(sid)) || (T.k ? 'Сериал' : 'Фильм'); }
  // Досье открывается, когда индекс и недели мира в памяти; «Назад» возвращает пульт туда, откуда пришли.
  function showDossier(T) {
    var enabled = '', back;
    try { enabled = Lampa.Controller.enabled().name; } catch (e) {}
    back = function () { if (enabled) Lampa.Controller.toggle(enabled); };
    ensure(['index', 'global'], function () { dossierMenu(T, back); }, { fail: back });
  }
  // «Netflix: Игра в кальмара»: справка (noenter), «Сезоны», «Действия».
  function dossierMenu(T, back) {
    var items = [], st = seasonStats(T.n), streak = 0, ru, i;
    function info(title, sub) { items.push({ title: title, subtitle: sub || '', noenter: true }); }
    for (i = 0; i < st.length; i++) if (st[i].streak > streak) streak = st[i].streak;
    if (T.gw > 0) info('В мировом топе: ' + T.gw + ' нед. · ' + monthYear(T.gf) + (monthYear(T.gl) !== monthYear(T.gf) ? ' – ' + monthYear(T.gl) : ''));
    else info('В мировом топе не был', 'только чарты стран');
    if (T.gb) info('Лучшее место: №' + T.gb + (T.gb === 1 && streak > 1 ? ' · ' + streak + ' нед. подряд' : ''));
    else if (T.cb) info('Лучшее место в странах: №' + T.cb);
    if (T.gh) info('Часы в топе: ' + fmtUnits(T.gh) + (T.gv ? ' · просмотры: ' + fmtUnits(T.gv) + ' (с июня 2023)' : ''));
    if (T.nc) info('Стран в топе: ' + T.nc + (T.c1 ? ' · №1 в ' + T.c1 : ''));
    if (D.cty.RU) { ru = (periodAgg('RU', '').a[T.n] || ZERO).wk; info('В России (2021–22): ' + (ru ? ru + ' нед.' : 'не был в топе')); }
    if (T.lv === 1) { if (st.length) info('Эфиров в мировом топе: ' + st.length); }
    else if (st.length > 1 || (st.length === 1 && slabel(st[0].sid))) {
      items.push({ title: 'Сезоны', separator: true });
      for (i = 0; i < st.length; i++) info(seasonName(st[i].sid, T) + ' — ' + st[i].weeks + ' нед. · №' + st[i].best);
    }
    items.push({ title: 'Действия', separator: true });
    items = items.concat(trailerItems(T));
    if (st.length) items.push({ title: 'История по неделям ›', subtitle: st.length > 1 ? 'все сезоны' : '', act: 'weeks' });
    if (similarSpec(T)) items.push({ title: 'Похожие в топе ›', act: 'similar' });
    Lampa.Select.show({
      title: 'Netflix: ' + titleName(T), items: items,
      onSelect: function (a) {
        if (a.act === 'weeks') showWeekHistory(T, function () { dossierMenu(T, back); });
        else if (a.act === 'similar') openSimilar(T);
        else if (a.nf_act === 'trailer') playTrailer(T, a.lang, back);   // Select уже закрыт: пульт вернёт back
        else back();
      },
      onBack: back
    });
  }
  // «История по неделям ›»: позиции сезонов по порядку недель; «Назад» — в досье (content_filter/menu.js:242-253).
  // OK открывает ленту недель на этой неделе со списком Netflix, где стоял тайтл (в слитой десятке
  // его может не быть), с фокусом на его карточке; «Назад» из ленты — снова сюда, на ту же позицию (at).
  function showWeekHistory(T, back, at) {
    var pos = titlePositions(T.n), items = [], i, p, val;
    for (i = 0; i < pos.length; i++) {
      p = pos[i];
      val = hoursLabel(p.h) + (p.W >= vf() && p.v ? ' · ' + viewsLabel(p.v) : '');
      items.push({ title: weekLabel(p.W, { short: true }) + ' · №' + p.pl, subtitle: [seasonLong(slabel(p.sid)), LIST_SHORT[p.cat], val].filter(Boolean).join(' · '), w: p.W, cat: p.cat,
        selected: !!at && at.w === p.W && at.cat === p.cat });
    }
    Lampa.Select.show({
      title: 'История по неделям · ' + titleName(T), items: items,
      onSelect: function (a) {
        var o2 = emptyNf(), act;
        o2.t = LIST_KEYS[a.cat];
        openWeeks(o2, a.w, T.n);
        act = activeObj();
        if (act && act.component === 'netflix_weeks') act.nf_ret = function () { showWeekHistory(T, back, a); };
      },
      onBack: back
    });
  }

  // ======================= Похожие в топе — сетка sim:<n> (§5.8) =======================
  // Тот же k; до двух жанровых групп тайтла по приоритету (Драма — только если других нет); та же
  // группа «Откуда» (первая подходящая в порядке §4.3, иначе страна производства). Без TMDB — нет.
  function similarSpec(T) {
    var g = [], names = [], origin = '', i, G, O, parts;
    if (!T || !T.id) return null;
    for (i = 0; i < GENRE_PRIORITY.length && g.length < 2; i++) {
      G = GENRE[GENRE_PRIORITY[i]];
      if (G.key === 'drama' && g.length) break;
      if (groupMatch(T, G)) { g.push(G.key); names.push(G.short || G.title); }
    }
    for (i = 0; i < ORIGINS.length && !origin; i++) { O = ORIGINS[i]; if ((T.oc && O.ocSet[T.oc]) || (T.ol && O.olSet[T.ol])) origin = O.key; }
    if (!origin && T.oc) origin = 'c:' + T.oc;
    parts = ['Похоже на «' + titleName(T) + '»', T.k ? 'сериалы' : 'фильмы'];
    if (origin) parts.push(originText(origin, true));
    if (names.length) parts.push(names.join('/'));
    return { k: T.k, g: g, o: origin, title: parts.join(' · ') };
  }
  // Кандидаты — тайтлы подбора o (по умолчанию весь мировой индекс), сам тайтл исключён. Нужны обе
  // жанровые группы; если таких меньше пяти, хватает любой из двух.
  function similarList(n, o) {
    var T = D.T[n], S = similarSpec(T), ctx = sortCtx(o), all, both = [], any = [], i, x;
    if (!T) return null;
    if (!S) return { list: [], ctx: ctx };
    all = resultTitles(o);
    for (i = 0; i < all.length; i++) {
      x = all[i];
      if (x.n === n || x.k !== S.k || !x.id || (S.o && !passOrigin(x, S.o))) continue;
      if (passGenres(x, S.g, true)) both.push(x);
      else if (S.g.length > 1 && passGenres(x, S.g, false)) any.push(x);
    }
    return { list: sortTitles(both.length >= 5 ? both : both.concat(any), ctx), ctx: ctx };
  }
  // Сортировка по умолчанию — pop (§5.8): подбор текущего экрана к «Похожим» не относится.
  function openSimilar(T) { openGrid(emptyNf(), 'sim:' + T.n); }

  // ======================= Страница карточки Lampa (§5.8) =======================
  // Ключ «tv:93405» → тайтл индекса. Только по данным в памяти: ради чужой карточки в сеть не ходим.
  function titleByTmdb(method, id) {
    var m = D.byTmdb, i, T, k;
    if (!D.index || !id) return null;
    if (!m) {
      m = D.byTmdb = {};
      for (i = 0; i < D.index.list.length; i++) {
        T = D.T[D.index.list[i]];
        if (!T || !T.id) continue;
        k = (isTv(T) ? 'tv' : 'movie') + ':' + T.id;
        if (!m.hasOwnProperty(k)) m[k] = T.n;
      }
    }
    k = method + ':' + id;
    return m.hasOwnProperty(k) ? D.T[m[k]] || null : null;
  }
  var ICON_PLAY =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M8 5.6V18.4C8 19.2 8.9 19.7 9.6 19.2L19.2 12.8C19.8 12.4 19.8 11.6 19.2 11.2L9.6 4.8C8.9 4.3 8 4.8 8 5.6Z" fill="currentColor"/></svg>';
  function fullButton(svg, text, fn) {
    var b = $('<div class="full-start__button selector nf-full-btn">' + svg + '<span>' + esc(text) + '</span></div>');
    b.on('hover:enter', fn);
    return b;
  }
  // «▶ Трейлер (RU)» или «(EN)» и «Netflix · 42 нед.» (досье). Lampa 3.x — в видимый ряд
  // .full-start-new__buttons перед .button--options; иначе после .view--torrent, как online.js:2603-2617.
  function addFullButtons(e) {
    var obj = e.object || {}, movie = (e.data && e.data.movie) || {}, method, T, render, k, btns = [], row, anchor, i;
    if (!D.index) return;
    method = obj.method || (movie.name || movie.original_name ? 'tv' : 'movie');
    T = titleByTmdb(method, obj.id || movie.id);
    if (!T) return;
    render = obj.activity && obj.activity.render ? obj.activity.render() : e.body;
    if (!render || !render.find || render.find('.nf-full-btn').length) return;
    k = trailerKeys(T);
    k = k.ru || k.en;
    if (k) btns.push(fullButton(ICON_PLAY, 'Трейлер (' + (k.lang === 'ru' ? 'RU' : 'EN') + ')', function () { playTrailer(T, k.lang); }));
    btns.push(fullButton(ICON, 'Netflix' + (T.gw ? ' · ' + T.gw + ' нед.' : ''), function () { showDossier(T); }));
    row = render.find('.full-start-new__buttons');
    if (row.length) {
      anchor = row.find('.button--options');
      for (i = 0; i < btns.length; i++) { if (anchor.length) anchor.before(btns[i]); else row.append(btns[i]); }
      return;
    }
    anchor = render.find('.view--torrent');
    if (anchor.length) { for (i = btns.length - 1; i >= 0; i--) anchor.after(btns[i]); return; }
    row = render.find('.full-start__buttons');
    for (i = 0; i < btns.length; i++) row.append(btns[i]);
  }
  function registerFull() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('full', function (e) {
      if (!e || e.type !== 'complite') return;
      try { addFullButtons(e); } catch (ex) { log('full', ex && ex.message); }
    });
  }

  // ======================= Шапка, меню, стиль =======================
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="3" y="12" width="4.6" height="8.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/>' +
    '<rect x="9.7" y="4.5" width="4.6" height="16" rx="1.2" stroke="currentColor" stroke-width="1.6"/>' +
    '<rect x="16.4" y="8.5" width="4.6" height="12" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  var ICON_SORT =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 6H14M4 12H11M4 18H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M18 5V19M18 19L15 16M18 19L21 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_FILTER =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 5H20L13.8 12.4V18L10.2 19.8V12.4L4 5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  // Два значка в шапке (§5.1): «Сортировка» — на netflix и netflix_grid, «Фильтры» — на всех четырёх
  // экранах. DOM-приём dorama.js:647-658: работает и в 2.x, на чужих активностях — класс hide.
  function addHeadButtons() {
    var actions = $('.head .head__actions').eq(0), bSort, bFilter;
    if (!actions.length || !actions.prepend) return;
    bFilter = $('<div class="head__action selector nf-head-filter hide" title="Фильтры">' + ICON_FILTER + '</div>');
    bSort = $('<div class="head__action selector nf-head-sort hide" title="Сортировка">' + ICON_SORT + '</div>');
    bFilter.on('hover:enter', function () { openChip('all', currentNf(), 'head'); });
    bSort.on('hover:enter', function () {
      var cur = currentNf();
      showSortMenu(cur, {
        from: 'head',
        back: function () { Lampa.Controller.toggle('head'); },
        pick: function (o2) {
          if (buildNf(o2) === buildNf(cur)) { Lampa.Controller.toggle('head'); return; }
          storageSet('netflix_sort', o2.s || '');
          applyNf(o2, { replace: true, from: 'head' });
        }
      });
    });
    actions.prepend(bFilter);
    actions.prepend(bSort);
    function sync(component) {
      bSort.toggleClass('hide', !(component === 'netflix' || component === 'netflix_grid'));
      bFilter.toggleClass('hide', !(component === 'netflix' || component === 'netflix_grid' || component === 'netflix_weeks' || component === 'netflix_hall'));
    }
    sync((activeObj() || {}).component);
    Lampa.Listener.follow('activity', function (e) { if (e && e.type === 'start') sync(e.component); });
  }
  // Пункт меню всегда открывает «Мир» (§5.1) с последней сортировкой; прошлый подбор ждёт на плитке.
  function openRoot() {
    var o = emptyNf(), s = String(storageGet('netflix_sort', '') || '');
    if (SORT[s]) o.s = s === 'pop' ? '' : s;
    Lampa.Activity.push({ url: '', title: nfTitle(o), component: 'netflix', source: 'tmdb', page: 1, nf: buildNf(o) });
  }
  function addMenuItem() {
    var item = $('<li class="menu__item selector" data-action="netflix"><div class="menu__ico">' + ICON + '</div><div class="menu__text">' + MENU_TITLE + '</div></li>');
    item.on('hover:enter', openRoot);
    $('.menu .menu__list').eq(0).append(item);
  }

  // Размеры и сдвиги цифр подобраны на глаз; на ТВ не проверено (§15, п. 6).
  var STYLE =
    '.items-line--type-nf-chips,.items-line--type-nf-tiles{padding-bottom:2.2em}' +
    '.nf-chip{flex-shrink:0;width:13.6em;height:5.4em;margin-right:1em;padding:.7em 1em;box-sizing:border-box;border-radius:1em;background:rgba(255,255,255,.09);position:relative;display:flex;flex-direction:column;justify-content:center;transition:transform .15s}' +
    '.nf-chip__label{font-size:.9em;opacity:.6;white-space:nowrap}' +
    '.nf-chip__value{font-size:1.3em;font-weight:600;margin-top:.2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.nf-chip.focus{background:#fff;color:#000;transform:scale(1.04)}' +
    '.nf-chip--active::after{content:"";position:absolute;left:20%;right:20%;bottom:-.65em;height:.3em;border-radius:.3em;background:#ffd400}' +
    '.nf-tile{flex-shrink:0;width:15em;height:7.5em;margin-right:1em;padding:.9em 1em;box-sizing:border-box;border-radius:1em;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;background:rgba(255,255,255,.09);transition:transform .15s}' +
    '.nf-tile__title{position:relative;font-size:1.3em;font-weight:700;line-height:1.2}' +
    '.nf-tile__sub{position:relative;font-size:.9em;opacity:.85;margin-top:.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.nf-tile.focus{transform:scale(1.06);box-shadow:0 0 0 .3em #fff}' +
    '.nf-tile--country{height:9em;background:#1c1c1e}' +
    '.nf-tile__img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}' +
    '.nf-tile__img--on{opacity:.45}' +
    '.nf-tile__code{position:absolute;left:.75em;top:.55em;font-size:1.5em;font-weight:900;letter-spacing:.04em}' +
    '.nf-tile--country .nf-tile__title,.nf-tile--country .nf-tile__sub,.nf-tile__code{text-shadow:0 0 .4em rgba(0,0,0,.9)}' +
    '.nf-tile--tail{width:12.75em;height:19.1em;justify-content:center;align-items:center;text-align:center}' +
    '.nf-tile--tail-short{width:12em;height:9em}' +
    '.items-line--type-nf-top{min-height:24em}' +
    '.items-line--type-nf-top .card.nf-card--r{margin-left:4.6em}' +
    '.items-line--type-nf-top .card.nf-card--r10{margin-left:7.4em}' +
    '.nf-rank{position:absolute;right:100%;bottom:-.04em;margin-right:-.1em;font-size:9em;line-height:.8;font-weight:900;letter-spacing:-.07em;color:#141414;-webkit-text-stroke:.025em #cfcfcf;pointer-events:none}' +
    '.nf-rank--1{color:#d9a520;-webkit-text-stroke:.025em #fff3c4}' +
    '.nf-chip--year{width:10em}' +
    '.nf-chip--year .nf-chip__value{font-size:1.6em;margin-top:0}' +
    '.nf-chip--year .nf-chip__label{margin-top:.15em}' +
    '.nf-meta{position:absolute;right:.4em;top:.4em;z-index:2;max-width:calc(100% - .8em);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;padding:.2em .55em;border-radius:1em;background:rgba(0,0,0,.78);color:#fff;font-size:.85em;font-weight:700;line-height:1.3;white-space:nowrap;pointer-events:none}' +
    '.nf-meta i{display:inline-block;width:0;height:0;margin-right:.3em;vertical-align:.1em;border-left:.35em solid transparent;border-right:.35em solid transparent}' +
    '.nf-meta--up{color:#5ee37b}.nf-meta--up i{border-bottom:.5em solid #5ee37b}' +
    '.nf-meta--down{color:#ff6b6b}.nf-meta--down i{border-top:.5em solid #ff6b6b}' +
    '.nf-meta--new{color:#ffd400}' +
    '.nf-meta--back{color:#6cc8ff}' +
    // Оверлей трейлера (§8.5): выше шапки, меню и Select (55), ниже Noty (99). Подписи сверху: снизу —
    // субтитры YouTube.
    '.nf-trailer{position:fixed;left:0;top:0;right:0;bottom:0;z-index:70;background:#000;overflow:hidden}' +
    '.nf-trailer iframe{position:absolute;left:0;top:0;width:100%;height:100%;border:0;pointer-events:none}' +
    '.nf-trailer__bar{position:absolute;left:0;right:0;top:0;padding:1.6em 2.4em 4em;color:#fff;background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,0));pointer-events:none;transition:opacity .4s}' +
    '.nf-trailer--idle .nf-trailer__bar{opacity:0}' +
    '.nf-trailer__cap{font-size:1.6em;font-weight:700;line-height:1.3;text-shadow:0 0 .3em rgba(0,0,0,.8)}' +
    '.nf-trailer__subs{font-size:1.1em;line-height:1.3;min-height:1.3em;margin-top:.35em;opacity:.85}' +
    '.nf-trailer__hint{font-size:.95em;margin-top:.6em;opacity:.55}' +
    '.nf-mv i{display:inline-block;width:0;height:0;margin-right:.25em;vertical-align:.1em;border-left:.35em solid transparent;border-right:.35em solid transparent}' +
    '.nf-mv--up{color:#5ee37b}.nf-mv--up i{border-bottom:.5em solid #5ee37b}' +
    '.nf-mv--down{color:#ff6b6b}.nf-mv--down i{border-top:.5em solid #ff6b6b}' +
    '.nf-mv--new{color:#ffd400}.nf-mv--back{color:#6cc8ff}';
  function injectStyle() {
    var s;
    if (typeof document === 'undefined' || !document.head || document.getElementById('netflix-style')) return;
    s = document.createElement('style');
    s.id = 'netflix-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ======================= Старт =======================
  initTables();
  function start() {
    if (window.netflix_plugin_ready) return;   // защита от двойной загрузки
    window.netflix_plugin_ready = true;
    injectStyle();
    registerScreen('netflix', componentNetflix);
    registerScreen('netflix_grid', componentGrid);
    registerScreen('netflix_weeks', componentWeeks);
    registerScreen('netflix_hall', componentHall);
    addMenuItem();
    addHeadButtons();
    registerBadges();
    registerFull();
    registerSettings();
    registerPlayKey();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

  // --- test export hook (в браузере неактивен: module там не определён) ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _D: D,
      _initTables: initTables,
      _parseFile: parseFile,
      _setManifest: setManifest,
      _parseNf: parseNf,
      _buildNf: buildNf,
      _nfMode: nfMode,
      _nfSummary: nfSummary,
      _nfTitle: nfTitle,
      _weekLabel: weekLabel,
      _fmtUnits: fmtUnits,
      _fmtInt: fmtInt,
      _seasonShort: seasonShort,
      _seasonLong: seasonLong,
      _owner: owner,
      _makeCard: makeCard,
      _mergedWeek: mergedWeek,
      _worldTop: worldTop,
      _worldNew: worldNew,
      _countryTop: countryTop,
      _countryNew: countryNew,
      _passFacets: passFacets,
      _periodAgg: periodAgg,
      _resultTitles: resultTitles,
      _countNf: countNf,
      _sortCtx: sortCtx,
      _sortedResult: sortedResult,
      _sortBadge: sortBadge,
      _hallLists: hallLists,
      _hallFiltered: hallFiltered,
      _planScreen: planScreen,
      _worldRows1: worldRows1,
      _worldRows2: worldRows2,
      _yearRows: yearRows,
      _countryRows1: countryRows1,
      _countryRows2: countryRows2,
      _pickRows1: pickRows1,
      _pickRows2: pickRows2,
      _expansionRows: expansionRows,
      _hintRow: hintRow,
      _decorateCard: decorateCard,
      _focusLine: focusLine,
      _applyNf: applyNf,
      _ensure: ensure,
      _registerScreen: registerScreen,
      _hasScreen: hasScreen,
      _openGrid: openGrid,
      _openWeeks: openWeeks,
      _openHall: openHall,
      _titleList: titleList,
      _gridCards: gridCards,
      _gridTitle: gridTitle,
      _weekRows: weekRows,
      _weeksPack: weeksPack,
      _hallRows: hallRows,
      _seasonStats: seasonStats,
      _titlePositions: titlePositions,
      _similarSpec: similarSpec,
      _similarList: similarList,
      _titleByTmdb: titleByTmdb,
      _trailerKeys: trailerKeys,
      _trailerList: trailerList,
      _trailerItems: trailerItems,
      _bestVideo: bestVideo,
      _countdownPlan: countdownPlan,
      _countdownSub: countdownSub,
      _playTrailer: playTrailer,
      _closeTrailer: closeTrailer,
      _component: componentNetflix,
      _componentGrid: componentGrid,
      _componentWeeks: componentWeeks,
      _componentHall: componentHall,
      _start: start
    };
  }
})();
