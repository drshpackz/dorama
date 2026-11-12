"""The netflix/ folder of the data contract (spec §3.2-3.8): objects, bytes, hashes, sizes.

Every file carries 'b', the build stamp. A file whose content did not change keeps its
old bytes, 'b' included, so a rebuild on the same input leaves the folder byte for byte
as it was and the weekly job has nothing to commit.
"""
import collections
import gzip
import hashlib
import json
import os

import aggregates
import nfdata

# spec §3.10: gzip target and raw ceiling, bytes
BUDGET = collections.OrderedDict([
    ('manifest.json', (2000, 4000)),
    ('home.json', (45000, 120000)),
    ('index.json', (360000, 900000)),
    ('global.json', (75000, 230000)),
    ('country/XX.json', (110000, 260000)),
])


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def _head(bd):
    return collections.OrderedDict([('schema', 1), ('v', bd.v), ('b', bd.b)])


def build_files(bd):
    """rel path -> object for every file but the manifest, and the manifest without 'files'."""
    files = collections.OrderedDict()
    owner = bd.so

    # home.json — the first screen without the index
    W = bd.nw - 1
    home = _head(bd)
    home['w'] = W
    home['unit'] = aggregates.UNIT
    home['vf'] = bd.vf
    home['fields'] = aggregates.FIELDS
    home['weeks'] = collections.OrderedDict((str(w), bd.gweeks[w]) for w in (W, W - 1) if w >= 0)
    home['c'] = collections.OrderedDict((iso, bd.cweeks[iso][W]) for iso, _ in bd.countries if bd.cc[iso][1] == W)
    home['alltime'] = bd.alltime
    home['local'] = bd.local
    sids = set()
    for wk in home['weeks'].values():
        for cat in wk:
            sids.update(x[0] for x in cat)
    for lists in home['c'].values():
        for lst in lists:
            sids.update(lst)
    for cat in bd.alltime:
        sids.update(x[0] for x in cat)
    home['ss'] = collections.OrderedDict((str(s), [owner[s], bd.labels[s]]) for s in sorted(sids))
    ns = {owner[s] for s in sids} | {x[0] for x in bd.local}
    home['cards'] = collections.OrderedDict((str(n), bd.rows[n]) for n in sorted(ns))
    files['home.json'] = home

    # index.json — every title of the world top, dense by n
    index = _head(bd)
    index['w0'] = nfdata.week_date(0)
    index['nw'] = bd.nw
    index['vf'] = bd.vf
    index['years'] = bd.years
    index['cats'] = nfdata.CATS
    index['cc'] = [iso for iso, _ in bd.countries]
    index['cn'] = [name for _, name in bd.countries]
    index['genres'] = aggregates.GENRES
    index['kws'] = aggregates.KWS
    index['fields'] = aggregates.FIELDS
    index['t'] = [bd.rows[n] if n in bd.in_index else None for n in range(bd.next_n)]
    index['so'] = owner
    index['s'] = bd.labels
    files['index.json'] = index

    # global.json — all weeks of the world: w[W][cat][rank-1] = [sid, h, v, cw]
    glob = _head(bd)
    glob['unit'] = aggregates.UNIT
    glob['vf'] = bd.vf
    glob['cats'] = nfdata.CATS
    glob['w'] = bd.gweeks
    files['global.json'] = glob

    # country/XX.json — the chart of one country, with the cards of titles outside the index
    for iso, _ in bd.countries:
        a, b = bd.cc[iso]
        wk = bd.cweeks[iso]
        obj = _head(bd)
        obj['c'] = iso
        obj['w1'] = a
        obj['f'] = [wk[w][0] for w in range(a, b + 1)]
        obj['t'] = [wk[w][1] for w in range(a, b + 1)]
        ns = set()
        for lst in obj['f'] + obj['t']:
            ns.update(owner[s] for s in lst)
        obj['cards'] = collections.OrderedDict((str(n), bd.rows[n]) for n in sorted(ns) if n not in bd.in_index)
        files['country/%s.json' % iso] = obj

    man = _head(bd)
    man['w0'] = nfdata.week_date(0)
    man['nw'] = bd.nw
    man['vf'] = bd.vf
    man['years'] = bd.years
    man['cc'] = collections.OrderedDict((iso, list(bd.cc[iso])) for iso, _ in bd.countries)
    man['files'] = collections.OrderedDict()
    man['counts'] = bd.counts
    return files, man


