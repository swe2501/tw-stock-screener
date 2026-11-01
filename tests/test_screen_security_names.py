import copy,importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('security_names_screen',Path(__file__).parents[1]/'api/screen.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class SecurityNames(unittest.TestCase):
 def setUp(self):s._security_name_cache.clear()
 def test_batch_validation_cache_and_copy(self):
  codes=[str(i) for i in range(1000,1451)]+['2330&select=*']
  calls=[]
  def backend(path,params):
   q=dict(params);self.assertEqual(path,'/security_catalog');self.assertEqual(q['select'],'code,name')
   batch=q['code'][4:-1].split(',');self.assertLessEqual(len(batch),200);calls.append(batch)
   return 200,[{'code':c,'name':'current '+c} for c in batch]
  with patch.object(s,'_cache_sb',backend):
   names=s._current_security_names(codes);self.assertEqual(len(calls),3)
   names['1000']='mutated';self.assertEqual(s._current_security_names(['1000'])['1000'],'current 1000')
  self.assertEqual(len(names),451)
 def test_failure_not_cached_and_no_legacy_table(self):
  # 2026-11-01 正規化：目錄失效時不再查舊 otc_names（將停用），回空讓呼叫端沿用快照原名；失敗不快取
  with patch.object(s,'_cache_sb',return_value=(503,None)) as read:
   self.assertEqual(s._current_security_names(['9999']),{})
   self.assertEqual(read.call_count,1);self.assertEqual(read.call_args.args[0],'/security_catalog')
  with patch.object(s,'_cache_sb',return_value=(200,[{'code':'9999','name':'current'}])):
   self.assertEqual(s._current_security_names(['9999'])['9999'],'current')
 def test_expiry(self):
  with patch.object(s.time,'time',side_effect=[0,301]),patch.object(s,'_cache_sb',side_effect=[(200,[{'code':'2330','name':'old'}]),(200,[{'code':'2330','name':'new'}])]):
   self.assertEqual(s._current_security_names(['2330'])['2330'],'old');self.assertEqual(s._current_security_names(['2330'])['2330'],'new')
 def test_completed_focus_snapshot_preserves_everything_except_names(self):
  data={'date':'2026-10-30','fields_version':3,'gainers':[{'code':'2330','name':'old','close':123,'chg':9.9}],'losers':[],'volume_surge':[]}
  before=copy.deepcopy(data)
  with patch.object(s,'_snapshot_rows',return_value=(200,[{'payload':data}])),patch.object(s,'_current_security_names',return_value={'2330':'current'}):
   result=s._read_focus_snapshot()
  self.assertEqual(result['gainers'],[dict(before['gainers'][0],name='current')]);self.assertEqual(data,before);self.assertEqual(result['date'],data['date'])
 def test_limitup_same_order_prices_counts_and_no_full_directory(self):
  history={'2330':[{'trade_date':'2026-10-30','close':110,'volume':100},{'trade_date':'2026-10-29','close':100,'volume':100}],'9999':[{'trade_date':'2026-10-30','close':90,'volume':100},{'trade_date':'2026-10-29','close':100,'volume':100}]}
  with patch.object(s,'_load_pw_window',return_value=('2026-10-30',history)),patch.object(s,'_current_security_names',return_value={'2330':'current','9999':'other'}),patch.object(s,'_cache_sb',side_effect=AssertionError('no full directory')):
   result=s._fetch_limitup()
  self.assertEqual(result['up'][0],dict(code='2330',name='current',close=110,chg=10.0,days=1,ratio=None));self.assertEqual(result['down'][0]['name'],'other');self.assertEqual(result['up_count'],1);self.assertEqual(result['date'],'2026-10-30')
if __name__=='__main__':unittest.main()
