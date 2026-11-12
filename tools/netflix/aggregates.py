"""Title rows of the data contract (spec §3.3): Netflix aggregates, the live rule, TMDB fields."""
import re

import nfdata

FIELDS = ['k', 't', 'lg', 'lv', 'gf', 'gl', 'gy', 'gw', 'gb', 'gh', 'gv', 'cw', 'cb', 'nc', 'c1', 'pts', 'py',
          'id', 'mt', 'cf', 'ru', 'p', 'yr', 'g', 'kw', 'oc', 'ol', 'va', 'tr']
TMDB_FIELDS = FIELDS[FIELDS.index('id'):]
# union of TMDB movie and tv genre ids: bit i of g = GENRES[i]
GENRES = [12, 14, 16, 18, 27, 28, 35, 36, 37, 53, 80, 99, 878, 9648, 10402, 10749, 10751, 10752, 10759, 10762,
          10763, 10764, 10765, 10766, 10767, 10768, 10770]
# TMDB keywords: bit 0 = romance, bit 1 = anime
KWS = [9840, 210024]
UNIT = 10000
CONF = {'manual': 3, 'high': 2, 'medium': 1}
MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
DATE_LABEL = re.compile(r'^(%s) \d{1,2}, \d{4}$' % MONTHS)
CYRILLIC = re.compile('[Ѐ-ӿ]')


def units(x):
    """Hours or views in units of 10 000 (all TSV values are multiples of it)."""
    return (x + UNIT // 2) // UNIT


def live_rule(e):
    """lv by rule (spec A1.4): a TV title with >= 3 date labels (WWE), or a TV title
    without seasons whose name has ' vs. ' (Jake Paul vs. Mike Tyson; the film
    Monsters vs. Aliens stays out)."""
    if e.kind != nfdata.TV:
        return 0
    if sum(1 for label in e.seasons if DATE_LABEL.match(label)) >= 3:
        return 1
    if all(label == '' for label in e.seasons) and ' vs. ' in e.title:
        return 1
    return 0


def netflix_part(members, lv, wy, ny):
    """Fields k..py of one title; members = entities of one card, survivor first.
    wy[w] = index of the year of week w in manifest.years, ny = len(years)."""
    head = members[0]
    grows = [r for e in members for r in e.glob]
    crows = [r for e in members for r in e.country]
    if grows:
        en = sum(1 for r in grows if r[1] % 2 == 0)
        lg = 0 if en * 2 >= len(grows) else 1
    else:
        prows = [r for e in members for r in e.popular]
        if prows:
            en = sum(1 for r in prows if r[0] % 2 == 0)
            lg = 0 if en * 2 >= len(prows) else 1
        else:
            lg = -1
    gweeks = {r[0] for r in grows}
    gy = 0
    for w in gweeks:
        gy |= 1 << wy[w]
    py = [0] * ny
    for r in crows:
        py[wy[r[1]]] += 11 - r[3]
    return [
        head.kind, head.title, lg, lv,
        min(gweeks) if gweeks else -1,
        max(gweeks) if gweeks else -1,
        gy, len(gweeks),
        min(r[2] for r in grows) if grows else 0,
        units(sum(r[4] for r in grows)),
        units(sum(r[5] for r in grows)),
        len(crows),
        min(r[3] for r in crows) if crows else 0,
        len({r[0] for r in crows}),
        len({r[0] for r in crows if r[3] == 1}),
        sum(py),
        py,
    ]


def no_tmdb():
    return {'id': None, 'mt': None, 'cf': 0, 'ru': None, 'p': None, 'yr': None, 'g': 0, 'kw': 0,
            'oc': None, 'ol': None, 'va': 0, 'tr': None}


def _mask(ids, table):
    if isinstance(ids, int):
        return ids
    m = 0
    for x in ids or []:
        if x in table:
            m |= 1 << table.index(x)
    return m


def tmdb_fields(entry):
    """Row fields from one TMDB cache line (state/tmdb.jsonl, A2), e.g.
    {"key":"tv:Squid Game","id":93405,"mt":1,"conf":"high","ru":"Игра в кальмара","p":"/6zH....jpg",
     "yr":2021,"g":[10759,9648,18],"kw":[],"oc":"KR","ol":"ko","va":7.9,"tr":"ru:T:... en:T:..."}.
    Only manual, high and medium matches give a card; anything else is a stub."""
    t = no_tmdb()
    cf = CONF.get(entry.get('conf'), 0)
    if not cf or entry.get('id') is None:
        return t
    mt = entry.get('mt')
    t['id'] = int(entry['id'])
    t['mt'] = {'movie': 0, 'tv': 1}.get(mt, mt)
    t['cf'] = cf
    ru = entry.get('ru')
    t['ru'] = ru if ru and CYRILLIC.search(ru) else None
    t['p'] = entry.get('p') or None
    yr = entry.get('yr')
    if isinstance(yr, str):
        yr = int(yr[:4]) if yr[:4].isdigit() else None
    t['yr'] = yr or None
    t['g'] = _mask(entry.get('g'), GENRES)
    t['kw'] = _mask(entry.get('kw'), KWS)
    t['oc'] = entry.get('oc') or None
    t['ol'] = entry.get('ol') or None
    va = entry.get('va') or 0
    t['va'] = int(round(va * 10)) if isinstance(va, float) or va <= 10 else int(va)
    t['tr'] = entry.get('tr')
    return t


def tmdb_part(t):
    return [t[k] for k in TMDB_FIELDS]


def local_heroes(cands, limit=30):
    """home.local (spec §5.2 row 9): [n, "PH" | "MY ID", country-weeks, country-weeks at #1].
    cands: [(n, pts, country rows)] of titles outside the index, already filtered."""
    out = []
    for n, pts, crows in cands:
        by = {}
        for r in crows:
            by[r[0]] = by.get(r[0], 0) + 1
        if len(by) > 3:
            continue
        isos = sorted(by, key=lambda iso: (-by[iso], iso))
        top = sum(1 for r in crows if r[3] == 1)
        out.append((top, len(crows), pts, n, ' '.join(isos)))
    out.sort(key=lambda x: (-x[0], -x[1], -x[2], x[3]))
    return [[n, isos, cw, top] for top, cw, pts, n, isos in out[:limit]]
