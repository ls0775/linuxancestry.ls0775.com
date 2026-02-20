#!/usr/bin/env python3
"""
Download and cache all distro logos locally.

Reads public/distros.json, downloads each distro's logo to public/logos/{id}.png.
Run this after transform_data.py to populate the local logo cache.

Usage:
    python download_logos.py           # download missing logos only
    python download_logos.py --refresh # re-download all logos
"""

import json
import sys
import time
from pathlib import Path

import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}
RATE_LIMIT_S = 0.15  # seconds between requests


def get_logo_url(distro: dict) -> str:
    """Return the best known logo URL for a distro."""
    if distro.get('icon'):
        return distro['icon']
    slug = distro['id'].lower().replace('-', '').replace('_', '').replace(' ', '')
    return f'https://distrowatch.com/images/y9go/{slug}.png'


def main():
    refresh = '--refresh' in sys.argv

    root = Path(__file__).parent.parent
    distros_json = root / 'public' / 'distros.json'
    logos_dir = root / 'public' / 'logos'
    logos_dir.mkdir(exist_ok=True)

    if not distros_json.exists():
        print(f'ERROR: {distros_json} not found. Run transform_data.py first.')
        sys.exit(1)

    distros = json.loads(distros_json.read_text(encoding='utf-8'))
    print(f'Found {len(distros)} distros in distros.json')

    downloaded = skipped = failed = 0

    for distro in distros:
        dist_id = distro.get('id', '').strip()
        if not dist_id:
            continue

        dest = logos_dir / f'{dist_id}.png'

        if dest.exists() and not refresh:
            skipped += 1
            continue

        url = get_logo_url(distro)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=10)
            if resp.status_code == 200 and len(resp.content) > 500:
                dest.write_bytes(resp.content)
                downloaded += 1
                print(f'  ✓  {dist_id}')
            else:
                failed += 1
                print(f'  ✗  {dist_id}  (HTTP {resp.status_code}, {len(resp.content)} bytes)  {url}')
        except Exception as exc:
            failed += 1
            print(f'  ✗  {dist_id}  ({exc})')

        time.sleep(RATE_LIMIT_S)

    print(f'\nDone: {downloaded} downloaded, {skipped} skipped, {failed} failed')
    print(f'Logos saved to: {logos_dir}')


if __name__ == '__main__':
    main()
