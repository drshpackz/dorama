"""Trailer string `tr` of a title row (spec §3.4).

  tr    := null | "" | token | token " " token
  token := lang ":" type ":" key [":" flags]      lang ru | en, ru first, one token per language
  type  := T Trailer | Z Teaser | C Clip           key = YouTube id, [A-Za-z0-9_-]{11}

For each language of (ru, en): TMDB videos on YouTube in that language of type Trailer,
Teaser or Clip; Trailer before Teaser before Clip, official before fan-made within a
type, then the newest; the first one wins. Flags are reserved for phase 2 ("s").
"""
import re

TYPES = {'Trailer': 'T', 'Teaser': 'Z', 'Clip': 'C'}
RANK = {'Trailer': 0, 'Teaser': 1, 'Clip': 2}
LANGS = ('ru', 'en')
KEY = re.compile(r'^[A-Za-z0-9_-]{11}$')
TOKEN = re.compile(r'^(?P<lang>ru|en):[TZC]:[A-Za-z0-9_-]{11}(:[a-z]+)?$')


def pick(videos):
    """TMDB `videos.results` -> the tr string; "" when no video fits."""
    tokens = []
    for lang in LANGS:
        cands = [v for v in videos or [] if v.get('site') == 'YouTube' and v.get('iso_639_1') == lang
                 and v.get('type') in TYPES and KEY.match(v.get('key') or '')]
        if not cands:
            continue
        cands.sort(key=lambda v: v['key'])
        cands.sort(key=lambda v: v.get('published_at') or '', reverse=True)
        cands.sort(key=lambda v: (RANK[v['type']], not v.get('official')))
        v = cands[0]
        tokens.append('%s:%s:%s' % (lang, TYPES[v['type']], v['key']))
    return ' '.join(tokens)


def valid(tr):
    """True for a tr value the plugin can read (the override 'tr' is checked with it)."""
    if tr is None or tr == '':
        return True
    if not isinstance(tr, str):
        return False
    tokens = tr.split(' ')
    if len(tokens) > 2:
        return False
    langs = []
    for t in tokens:
        m = TOKEN.match(t)
        if not m:
            return False
        langs.append(m.group('lang'))
    return langs in (['ru'], ['en'], ['ru', 'en'])
