# Как устроены «Shots» в lampa.mx — разбор для собственных «дорама-шотов»

Дата исследования: 2026-07-11. Источники: `app.min.js` из github.com/yumata/lampa,
живой плагин `https://cub.rip/plugin/shots` (177 КБ, неминифицированный Rollup-бандл),
живые ответы API `cub.rip/api/shots/*`.

## Главное

**Shots — это не часть ядра Lampa, а обычный внешний плагин**, который ядро
догружает с CUB-сервера при старте:

```js
// app.min.js (ServiceLibs.init)
if (window.location.hostname !== 'localhost' && !window.lampa_settings.iptv)
  include.push(Utils.protocol() + object.cub_domain + '/plugin/shots');
```

То есть архитектурно он нам доступен как образец «как правильно»: всё сделано
через публичные `Lampa.*` API, без патчей ядра. Требует `Lampa.Manifest.app_digital >= 307`
и включается **только при языке интерфейса ru/uk/be**.

**«Запись» клипа — виртуальная.** Клиент ничего не кодирует и не загружает видео.
Он только запоминает `start_point`/`end_point` (секунды в потоке) + метаданные
карточки и отправляет их на сервер. Сервер CUB сам заново находит тот же поток
через балансер (kodik, veoveo и т.п.), вырезает фрагмент, кодирует и выкладывает
mp4 на CDN (`video.lampa-shorts.com/o/{id}/o.mp4` + скриншот `s.jpg`).
Клиент потом опрашивает `upload-status/{id}` раз в минуту до `ready`/`error`.

## API (база: `{protocol}//{cub_domain}/api/shots/`)

Авторизация: заголовки `token` (CUB-токен аккаунта) и `profile` (id профиля)
из `Lampa.Account.Permit.account`. **Чтение (lenta/card/channel/list) работает и без токена.**

| Endpoint | Метод | Что делает |
|---|---|---|
| `lenta?page=&sort=&limit=&uid=&tags=&id=` | GET | Лента. `sort`: `new`, `popular`, `from_id` (пагинация по id, `id=` последний виденный). `tags` — слаги через запятую. `uid` — анонимный id устройства для фильтрации просмотренного |
| `list/{type}?page=` | GET | Списки пользователя: `favorite`, `created`, `map` (map = только id избранного) |
| `card/{tmdb_id}/{movie\|tv}?page=` | GET | Шоты по конкретному тайтлу TMDB |
| `channel/{cid}?page=` | GET | Шоты одного автора (канал) |
| `video/{id}` | GET | Один шот по id (после upload-request) |
| `upload-request` | POST | Заявка на создание: `card_id, card_type, card_title, card_year, card_poster, start_point, end_point, season, episode, voice_name, balanser, tags[], recorder:'new'` |
| `upload-status/{id}` | GET | Статус конвертации: `processing/converting/ready/error` |
| `liked?uid=` | POST `{id, type: like\|unlike}` | Лайк |
| `favorite` | POST `{sid, card_title, card_poster, action: add\|remove}` | В избранное |
| `viewed?uid=` | POST `{id}` | Отметка «просмотрено» |
| `block` / `report` / `delete` | POST `{id}` | Модерация |

Метрики шлются отдельно на `/api/metric/stat?method=shots_*`.

### Форма объекта «shot» (живой ответ)

```json
{
  "id": 3388, "cid": 27013, "server": "server.lampa-shorts.com",
  "status": "ready", "created_at": 1783618238524, "updated_at": 1783726112797,
  "file": "https://video.lampa-shorts.com/o/3388/o.mp4",
  "screen": "https://video.lampa-shorts.com/o/3388/s.jpg",
  "liked": 0, "viewed": 173, "saved": 0,
  "season": 0, "episode": 0, "voice_name": "Dragon Money Studio",
  "start_point": 4560, "end_point": 4695,
  "card_id": "1280738", "card_title": "Живая ярость", "card_year": "2026",
  "card_type": "movie", "card_poster": "/jAN5WQstlgSMsbLISH59Sx7cYfu.jpg",
  "profile": 29228, "reports": 0, "balanser": "kodik",
  "email": "sergeylysyak5263", "nickname": "", "icon": "l_1", "tags": []
}
```

Обёртка: `{ secuses: true, results: [...], page, total, total_pages }` (да, опечатка `secuses`).

## Клиентская архитектура плагина

Модули (все — в одном IIFE, инициализация после `app: ready`):

