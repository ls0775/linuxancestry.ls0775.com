#!/usr/bin/env python3
"""
Fetch DistroWatch "Last 3 months" page-hit rankings and patch public/distros.json.

Uses curl to fetch https://distrowatch.com/dwres.php?resource=popularity
(Python requests gets 403; curl works fine with standard browser headers).
Parses the "Last 3 months" ranking table and assigns rank 1-N to each distro.

Usage:
    python fetch_popularity.py           # fetch and patch
    python fetch_popularity.py --dry-run # preview without writing
"""

import json
import subprocess
import sys
from pathlib import Path

from bs4 import BeautifulSoup

POPULARITY_URL = 'https://distrowatch.com/dwres.php?resource=popularity'


def fetch_html(url: str) -> str:
    """Use curl to fetch a page (bypasses 403 that Python requests gets)."""
    result = subprocess.run(
        [
            'curl', '-s', '--compressed',
            '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            url,
        ],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout


def parse_last_3_months(html: str) -> dict:
    """
    Parse the 'Last 3 months' ranking table.
    Returns {distro_slug: rank} where rank 1 = most popular.
    """
    soup = BeautifulSoup(html, 'html.parser')

    target_table = None
    for th in soup.find_all('th'):
        if 'Last 3 months' in th.get_text():
            target_table = th.find_parent('table')
            break

    if not target_table:
        return {}

    rankings = {}
    rows = target_table.find_all('tr')
    for rank, row in enumerate(rows[1:], 1):
        a = row.find('a')
        if a:
            slug = a.get('href', '').strip().lower()
            if slug:
                rankings[slug] = rank

    return rankings


def main():
    dry_run = '--dry-run' in sys.argv

    root = Path(__file__).parent.parent
    distros_json = root / 'public' / 'distros.json'

    if not distros_json.exists():
        print(f'ERROR: {distros_json} not found. Run transform_data.py first.')
        sys.exit(1)

    print(f'Fetching: {POPULARITY_URL}')
    html = fetch_html(POPULARITY_URL)
    if not html:
        print('ERROR: Empty response from curl.')
        sys.exit(1)

    rankings = parse_last_3_months(html)
    if not rankings:
        print('ERROR: Could not find "Last 3 months" table.')
        sys.exit(1)

    print(f'Found {len(rankings)} ranked distros (Last 3 months)')

    distros = json.loads(distros_json.read_text(encoding='utf-8'))

    matched = 0
    for distro in distros:
        slug = distro.get('id', '').lower().strip()
        if slug in rankings:
            distro['popularity'] = str(rankings[slug])
            matched += 1

    print(f'Matched {matched} / {len(distros)} distros')

    top20 = sorted(
        [d for d in distros if d.get('popularity')],
        key=lambda x: int(x['popularity'])
    )[:20]
    print('\nTop 20 (Last 3 months):')
    for d in top20:
        print(f'  #{int(d["popularity"]):>4}  {d["name"]}')

    if dry_run:
        print('\n[DRY RUN] No changes written.')
        return

    distros_json.write_text(json.dumps(distros, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\n✓ Patched {distros_json}')


if __name__ == '__main__':
    main()
