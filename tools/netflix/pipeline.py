"""Netflix Top 10 -> netflix/*.json for netflix.js (spec docs/superpowers/specs/2026-11-12-netflix-plugin-design.md, §3, §12).

  python3 tools/netflix/pipeline.py --src .nf --out netflix                  weekly build
  TMDB_API_KEY=... python3 tools/netflix/pipeline.py --src .nf --backfill    first TMDB fill (see README.md)

Steps: read and check the TSV files -> entities -> overrides 'split' -> TMDB (search,
details, trailers; cache state/tmdb.jsonl) -> the other overrides -> stable numbers
(state/ids.json) -> rows and charts -> invariants -> write the changed files, the review
queue state/review.json -> size table. On bad input or a broken invariant it exits with
an error and leaves the old files as they are (the TMDB cache is kept: it costs requests).

TMDB requests need env TMDB_API_KEY; without it, or with --no-tmdb, the cards come from
the cache and overrides only, and new titles are stubs (id null).
"""
import argparse
import collections
import datetime
import json
import os
import sys
import time

sys.dont_write_bytecode = True  # no __pycache__ inside the repository

import aggregates
import ids
import matcher
import nfdata
import publish
import tmdb
import trailers
import validate

HERE = os.path.dirname(os.path.abspath(__file__))
SPLIT_OPS = ('tmdb', 'ru', 'tr', 'lv', 'hide')
REVIEW_HOW = ('unmatched: low и none по убыванию pts, карточки нет (id null). Решение — строка в '
              'tools/netflix/overrides.json: "<key>": {"tmdb": "tv/<id>"} или {"tmdb": "movie/<id>"}, '
              '{"tmdb": null} — оставить заглушку, {"hide": true} — не искать и не показывать в местных хитах. '
              'merges: карточки, слитые по общему TMDB id или правкой merge; неверное слияние — '
              '"<key>": {"merge": false} и верный tmdb у этого ключа. pending — тайтлов ещё не искали.')


class Build:
    """Everything publish.py needs."""


def die(msg):
    print('error: ' + msg, file=sys.stderr)
    sys.exit(1)


def load_overrides(path):
    if not path or not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        ov = json.load(f)
    return {k: v for k, v in ov.items() if isinstance(v, dict) and not k.startswith('_')}


def _part(parts, iso, w):
    """Index of the split part that takes a row of country iso (None: world) in week w (-1: no week)."""
    day = nfdata.week_date(w) if w >= 0 else None
    for i, p in enumerate(parts[:-1]):
        if p.get('countries') and iso not in p['countries']:
            continue
        if (p.get('from') or p.get('to')) and day is None:
            continue
        if p.get('from') and day < p['from']:
            continue
        if p.get('to') and day > p['to']:
            continue
        return i
    return len(parts) - 1