def _keep_old(path, obj):
    """Old bytes of path if they hold the same object up to 'b', else None."""
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        old = f.read()
    try:
        ob = json.loads(old.decode('utf-8')).get('b')
    except (ValueError, AttributeError):
        return None
    trial = collections.OrderedDict(obj)
    trial['b'] = ob
    return old if dumps(trial) == old else None


def finalize(files, man, out):
    """Bytes of every file with the manifest last: OrderedDict rel -> (bytes, changed)."""
    blobs = collections.OrderedDict()
    for rel, obj in files.items():
        old = _keep_old(os.path.join(out, rel), obj)
        blobs[rel] = (old, False) if old is not None else (dumps(obj), True)
        man['files'][rel] = hashlib.sha1(blobs[rel][0]).hexdigest()[:10]
    old = _keep_old(os.path.join(out, 'manifest.json'), man)
    blobs['manifest.json'] = (old, False) if old is not None else (dumps(man), True)
    return blobs


def write(out, blobs):
    """Write the changed files, data first and the manifest last; returns their number."""
    n = 0
    for rel, (data, changed) in blobs.items():
        if not changed:
            continue
        path = os.path.join(out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)
        n += 1
    return n


def sizes(blobs):
    """rel -> (raw bytes, gzip -9 bytes)."""
    return collections.OrderedDict((rel, (len(d), len(gzip.compress(d, 9)))) for rel, (d, _) in blobs.items())


def size_table(sz):
    """Lines of the size table against the budget of spec §3.10 (1 KB = 1000 bytes)."""
    def kb(x):
        return '%.1f' % (x / 1000.0)

    def verdict(raw, gz, budget):
        gz_cap, raw_cap = budget
        bad = []
        if gz > gz_cap:
            bad.append('gzip over')
        if raw > raw_cap:
            bad.append('raw over')
        return ', '.join(bad) or 'ok'

    lines = ['%-30s %10s %10s %16s  %s' % ('file (KB = 1000 B)', 'raw KB', 'gzip-9 KB', 'budget gz / raw', '')]
    for rel in ('manifest.json', 'home.json', 'index.json', 'global.json'):
        raw, gz = sz[rel]
        b = BUDGET[rel]
        lines.append('%-30s %10s %10s %16s  %s' % (rel, kb(raw), kb(gz), '%s / %s' % (kb(b[0]), kb(b[1])), verdict(raw, gz, b)))
    cs = [(rel, r, g) for rel, (r, g) in sz.items() if rel.startswith('country/')]
    if cs:
        b = BUDGET['country/XX.json']
        by_gz = sorted(cs, key=lambda x: (x[2], x[0]))
        picks = [('country max ' + by_gz[-1][0][8:10], by_gz[-1]), ('country median ' + by_gz[len(by_gz) // 2][0][8:10], by_gz[len(by_gz) // 2]),
                 ('country min ' + by_gz[0][0][8:10], by_gz[0])]
        for iso in ('KR', 'US', 'RU'):
            for x in cs:
                if x[0] == 'country/%s.json' % iso:
                    picks.append(('country ' + iso, x))
        for name, (rel, raw, gz) in picks:
            lines.append('%-30s %10s %10s %16s  %s' % (name, kb(raw), kb(gz), '%s / %s' % (kb(b[0]), kb(b[1])), verdict(raw, gz, b)))
        over = [rel[8:10] for rel, raw, gz in cs if verdict(raw, gz, b) != 'ok']
        lines.append('%-30s %10s %10s %16s  %s' % ('country/*.json (%d files)' % len(cs), kb(sum(x[1] for x in cs)),
                                                    kb(sum(x[2] for x in cs)), '', ('over: ' + ' '.join(over)) if over else 'all ok'))
    lines.append('%-30s %10s %10s' % ('all files', kb(sum(r for r, g in sz.values())), kb(sum(g for r, g in sz.values()))))
    return lines
