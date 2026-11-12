"""Invariants of the data contract (spec §3.9), checked before anything is written.

  python3 validate.py --out netflix [--state tools/netflix/state]   check a written folder
  python3 validate.py --same DIR1 DIR2                              same files up to 'b'

1 closed references, 2 complete weeks: check_files. 3 stable numbers: check_stability.
4 no losses: check_no_loss. 5 repeatability: --same on two builds of one input.
"""
import argparse
import hashlib
import json
import os
import sys

LIMIT = 12


class Errors(list):
    def add(self, kind, msg):
        n = sum(1 for e in self if e.startswith(kind + ':'))
        if n < LIMIT:
            self.append('%s: %s' % (kind, msg))
        elif n == LIMIT:
            self.append('%s: ...more' % kind)


def check_files(files, man):
    """files: rel -> object (all but the manifest), man: the manifest object."""
    err = Errors()
    index = files.get('index.json')
    glob = files.get('global.json')
    home = files.get('home.json')
    if not (index and glob and home):
        err.add('files', 'index.json, global.json and home.json are required')
        return err
    for rel, obj in list(files.items()) + [('manifest.json', man)]:
        if obj.get('schema') != 1 or obj.get('v') != man['v'] or not obj.get('b'):
            err.add('head', '%s: schema/v/b' % rel)
    t, so, s, fields = index['t'], index['so'], index['s'], index['fields']
    if len(so) != len(s):
        err.add('index', 'so has %d sids, s has %d' % (len(so), len(s)))
    for n, row in enumerate(t):
        if row is not None and len(row) != len(fields):
            err.add('index', 't[%d] has %d fields, expected %d' % (n, len(row), len(fields)))
    for sid, n in enumerate(so):
        if n >= len(t) or n < -1:
            err.add('index', 'so[%d] = %d is not a title number' % (sid, n))

    def owned(sid, cards, where):
        if not isinstance(sid, int) or not 0 <= sid < len(so):
            err.add('ref', '%s: sid %r unknown' % (where, sid))
            return
        n = so[sid]
        if n < 0:
            err.add('ref', '%s: sid %d has no owner' % (where, sid))
        elif not ((n < len(t) and t[n] is not None) or str(n) in cards):
            err.add('ref', '%s: owner %d of sid %d is neither in index.t nor in cards' % (where, n, sid))

    def week4x10(wk, where, size):
        if not isinstance(wk, list) or len(wk) != 4 or any(not isinstance(c, list) or len(c) != 10 for c in wk):
            err.add('weeks', '%s: not 4 x 10' % where)
            return []
        bad = [x for c in wk for x in c if not isinstance(x, list) or len(x) != size]
        if bad:
            err.add('weeks', '%s: %d positions of a wrong size' % (where, len(bad)))
            return []
        return [x[0] for c in wk for x in c]

    # global.json: nw weeks of 4 x 10, every owner in the index
    if len(glob['w']) != man['nw']:
        err.add('weeks', 'global.w has %d weeks, nw = %d' % (len(glob['w']), man['nw']))
    for w, wk in enumerate(glob['w']):
        for sid in week4x10(wk, 'global.w[%d]' % w, 4):
            owned(sid, {}, 'global.w[%d]' % w)

    # country files: (cc[1] - cc[0] + 1) weeks of 10 + 10
    for iso, (a, b) in man['cc'].items():
        rel = 'country/%s.json' % iso
        obj = files.get(rel)
        if obj is None:
            err.add('files', '%s missing' % rel)
            continue
        if obj.get('c') != iso or obj.get('w1') != a:
            err.add('country', '%s: c/w1' % rel)
        for part in ('f', 't'):
            if len(obj[part]) != b - a + 1:
                err.add('weeks', '%s: %s has %d weeks, expected %d' % (rel, part, len(obj[part]), b - a + 1))
            for i, lst in enumerate(obj[part]):
                if len(lst) != 10:
                    err.add('weeks', '%s: %s[%d] has %d places' % (rel, part, i, len(lst)))
                for sid in lst:
                    owned(sid, obj['cards'], rel)
        for key in obj['cards']:
            n = int(key)
            if n < len(t) and t[n] is not None:
                err.add('country', '%s: card %s is in the index too' % (rel, key))
    for rel in files:
        if rel.startswith('country/') and rel[8:10] not in man['cc']:
            err.add('files', '%s is not in manifest.cc' % rel)

    # home.json: self-contained, every sid in ss, every n in cards
    ss, cards = home['ss'], home['cards']
    sids = []
    for key, wk in home['weeks'].items():
        sids += week4x10(wk, 'home.weeks[%s]' % key, 4)
        if glob['w'][int(key)] != wk:
            err.add('home', 'home.weeks[%s] differs from global.w' % key)
    for iso, lists in home['c'].items():
        if len(lists) != 2 or any(len(x) != 10 for x in lists):
            err.add('home', 'home.c.%s is not 10 + 10' % iso)
        else:
            sids += lists[0] + lists[1]
    sids += week4x10(home['alltime'], 'home.alltime', 3)
    for sid in sids:
        if str(sid) not in ss:
            err.add('home', 'sid %s has no ss' % sid)
    for key, (n, label) in ss.items():
        if str(n) not in cards:
            err.add('home', 'title %d of sid %s has no card' % (n, key))
        if 0 <= int(key) < len(so) and (so[int(key)] != n or s[int(key)] != label):
            err.add('home', 'ss[%s] differs from index so/s' % key)
    for x in home['local']:
        if str(x[0]) not in cards:
            err.add('home', 'local title %d has no card' % x[0])
    for key, row in cards.items():
        if len(row) != len(fields):
            err.add('home', 'card %s has %d fields' % (key, len(row)))
    return err