def apply_splits(overrides, ents):
    """Override 'split': the rows of one key become several titles, by country and period.

    "film:The King": {"split": [{"countries": ["KR"], "tmdb": "movie/434724"}, {"tmdb": "movie/504949"}]}
    A row goes to the first part whose 'countries' and period ('from', 'to': dates of the
    week's Sunday) hold; the last part takes the rest and keeps the key and its number,
    part i before it becomes '<key>#<i>'. World and all-time rows have no country, so only
    parts without 'countries' take them. A part may carry tmdb, ru, tr, lv, hide; the
    key's other operations go to the last part. Returns the overrides by part key.
    """
    out = dict(overrides)
    for key in sorted(overrides):
        parts = overrides[key].get('split')
        if not parts:
            continue
        e = ents.get(key)
        if e is None or not isinstance(parts, list) or len(parts) < 2 or not all(isinstance(p, dict) for p in parts):
            print('warning: split of %r skipped: %s' % (key, 'unknown key' if e is None else 'needs a list of 2+ parts'))
            continue
        last = len(parts) - 1
        pe = [nfdata.Entity(key if i == last else '%s#%d' % (key, i + 1), e.kind, e.title) for i in range(len(parts))]
        for r in e.glob:
            p = pe[_part(parts, None, r[0])]
            p.glob.append(r)
            p.season(r[3], r[0])
        for r in e.country:
            p = pe[_part(parts, r[0], r[1])]
            p.country.append(r)
            p.season(r[4], r[1])
        for r in e.popular:
            p = pe[_part(parts, None, -1)]
            p.popular.append(r)
            p.season(r[2], -1)
        del ents[key]
        del out[key]
        for i, p in enumerate(pe):
            ops = {k: v for k, v in parts[i].items() if k in SPLIT_OPS}
            if i == last:
                ops = dict({k: v for k, v in overrides[key].items() if k != 'split'}, **ops)
            if not (p.glob or p.country or p.popular):
                print('note: split part %d of %r takes no rows' % (i + 1, key))
                continue
            if p.key in ents:
                print('warning: split part %r is a key of its own already; part skipped' % p.key)
                continue
            ents[p.key] = p
            if ops:
                out[p.key] = dict(out.get(p.key, {}), **ops)
    return out


def tmdb_stage(a, nf, ents, overrides):
    """TMDB fields by key from state/tmdb.jsonl, which is first brought up to date unless
    --no-tmdb or no TMDB_API_KEY. Returns (fields by key, cache, stage)."""
    path = os.path.join(a.state, 'tmdb.jsonl')
    cache = tmdb.load_cache(path)
    stage = matcher.Stage(cache, ents, overrides, nf.nw - 1, datetime.datetime.now(datetime.timezone.utc).date())
    key = os.environ.get('TMDB_API_KEY', '').strip()
    if a.backfill and not key and not a.no_tmdb:
        die('--backfill needs TMDB_API_KEY in the environment (README.md, «Ключ TMDB»)')
    if a.no_tmdb or not key:
        print('TMDB: %s; cards from state/tmdb.jsonl (%d lines) and overrides, %d titles wait for a search' % (
            '--no-tmdb' if a.no_tmdb else 'TMDB_API_KEY is not set', len(cache), stage.pending()))
    else:
        budget = a.tmdb_budget if a.tmdb_budget is not None else (0 if a.backfill else 600)
        client = tmdb.Client(key, budget)
        t0 = time.time()
        try:
            total, done, stopped = stage.run(client, a.src, a.backfill, lambda: tmdb.save_cache(path, cache))
        except KeyboardInterrupt:
            tmdb.save_cache(path, cache)
            die('interrupted; the TMDB cache is saved, a new run goes on from there')
        outcome = ', '.join('%s %d' % kv for kv in sorted(stage.stats.items()))
        print('TMDB: %d requests in %.0f s; %d of %d planned done%s%s; %d titles wait for a search' % (
            client.made, time.time() - t0, done, total, (' (%s)' % outcome) if outcome else '',
            ('; stopped: ' + stopped) if stopped else '', stage.pending()))
    tmdb.save_cache(path, cache)
    tm = {k: aggregates.tmdb_fields(cache[k]) for k in sorted(ents) if matcher.usable(cache.get(k), stage.want[k])}
    return tm, cache, stage


