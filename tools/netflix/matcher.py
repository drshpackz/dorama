"""TMDB matching of Netflix titles and the TMDB stage of the pipeline (spec §12 A2).

The scoring core is the v4 matcher of the r3 prototype (proto/match.py, r3 §4.1): search
search/{tv|movie}?query=<show_title>&language=en-US, score every candidate by title, the
original title and release date from What We Watched, release date against the first
chart week, language and popularity; fallbacks: the original title, the other media
type, the part before ':'. The year is never a filter. high and medium are accepted
(a card from details ru-RU), low and none go to the review queue with no card.

The stage decides what this run asks TMDB, within the budget:
  1. ids that overrides ask for and the cache does not hold (details only);
  2. titles never searched: titles of the last week first, then global ones, then by
     points (with --backfill: global first, then by points);
  3. titles of the last week whose card was checked 30 days ago or more (poster,
     Russian title and trailers come later for new releases);
  4. low and none, once a month.
"""
import datetime
import math

import nfdata
import tmdb

STALE_DAYS = 30
CHECKPOINT = 250   # titles between cache saves in a long run

# Countries whose charts are dominated by local-language titles -> expected original_language.
COUNTRY_LANG = {
    'KR': {'ko'}, 'JP': {'ja'}, 'TW': {'zh', 'cn'}, 'HK': {'cn', 'zh'}, 'TH': {'th'}, 'VN': {'vi'}, 'ID': {'id'},
    'PH': {'tl', 'en'}, 'MY': {'ms', 'id'}, 'IN': {'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn', 'pa', 'gu'},
    'PK': {'ur', 'hi'}, 'BD': {'bn', 'hi'}, 'TR': {'tr'}, 'IL': {'he'}, 'EG': {'ar'}, 'SA': {'ar'}, 'AE': {'ar'},
    'KW': {'ar'}, 'QA': {'ar'}, 'BH': {'ar'}, 'OM': {'ar'}, 'JO': {'ar'}, 'LB': {'ar'}, 'MA': {'ar', 'fr'},
    'BR': {'pt'}, 'PT': {'pt'}, 'MX': {'es'}, 'AR': {'es'}, 'CO': {'es'}, 'CL': {'es'}, 'PE': {'es'}, 'ES': {'es'},
    'UY': {'es'}, 'PY': {'es'}, 'BO': {'es'}, 'EC': {'es'}, 'VE': {'es'}, 'CR': {'es'}, 'GT': {'es'}, 'HN': {'es'},
    'SV': {'es'}, 'NI': {'es'}, 'PA': {'es'}, 'DO': {'es'}, 'FR': {'fr'}, 'BE': {'fr', 'nl'}, 'CH': {'de', 'fr'},
    'DE': {'de'}, 'AT': {'de'}, 'IT': {'it'}, 'PL': {'pl'}, 'CZ': {'cs'}, 'SK': {'sk', 'cs'}, 'HU': {'hu'},
    'RO': {'ro'}, 'BG': {'bg'}, 'GR': {'el'}, 'CY': {'el'}, 'HR': {'hr'}, 'RS': {'sr'}, 'SI': {'sl'}, 'UA': {'uk'},
    'RU': {'ru'}, 'LT': {'lt'}, 'LV': {'lv'}, 'EE': {'et'}, 'NL': {'nl'}, 'DK': {'da'}, 'NO': {'no', 'nb'},
    'SE': {'sv'}, 'FI': {'fi'}, 'IS': {'is'}, 'NG': {'en', 'yo'}, 'KE': {'en', 'sw'}, 'ZA': {'en', 'af', 'zu'},
}
FIRST_LABELS = ('', 'Season 1', 'Limited Series', 'Part 1', 'Volume 1')


def d2(s):
    try:
        return datetime.date.fromisoformat((s or '')[:10])
    except ValueError:
        return None


# ---- the v4 matcher (proto/match.py) ----

def tsim(q, names):
    nq = nfdata.norm(q)
    best = 0.0
    for n in names:
        if not n:
            continue
        nn = nfdata.norm(n)
        if not nn:
            continue
        if nn == nq:
            s = 1.0
        elif nn.replace(' ', '') == nq.replace(' ', ''):
            s = 0.97
        else:
            a, b = set(nq.split()), set(nn.split())
            s = 0.9 * len(a & b) / max(1, len(a | b))
            if nq.startswith(nn + ' ') or nn.startswith(nq + ' '):
                s = max(s, 0.7)
        best = max(best, s)
    return best


