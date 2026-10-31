import importlib.util, unittest
from pathlib import Path
from unittest.mock import patch
from test_zhenming_four import fixture
spec=importlib.util.spec_from_file_location('screen_four',Path(__file__).parents[1]/'api/screen.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
class Screen(unittest.TestCase):
 def run_screen(self,missing=False,min_price=0):
  bars=fixture();s=dict(name='fixture',open=105,close=106,high=107,low=104,volume=150,prev_close=104)
  with patch.object(api,'_get_industry_map',return_value={}),patch.object(api,'fetch_all_stocks_latest',return_value=({'TEST':s},'20260113')),patch.object(api,'fetch_pw_one',return_value={'bars':bars[:-1] if missing else bars,'prev_vols':[100]*5}):
   return api.screen({'zhenming4':True,'min_price':min_price})
 def test_applied_and_details(self):
  result=self.run_screen();self.assertTrue(result['zhenming4_applied']);self.assertEqual(result['count'],1);self.assertEqual(result['results'][0]['zm4']['day_n'],1)
 def test_missing_snapshot_is_excluded(self):self.assertEqual(self.run_screen(True)['count'],0)
 def test_empty_fast_path_retains_capability(self):
  result=self.run_screen(min_price=999);self.assertTrue(result['zhenming4_applied']);self.assertEqual(result['results'],[])
if __name__=='__main__':unittest.main()
