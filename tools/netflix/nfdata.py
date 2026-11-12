"""Netflix Top 10 input for the netflix.js data pipeline.

Reads the three TSV files Netflix publishes, checks their shape and builds title
entities with their seasons. The What We Watched XLSX reader is here too, for the
TMDB matcher. Ported from the r3 prototype (proto/nfdata.py). Stdlib only.

Entity: one show or one film, that is one TMDB card. Key 'tv:<show_title>' or
'film:<show_title>'. A film title that stands for two films (different language
category or runtime, r3 §1) is split: the earliest film keeps the bare key and a later
one gets '#<e|n><runtime>' ('film:Alpha#n2.35'), so a new namesake never renumbers
the old card.
Season: (entity, label); label is season_title after show_title, '' for N/A.
"""
import collections
import csv
import datetime
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

W0 = datetime.date(2021, 7, 4)
FILM, TV = 0, 1
CATS = ['Films (English)', 'Films (Non-English)', 'TV (English)', 'TV (Non-English)']
GLOBAL_TSV = 'all-weeks-global.tsv'
COUNTRY_TSV = 'all-weeks-countries.tsv'
POPULAR_TSV = 'most-popular.tsv'
GLOBAL_COLS = ('week', 'category', 'weekly_rank', 'show_title', 'season_title',
               'weekly_hours_viewed', 'runtime', 'weekly_views', 'cumulative_weeks_in_top_10')
COUNTRY_COLS = ('country_name', 'country_iso2', 'week', 'category', 'weekly_rank',
                'show_title', 'season_title', 'cumulative_weeks_in_top_10')
POPULAR_COLS = ('category', 'rank', 'show_title', 'season_title',
                'hours_viewed_first_91_days', 'runtime', 'views_first_91_days')
COUNTRY_CATS = {'Films': FILM, 'TV': TV}


class InputError(Exception):
    """The Netflix files are not in the shape the pipeline expects."""


_weeks = {}


def week_index(day):
    """'2021-07-04' -> 0. Netflix names a Monday-Sunday week by its Sunday."""
    w = _weeks.get(day)
    if w is None:
        try:
            delta = (datetime.date.fromisoformat(day) - W0).days
        except ValueError:
            raise InputError('bad week date %r' % day)
        if delta < 0 or delta % 7:
            raise InputError('week %s is not a Sunday on or after %s' % (day, W0))
        w = _weeks[day] = delta // 7
    return w


def week_date(w):
    return (W0 + datetime.timedelta(days=7 * w)).isoformat()


def week_year(w):
    return (W0 + datetime.timedelta(days=7 * w)).year


def season_label(show, season):
    """'Squid Game: Season 2' -> 'Season 2'; 'Stranger Things 4' -> '4'; 'N/A' -> ''."""
    if season in ('', 'N/A'):
        return ''
    if season.startswith(show + ': '):
        return season[len(show) + 2:]
    if season.startswith(show + ' '):
        return season[len(show) + 1:]
    return season