def score(row, c, kind):
    """Score of one TMDB search result for a Netflix title: (score, reasons)."""
    name = c.get('name') or c.get('title') or ''
    orig = c.get('original_name') or c.get('original_title') or ''
    date = d2(c.get('first_air_date') or c.get('release_date') or '')
    fw = d2(row['first_week'])
    why = []
    ts = tsim(row['title'], [name, orig])
    native_hit = bool(row['native']) and nfdata.norm(row['native']) != '' and nfdata.norm(row['native']) == nfdata.norm(orig)
    if native_hit:
        ts = max(ts, 1.0)
        why.append('native=orig')
    s = ts + (0.3 if native_hit else 0)
    why.append('t%.2f' % ts)
    if date is None:
        s -= 0.15
        why.append('nodate')
    elif date > fw + datetime.timedelta(days=7):
        late = (date - fw).days
        s -= 0.6 if late > 30 else 0.25
        why.append('after-chart+%dd' % late)
    else:
        gap = (fw - date).days
        if row['first_week'] > '2021-07-04' and gap <= 45:
            s += 0.12
            why.append('fresh')
        if row['release']:
            rd = d2(row['release'])
            if rd and abs((rd - date).days) <= 4:
                s += 0.3
                why.append('www-release')
        # An obscure film (< 100 votes) more than 15 years older than its first week does not get into the
        # global top 10: it is a namesake (The Man from Toronto 1933, 365 Days 1922, Mary, Mother of Jesus 1999).
        if kind == 'movie' and gap > 15 * 365 and row['lang'] in (0, 1) and (c.get('vote_count') or 0) < 100:
            s -= 0.3
            why.append('old-obscure')
    ol = c.get('original_language') or ''
    if row['lang'] == 0:
        s += 0.15 if ol == 'en' else -0.3
    elif row['lang'] == 1:
        s += 0.15 if ol != 'en' else -0.3
    else:
        # share of the countries where it charted whose local language is the candidate's language
        known = [cc for cc in row['countries'] if cc in COUNTRY_LANG]
        share = sum(1 for cc in known if ol in COUNTRY_LANG[cc]) / len(known) if known else 0
        local = set()
        for cc in known:
            local |= COUNTRY_LANG[cc]
        if ol != 'en' and (share >= 0.5 or (len(known) <= 6 and ol in local)):
            s += 0.15
            why.append('lang-hint')
        elif ol != 'en' and share == 0 and len(known) >= 3:
            s -= 0.1
        oc = c.get('origin_country') or []
        if oc and set(oc) & set(row['countries']):
            s += 0.05
            why.append('oc-hint')
    vc = c.get('vote_count') or 0
    s += min(0.2, 0.06 * math.log10(1 + vc))
    if kind != row['kind']:
        s -= 0.05
    return round(s, 3), why


def _name(c):
    return c.get('name') or c.get('title')


def match(row, client):
    """Search TMDB for one title; {'conf', and for a candidate: 'score', 'media', 'id', 'name', 'date', 'ol', 'alts'}."""
    kind = row['kind']
    alt = 'movie' if kind == 'tv' else 'tv'

    def search(query, media):
        res = client.get('search/' + media, query=query, language='en-US', include_adult='false', page=1) or {}
        return [(media, c) for c in res.get('results') or [] if c.get('id')]

    def best_of(cs):
        sc = [(score(row, c, k)[0], k, c) for k, c in cs]
        fw = d2(row['first_week'])
        # A known namesake film (>= 50 votes) from around the first chart week (3 years before to 13 months
        # after: TMDB often dates a Netflix film by a later release) pushes films more than 15 years older
        # down: 365 Days 2020 over 1922, River Wild 2023 over Wild River 1960, Bullet Train Explosion 2025 over 1975.
        def date(c):
            return d2(c.get('release_date') or c.get('first_air_date') or '')
        recent = fw is not None and any(
            k == 'movie' and date(c) is not None and -3 * 365 <= (date(c) - fw).days <= 400
            and (c.get('vote_count') or 0) >= 50
            and tsim(row['title'], [_name(c), c.get('original_title')]) >= 0.9 for k, c in cs)
        if recent:
            sc = [(round(s - 0.3, 3) if k == 'movie' and date(c) is not None and (fw - date(c)).days > 15 * 365 else s, k, c)
                  for s, k, c in sc]
        return sorted(sc, key=lambda x: -x[0])

    cands = search(row['title'], kind)
    sc = best_of(cands)
    good = bool(sc) and sc[0][0] >= 1.0 and tsim(row['title'], [_name(sc[0][2]), sc[0][2].get('original_name') or sc[0][2].get('original_title')]) >= 0.8
    # fallback 1: the original title from What We Watched, also when the best hit is a
    # namesake whose original title is not that one ('Face to Face' -> 'وش في وش')
    nat_hit = bool(sc) and bool(row['native']) and nfdata.norm(row['native']) == nfdata.norm(sc[0][2].get('original_name') or sc[0][2].get('original_title') or '')
    if (not good or (row['native'] and not nat_hit)) and row['native']:
        cands += search(row['native'], kind)
        sc = best_of(cands)
        good = bool(sc) and sc[0][0] >= 1.0
    # fallback 2: the other media type (stand-up specials are TMDB movies; some 'Films' are docuseries)
    seasonless_tv = kind == 'tv' and row['seasons'] == ['']
    film_with_season = kind == 'movie' and any(s for s in row['seasons'])
    if not good and (seasonless_tv or film_with_season or not sc or sc[0][0] < 0.6):
        cands += search(row['title'], alt)
        sc = best_of(cands)
        good = bool(sc) and sc[0][0] >= 1.0
    # fallback 3: the part before ':' ("Monster: The Ed Gein Story" -> "Monster")
    if not good and ':' in row['title']:
        head = row['title'].split(':')[0].strip()
        if len(head) >= 3:
            cands += search(head, kind)
            sc = best_of(cands)
    if not sc:
        return {'conf': 'none'}
    top = sc[0]
    margin = top[0] - max([x[0] for x in sc[1:] if x[2].get('id') != top[2].get('id')] or [0])
    if top[0] >= 1.15 and margin >= 0.15:
        conf = 'high'
    elif top[0] >= 0.9 and margin >= 0.05:
        conf = 'medium'
    else:
        conf = 'low'
    c = top[2]
    alts, seen = [], {(top[1], c['id'])}
    for s, k, x in sc[1:]:
        if (k, x['id']) not in seen and len(alts) < 3:
            seen.add((k, x['id']))
            alts.append([s, '%s/%d' % (k, x['id']), _name(x), (x.get('first_air_date') or x.get('release_date') or '')[:4]])
    return {'conf': conf, 'score': top[0], 'media': top[1], 'id': c['id'], 'name': _name(c),
            'date': c.get('first_air_date') or c.get('release_date') or '', 'ol': c.get('original_language'),
            'alts': alts}


