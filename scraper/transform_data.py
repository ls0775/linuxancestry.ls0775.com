#!/usr/bin/env python3
"""
Transform raw DistroWatch data into the format expected by the React app
Converts from raw scraper output to the hierarchical JSON structure
"""

import json
import argparse
import re
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime


# Color palette for different distribution families
FAMILY_COLORS = {
    # Major families
    'Debian': '#bf1238',
    'Ubuntu': '#dd4814',
    'Red Hat': '#ee0000',
    'Fedora': '#294172',
    'Arch': '#1793d1',
    'Gentoo': '#54487a',
    'Slackware': '#000000',
    'SUSE': '#73ba25',
    'openSUSE': '#73ba25',
    'Mandriva': '#1c4587',
    'Independent': '#666666',
    
    # Other notable families
    'Android': '#3ddc84',
    'Void': '#478061',
    'Alpine': '#0d597f',
    'NixOS': '#5277c3',
    'Clear Linux': '#0095d5',
}

# Default color for unknown families
DEFAULT_COLOR = '#888888'


def generate_color_for_family(family: str, existing_colors: set) -> str:
    """
    Generate a color for a distribution family
    """
    if family in FAMILY_COLORS:
        return FAMILY_COLORS[family]
    
    # Generate a deterministic color based on the family name
    # Use hash to get a consistent color for the same family
    hash_val = hash(family)
    
    # Generate HSL color with good saturation and lightness
    hue = abs(hash_val) % 360
    saturation = 60 + (abs(hash_val >> 8) % 30)  # 60-90%
    lightness = 45 + (abs(hash_val >> 16) % 20)  # 45-65%
    
    # Convert HSL to hex (simplified)
    # For now, just return a hex color based on hue
    r = int(255 * (lightness / 100))
    g = int(255 * (saturation / 100))
    b = int(255 * ((360 - hue) / 360))
    
    return f'#{r:02x}{g:02x}{b:02x}'


def clean_description(description: str) -> str:
    """
    Clean description text by removing DistroWatch metadata.
    Removes patterns like '<distro name> Last Update: YYYY-MM-DD HH:MM UTC'
    """
    if not description:
        return ''
    
    # Remove "Last Update: ..." pattern
    import re
    cleaned = re.sub(r'\s*Last Update:.*?UTC\.?', '', description, flags=re.IGNORECASE)
    
    # Remove leading distro name if it starts the description
    # Pattern: "DistroName is a..." or "DistroName: description"
    cleaned = re.sub(r'^[A-Za-z0-9\s]+(?:is a|:)\s*', '', cleaned).strip()
    
    # Remove any remaining leading/trailing whitespace
    cleaned = cleaned.strip()
    
    return cleaned


def normalize_parent_name(parent: str, distro_names: set) -> Optional[str]:
    """
    Normalize parent distribution name to match actual distribution IDs
    Handles cases like "Debian GNU/Linux" -> "debian"
    """
    if not parent:
        return None
    
    parent = parent.strip()
    parent_lower = parent.lower()
    
    # 1. Direct match
    if parent_lower in distro_names:
        return parent_lower
    
    # 2. Try common variants/sub-strings
    # e.g., "Arch Linux" -> "arch"
    clean_variants = [
        parent_lower.replace(' linux', '').strip(),
        parent_lower.replace(' gnu/linux', '').strip(),
        parent_lower.replace(' os', '').strip(),
        re.sub(r'\(.*?\)', '', parent_lower).strip(), # remove things like "(stable)"
    ]
    
    for variant in clean_variants:
        if variant in distro_names:
            return variant
            
    # 3. Word-by-word fallback (Aggressive)
    # Check if any single word in the parent name is a known distro
    # Useful for "Based on: Debian (Stable), Ubuntu (LTS)"
    words = re.findall(r'[a-z0-9]+', parent_lower)
    for word in words:
        if word in distro_names and word not in ['linux', 'gnu', 'independent', 'fork']:
            return word
            
    return None


def convert_date_format(date_str: str) -> str:
    """
    Convert date from YYYY-MM-DD to YYYY.MM.DD format expected by the app
    """
    if not date_str:
        return ''
    
    try:
        # Parse and reformat
        parts = date_str.split('-')
        if len(parts) == 3:
            year, month, day = parts
            return f"{year}.{month}.{day}"
        elif len(parts) == 2:
            year, month = parts
            return f"{year}.{month}.01"
        elif len(parts) == 1:
            return f"{parts[0]}.01.01"
    except:
        pass
    
    return date_str