def apply_overrides(overrides, ents, tm):
    """Overrides on the rows: lv, merge, tmdb, ru, tr, hide ('split' came before).
    Returns (lv by key, merge links, keys that never merge)."""
    lv, links, unlinked = {}, [], set()
    for key in sorted(overrides):
        ov = overrides[key]
        if key not in ents:
            print('warning: override for unknown key %r' % key)
            continue
        if 'lv' in ov:
            lv[key] = 1 if ov['lv'] else 0
        if ov.get('merge') is False:
            unlinked.add(key)
        elif ov.get('merge'):
            if ov['merge'] in ents:
                links.append((key, ov['merge']))
            else:
                print('warning: %r merges into unknown key %r' % (key, ov['merge']))
        if ov.get('hide'):
            tm[key] = aggregates.no_tmdb()
            continue
        if 'tmdb' in ov:
            t = tm.get(key) or aggregates.no_tmdb()
            if ov['tmdb']:
                try:
                    mt, tid = tmdb.parse_ref(ov['tmdb'])
                    if (t['mt'], t['id']) != (mt, tid):
                        t = aggregates.no_tmdb()
                        t['id'], t['mt'] = tid, mt
                    t['cf'] = 3
                except ValueError as e:
                    print('warning: override %r: %s' % (key, e))
            else:
                t = aggregates.no_tmdb()
            tm[key] = t
        if 'ru' in ov:
            tm.setdefault(key, aggregates.no_tmdb())['ru'] = ov['ru'] or None
        if 'tr' in ov:
            if trailers.valid(ov['tr']):
                tm.setdefault(key, aggregates.no_tmdb())['tr'] = ov['tr']
            else:
                print('warning: override %r: tr %r is not like "ru:T:<key> en:T:<key>"' % (key, ov['tr']))
    return lv, links, unlinked


def tmdb_links(tm, unlinked):
    """Merge links between keys that share a TMDB (mt, id)."""
    by = collections.defaultdict(list)
    for key in sorted(tm):
        t = tm[key]
        if t['id'] is not None and t['cf'] > 0 and key not in unlinked:
            by[(t['mt'], t['id'])].append(key)
    return [(keys[0], k) for keys in by.values() for k in keys[1:]]


def review(v, ents, cache, stage, num, rows, manual_links):
    """state/review.json: titles TMDB could not match (low, none) and merged cards, by points."""
    f = aggregates.FIELDS.index
    unmatched = []
    for key in sorted(ents):
        entry = cache.get(key)
        if stage.want[key] is not None or entry is None or entry.get('conf') not in ('low', 'none'):
            continue
        if num.root[key] != key:
            continue
        e, n = ents[key], num.n[key]
        row = rows[n]
        weeks = [r[0] for r in e.glob] + [r[1] for r in e.country]
        by = collections.Counter(r[0] for r in e.country)
        item = collections.OrderedDict([
            ('key', key), ('n', n), ('pts', row[f('pts')]), ('conf', entry['conf']),
            ('weeks', '%s..%s' % (nfdata.week_date(min(weeks)), nfdata.week_date(max(weeks))) if weeks else ''),
            ('gw', row[f('gw')]), ('cw', row[f('cw')]),
            ('countries', ' '.join(iso for iso, _ in sorted(by.items(), key=lambda x: (-x[1], x[0]))[:8]))])
        if entry.get('id') is not None and entry.get('mt') in (0, 1):
            item['cand'] = [entry.get('score'), tmdb.ref(entry['mt'], entry['id']), entry.get('name'), entry.get('yr'),
                            entry.get('ol')]
            item['alts'] = entry.get('alts') or []
        if entry.get('note'):
            item['note'] = entry['note']
        unmatched.append(item)
    unmatched.sort(key=lambda x: (-x['pts'], x['key']))
    paired = {k for pair in manual_links for k in pair}
    merges = []
    for root in sorted(num.members, key=num.n.get):
        members = num.members[root]
        if len(members) < 2:
            continue
        n = num.n[root]
        row = rows[n]
        merges.append(collections.OrderedDict([
            ('n', n), ('pts', row[f('pts')]),
            ('tmdb', tmdb.ref(row[f('mt')], row[f('id')]) if row[f('id')] is not None else None),
            ('by', 'override' if all(k in paired for k in members) else 'tmdb'), ('keys', members)]))
    merges.sort(key=lambda x: (-x['pts'], x['n']))

    def block(items):
        return '[\n' + ',\n'.join(publish.dumps(x).decode('utf-8') for x in items) + '\n]' if items else '[]'

    return ('{"v":"%s","pending":%d,\n"how":%s,\n"unmatched":%s,\n"merges":%s}\n' % (
        v, stage.pending(), json.dumps(REVIEW_HOW, ensure_ascii=False), block(unmatched), block(merges)))