def title_row(e, www):
    """What the matcher knows of one title (the 'row' of proto/match.py)."""
    langs = {r[1] % 2 for r in e.glob} or {r[0] % 2 for r in e.popular}
    weeks = [r[0] for r in e.glob] + [r[1] for r in e.country]
    labels = sorted(e.seasons, key=lambda label: (e.seasons[label] < 0, e.seasons[label], label))
    recs = []
    for label in labels:
        full = e.title + ((': ' + label) if label and not label.isdigit() else ((' ' + label) if label else ''))
        rec = www.get((e.kind, full)) or www.get((e.kind, e.title))
        if rec:
            recs.append((label, rec))
    native = ''
    for label, rec in recs:
        if rec.get('native'):
            # 'Hellbound: Season 1 // 지옥: 시즌 1' -> the native show name is '지옥'
            nat = rec['native'].split(' // ')[0]
            native = nat.rsplit(':', 1)[0].strip() if label and ':' in nat else nat
            break
    release = ''
    for label, rec in recs:
        if rec.get('release') and label in FIRST_LABELS:
            release = rec['release']
            break
    return {'key': e.key, 'kind': 'tv' if e.kind == nfdata.TV else 'movie', 'title': e.title,
            'lang': langs.pop() if len(langs) == 1 else (2 if langs else -1),
            'first_week': nfdata.week_date(min(weeks) if weeks else -1), 'seasons': labels,
            'countries': sorted({r[0] for r in e.country}), 'native': native, 'release': release}


# ---- the stage ----

def wanted(ov):
    """What an override asks of TMDB: None = match as usual, False = no card, (mt, id) = this card."""
    if ov.get('hide'):
        return False
    if 'tmdb' in ov:
        if not ov['tmdb']:
            return False
        try:
            return tmdb.parse_ref(ov['tmdb'])
        except ValueError:
            return False
    return None


def usable(entry, want):
    """The cache line gives the card of this run (want as from wanted())."""
    if entry is None or want is False:
        return False
    if want is None:
        return entry.get('conf') in ('high', 'medium')
    return entry.get('conf') in ('high', 'medium', 'manual') and (entry.get('mt'), entry.get('id')) == want


def stale(entry, today):
    day = d2(entry.get('checked'))
    return day is None or (today - day).days >= STALE_DAYS


