"""TMDB for the netflix.js pipeline (spec §12 A2): the HTTP client and the card cache.

The key comes from env TMDB_API_KEY and from nowhere else: a v3 API key (sent as
api_key) or a v4 read access token (sent as a Bearer header). No key, no requests.
About 8 requests a second; 429 and 5xx are retried, honouring Retry-After; a request
budget per run. The key never gets into a message or a log line.

Cache state/tmdb.jsonl: one line per title key, sorted by key, so a weekly git diff is
a few lines. What a line holds depends on "conf":
  high, medium  the matcher's answer and the card (details ru-RU with videos, keywords)
  manual        the card of an id an override asked for
  low           no card; the best candidates, for the review queue
  none          nothing found
{"key":"tv:Squid Game","conf":"high","score":1.65,"mt":1,"id":93405,"name":"Squid Game",
 "ru":"Игра в кальмара","p":"/6zH....jpg","yr":2021,"g":[18,9648,10759],"kw":[],"oc":"KR",
 "ol":"ko","va":7.851,"tr":"ru:T:... en:T:...","checked":"2026-11-12"}
aggregates.tmdb_fields() turns a line into the TMDB fields of a title row.
"""
import http.client
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import aggregates
import trailers

BASE = 'https://api.themoviedb.org/3/'
RATE = 8.0           # requests a second
RETRIES = 5          # after the first try
TIMEOUT = 20         # seconds per request
BAD_LIMIT = 20       # other 4xx answers in a run before the stage stops
UA = 'dorama-netflix-top10/1 (+https://github.com/drshpackz/dorama)'
MEDIA = ('movie', 'tv')   # mt 0, 1
REF = re.compile(r'^(?P<media>movie|tv)/(?P<id>\d+)$')
ORDER = ('key', 'conf', 'score', 'mt', 'id', 'name', 'ru', 'p', 'yr', 'g', 'kw', 'oc', 'ol', 'va', 'tr', 'trv',
         'alts', 'note', 'checked')


class Stop(Exception):
    """No more TMDB requests in this run: the budget is spent, the key is refused or TMDB is down."""


class Client:
    """GET api.themoviedb.org/3 with pacing, retries and a budget; answers are kept for the run."""

    def __init__(self, key, budget=0, rate=RATE):
        self.key = key.strip()
        self.bearer = self.key.count('.') == 2 and len(self.key) > 60   # a v4 token is a JWT
        self.budget = budget      # requests for the run, 0 = no limit
        self.made = 0             # HTTP requests sent, retries included
        self.bad = 0
        self.gap = 1.0 / rate
        self.last = 0.0
        self.memo = {}

    def get(self, path, **params):
        """GET /3/<path>?<params>: parsed JSON, or None when TMDB has no such object."""
        query = urllib.parse.urlencode(sorted((k, v) for k, v in params.items() if v is not None))
        url = BASE + path + ('?' + query if query else '')
        if url not in self.memo:
            self.memo[url] = self._fetch(url)
        return self.memo[url]

    def _fetch(self, url):
        headers = {'Accept': 'application/json', 'User-Agent': UA}
        full = url
        if self.bearer:
            headers['Authorization'] = 'Bearer ' + self.key
        else:
            full += ('&' if '?' in url else '?') + 'api_key=' + urllib.parse.quote(self.key, safe='')
        why = ''
        for attempt in range(RETRIES + 1):
            if self.budget and self.made >= self.budget:
                raise Stop('the budget of %d requests is spent' % self.budget)
            wait = self.gap - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            self.made += 1
            delay = min(2 ** attempt, 60)
            try:
                with urllib.request.urlopen(urllib.request.Request(full, headers=headers), timeout=TIMEOUT) as r:
                    return json.loads(r.read().decode('utf-8'))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code in (401, 403):
                    raise Stop('TMDB does not accept TMDB_API_KEY (HTTP %d)' % e.code)
                if e.code != 429 and e.code < 500:
                    self.bad += 1
                    print('warning: TMDB answers HTTP %d to %s' % (e.code, url))
                    if self.bad > BAD_LIMIT:
                        raise Stop('%d answers HTTP 4xx' % self.bad)
                    return None
                retry_after = (e.headers.get('Retry-After') or '').strip() if e.headers else ''
                if retry_after.isdigit():
                    delay = min(int(retry_after) + 1, 120)
                why = 'HTTP %d' % e.code
            except (OSError, http.client.HTTPException, ValueError) as e:   # URLError, timeouts, resets, bad JSON
                why = type(e).__name__
            if attempt < RETRIES:
                time.sleep(delay)
        raise Stop('TMDB does not answer (%s, %d tries)' % (why, RETRIES + 1))


def parse_ref(ref):
    """'tv/136125' -> (1, 136125); ValueError for anything else."""
    m = REF.match(str(ref).strip())
    if not m:
        raise ValueError('not "movie/<id>" or "tv/<id>": %r' % (ref,))
    return MEDIA.index(m.group('media')), int(m.group('id'))


def ref(mt, tid):
    return '%s/%d' % (MEDIA[mt], tid)


def details(client, mt, tid):
    """Details ru-RU with videos and keywords: one request a title. None if TMDB has no such id."""
    return client.get('%s/%d' % (MEDIA[mt], tid), language='ru-RU', append_to_response='videos,keywords',
                      include_video_language='ru,en')


def card(d, mt):
    """Card fields of a cache line from a details answer (spec §3.3 and §12 A2 step 2)."""
    name = d.get('title' if mt == 0 else 'name') or ''
    date = d.get('release_date' if mt == 0 else 'first_air_date') or ''
    oc = d.get('origin_country') or [x.get('iso_3166_1') for x in d.get('production_countries') or []
                                     if x.get('iso_3166_1')]
    kws = (d.get('keywords') or {}).get('keywords' if mt == 0 else 'results') or []
    return {
        'ru': name if aggregates.CYRILLIC.search(name) else None,
        'p': d.get('poster_path') or None,
        'yr': int(date[:4]) if date[:4].isdigit() else None,
        'g': sorted({g.get('id') for g in d.get('genres') or [] if g.get('id') in aggregates.GENRES}),
        'kw': sorted({k.get('id') for k in kws if k.get('id') in aggregates.KWS}),
        'oc': oc[0] if oc else None,
        'ol': d.get('original_language') or None,
        'va': round(float(d.get('vote_average') or 0), 3),
        'tr': trailers.pick((d.get('videos') or {}).get('results') or []),
        'trv': trailers.VERSION,
    }


def ordered(entry):
    out = {k: entry[k] for k in ORDER if k in entry}
    out.update((k, v) for k, v in sorted(entry.items()) if k not in out)
    return out


def load_cache(path):
    """state/tmdb.jsonl -> {key: line}."""
    cache = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    entry = json.loads(line)
                    cache[entry['key']] = entry
    return cache


def dumps_cache(cache):
    return ''.join(json.dumps(ordered(cache[k]), ensure_ascii=False, separators=(',', ':')) + '\n'
                   for k in sorted(cache))


def save_cache(path, cache):
    """Write the cache when it changed; True if written."""
    text = dumps_cache(cache)
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            if f.read() == text:
                return False
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)
    return True
