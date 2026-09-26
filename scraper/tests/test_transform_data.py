import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fetch_distros_modern import sanitize_date  # noqa: E402
from transform_data import merge_record, merge_records, normalize_parent_name  # noqa: E402


def existing_ubuntu(**overrides):
    record = {
        'id': 'ubuntu',
        'name': 'Ubuntu',
        'parent': 'debian',
        'start': '2004.10.20',
        'stop': '',
        'status': 'Active',
        'popularity': '10',
        'description': 'A hand-edited description.',
        'icon': 'https://distrowatch.com/images/yvzhuwbpy/ubuntu.png',
        'color': '#dd4814',
        'desktop': 'GNOME',
    }
    record.update(overrides)
    return record


def scraped_ubuntu(**overrides):
    record = {
        'id': 'ubuntu',
        'name': 'Ubuntu',
        'parent': None,
        'start': '2006.06.01',
        'stop': '',
        'status': 'Active',
        'popularity': '4',
        'description': 'Raw scraped text with a typo.',
        'icon': '',
        'color': '#888888',
        'desktop': 'GNOME, KDE',
    }
    record.update(overrides)
    return record


def test_curated_fields_survive_merge():
    merged = merge_record(existing_ubuntu(), scraped_ubuntu())
    assert merged['description'] == 'A hand-edited description.'
    assert merged['parent'] == 'debian'
    assert merged['start'] == '2004.10.20'
    assert merged['icon'].endswith('ubuntu.png')
    assert merged['color'] == '#dd4814'


def test_volatile_fields_are_refreshed():
    merged = merge_record(existing_ubuntu(), scraped_ubuntu())
    assert merged['popularity'] == '4'
    assert merged['desktop'] == 'GNOME, KDE'


def test_empty_curated_field_is_filled_from_scrape():
    merged = merge_record(existing_ubuntu(description='', parent=None), scraped_ubuntu(parent='debian'))
    assert merged['description'] == 'Raw scraped text with a typo.'
    assert merged['parent'] == 'debian'


def test_empty_scraped_volatile_field_does_not_clobber():
    merged = merge_record(existing_ubuntu(), scraped_ubuntu(popularity=None, desktop=''))
    assert merged['popularity'] == '10'
    assert merged['desktop'] == 'GNOME'


def test_discontinuation_is_picked_up():
    merged = merge_record(existing_ubuntu(), scraped_ubuntu(status='Discontinued', stop='2025.01.01'))
    assert merged['status'] == 'Discontinued'
    assert merged['stop'] == '2025.01.01'


def test_revival_clears_stop():
    merged = merge_record(
        existing_ubuntu(status='Dormant', stop='2020.01.01'),
        scraped_ubuntu(status='Active', stop=''),
    )
    assert merged['stop'] == ''


def test_merge_records_adds_new_and_keeps_unscraped():
    existing = [existing_ubuntu(), {'id': 'oldie', 'name': 'Oldie', 'start': '1999.01.01', 'parent': None}]
    new = [scraped_ubuntu(), {'id': 'newbie', 'name': 'Newbie', 'start': '2026.05.01', 'parent': 'ubuntu'}]
    merged = merge_records(new, existing)
    ids = [d['id'] for d in merged]
    assert ids == ['oldie', 'ubuntu', 'newbie']


def test_merge_records_is_case_insensitive_on_id():
    merged = merge_records([scraped_ubuntu(id='Ubuntu')], [existing_ubuntu()])
    assert len(merged) == 1
    assert merged[0]['description'] == 'A hand-edited description.'


def test_normalize_parent_name():
    ids = {'debian', 'arch', 'mint'}
    assert normalize_parent_name('Debian (Stable)', ids) == 'debian'
    assert normalize_parent_name('Arch Linux', ids) == 'arch'
    assert normalize_parent_name('Independent', ids) is None
    assert normalize_parent_name('', ids) is None


def test_sanitize_date():
    assert sanitize_date('2004') == '2004-01-01'
    assert sanitize_date('2004-10') == '2004-10-01'
    assert sanitize_date('2004-10-20') == '2004-10-20'
    assert sanitize_date('2004.10.20') == '2004-10-20'
    assert sanitize_date('2004-XX-XX') == '2004-01-01'
    assert sanitize_date('') == ''
