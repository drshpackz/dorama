"""Download the What We Watched reports of www-sources.json for the TMDB matcher.

  python3 tools/netflix/fetch_www.py --sources tools/netflix/www-sources.json --dest .nf

Each report lands in DEST as What_We_Watched_<period>.xlsx, the name nfdata.load_www()
reads. The reports only sharpen TMDB matching (original titles, release dates), so a
report that cannot be downloaded is a warning, not a failure: the old copy in DEST, if
any, stays, and the exit code is 0 (--strict makes it 1).
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
UA = os.environ.get('UA') or ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                              '(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')
PERIOD = re.compile(r'^\d{4}(Jan-Jun|Jul-Dec)$')
TRIES = 4


def download(url):
    why = ''
    for attempt in range(TRIES):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            why = 'HTTP %d' % e.code
            if e.code < 500 and e.code != 429:
                break
        except (urllib.error.URLError, OSError) as e:
            why = str(getattr(e, 'reason', e))
        if attempt < TRIES - 1:
            time.sleep(15 * (attempt + 1))
    raise IOError(why)


def check_xlsx(data):
    """The bytes are a workbook with the sheets the matcher reads."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        wb = z.read('xl/workbook.xml').decode('utf-8', 'replace')
    missing = [s for s in ('Shows', 'Movies') if 'name="%s"' % s not in wb]
    if missing:
        raise ValueError('no sheet %s' % ', '.join(missing))


def main():
    ap = argparse.ArgumentParser(description='Download the What We Watched reports for the TMDB matcher.')
    ap.add_argument('--sources', default=os.path.join(HERE, 'www-sources.json'))
    ap.add_argument('--dest', default='.nf')
    ap.add_argument('--strict', action='store_true', help='exit 1 when a report is not downloaded')
    a = ap.parse_args()
    with open(a.sources, encoding='utf-8') as f:
        reports = json.load(f)['reports']
    os.makedirs(a.dest, exist_ok=True)
    failed = 0
    for rep in reports:
        if not PERIOD.match(rep.get('period', '')):
            print('warning: bad period %r in %s' % (rep.get('period'), a.sources))
            failed += 1
            continue
        path = os.path.join(a.dest, 'What_We_Watched_%s.xlsx' % rep['period'])
        try:
            data = download(rep['url'])
            check_xlsx(data)
        except (IOError, ValueError, KeyError, zipfile.BadZipFile) as e:
            print('warning: What We Watched %s not downloaded (%s)%s' % (
                rep['period'], e, '; the old copy stays' if os.path.exists(path) else ''))
            failed += 1
            continue
        tmp = path + '.part'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)
        print('%s: %d bytes' % (os.path.basename(path), len(data)))
    sys.exit(1 if failed and a.strict else 0)


if __name__ == '__main__':
    main()
