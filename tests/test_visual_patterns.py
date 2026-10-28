import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('visual_screen',ROOT/'api/screen.py')
screen=importlib.util.module_from_spec(spec);spec.loader.exec_module(screen)

class SavedVisualTests(unittest.TestCase):
    def test_read_only_scope_and_stock_filter_never_infers(self):
        snapshot={'version':'codex-visual-v1','scope':'uat','records':[
            {'code':'1236','timeframe':'daily','classification':'w'},
            {'code':'1236','timeframe':'weekly','classification':'no_w'},
            {'code':'1316','timeframe':'daily','classification':'w'}]}
        with patch.object(screen,'_site_env',return_value='uat'),patch.object(screen,'_cache_sb',return_value=(200,[{'payload':snapshot}])) as cache,patch.object(screen,'_aibuy_call',side_effect=AssertionError('Paid inference forbidden')):
            result=screen._read_visual_patterns('1236')
        self.assertEqual(len(result['records']),2)
        self.assertTrue(all(r['code']=='1236' for r in result['records']))
        self.assertIn('codex_visual_patterns@uat',str(cache.call_args))

    def test_prod_never_reads_uat_dataset(self):
        with patch.object(screen,'_site_env',return_value='prod'),patch.object(screen,'_cache_sb',side_effect=AssertionError('Wrong environment')):
            self.assertTrue(screen._read_visual_patterns('1236')['unavailable'])

    def test_failed_or_malformed_snapshot_is_not_a_negative_review(self):
        for response in [(503,None),(200,[{'payload':{'version':'wrong'}}])]:
            with patch.object(screen,'_site_env',return_value='uat'),patch.object(screen,'_cache_sb',return_value=response):
                result=screen._read_visual_patterns('1236')
                self.assertEqual(result['records'],[])
                self.assertTrue(result['unavailable'])

    def test_invalid_code_does_not_query(self):
        with patch.object(screen,'_cache_sb',side_effect=AssertionError('No query')):
            for code in ['1236&bad=1','^TWII','abc','123456']:
                self.assertIn('error',screen._read_visual_patterns(code))

if __name__=='__main__':unittest.main()
