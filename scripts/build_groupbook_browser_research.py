"""Package reviewed public research by quarter for read-only API outage fallback.

Run after updating data/groupbook-quarterly-research.json. No source text is trimmed.
This does not produce price statistics or impersonate a live financial snapshot.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build():
    source = json.loads((ROOT / 'data/groupbook-quarterly-research.json').read_text(encoding='utf-8'))
    if source.get('schemaVersion') != 1 or not source.get('complete'):
        raise ValueError('Only a complete reviewed research catalog may be packaged')
    destination = ROOT / 'apps/web/assets/groupbook-research'
    destination.mkdir(exist_ok=True)
    for quarter, records in source['quarters'].items():
        payload = dict(schemaVersion=1, quarter=quarter, asOf=source['asOf'],
                       availableQuarters=sorted(source['quarters'], reverse=True), records=records)
        (destination / (quarter + '.js')).write_text(
            'window.GROUP_BOOK_RESEARCH=window.GROUP_BOOK_RESEARCH||{};window.GROUP_BOOK_RESEARCH['+json.dumps(quarter)+']=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print('Packaged reviewed research quarters:', len(source['quarters']))


if __name__ == '__main__':
    build()
