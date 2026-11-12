#!/usr/bin/env bash
# Download the three Netflix Top 10 TSV files into DEST (default .nf) for pipeline.py.
#
#   bash tools/netflix/fetch.sh .nf
#
# Netflix filters by User-Agent: an old Chrome gets /unsupportedbrowser, Chrome 142 gets
# the file. HEAD gets 403, so this is a plain GET. A file that is not the TSV it should
# be (an HTML page, an empty answer) fails here and leaves the old copy in DEST alone.
set -euo pipefail

dest="${1:-.nf}"
ua="${UA:-Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36}"
base='https://www.netflix.com/tudum/top10/data'
mkdir -p "$dest"

for pair in 'all-weeks-global.tsv:week' 'all-weeks-countries.tsv:country_name' 'most-popular.tsv:category'; do
  f="${pair%%:*}"
  first="${pair#*:}"
  curl -fsS --retry 4 --retry-delay 30 --connect-timeout 30 -A "$ua" -o "$dest/$f.part" "$base/$f"
  head1="$(head -n 1 "$dest/$f.part" | tr -d '\r')"
  head1="${head1#$'\xef\xbb\xbf'}"
  if [ "${head1%%$'\t'*}" != "$first" ]; then
    echo "error: $base/$f is not the TSV it should be; it starts: $(head -c 120 "$dest/$f.part" | tr '\n\t' '  ')" >&2
    rm -f "$dest/$f.part"
    exit 1
  fi
  mv "$dest/$f.part" "$dest/$f"
  echo "$f: $(wc -c < "$dest/$f" | tr -d ' ') bytes, $(($(wc -l < "$dest/$f"))) lines"
done
