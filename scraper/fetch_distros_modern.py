#!/usr/bin/env python3
"""
Modern DistroWatch scraper using the search page with status=All
This gets ALL distributions (1100+) including discontinued ones
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from typing import Dict, List, Optional
from datetime import datetime
import argparse
import sys
import random
from pathlib import Path

# Simplified but realistic headers
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

# Base URL
BASE_URL = "https://distrowatch.com"

# DistroWatch robots.txt declares "Crawl-Delay: 15". Do not go below this.
CRAWL_DELAY = 15.0


def sanitize_date(date_str: str) -> str:
    """
    Sanitize date strings from DistroWatch format to YYYY-MM-DD
    """
    if not date_str or date_str.strip() == '':
        return ''
    
    date_str = date_str.strip()
    date_str = date_str.replace('XX', '01')
    
    if re.match(r'^\d{4}$', date_str):
        return f"{date_str}-01-01"
    
    if re.match(r'^\d{4}-\d{2}$', date_str):
        return f"{date_str}-01"
    
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return date_str
    
    try:
        date_str = date_str.replace('.', '-')
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return date_str
    except Exception:
        pass
    
    return date_str


def fetch_search_page_distributions(session: requests.Session) -> List[tuple]:
    """
    Fetch ALL distributions from the search page using ostype=Linux&status=All
    This returns ALL distributions including discontinued ones (1100+)
    
    The search results page contains links in the format: <a href="distro-slug">Distro Name</a>
    """
    # Check if local file exists first (much faster and more reliable)
    local_file = Path('search_all.html')
    if local_file.exists():
        print(f"Reading distribution list from local file: {local_file}")
        with open(local_file, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()
    else:
        # Use the search page with status=All to get ALL distributions
        search_url = f"{BASE_URL}/search.php?ostype=Linux&status=All"
        print(f"Fetching distribution list from search page: {search_url}")
        
        try:
            response = session.get(search_url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            html_content = response.text
        except requests.RequestException as e:
            print(f"Error fetching search page: {e}", file=sys.stderr)
            return []
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # The search results are in the format:
    # <b>1. <a href="cachyos">CachyOS</a> (1)</b>
    # We need to find all <a> tags with simple href (no slashes or query params)
    distributions = []
    seen = set()
    
    # Find all links
    for link in soup.find_all('a', href=True):
        href = link.get('href', '').strip()
        name = link.get_text().strip()
        
        # Skip empty or invalid links
        if not href or not name:
            continue
            
        # Distribution links are simple slugs (no slashes, no query params, no fragments)
        # Examples: "cachyos", "mint", "debian"
        if '/' in href or '?' in href or '#' in href or '.' in href:
            continue
            
        # Skip very short or very long hrefs
        if len(href) < 2 or len(href) > 50:
            continue
            
        # Skip if it's just a number or contains only special chars
        if href.isdigit() or not any(c.isalnum() for c in href):
            continue
        
        # Skip navigation items (contain arrows, slashes, or common nav words)
        nav_keywords = ['news', 'opinions', 'reviews', 'headlines', 'weekly', 'packages']
        if any(keyword in name.lower() for keyword in nav_keywords):
            continue
        if '▼' in name or '▲' in name or '►' in name:
            continue
            
        # Skip duplicates
        if href in seen:
            continue
            
        seen.add(href)
        distributions.append((href, name))
    
    print(f"Found {len(distributions)} distributions from search page")
    return distributions


def fetch_distribution_details(session: requests.Session, slug: str, name: str) -> Optional[Dict]:
    """
    Fetch detailed information about a specific distribution
    """
    print(f"Fetching details for: {name} ({slug})")
    
    detail_url = f"{BASE_URL}/table.php?distribution={slug}"
    
    max_retries = 3
    retry_delay = 60  # throttling means back off well beyond the crawl delay
    
    for attempt in range(max_retries):
        try:
            response = session.get(detail_url, headers=HEADERS, timeout=30)
            if response.status_code == 403 or response.status_code == 429:
                print(f"  Warning: Throttled (HTTP {response.status_code}). Waiting {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(retry_delay)
                retry_delay *= 2 # Exponential backoff
                continue
            response.raise_for_status()
            break # Success
        except requests.RequestException as e:
            if attempt < max_retries - 1:
                print(f"  Warning: Error fetching {name} ({e}). Retrying in {retry_delay}s...", file=sys.stderr)
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"  Error: Could not fetch details for {name} after {max_retries} attempts: {e}", file=sys.stderr)
                return None
    else:
        print(f"  Error: {name} still throttled after {max_retries} attempts", file=sys.stderr)
        return None

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Initialize distribution data with all fields
    distro_data = {
        'id': slug,
        'name': name,
        'url': detail_url,
        'parent': None,
        'start': '',
        'stop': '',
        'status': 'Unknown',
        'based_on': '',
        'origin': '',
        'architecture': '',
        'desktop': '',
        'category': '',
        'description': '',
        'popularity': None,
        'logo': ''
    }
    
    # Extract logo/icon
    # DistroWatch often uses multiple img tags, we want the one in the top headline area
    # Usually it's in a td with class TablesTitle or near the h1
    try:
        title_td = soup.find('td', class_='TablesTitle')
        if title_td:
            img = title_td.find('img')
            if img and img.get('src'):
                logo_src = img.get('src')
                if logo_src.startswith('/'):
                    distro_data['logo'] = f"{BASE_URL}{logo_src}"
                elif not logo_src.startswith('http'):
                    distro_data['logo'] = f"{BASE_URL}/{logo_src}"
                else:
                    distro_data['logo'] = logo_src
    except Exception:
        pass
    
    # Extract description
    # The description is usually in the second or third paragraph after the metadata list
    desc_section = soup.find('td', class_='TablesTitle')
    if desc_section:
        # Clone to avoid modifying original
        temp_soup = BeautifulSoup(str(desc_section), 'html.parser')
        # Remove the ul/li metadata
        ul = temp_soup.find('ul')
        if ul:
            ul.decompose()
        # Remove the "Last Update" text if it's there
        desc_text = temp_soup.get_text(separator=' ', strip=True)
        # Often starts with "Name Last Update: ... OS Type: ..."
        # We want to skip to the actual description
        m = re.search(r'Popularity:.*?\)\s*(.*)', desc_text)
        if m:
            distro_data['description'] = m.group(1).split('Submit a review')[0].strip()[:500]
        else:
            # Fallback: just take the text but try to skip common headers
            clean_desc = re.sub(r'^.*?Status: [A-Za-z]+ ', '', desc_text)
            distro_data['description'] = clean_desc.split('Submit a review')[0].strip()[:500]
    
    # Extract popularity ranking
    try:
        # Search for "Popularity:" text across all tags
        pop_label = soup.find(string=re.compile(r'Popularity:', re.I))
        if pop_label:
            # Look at the parent container (likely an <li> or <td>)
            container = pop_label.find_parent()
            if container:
                text = container.get_text()
                # Pattern: "Popularity: 1 (4,443 hits per day)"
                m = re.search(r'Popularity:\s*(\d+)', text)
                if m:
                    distro_data['popularity'] = m.group(1)
    except Exception:
        pass
    
    # Find the main info table
    info_section = soup.find('td', class_='TablesTitle')
    if info_section:
        ul = info_section.find('ul')
        if ul:
            for li in ul.find_all('li'):
                b_tag = li.find('b')
                if b_tag:
                    key = b_tag.text.strip().rstrip(':')
                    b_tag.extract()
                    value = li.get_text(separator='\n').strip()
                    
                    
                    # Original logic for 'Based on' and other fields
                    if key == 'Based on':
                        # Split on newline to get just the "Based on" value
                        clean_value = value.split('\n')[0].strip()
                        distro_data['based_on'] = clean_value
                        # Extract parent from "Based on" field
                        # Handle formats like "Arch", "Debian (Stable)", "Debian (Stable), Ubuntu (LTS)"
                        parent_match = re.match(r'^([^,(]+)', clean_value)
                        if parent_match:
                            parent_name = parent_match.group(1).strip()
                            # Skip "Independent" as it means no parent
                            if parent_name.lower() != 'independent':
                                # Convert parent name to slug (lowercase, remove spaces)
                                distro_data['parent'] = parent_name.lower().replace(' ', '')
                    elif key == 'Origin':
                        # Split on newline to get just the origin value
                        distro_data['origin'] = value.split('\n')[0].strip()
                    elif key == 'Architecture':
                        # Split on newline to get just the architecture value
                        distro_data['architecture'] = value.split('\n')[0].strip()
                    elif key == 'Desktop':
                        # Split on newline to get just the desktop value
                        distro_data['desktop'] = value.split('\n')[0].strip()
                    elif key == 'Category':
                        # Split on newline to get just the category value
                        distro_data['category'] = value.split('\n')[0].strip()
                    elif key == 'Status':
                        # Split on newline to get just the status value
                        distro_data['status'] = value.split('\n')[0].strip()
    
    # Find release dates
    dates = []
    date_cells = soup.find_all('td', class_='Date')
    for cell in date_cells:
        date_text = cell.text.strip()
        if date_text:
            sanitized = sanitize_date(date_text)
            if sanitized:
                dates.append(sanitized)
    
    if dates:
        dates.sort()
        distro_data['start'] = dates[0]
        
        # If discontinued, set stop date
        status = distro_data.get('status', '')
        if status and status.lower() in ['discontinued', 'inactive', 'dormant']:
            distro_data['stop'] = dates[-1]
    
    # Small delay is now handled in the main loop for better control
    
    return distro_data


def fetch_all_distributions(output_file: Optional[str] = None, use_cache: bool = True, limit: Optional[int] = None, delay: float = CRAWL_DELAY, repair: bool = False) -> List[Dict]:
    """
    Main function to fetch all Linux distributions from DistroWatch
    Uses the search page with status=All to get ALL distributions (1100+)
    """
    cache_file = Path('distrowatch_cache.json')
    all_distros = []
    if delay < CRAWL_DELAY:
        print(f"Warning: delay {delay}s is below DistroWatch's Crawl-Delay of {CRAWL_DELAY:.0f}s; using {CRAWL_DELAY:.0f}s")
        delay = CRAWL_DELAY
    if not use_cache and cache_file.exists():
        print(f"Ignoring existing cache (--no-cache): {cache_file}")
    elif cache_file.exists():
        print(f"Detected existing cache: {cache_file}")
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                all_distros = json.load(f)
            print(f"  Loaded {len(all_distros)} distributions from cache.")
        except Exception as e:
            print(f"  Warning: Could not load cache: {e}")
    
    session = requests.Session()
    session.headers.update(HEADERS)
    
    
    # Fetch the list of distributions from search page (ALL distributions)
    distro_list = fetch_search_page_distributions(session)
    
    if not distro_list:
        print("No distributions found!", file=sys.stderr)
        return all_distros
    
    print(f"\n✓ Found {len(distro_list)} distributions in DistroWatch list")
    
    # Apply limit if specified (for testing)
    if limit:
        distro_list = distro_list[:limit]
        print(f"Limiting to first {limit} distributions for testing")
    
    # Create a set of already fetched slugs for resume logic
    seen_slugs = {d['id'] for d in all_distros if 'id' in d}
    failed: List[tuple] = []
    
    try:
        # Process each distribution
        for i, (slug, name) in enumerate(distro_list, 1):
            should_fetch = False
            
            if slug not in seen_slugs:
                should_fetch = True
            elif repair:
                # In repair mode, check if existing record is "incomplete"
                existing = next((d for d in all_distros if d.get('id') == slug), None)
                if existing:
                    # If popularity is missing or logo is missing, we re-fetch
                    if existing.get('status') == 'Unknown' or not existing.get('popularity') or not existing.get('logo'):
                        print(f"[{i}/{len(distro_list)}] Repairing (incomplete data): {name}")
                        should_fetch = True
                        # Remove old record so we can replace it
                        all_distros = [d for d in all_distros if d.get('id') != slug]
                        seen_slugs.discard(slug)

            if not should_fetch:
                # Progress update occasionally even if skipping
                if i % 50 == 0:
                    print(f"[{i}/{len(distro_list)}] Already cached: {name}")
                continue
                
            print(f"\n[{i}/{len(distro_list)}] Fetching: {name}")
            
            details = fetch_distribution_details(session, slug, name)
            if details:
                all_distros.append(details)
                seen_slugs.add(slug)
            else:
                failed.append((slug, name))
                
            # Periodic save to cache (every 10 distros) to prevent full loss on crash
            if len(all_distros) % 10 == 0:
                with open(cache_file, 'w', encoding='utf-8') as f:
                    json.dump(all_distros, f, indent=2, ensure_ascii=False)
                
            # Respectful delay with jitter
            if i < len(distro_list):
                jittered_delay = delay * (0.8 + random.random() * 0.4)
                time.sleep(jittered_delay)
                
    except KeyboardInterrupt:
        print("\n\nUser interrupted! Saving current progress...")
    except Exception as e:
        print(f"\n\nError during scraping: {e}")
        print("Saving current progress...")
    
    if failed:
        print(f"\n{len(failed)} distributions could not be fetched (re-run to retry):", file=sys.stderr)
        for slug, name in failed:
            print(f"  {name} ({slug})", file=sys.stderr)

    # Final save to cache
    print(f"Saving {len(all_distros)} records to cache: {cache_file}")
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(all_distros, f, indent=2, ensure_ascii=False)
    
    # Save to output file if specified
    if output_file:
        print(f"Saving to output file: {output_file}")
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(all_distros, f, indent=2, ensure_ascii=False)
    
    return all_distros


def main():
    parser = argparse.ArgumentParser(
        description='DistroWatch scraper using search page (gets ALL distributions including discontinued)'
    )
    parser.add_argument(
        '--output', '-o',
        default='distros_raw.json',
        help='Output JSON file path (default: distros_raw.json)'
    )
    parser.add_argument(
        '--no-cache',
        action='store_true',
        help='Ignore cache and fetch fresh data'
    )
    parser.add_argument(
        '--limit', '-l',
        type=int,
        help='Limit number of distributions to fetch (for testing)'
    )
    parser.add_argument(
        '--delay', '-d',
        type=float,
        default=CRAWL_DELAY,
        help=f'Delay between requests in seconds (default and minimum: {CRAWL_DELAY:.0f}, per robots.txt)'
    )
    parser.add_argument(
        '--repair',
        action='store_true',
        help='Re-fetch distributions with missing popularity/logo'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("DistroWatch Scraper (Search Page Method)")
    print("Gets ALL distributions including discontinued (1100+)")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    distros = fetch_all_distributions(
        output_file=args.output,
        use_cache=not args.no_cache,
        limit=args.limit,
        delay=args.delay,
        repair=args.repair
    )
    
    print()
    print("=" * 60)
    print(f"Completed! Total distributions: {len(distros)}")
    print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)


if __name__ == '__main__':
    main()