def check_stability(old, new):
    """Invariant 3: every key keeps its number; numbers are unique and below next_*."""
    err = Errors()
    for part in ('titles', 'seasons'):
        for key, n in old[part].items():
            if new[part].get(key) != n:
                err.add('stable', '%s %r: %s -> %s' % (part, key, n, new[part].get(key)))
    for part, top in (('titles', 'next_n'), ('seasons', 'next_sid')):
        vals = list(new[part].values())
        if len(set(vals)) != len(vals):
            err.add('stable', '%s: a number is given twice' % part)
        if vals and max(vals) >= new[top]:
            err.add('stable', '%s: %s = %d is not above every number' % (part, top, new[top]))
        if new[top] < old[top]:
            err.add('stable', '%s went down' % top)
    return err


def check_no_loss(prev, man):
    """Invariant 4: the last week does not go back; the index does not shrink by more than 1 %."""
    err = Errors()
    if not prev:
        return err
    if man['v'] < prev.get('v', ''):
        err.add('loss', 'last week %s is older than the published %s' % (man['v'], prev['v']))
    before = prev.get('counts', {}).get('index', 0)
    if man['counts']['index'] < before * 0.99:
        err.add('loss', 'index shrinks from %d to %d titles' % (before, man['counts']['index']))
    return err


def check_state(st, index):
    """The published so/t against state/ids.json."""
    err = Errors()
    t, so = index['t'], index['so']
    if len(t) != st['next_n'] or len(so) != st['next_sid']:
        err.add('state', 'index has %d titles and %d sids, state %d and %d' % (len(t), len(so), st['next_n'], st['next_sid']))
    for key in st['merged']:
        n = st['titles'].get(key)
        if n is not None and n < len(t) and t[n] is not None:
            err.add('state', 'merged %r still has a row t[%d]' % (key, n))
    for sk, sid in st['seasons'].items():
        key = sk.split('\t', 1)[0]
        if sid < len(so) and so[sid] >= 0:
            own = st['titles'].get(key)
            root = st['titles'].get(st['merged'].get(key, key))
            if so[sid] not in (own, root):
                err.add('state', 'so[%d] = %d, key %r has n %s' % (sid, so[sid], key, own))
    return err


def _load(path):
    with open(path, 'rb') as f:
        data = f.read()
    return data, json.loads(data.decode('utf-8'))


def check_dir(out, state=None):
    err = Errors()
    _, man = _load(os.path.join(out, 'manifest.json'))
    files = {}
    for rel, h in man['files'].items():
        path = os.path.join(out, rel)
        if not os.path.exists(path):
            err.add('files', '%s missing' % rel)
            continue
        data, obj = _load(path)
        if hashlib.sha1(data).hexdigest()[:10] != h:
            err.add('hash', '%s does not match manifest.files' % rel)
        files[rel] = obj
    err += check_files(files, man)
    if state:
        path = os.path.join(state, 'ids.json')
        if os.path.exists(path) and 'index.json' in files:
            with open(path, encoding='utf-8') as f:
                err += check_state(json.load(f), files['index.json'])
    return err


def same(a, b):
    """Invariant 5: two builds hold the same data up to 'b' (and the hashes 'b' moves)."""
    err = Errors()
    rels = set()
    for root in (a, b):
        for dirpath, _, names in os.walk(root):
            for name in names:
                if name.endswith('.json'):
                    rels.add(os.path.relpath(os.path.join(dirpath, name), root))
    for rel in sorted(rels):
        pa, pb = os.path.join(a, rel), os.path.join(b, rel)
        if not (os.path.exists(pa) and os.path.exists(pb)):
            err.add('same', '%s is only in one folder' % rel)
            continue
        oa, ob = _load(pa)[1], _load(pb)[1]
        for o in (oa, ob):
            o.pop('b', None)
            if rel == 'manifest.json':
                o.pop('files', None)
        if oa != ob:
            err.add('same', '%s differs' % rel)
    return err, len(rels)


def main():
    ap = argparse.ArgumentParser(description='Check the netflix/ data folder against the contract invariants.')
    ap.add_argument('--out', help='folder with manifest.json')
    ap.add_argument('--state', help='folder with ids.json')
    ap.add_argument('--same', nargs=2, metavar='DIR', help='compare two builds up to "b"')
    a = ap.parse_args()
    if a.same:
        err, n = same(*a.same)
        what = '%d files' % n
    elif a.out:
        err = check_dir(a.out, a.state)
        what = a.out
    else:
        ap.error('give --out or --same')
    for e in err:
        print(e)
    print('%s: %s' % (what, 'FAILED, %d problems' % len(err) if err else 'ok'))
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