class Stage:
    """The TMDB work of one run; plan() then run()."""

    def __init__(self, cache, ents, overrides, last_week, today):
        self.cache = cache
        self.ents = ents
        self.want = {k: wanted(overrides.get(k, {})) for k in ents}
        self.last_week = last_week
        self.today = today
        self.stats = {}

    def recent(self, e):
        return any(r[0] == self.last_week for r in e.glob) or any(r[1] == self.last_week for r in e.country)

    def pending(self):
        """Titles that wait for their first search."""
        return sum(1 for k in self.ents if self.want[k] is None and
                   (self.cache.get(k) is None or self.cache[k].get('conf') == 'manual'))

    def plan(self, backfill):
        manual, new, refresh, recheck = [], [], [], []
        for key in sorted(self.ents):
            e, want, entry = self.ents[key], self.want[key], self.cache.get(key)
            if want is False:
                continue
            if want is not None:
                if not usable(entry, want):
                    manual.append(('manual', key))
                elif self.recent(e) and stale(entry, self.today):
                    refresh.append(('refresh', key))
                continue
            if entry is None or entry.get('conf') == 'manual':
                pts = sum(11 - r[3] for r in e.country)
                glob = 0 if (e.glob or e.popular) else 1
                order = (glob, -pts, key) if backfill else (0 if self.recent(e) else 1, glob, -pts, key)
                new.append((order, ('match', key)))
            elif entry.get('conf') in ('high', 'medium'):
                if self.recent(e) and stale(entry, self.today):
                    refresh.append(('refresh', key))
            elif stale(entry, self.today):
                recheck.append(((entry.get('checked') or '', key), ('match', key)))
        return manual + [x[1] for x in sorted(new)] + refresh + [x[1] for x in sorted(recheck)]

    def run(self, client, src, backfill, checkpoint=None):
        """Do the planned work until it ends or TMDB stops; stats by outcome."""
        work = self.plan(backfill)
        www = None
        done = 0
        stopped = ''
        for what, key in work:
            try:
                if what == 'manual':
                    entry = self._manual(client, key)
                elif what == 'refresh':
                    entry = self._refresh(client, key)
                else:
                    if www is None:
                        try:
                            www = nfdata.load_www(src)
                        except Exception as e:   # What We Watched only sharpens the scores
                            print('warning: What We Watched not read (%s); matching without it' % e)
                            www = {}
                    entry = self._match(client, key, www)
            except tmdb.Stop as e:
                stopped = str(e)
                break
            self.cache[key] = entry
            label = what if what != 'match' else entry['conf']
            self.stats[label] = self.stats.get(label, 0) + 1
            done += 1
            if checkpoint and done % CHECKPOINT == 0:
                checkpoint()
                print('TMDB: %d of %d done, %d requests' % (done, len(work), client.made), flush=True)
        return len(work), done, stopped

    def _line(self, key, conf, **fields):
        entry = {'key': key, 'conf': conf}
        entry.update(fields)
        entry['checked'] = self.today.isoformat()
        return entry

    def _card(self, client, mt, tid):
        d = tmdb.details(client, mt, tid)
        return tmdb.card(d, mt) if d else None

    def _manual(self, client, key):
        mt, tid = self.want[key]
        c = self._card(client, mt, tid)
        if c is None:
            print('warning: override %s of %r: TMDB has no such id' % (tmdb.ref(mt, tid), key))
            return self._line(key, 'manual', mt=mt, id=tid, note='TMDB has no %s' % tmdb.ref(mt, tid))
        return self._line(key, 'manual', mt=mt, id=tid, **c)

    def _refresh(self, client, key):
        old = self.cache[key]
        c = self._card(client, old['mt'], old['id'])
        if c is None:
            if old.get('conf') == 'manual':
                return self._line(key, 'manual', mt=old['mt'], id=old['id'],
                                  note='TMDB has no %s' % tmdb.ref(old['mt'], old['id']))
            return self._line(key, 'none', note='TMDB has no %s any more' % tmdb.ref(old['mt'], old['id']))
        entry = {k: v for k, v in old.items() if k not in c and k not in ('note', 'checked')}
        entry.update(c)
        entry['checked'] = self.today.isoformat()
        return entry

    def _match(self, client, key, www):
        res = match(title_row(self.ents[key], www), client)
        if res['conf'] == 'none':
            return self._line(key, 'none')
        mt = tmdb.MEDIA.index(res['media'])
        if res['conf'] == 'low':
            return self._line(key, 'low', score=res['score'], mt=mt, id=res['id'], name=res['name'],
                              yr=int(res['date'][:4]) if res['date'][:4].isdigit() else None,
                              ol=res['ol'], alts=res['alts'])
        c = self._card(client, mt, res['id'])
        if c is None:
            return self._line(key, 'low', score=res['score'], mt=mt, id=res['id'], name=res['name'],
                              alts=res['alts'], note='details: TMDB has no %s' % tmdb.ref(mt, res['id']))
        return self._line(key, res['conf'], score=res['score'], mt=mt, id=res['id'], name=res['name'], **c)
