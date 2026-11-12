"""Trailer string `tr` of a title row (spec §3.4).

  tr    := null | "" | token | token " " token
  token := lang ":" type ":" key [":" flags]      lang ru | en, ru first, one token per language
  type  := T Trailer | Z Teaser | C Clip           key = YouTube id, [A-Za-z0-9_-]{11}

For each language of (ru, en): TMDB videos on YouTube in that language of type Trailer,
Teaser or Clip; Trailer before Teaser before Clip, official before fan-made within a
type, then the newest; the first one wins.

flags: "s" -- subtitles burned into the picture, so the audio is not the token's language
(TMDB tags by the language of the text): "Official Trailer [Subtitled]" in en has the
original audio with English subtitles, "Русский трейлер (Субтитры)" in ru has English
audio with Russian subtitles. Found by the video name (SUBTITLED); the plugin labels the
audio by it and checks the same pattern on its own live TMDB lookups (netflix.js TR_SUB).
"""
import re

# Version of the pick rules a cached card's tr was made with (cache field "trv"). Raise it when pick() changes:
# the TMDB stage then refetches every card with a trailer once (matcher.Stage.plan, "retrailer"), so old
# cache lines get the new rules without waiting for the 30-day refresh. 2: flag s for subtitled videos.
VERSION = 2

TYPES = {'Trailer': 'T', 'Teaser': 'Z', 'Clip': 'C'}
RANK = {'Trailer': 0, 'Teaser': 1, 'Clip': 2}
LANGS = ('ru', 'en')
KEY = re.compile(r'^[A-Za-z0-9_-]{11}$')
FLAGS = 's'
TOKEN = re.compile(r'^(?P<lang>ru|en):[TZC]:[A-Za-z0-9_-]{11}(:[%s]+)?$' % FLAGS)
SUBTITLED = re.compile(r'\[Subtitled\]|ENG SUB|SUB\]|субтитр', re.I)


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
        flags = 's' if SUBTITLED.search(v.get('name') or '') else ''
        tokens.append('%s:%s:%s' % (lang, TYPES[v['type']], v['key']) + (':' + flags if flags else ''))
    return ' '.join(tokens)


def stale(entry):
    """A cache line with a card whose tr was picked by older rules (VERSION)."""
    return bool(entry.get('tr')) and (entry.get('trv') or 0) < VERSION


def urgent(entry):
    """Old rules most likely mislabel this card: a Russian key (dubbed or «(Субтитры)»), or an English key of a
    title not in English (Dead-End Job: «[ENG SUB]» over Korean audio)."""
    tr = entry.get('tr') or ''
    return 'ru:' in tr or ('en:' in tr and (entry.get('ol') or 'en') != 'en')


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
