import importlib.util
import math
import unittest
from unittest.mock import patch
from lib import pristine

spec = importlib.util.spec_from_file_location('pristine_screen_test', 'api/screen.py')
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)


class PristineTests(unittest.TestCase):
    def test_membership_and_date_boundaries(self):
        self.assertEqual(len(pristine.members_for_date('2026-10-20')),394)
        self.assertIn('1104',pristine.members_for_date('20270331'))
        self.assertNotIn('2330',pristine.members_for_date('20261105'))
        for day in ('20261019','20270401','20250101'):
            with self.assertRaises(ValueError): pristine.members_for_date(day)

    def test_history_rejects_missing_invalid_or_duplicate_data(self):
        for labels,values in [([],[]),(['2026/11/05'],[]),(['2026/11/05'],[math.nan]),(['2026/11/05'],[-1]),(['2026/11/05']*2,[1,2])]:
            with self.assertRaises(ValueError): pristine.normalize_history({'data':{'labels':labels,'datasets':[{'data':values}]}})

    def test_screen_applies_official_universe_and_intersects_other_conditions(self):
        stock={'open':10,'close':11,'high':12,'low':9,'volume':1000,'name':'fixture'}
        with patch.object(screen,'fetch_all_stocks_latest',return_value=({'1104':stock,'2330':stock},'20261105')),patch.object(screen,'_get_industry_map',return_value={}):
            self.assertEqual(screen.screen({})['count'],2)
            result=screen.screen({'pristine_only':True})
            self.assertTrue(result['pristine_applied'])
            self.assertEqual([r['code'] for r in result['results']],['1104'])
            self.assertEqual(screen.screen({'pristine_only':True,'min_price':12})['results'],[])

    def test_history_unavailable_falls_back_with_explicit_status(self):
        with patch.object(pristine,'_cache',None),patch.object(pristine.urllib.request,'urlopen',side_effect=OSError()):
            data=pristine.overview()
            self.assertEqual(data['history_status'],'snapshot')
            self.assertEqual(data['history_as_of'],'2026-11-05')
            self.assertEqual(data['history'][-1]['value'],5357.78)

if __name__=='__main__':unittest.main()
