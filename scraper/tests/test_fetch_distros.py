import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fetch_distros import parse_distribution_page  # noqa: E402

# Trimmed from https://distrowatch.com/table.php?distribution=omarchy. The
# <li> tags are unclosed on the real page too.
PAGE = """
<table><tr><td class="TablesTitle">
<img align="left" class="logo" src="images/icon-large/omarchy.png" title="Omarchy"/>
<h1>Omarchy</h1><br/><h2>Last Update: 2026-09-16 14:20 UTC</h2>
<hr/>
<div style="text-align:right">omarchy-4.0.0-hyprland
 <span>(more screenshots in <a href="gallery.php?distribution=omarchy">our gallery</a>)</span></div>
<a href="images/slinks/omarchy.png"><img align="right" src="images/slinks/omarchy-small.png"/></a>
<ul><li><b>OS Type:</b> <a href="search.php?ostype=Linux#simple">Linux</a><br/>
<li><b>Based on:</b> <a href="search.php?basedon=Arch#simple">Arch</a><br/>
<li><b>Origin:</b> <a href="search.php?origin=Denmark#simple">Denmark</a><br/>
<li><b>Architecture:</b> <a href="search.php?architecture=x86_64#simple">x86_64</a><br/>
<li><b>Desktop:</b> <a href="search.php?desktop=Hyprland#simple">Hyprland</a><br/>
<li><b>Category:</b> <a href="search.php?category=Desktop#simple">Desktop</a>, <a href="search.php?category=LLM#simple">Large Language Model</a><br/>
<!-- <li><b>Release Model:</b> <br /><li><b>Init:</b> <br /> -->
<li><b>Status:</b> <font color="green">Active</font><br/>
<li><b>Popularity:</b> <a href="dwres.php?resource=popularity">14 (592 hits per day)</a>
</li></li></li></li></li></li></li></li></ul>
Omarchy is an Arch-based Linux distribution featuring the Hyprland tiling window manager.
It ships with what a <a href="x">developer</a> would need.
    <br/><br/>
<b><a href="dwres.php?resource=popularity">Popularity (hits per day)</a>:</b> 12 months: <b>19</b> (517), 6 months: <b>14</b> (592)<br/><br/>
<b><a href="dwres.php?resource=ratings">Average visitor rating</a></b>: <b>9.0</b>/10 from <b>77</b> review(s).<br/><br/>
</td></tr></table>
<table><tr><td class="Date">2025-12-15</td><td class="Date">2026-09-16</td></tr></table>
"""


def test_parses_metadata_and_popularity():
    record = parse_distribution_page(PAGE, 'omarchy', 'Omarchy')
    assert record['based_on'] == 'Arch'
    assert record['parent'] == 'arch'
    assert record['origin'] == 'Denmark'
    assert record['architecture'] == 'x86_64'
    assert record['desktop'] == 'Hyprland'
    assert record['category'] == 'Desktop'
    assert record['status'] == 'Active'
    assert record['popularity'] == '14'
    assert record['logo'] == 'https://distrowatch.com/images/icon-large/omarchy.png'
    assert record['start'] == '2025-12-15'
    assert record['stop'] == ''


def test_description_excludes_header_and_stats():
    record = parse_distribution_page(PAGE, 'omarchy', 'Omarchy')
    assert record['description'] == (
        'Omarchy is an Arch-based Linux distribution featuring the Hyprland '
        'tiling window manager. It ships with what a developer would need.'
    )