def norm(s):
    """Loose form of a title for matching."""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().replace('&', ' and ').replace('’', "'")
    s = re.sub(r"[^\w\s]", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _int(s, where):
    if s in ('', 'N/A'):
        return None
    try:
        return int(s)
    except ValueError:
        try:
            return int(round(float(s)))
        except ValueError:
            raise InputError('%s: not a number %r' % (where, s))


def read_tsv(path, cols):
    """Rows of a Netflix TSV as tuples in the order of cols."""
    name = os.path.basename(path)
    if not os.path.exists(path):
        raise InputError('%s: not found' % path)
    with open(path, encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f, delimiter='\t')
        header = next(reader, None) or []
        missing = [c for c in cols if c not in header]
        if missing:
            raise InputError('%s: no column %s; file starts %r' % (name, ', '.join(missing), '\t'.join(header)[:120]))
        idx = [header.index(c) for c in cols]
        need = max(idx) + 1
        rows = []
        for row in reader:
            if not row:
                continue
            if len(row) < need:
                raise InputError('%s line %d: %d columns' % (name, reader.line_num, len(row)))
            rows.append(tuple(row[i] for i in idx))
    return rows


GRow = collections.namedtuple('GRow', 'w cat rank title season hours runtime views cw')
CRow = collections.namedtuple('CRow', 'iso w kind rank title season')
PRow = collections.namedtuple('PRow', 'cat rank title season hours runtime views')


class Netflix:
    """The checked input: global rows, country rows, the all-time list."""

    def __init__(self, glob, country, popular, countries, cc, nw, vf):
        self.glob = glob            # [GRow], sorted by (w, cat, rank)
        self.country = country      # [CRow]
        self.popular = popular      # [PRow], sorted by (cat, rank)
        self.countries = countries  # [(iso, name)] by iso
        self.cc = cc                # iso -> [first week, last week]
        self.nw = nw                # weeks 0 .. nw-1
        self.vf = vf                # first week with views


def _ranks_ok(ranks):
    return sorted(ranks) == list(range(1, 11))


def load(src):
    """Read and check the three TSV files of folder src (r3 §5.4 step 1)."""
    glob = []
    for r in read_tsv(os.path.join(src, GLOBAL_TSV), GLOBAL_COLS):
        if r[1] not in CATS:
            raise InputError('%s: unknown category %r' % (GLOBAL_TSV, r[1]))
        where = '%s %s %s' % (GLOBAL_TSV, r[0], r[1])
        hours = _int(r[5], where)
        if hours is None:
            raise InputError('%s: no hours for %r' % (where, r[3]))
        glob.append(GRow(week_index(r[0]), CATS.index(r[1]), _int(r[2], where), r[3], r[4], hours,
                         r[6] if r[6] not in ('', 'N/A') else '', _int(r[7], where), _int(r[8], where) or 0))
    if not glob:
        raise InputError('%s: no rows' % GLOBAL_TSV)
    glob.sort(key=lambda r: (r.w, r.cat, r.rank))
    nw = glob[-1].w + 1
    slots = collections.defaultdict(list)
    for r in glob:
        slots[(r.w, r.cat)].append(r.rank)
    for w in range(nw):
        for cat in range(4):
            if not _ranks_ok(slots.get((w, cat), [])):
                raise InputError('%s: week %s, %s has ranks %s, expected 1..10' % (
                    GLOBAL_TSV, week_date(w), CATS[cat], sorted(slots.get((w, cat), []))))
    with_views = [r.w for r in glob if r.views is not None]
    vf = min(with_views) if with_views else nw
    late = sum(1 for r in glob if r.w >= vf and r.views is None)
    if late:
        print('warning: %d global rows after %s have no views; taken as 0' % (late, week_date(vf)))

    country = []
    names = {}
    for r in read_tsv(os.path.join(src, COUNTRY_TSV), COUNTRY_COLS):
        kind = COUNTRY_CATS.get(r[3])
        if kind is None:
            raise InputError('%s: unknown category %r' % (COUNTRY_TSV, r[3]))
        if not re.match(r'^[A-Z]{2}$', r[1]):
            raise InputError('%s: bad country code %r' % (COUNTRY_TSV, r[1]))
        names.setdefault(r[1], r[0])
        country.append(CRow(r[1], week_index(r[2]), kind, _int(r[4], COUNTRY_TSV + ' ' + r[2]), r[5], r[6]))
    slots = collections.defaultdict(list)
    weeks = collections.defaultdict(set)
    for r in country:
        slots[(r.iso, r.w, r.kind)].append(r.rank)
        weeks[r.iso].add(r.w)
    cc = {}
    for iso in sorted(weeks):
        ws = weeks[iso]
        a, b = min(ws), max(ws)
        if b >= nw:
            raise InputError('%s: %s has week %s, the global file ends at %s' % (
                COUNTRY_TSV, iso, week_date(b), week_date(nw - 1)))
        for w in range(a, b + 1):
            for kind in (FILM, TV):
                if not _ranks_ok(slots.get((iso, w, kind), [])):
                    raise InputError('%s: %s, week %s, %s has ranks %s, expected 1..10' % (
                        COUNTRY_TSV, iso, week_date(w), 'Films' if kind == FILM else 'TV',
                        sorted(slots.get((iso, w, kind), []))))
        cc[iso] = [a, b]
    if not cc or max(b for a, b in cc.values()) != nw - 1:
        raise InputError('%s does not reach the last global week %s' % (COUNTRY_TSV, week_date(nw - 1)))

    popular = []
    for r in read_tsv(os.path.join(src, POPULAR_TSV), POPULAR_COLS):
        if r[0] not in CATS:
            raise InputError('%s: unknown category %r' % (POPULAR_TSV, r[0]))
        where = POPULAR_TSV + ' ' + r[0]
        popular.append(PRow(CATS.index(r[0]), _int(r[1], where), r[2], r[3], _int(r[4], where) or 0,
                            r[5] if r[5] not in ('', 'N/A') else '', _int(r[6], where) or 0))
    popular.sort(key=lambda r: (r.cat, r.rank))
    for cat in range(4):
        if not _ranks_ok([r.rank for r in popular if r.cat == cat]):
            raise InputError('%s: %s does not have ranks 1..10' % (POPULAR_TSV, CATS[cat]))

    countries = [(iso, names[iso]) for iso in sorted(cc)]
    return Netflix(glob, country, popular, countries, cc, nw, vf)


class Entity:
    """One title. Rows keep the season label, numbers are given later (ids.py)."""
    __slots__ = ('key', 'kind', 'title', 'seasons', 'glob', 'country', 'popular')

    def __init__(self, key, kind, title):
        self.key = key
        self.kind = kind
        self.title = title
        self.seasons = {}    # label -> first week in any chart, -1 if only in most-popular
        self.glob = []       # (w, cat, rank, label, hours, views, cw)
        self.country = []    # (iso, w, kind, rank, label)
        self.popular = []    # (cat, rank, label, hours, views)

    def season(self, label, w):
        old = self.seasons.get(label)
        if old is None or (w >= 0 and (old < 0 or w < old)):
            self.seasons[label] = w

    def first_week(self):
        ws = [w for w in self.seasons.values() if w >= 0]
        return min(ws) if ws else -1


def split_namesakes(glob):
    """Film titles that stand for several films: title -> [[suffix, lang, runtime, weeks]].

    Signature = (language category, runtime). Rows from before runtimes were published
    join the nearest film of their language. The earliest film gets suffix ''.
    """
    groups = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in glob:
        if r.cat < 2:
            groups[r.title][(r.cat, r.runtime)].append(r.w)
    out = {}
    for title, sigs in groups.items():
        with_rt = collections.OrderedDict((k, v) for k, v in sigs.items() if k[1])
        if len(with_rt) <= 1 and len({k[0] for k in sigs}) <= 1:
            continue
        variants = []
        for (lang, rt), ws in sorted(with_rt.items(), key=lambda kv: (min(kv[1]), kv[0])):
            variants.append(['%s%s' % ('e' if lang == 0 else 'n', rt), lang, rt, set(ws)])
        for (lang, rt), ws in sigs.items():
            if rt:
                continue
            same = [v for v in variants if v[1] == lang]
            if not same:
                variants.append(['e' if lang == 0 else 'n', lang, '', set(ws)])
            else:
                best = min(same, key=lambda v: min(abs(w - x) for w in ws for x in v[3]))
                best[3].update(ws)
        if len(variants) > 1:
            first = min(variants, key=lambda v: min(v[3]))
            first[0] = ''
            out[title] = variants
    return out


def _pick(variants, w, lang=None, runtime=''):
    cand = variants
    if lang is not None:
        same = [v for v in variants if v[1] == lang]
        cand = ([v for v in same if runtime and v[2] == runtime]
                or [v for v in same if not runtime or not v[2]] or same or variants)
    return min(cand, key=lambda v: min(abs(w - x) for x in v[3]))


def entities(nf):
    """Title entities of the input: key -> Entity."""
    variants = split_namesakes(nf.glob)
    ents = {}

    def entity(kind, title, w, lang=None, runtime=''):
        key = ('tv:' if kind == TV else 'film:') + title
        vs = variants.get(title) if kind == FILM else None
        if vs:
            suffix = _pick(vs, w, lang, runtime)[0]
            if suffix:
                key += '#' + suffix
        e = ents.get(key)
        if e is None:
            e = ents[key] = Entity(key, kind, title)
        return e

    for r in nf.glob:
        e = entity(FILM if r.cat < 2 else TV, r.title, r.w, r.cat % 2, r.runtime)
        label = season_label(r.title, r.season)
        e.season(label, r.w)
        e.glob.append((r.w, r.cat, r.rank, label, r.hours, r.views or 0, r.cw))
    for r in nf.country:
        e = entity(r.kind, r.title, r.w)
        label = season_label(r.title, r.season)
        e.season(label, r.w)
        e.country.append((r.iso, r.w, r.kind, r.rank, label))
    for r in nf.popular:
        e = entity(FILM if r.cat < 2 else TV, r.title, 0, r.cat % 2, r.runtime)
        label = season_label(r.title, r.season)
        e.season(label, -1)
        e.popular.append((r.cat, r.rank, label, r.hours, r.views))
    return ents


# What We Watched reports (for the TMDB matcher, not used by the core build).

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def load_www(src):
    """What We Watched XLSX in src: {(kind, title): {'native', 'release', 'periods', 'global'}}."""
    out = {}
    for fn in sorted(os.listdir(src)):
        m = re.match(r'What_We_Watched_(\d{4})(Jan-Jun|Jul-Dec)\.xlsx$', fn)
        if not m:
            continue
        period = m.group(1) + ('H1' if m.group(2) == 'Jan-Jun' else 'H2')
        for sheet, kind in (('Shows', TV), ('Movies', FILM)):
            for row in xlsx_rows(os.path.join(src, fn), sheet):
                if len(row) < 7 or not row[1] or row[1] == 'Title' or row[4] in (None, ''):
                    continue
                title = str(row[1]).strip()
                if title.startswith('Other ') or title.startswith('*'):
                    continue
                native = ''
                if ' // ' in title:
                    title, native = [x.strip() for x in title.split(' // ', 1)]
                rec = out.setdefault((kind, title), {'native': native, 'release': '', 'periods': {}, 'global': ''})
                if native and not rec['native']:
                    rec['native'] = native
                if row[3] and not rec['release']:
                    rec['release'] = str(row[3])[:10]
                rec['global'] = row[2] or rec['global']
                try:
                    rec['periods'][period] = (float(row[4]), float(row[6] or 0))
                except (TypeError, ValueError):
                    pass
    return out


def xlsx_rows(path, sheet_name):
    """Minimal stdlib xlsx reader: rows as lists of str/float/None, column-aligned."""
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid = None
    for s in wb.iter(NS + 'sheet'):
        if s.get('name') == sheet_name:
            rid = s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    target = None
    for r in rels:
        if r.get('Id') == rid:
            target = r.get('Target')
    if target is None:
        return
    target = target.lstrip('/')
    if not target.startswith('xl/'):
        target = 'xl/' + target
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    root = ET.fromstring(z.read(target))
    for row in root.iter(NS + 'row'):
        cells = {}
        for c in row.iter(NS + 'c'):
            col = 0
            for ch in re.match(r'[A-Z]+', c.get('r')).group(0):
                col = col * 26 + ord(ch) - 64
            t = c.get('t')
            v = c.find(NS + 'v')
            if t == 's' and v is not None:
                val = shared[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(NS + 't'))
            elif v is not None:
                try:
                    val = float(v.text)
                except ValueError:
                    val = v.text
            else:
                val = None
            cells[col - 1] = val
        if cells:
            yield [cells.get(i) for i in range(max(cells) + 1)]
