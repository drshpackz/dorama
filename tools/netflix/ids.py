"""Stable title numbers (n) and season numbers (sid) between builds, kept in state/ids.json.

{"titles": {key: n}, "seasons": {"key\\tlabel": sid}, "merged": {key: survivor key},
 "next_n": N, "next_sid": M}

A number, once given, stays with its key and is never given to another key. New keys
get the next free number (max + 1). A merge (override 'merge' or a shared TMDB (mt, id))
keeps the smallest n of the group; the other keys are written to "merged", their n
goes out of the index and their seasons point to the survivor. A merge stays recorded
until its line is deleted from "merged" by hand.
"""
import json
import os


def empty():
    return {'titles': {}, 'seasons': {}, 'merged': {}, 'next_n': 0, 'next_sid': 0}


def load(path):
    if not os.path.exists(path):
        return empty()
    with open(path, encoding='utf-8') as f:
        st = json.load(f)
    for k, v in empty().items():
        st.setdefault(k, v)
    return st


def dumps(st):
    """One entry per line, in number order, so the weekly git diff is a few added lines."""
    def block(d, order):
        items = sorted(d.items(), key=order)
        return '{\n' + ',\n'.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(v, ensure_ascii=False)
                                  for k, v in items) + ('\n}' if items else '}')
    return ('{"titles":' + block(st['titles'], lambda kv: kv[1]) +
            ',\n"seasons":' + block(st['seasons'], lambda kv: kv[1]) +
            ',\n"merged":' + block(st['merged'], lambda kv: kv[0]) +
            ',\n"next_n":%d,\n"next_sid":%d}\n' % (st['next_n'], st['next_sid']))


def save(path, st):
    """Write the state when it changed; True if written."""
    text = dumps(st)
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


def season_key(key, label):
    return key + '\t' + label


class Numbers:
    """Numbers of this build: own n, survivor of each key, sid of each season, owner of each sid."""

    def __init__(self):
        self.n = {}        # key -> own n
        self.root = {}     # key -> survivor key (itself when not merged)
        self.members = {}  # survivor key -> member keys, survivor first, then by n
        self.sid = {}      # (key, label) -> sid
        self.so = []       # sid -> owner n (survivor), -1 when the season is gone


def assign(old, titles, seasons, links):
    """Give numbers to the keys present in this build.

    titles: [(key, group, first week)], group 0 = index, 1 = local; new keys are numbered
    in (group, first week, key) order. seasons: [(key, label, first week)]; new ones in
    (n, first week, label) order. links: [(key, key)] merges found in this build.
    Returns (new state, Numbers). The old state is not changed.
    """
    st = {'titles': dict(old['titles']), 'seasons': dict(old['seasons']), 'merged': dict(old['merged']),
          'next_n': old['next_n'], 'next_sid': old['next_sid']}
    num = Numbers()
    for key, group, fw in sorted((t for t in titles if t[0] not in st['titles']), key=lambda t: (t[1], t[2], t[0])):
        st['titles'][key] = st['next_n']
        st['next_n'] += 1
    for key, group, fw in titles:
        num.n[key] = st['titles'][key]
    new = [s for s in seasons if season_key(s[0], s[1]) not in st['seasons']]
    for key, label, fw in sorted(new, key=lambda s: (num.n[s[0]], s[2], s[1])):
        st['seasons'][season_key(key, label)] = st['next_sid']
        st['next_sid'] += 1
    for key, label, fw in seasons:
        num.sid[(key, label)] = st['seasons'][season_key(key, label)]

    # merges: union of the recorded ones and this build's, among present keys; smallest n wins
    parent = {key: key for key in num.n}

    def find(k):
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    pairs = sorted(st['merged'].items()) + sorted(links)
    for a, b in pairs:
        if a in parent and b in parent:
            ra, rb = find(a), find(b)
            if ra != rb:
                if num.n[ra] < num.n[rb]:
                    parent[rb] = ra
                else:
                    parent[ra] = rb
    for key in sorted(num.n, key=num.n.get):
        r = find(key)
        num.root[key] = r
        num.members.setdefault(r, []).append(key)
        if r != key:
            st['merged'][key] = r

    present = set(num.sid)
    num.so = [-1] * st['next_sid']
    for sk, sid in st['seasons'].items():
        key, label = sk.split('\t', 1)
        if (key, label) in present:
            num.so[sid] = num.n[num.root[key]]
    return st, num
