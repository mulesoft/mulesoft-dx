"""
Build changelog data from changelog.yaml for portal rendering.

Reads the accumulated changelog entries and groups them by week.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict

import yaml

ACTION_LABELS = {
    'add': 'Added',
    'update': 'Updated',
    'remove': 'Removed',
    'fix': 'Fixed',
    'deprecate': 'Deprecated',
}


def _week_label(monday: str, sunday: str) -> str:
    m = datetime.strptime(monday, '%Y-%m-%d')
    s = datetime.strptime(sunday, '%Y-%m-%d')
    if m.month == s.month:
        return f"{m.strftime('%b %d')} — {s.strftime('%d, %Y')}"
    return f"{m.strftime('%b %d')} — {s.strftime('%b %d, %Y')}"


def build_changelog(repo_root: Path, **_kwargs) -> Dict:
    """Build changelog data structure from changelog.yaml for template rendering.

    Returns dict with keys: weeks, artifact_types, total_entries.
    """
    changelog_path = repo_root / 'changelog.yaml'
    if not changelog_path.exists():
        return {'weeks': [], 'artifact_types': [], 'total_entries': 0}

    with open(changelog_path, 'r') as f:
        data = yaml.safe_load(f) or {}

    raw_entries = data.get('entries', [])
    if not raw_entries:
        return {'weeks': [], 'artifact_types': [], 'total_entries': 0}

    weeks_map = defaultdict(list)
    artifact_types_seen = set()
    action_types_seen = set()

    for raw in raw_entries:
        date = str(raw.get('date', ''))
        if not date:
            continue

        action = raw.get('action', 'update')
        description = raw.get('description', '')
        commit_url = raw.get('url', '')

        for artifact in raw.get('artifacts', []):
            asset_type = artifact.get('type', '')
            asset_name = artifact.get('name', '')
            artifact_types_seen.add(asset_type)
            action_types_seen.add(action)

            dt = datetime.strptime(date, '%Y-%m-%d')
            monday = dt - timedelta(days=dt.weekday())
            sunday = monday + timedelta(days=6)
            wk_key = (monday.strftime('%Y-%m-%d'), sunday.strftime('%Y-%m-%d'))

            weeks_map[wk_key].append({
                'artifact_type': asset_type,
                'artifact_name': asset_name,
                'action': action,
                'action_label': ACTION_LABELS.get(action, action),
                'description': description,
                'commit_url': commit_url,
                'date': date,
                'author': raw.get('author', ''),
                'hash': raw.get('hash', ''),
            })

    weeks = []
    for (monday, sunday) in sorted(weeks_map.keys(), reverse=True):
        weeks.append({
            'monday': monday,
            'label': _week_label(monday, sunday),
            'entries': weeks_map[(monday, sunday)],
        })

    total = sum(len(w['entries']) for w in weeks)

    action_order = ['add', 'update', 'fix', 'remove', 'deprecate']
    sorted_actions = [a for a in action_order if a in action_types_seen]

    return {
        'weeks': weeks,
        'artifact_types': sorted(artifact_types_seen),
        'action_types': [{'key': a, 'label': ACTION_LABELS.get(a, a)} for a in sorted_actions],
        'total_entries': total,
    }