- **Lang / Templates** — `Lampa.Lang.add()` + `Lampa.Template.add()` (все шаблоны — строки HTML), CSS инжектится одним `<style>` в body.
- **Api** — обёртки над `Lampa.Network.silent(url, ok, err, body, {headers:{token, profile}, timeout})`.
- **Recorder** — оверлей поверх плеера: кнопки «−5с / стоп / +5с», таймер, лимит 5 мин (`recorder_max_duration`), скриншот кадра через `canvas.drawImage(video)` → dataURL (только для превью в модалке, на сервер не уходит).
- **Upload** — модалка подтверждения: превью, выбор тегов (8 фиксированных: action, comedy, drama, fantasy, horror, thriller, anime, sci_fi), затем `Api.uploadRequest(...)`.
- **Handler** — реестр «моих обрабатываемых» шотов, поллинг статуса каждые 60с через `Lampa.Timer.add`, уведомления `Lampa.Bell.push`.
- **Created / Favorite** — локальные кэши списков в `Lampa.Storage` (`shots_created`, `shots_favorite`, `shots_map`, максимум 20), синк между устройствами через `Lampa.Socket.send('update', ...)`.
- **Roll** — сборка ленты: параллельно 3 запроса (`sort=new`, `sort=popular`, `sort=from_id` c последнего id) через `Lampa.Status(3)`, дедуп, фильтр просмотренного (`Lampa.Storage.cache('shots_viewed', 2000)`), shuffle new+popular, старые в хвост.
- **Lenta** — полноэкранный вертикальный фид (TikTok-стиль): `<video autoplay loop>` + панель (карточка тайтла, автор, лайк/избранное/меню). Навигация: вверх/вниз с пульта, свайпы на тач, колесо мыши; автоподгрузка следующей страницы за 3 элемента до конца (`onNext`); панель автоскрывается через 7с бездействия.
- **Player-интеграция** — кнопка записи в панели плеера (`Lampa.PlayerPanel.render().find('.player-panel__settings').after(btn)`), слушает `Lampa.Player.listener 'ready'/'destroy'`; сегменты чужих шотов рисуются на таймлайне плеера с превью-картинками (клик = перемотка).
- **View (карточка фильма)** — по событию `Lampa.Listener.follow('full', ...)` добавляет кнопку «Shots» с бейджем количества после кнопки торрентов; открывает `Activity` c компонентом `shots_card`.

Регистрация в UI:

```js
Lampa.Component.add('shots_list' | 'shots_card' | 'shots_channel', ...)
Lampa.ContentRows.add({ screen: ['main'], ... })      // ряд «Shots» на главной
Lampa.ContentRows.add({ screen: ['bookmarks'], ... }) // ряды в закладках
Lampa.Menu.addButton(icon, 'Shots', onClick)          // пункт в левом меню
Lampa.SettingsApi.addComponent + addParam             // shots_in_player, shots_in_card
```

Карточка шота в рядах — через `Lampa.Maker.make('Episode', data, m => m.only('Card','Callback'))`
с классом `full-episode--shot`.

### Ограничения/правила продукта

- Квота: 1 запись в 10 минут (`shots_last_record` в Storage, проверка клиентская).
- Длительность: > 10 с и ≤ 5 мин; предупреждение, если фрагмент ближе 60 с к началу или 5 мин к концу (спойлер титров).
- Запись недоступна: IPTV, YouTube, торренты (нет `balanser`), без CUB-токена, TS/AD-качество, год < 1985, для сериалов — только при известных season/episode.
- `balanser` берётся из `Storage['online_watched_last']` — то есть запись реально работает только для онлайн-балансеров, чьи потоки CUB-сервер может сам переполучить.
- Детский профиль (`Account.Permit.child`) — ряд Shots на главной скрыт.

## Что это значит для «дорама-шотов»

Ключевой вывод: **вся тяжёлая часть — серверная** (перерезка потока, хостинг mp4).
Клиент — это UI + список URL на mp4. Отсюда три реальных пути:

1. **Читать чужой фид CUB и фильтровать корейское.** API открыт для чтения без
   токена; но фильтра по языку/стране нет — можно фильтровать клиентски по
   `card_id` через TMDB (`original_language == 'ko'`), либо запрашивать
   `card/{id}/{type}` по нашим каталожным тайтлам. Минус: корейских шотов там
   может быть мало; плюс: ноль инфраструктуры.
2. **Свой контент без сервера-резака:** «шоты» = вертикальный фид клипов из
   готовых источников (YouTube-трейлеры/клипы TMDB `videos`, teasers Netflix KR
   и т.п.). Полностью клиентский плагин: наш каталог дорам → TMDB videos →
   фид в стиле Lenta. Минус: это трейлеры, не «моменты».
3. **Полный клон с своим бэкендом** (upload-request → воркер режет поток →
   S3/CDN). Дорого: нужны свои балансер-резолверы на сервере.

UI-часть (Lenta, Roll, карточки, ряд на главной, кнопка в меню) переносима
почти 1:1 — все нужные `Lampa.*` API публичны и уже используются в `dorama.js`.

Локальная копия плагина для изучения скачивается так:
`curl -sL https://cub.rip/plugin/shots -o shots.js` (мирроры: cubnotrip.top;
lampa.mx с этой машины недоступен по TLS, cub.rip — доступен).