def transform_distros(raw_data: List[Dict]) -> List[Dict]:
    """
    Transform raw DistroWatch data to React app format
    """
    # First pass: collect all distribution IDs
    distro_ids = {d['id'].lower() for d in raw_data}
    
    # Second pass: transform each distribution
    transformed = []
    used_colors = set()
    
    for distro in raw_data:
        # Determine parent
        parent = None
        if distro.get('parent'):
            parent = normalize_parent_name(distro['parent'], distro_ids)
        elif distro.get('based_on') and distro['based_on'].lower() != 'independent':
            parent = normalize_parent_name(distro['based_on'], distro_ids)
        
        # SPECIAL FIX: Ubuntu context
        if distro['id'] == 'ubuntu':
            parent = 'debian'
        else:
            # Check if name contains Ubuntu (e.g. Kubuntu, Xubuntu, Ubuntu Studio)
            # OR if based_on/description specifically mentions Ubuntu
            based_on = distro.get('based_on', '')
            desc = distro.get('description', '')
            if 'Ubuntu' in distro['name'] or 'Ubuntu' in based_on or 'Ubuntu-based' in desc or 'based on Ubuntu' in desc:
                if parent != 'ubuntu' and 'ubuntu' in distro_ids:
                    parent = 'ubuntu'

        # Determine root family for coloring
        root_family = parent if parent else 'Independent'
        if parent and parent in FAMILY_COLORS:
            color = FAMILY_COLORS[parent]
        else:
            color = generate_color_for_family(root_family, used_colors)
        used_colors.add(color)
        
        # Build transformed entry with all fields
        entry = {
            'id': distro['id'],
            'name': distro['name'],
            'color': color,
            'parent': parent,
            'start': convert_date_format(distro.get('start', '')),
            'stop': convert_date_format(distro.get('stop', '')),
            'icon': distro.get('logo', ''),  # Use the logo URL from scraper
            'url': distro.get('url', ''),
            
            # New fields for enhanced info panel
            'description': clean_description(distro.get('description', '')),
            'popularity': distro.get('popularity'),
            'origin': distro.get('origin', ''),
            'status': distro.get('status', ''),
            'based_on': distro.get('based_on', ''),
            'architecture': distro.get('architecture', ''),
            'desktop': distro.get('desktop', ''),
            'category': distro.get('category', '')
        }
        
        transformed.append(entry)
    
    
    # Sort by start date (oldest first)
    transformed.sort(key=lambda x: x['start'] if x['start'] else '9999')
    
    # Validate parent references - fix orphaned parents
    valid_ids = {d['id'] for d in transformed}
    for distro in transformed:
        if distro['parent'] and distro['parent'] not in valid_ids:
            # Try to recover from based_on if available
            recovered = False
            if distro.get('based_on'):
                candidates = [c.strip() for c in distro['based_on'].split(',')]
                for candidate in candidates:
                    norm = normalize_parent_name(candidate, valid_ids)
                    if norm and norm in valid_ids and norm != distro['id']:
                        distro['parent'] = norm
                        recovered = True
                        break
            
            if not recovered:
                distro['parent'] = None
    
    # CYCLE BREAKING (Critical for D3)
    visited = set()
    stack = set()
    
    def break_cycles(node_id, id_map):
        if node_id in stack:
            # Cycle detected! Break it by making this node a root
            print(f"  Breaking cycle at {node_id}")
            id_map[node_id]['parent'] = None
            return
        
        if node_id in visited:
            return
            
        visited.add(node_id)
        stack.add(node_id)
        
        node = id_map.get(node_id)
        if node and node['parent']:
            break_cycles(node['parent'], id_map)
            
        stack.remove(node_id)

    id_map = {d['id']: d for d in transformed}
    for distro_id in list(id_map.keys()):
        break_cycles(distro_id, id_map)

    return transformed


