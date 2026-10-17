"""Regression tests using synthetic prices; no database writes or credentials."""
import ast
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from statistics import median

source = Path('api/screen.py').read_text(encoding='utf-8')
tree = ast.parse(source)
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_fetch_groupbook')

class GroupBookTests(unittest.TestCase):
    def run_model(self, fetch):
        scope = dict(datetime=datetime, timezone=timezone, timedelta=timedelta,
                     SUPABASE_URL='test', SUPABASE_KEY='test', _cache_sb=fetch,
                     _GROUP_BOOK_MEMBERS={'test': ['2330']}, _GROUP_BOOK_CATEGORIES={},
                     _STOCK_NAMES={}, _median=lambda xs: median(xs) if xs else None)
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'screen.py', 'exec'), scope)
        return scope['_fetch_groupbook'](5)

    def test_failed_page_does_not_publish_partial_statistics(self):
        self.assertIn('error', self.run_model(lambda *a, **k: (0, None)))

    def test_reads_past_old_sixty_thousand_limit(self):
        offsets = []
        def fetch(*a, **k):
            offset = int(dict(k['params'])['offset']); offsets.append(offset)
            return 200, ([{'code': 'ignored'}] * 1000 if offset < 61000 else [])
        self.run_model(fetch)
        self.assertEqual(offsets[-1], 61000)

    def test_current_quarter_excluded_from_group_and_member_samples(self):
        now = datetime.now(timezone(timedelta(hours=8)))
        month = ((now.month - 1) // 3) * 3 + 1
        previous = (now.year, month - 3) if month > 1 else (now.year - 1, 10)
        rows = []
        for year, m in [previous, (now.year, month)]:
            rows += [dict(code='2330', trade_date=f'{year}-{m:02d}-{d:02d}', close=100+d) for d in range(1, 9)]
        result = self.run_model(lambda *a, **k: (200, rows))
        group = result['groups'][0]
        self.assertEqual(group['samples'], 1)
        self.assertEqual(group['members'][0]['samples'], 1)
        self.assertEqual(len(group['events']), 1)
        self.assertEqual(group['events'][0]['quarter'], f'{previous[0]} Q{(previous[1]-1)//3+1}')

if __name__ == '__main__':
    unittest.main()
