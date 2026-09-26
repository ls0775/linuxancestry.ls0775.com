# Data pipeline

Python scripts that fetch Linux distribution metadata from DistroWatch and
produce `public/distros.json` for the app.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

The dev container does this for you.

## Full update

```bash
./update_distros.sh --use-cache          # resume from distrowatch_cache.json
./update_distros.sh                      # start from scratch
./update_distros.sh --use-cache --repair # re-fetch incomplete records only
```

The script runs four steps:

1. `fetch_distros_modern.py` — lists every distribution via
   `search.php?ostype=Linux&status=All`, then fetches each `table.php` page.
   Progress is saved to `distrowatch_cache.json` every ten records, so an
   interrupted run can be resumed. Failed pages are reported at the end and
   are not written to the cache.
2. `transform_data.py --merge` — normalises parentage, dates and colours and
   merges the result into the existing `public/distros.json`.
3. `download_logos.py` — fills `public/logos/{id}.png` for any missing logo.
4. `fetch_popularity.py` — patches the "Last 3 months" page-hit rank.

### Crawl delay

DistroWatch's `robots.txt` declares `Crawl-Delay: 15`. The fetcher enforces
this as a minimum, so a complete run of ~1,100 pages takes roughly five hours.
Run it in `tmux` or a detached shell and resume with `--use-cache` if needed.

### Merge policy

`public/distros.json` contains hand-edited descriptions and parentage fixes.
`transform_data.py --merge` therefore treats fields in two groups:

| Curated — existing value wins if non-empty | Volatile — scraped value wins if non-empty |
|---|---|
| `description`, `parent`, `start`, `name`, `icon`, `color` | `status`, `stop`, `popularity`, `desktop`, `architecture`, `category`, `origin`, `based_on`, `url` |

A distribution that returns to `Active` has its `stop` date cleared.
Distributions present in the existing file but missing from the scrape are
kept. New distributions are appended.

After merging, the transformer re-validates every `parent` reference and
breaks any cycles so D3 stratification cannot fail.

## Tests

```bash
python3 -m pytest tests
```

Covers the merge policy, parent-name normalisation and date sanitising.

## Files

| File | Purpose |
|------|---------|
| `fetch_distros_modern.py` | Crawler with retry, resume and repair |
| `transform_data.py` | Normalisation, merge and integrity checks |
| `download_logos.py` | Local logo cache |
| `fetch_popularity.py` | Popularity rank patch |
| `update_distros.sh` | Runs the four steps in order |
| `tests/` | pytest suite |

## Attribution

Data is sourced from DistroWatch.com for non-commercial, educational use.
Respect their `robots.txt` and server load.
