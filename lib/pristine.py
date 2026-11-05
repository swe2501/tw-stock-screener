"""Official IX0231 membership, dated explicitly; no inferred constituents or DB writes."""
import json
import math
import time
import urllib.request
from datetime import date
from pathlib import Path

SNAPSHOT = json.loads(Path(__file__).with_name('pristine_snapshot.json').read_text(encoding='utf-8'))
_cache = None


def members_for_date(day):
    day = str(day).replace('/', '').replace('-', '')
    if not (SNAPSHOT['effective_from'].replace('-', '') <= day < SNAPSHOT['valid_before'].replace('-', '')):
        raise ValueError('所選日期尚無對應的璞玉成分名單，請選 2026/10/20～2027/03/31；不以目前名單回套歷史。')
    return frozenset(row['code'] for row in SNAPSHOT['members'])


def normalize_history(raw):
    data = raw.get('data', {})
    labels, datasets = data.get('labels', []), data.get('datasets', [])
    values = datasets[0].get('data', []) if datasets else []
    if not labels or len(labels) != len(values):
        raise ValueError('index_history_unavailable')
    rows = []
    for label, value in zip(labels, values):
        day, number = str(label).replace('/', '-'), float(value)
        date.fromisoformat(day)
        if not math.isfinite(number) or number <= 0:
            raise ValueError('invalid_index_value')
        rows.append({'date': day, 'value': number})
    if rows != sorted(rows, key=lambda r:r['date']) or len({r['date'] for r in rows}) != len(rows):
        raise ValueError('invalid_index_dates')
    return rows


def overview():
    global _cache
    if _cache and time.monotonic() - _cache[0] < 900:
        return _cache[1]
    result = dict(SNAPSHOT, history_status='snapshot')
    try:
        url = 'https://backend.taiwanindex.com.tw/api/indexes/IX0231/records?start=2026-01-23&end=' + date.today().isoformat()
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0', 'Accept':'application/json'})
        with urllib.request.urlopen(req, timeout=7) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError('response_too_large')
        rows = normalize_history(json.loads(raw))
        if rows[-1]['date'] >= SNAPSHOT['history_as_of']:
            result.update(history=rows, history_as_of=rows[-1]['date'], history_status='official')
    except (OSError, ValueError, KeyError, TypeError):
        pass  # Dated official fallback is visible to clients; never manufacture prices.
    _cache = time.monotonic(), result
    return result