def save_text(path, text):
    """Write text when it changed; True if written."""
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            if f.read() == text:
                return False
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description='Netflix Top 10 -> netflix/*.json for netflix.js.')
    ap.add_argument('--src', default='.nf', help='folder with the Netflix TSV files (and What We Watched xlsx)')
    ap.add_argument('--state', default=os.path.join(HERE, 'state'), help='folder with ids.json, tmdb.jsonl, review.json')
    ap.add_argument('--overrides', default=os.path.join(HERE, 'overrides.json'), help='manual fixes (optional)')
    ap.add_argument('--out', default=os.path.normpath(os.path.join(HERE, '..', '..', 'netflix')), help='output folder')
    ap.add_argument('--no-tmdb', action='store_true', help='no TMDB requests; TMDB fields only from the cache')
    ap.add_argument('--tmdb-budget', type=int, default=None,
                    help='TMDB requests per run, 0 = no limit (default 600; with --backfill no limit)')
    ap.add_argument('--backfill', action='store_true', help='match every title not matched yet, global ones first')
    a = ap.parse_args(argv)
    t0 = time.time()
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())

    try:
        nf = nfdata.load(a.src)
    except nfdata.InputError as e:
        die('input: %s' % e)
    ents = nfdata.entities(nf)
    overrides = apply_splits(load_overrides(a.overrides), ents)
    tm, cache, stage = tmdb_stage(a, nf, ents, overrides)
    lv_over, links, unlinked = apply_overrides(overrides, ents, tm)
    manual_links = list(links)
    links += tmdb_links(tm, unlinked)

    ids_path = os.path.join(a.state, 'ids.json')
    old_state = ids.load(ids_path)
    base = old_state
    if unlinked:
        base = dict(old_state, merged={k: v for k, v in old_state['merged'].items()
                                       if k not in unlinked and v not in unlinked})
    keys = sorted(ents)
    titles = [(k, 0 if ents[k].glob or ents[k].popular else 1, ents[k].first_week()) for k in keys]
    seasons = [(k, label, fw) for k in keys for label, fw in sorted(ents[k].seasons.items())]
    state, num = ids.assign(base, titles, seasons, links)

    # one row per card: the survivor key and its members
    years = list(range(nfdata.week_year(0), nfdata.week_year(nf.nw - 1) + 1))
    wy = [years.index(nfdata.week_year(w)) for w in range(nf.nw)]
    rows, in_index, cf, pts, crows = {}, set(), {}, {}, {}
    for root in sorted(num.members, key=num.n.get):
        members = [ents[k] for k in num.members[root]]
        lv = lv_over.get(root)
        if lv is None:
            lv = max(lv_over.get(e.key, aggregates.live_rule(e)) for e in members)
        t = tm.get(root) or next((tm[e.key] for e in members if e.key in tm), None) or aggregates.no_tmdb()
        n = num.n[root]
        rows[n] = aggregates.netflix_part(members, lv, wy, len(years)) + aggregates.tmdb_part(t)
        if any(e.glob or e.popular for e in members):
            in_index.add(n)
        cf[n] = t['cf']
        pts[n] = rows[n][aggregates.FIELDS.index('pts')]
        crows[n] = [r for e in members for r in e.country]

    # season labels; a season taken over by a merge keeps its own show title
    labels = [''] * state['next_sid']
    for (key, label), sid in num.sid.items():
        root = num.root[key]
        if root != key and ents[key].title != ents[root].title:
            label = ents[key].title + (': ' + label if label else '')
        labels[sid] = label

    gweeks = [[[None] * 10 for _ in range(4)] for _ in range(nf.nw)]
    alltime = [[None] * 10 for _ in range(4)]
    cweeks = {iso: {} for iso, _ in nf.countries}
    for k in keys:
        e = ents[k]
        for w, cat, rank, label, hours, views, cw in e.glob:
            gweeks[w][cat][rank - 1] = [num.sid[(k, label)], aggregates.units(hours), aggregates.units(views), cw]
        for cat, rank, label, hours, views in e.popular:
            alltime[cat][rank - 1] = [num.sid[(k, label)], aggregates.units(hours), aggregates.units(views)]
        for iso, w, kind, rank, label in e.country:
            wk = cweeks[iso].get(w)
            if wk is None:
                wk = cweeks[iso][w] = [[None] * 10, [None] * 10]
            wk[kind][rank - 1] = num.sid[(k, label)]

    local_all = [(n, pts[n], crows[n]) for n in sorted(rows) if n not in in_index]
    local = aggregates.local_heroes([x for x in local_all if cf[x[0]] >= 2])

    bd = Build()
    bd.v = nfdata.week_date(nf.nw - 1)
    bd.b = stamp
    bd.nw, bd.vf, bd.years = nf.nw, nf.vf, years
    bd.countries, bd.cc = nf.countries, nf.cc
    bd.rows, bd.in_index, bd.next_n = rows, in_index, state['next_n']
    bd.so, bd.labels = num.so, labels
    bd.gweeks, bd.cweeks, bd.alltime, bd.local = gweeks, cweeks, alltime, local
    bd.counts = collections.OrderedDict([
        ('titles', len(rows)), ('index', len(in_index)), ('local', len(rows) - len(in_index)),
        ('seasons', sum(1 for x in num.so if x >= 0)), ('weeks', nf.nw), ('countries', len(nf.countries))])
    files, man = publish.build_files(bd)

    prev = None
    prev_path = os.path.join(a.out, 'manifest.json')
    if os.path.exists(prev_path):
        with open(prev_path, encoding='utf-8') as f:
            prev = json.load(f)
    err = validate.check_files(files, man) + validate.check_stability(old_state, state) + validate.check_no_loss(prev, man)
    if err:
        for e in err:
            print(e, file=sys.stderr)
        die('%d invariant problems, nothing written' % len(err))

    blobs = publish.finalize(files, man, a.out)
    written = publish.write(a.out, blobs)
    state_written = ids.save(ids_path, state)
    review_written = save_text(os.path.join(a.state, 'review.json'),
                               review(bd.v, ents, cache, stage, num, rows, manual_links))

    for line in publish.size_table(publish.sizes(blobs)):
        print(line)
    c = bd.counts
    print('week %s (W %d), %d titles: %d in the index, %d local; %d seasons; %d countries; %d merged keys' % (
        bd.v, nf.nw - 1, c['titles'], c['index'], c['local'], c['seasons'], c['countries'], len(state['merged'])))
    fi, ft = aggregates.FIELDS.index('id'), aggregates.FIELDS.index('tr')
    with_id = sum(1 for n in in_index if rows[n][fi] is not None)
    with_tr = sum(1 for n in in_index if rows[n][ft])
    print('TMDB in the index: id %d of %d (%.1f %%), trailers %d (%.1f %%); %d local cards' % (
        with_id, len(in_index), 100.0 * with_id / max(1, len(in_index)), with_tr, 100.0 * with_tr / max(1, len(in_index)),
        sum(1 for n in rows if n not in in_index and rows[n][fi] is not None)))
    if not local and local_all:
        top = aggregates.local_heroes(local_all, 3)
        print('home.local is empty (needs cf >= 2); without that condition it would start: ' +
              '; '.join('%s %s %d' % (rows[x[0]][1], x[1], x[3]) for x in top))
    print('%d of %d files written%s; %.1f s' % (
        written, len(blobs), ''.join(x for x, w in ((', ids.json updated', state_written),
                                                     (', review.json updated', review_written)) if w),
        time.time() - t0))


if __name__ == '__main__':
    main()