def merge_with_existing(new_data: List[Dict], existing_file: Path) -> List[Dict]:
    """
    Merge new scraped data with existing data, preserving manual edits.
    Uses case-insensitive ID matching to prevent duplicate entries like 'Debian' vs 'debian'.
    """
    if not existing_file.exists():
        print(f"No existing file found at {existing_file}, using new data only")
        return new_data
    
    print(f"Merging with existing data from {existing_file}")
    
    try:
        with open(existing_file, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
    except Exception as e:
        print(f"Error loading existing data: {e}. Using new data only.")
        return new_data
    
    # Create lookup map for new data (using lowercase IDs)
    new_by_id = {d['id'].lower(): d for d in new_data}
    
    merged = []
    processed_ids = set()
    
    # Pass 1: Keep existing entries, updating with new info where available
    for distro in existing_data:
        original_id = distro.get('id', '')
        distro_id = original_id.lower()
        
        if not distro_id or distro_id in processed_ids:
            continue
            
        if distro_id in new_by_id:
            # Found an update for this existing record
            new_info = new_by_id[distro_id].copy()
            
            # Preserve specific fields from existing data if they are manual/special
            # e.g., if existing has a custom icon and new one is empty
            if distro.get('icon') and not new_info.get('icon'):
                new_info['icon'] = distro['icon']
            
            # Prefer existing colors if they aren't the default gray
            if distro.get('color') and distro['color'] not in ['#888888', '#666666']:
                new_info['color'] = distro['color']
                
            merged.append(new_info)
        else:
            # Keep existing distribution as-is
            merged.append(distro)
            
        processed_ids.add(distro_id)
    
    # Pass 2: Add entirely new distributions from the scrape
    for distro_id, distro in new_by_id.items():
        if distro_id not in processed_ids:
            print(f"  New distribution found: {distro['name']}")
            merged.append(distro)
            processed_ids.add(distro_id)
            
    # Final sort: Older start dates first
    merged.sort(key=lambda x: x['start'] if x.get('start') else '9999')
    
    return merged


def main():
    parser = argparse.ArgumentParser(
        description='Transform raw DistroWatch data to React app format'
    )
    parser.add_argument(
        '--input', '-i',
        default='distros_raw.json',
        help='Input raw JSON file (default: distros_raw.json)'
    )
    parser.add_argument(
        '--output', '-o',
        default='../src/data/distros.json',
        help='Output transformed JSON file (default: ../src/data/distros.json)'
    )
    parser.add_argument(
        '--merge',
        action='store_true',
        help='Merge with existing distros.json, preserving manual edits'
    )
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    output_path = Path(args.output)
    
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        return 1
    
    print("=" * 60)
    print("DistroWatch Data Transformer")
    print("=" * 60)
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print()
    
    # Load raw data
    print("Loading raw data...")
    with open(input_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    print(f"Loaded {len(raw_data)} distributions")
    
    # Transform
    print("Transforming data...")
    transformed = transform_distros(raw_data)
    
    # Merge if requested
    if args.merge:
        transformed = merge_with_existing(transformed, output_path)
    
    # Final Validation: Fix orphaned parents (critical for D3 stratification)
    # This catches issues from both new data and merged existing data
    print("Validating ancestry integrity...")
    valid_ids = {d['id'] for d in transformed}
    orphan_count = 0
    
    for distro in transformed:
        current_parent = distro['parent']
        
        # Check if parent is invalid or explicitly 'fork'
        if current_parent and (current_parent == 'fork' or current_parent not in valid_ids):
            original_parent = current_parent
            new_parent = None
            
            # Try to recover parent from 'based_on' field
            # based_on often looks like: "Sorcerer, Linux From Scratch"
            if distro.get('based_on'):
                candidates = [c.strip() for c in distro['based_on'].split(',')]
                for candidate in candidates:
                    # Explicitly skip 'fork' as a candidate
                    if candidate.lower() == 'fork':
                        continue
                        
                    # Normalize candidate name using same logic as main transformer
                    normalized = normalize_parent_name(candidate, valid_ids)
                    if normalized and normalized in valid_ids and normalized != 'fork':
                        new_parent = normalized
                        break
            
            distro['parent'] = new_parent
            orphan_count += 1
            
            if new_parent:
                print(f"  Fixed orphan: '{distro['name']}' (was '{original_parent}') -> recovered parent '{new_parent}' from based_on")
            else:
                print(f"  Fixed orphan: '{distro['name']}' (was '{original_parent}') -> set to null (root)")
    
    if orphan_count > 0:
        print(f"Fixed {orphan_count} orphaned distributions.")

    # Save output
    print(f"Saving to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transformed, f, indent=None, ensure_ascii=False)
    
    print()
    print("=" * 60)
    print(f"Success! Transformed {len(transformed)} distributions")
    print("=" * 60)
    
    # Print some statistics
    active_count = sum(1 for d in transformed if not d['stop'])
    discontinued_count = len(transformed) - active_count
    root_count = sum(1 for d in transformed if not d['parent'])
    
    print(f"\nStatistics:")
    print(f"  Total distributions: {len(transformed)}")
    print(f"  Active: {active_count}")
    print(f"  Discontinued: {discontinued_count}")
    print(f"  Root distributions: {root_count}")
    
    return 0


if __name__ == '__main__':
    exit(main())
