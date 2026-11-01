import concurrent.futures,importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('catalog_screen',Path(__file__).parents[1]/'api/screen.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
def row(code,**kw):return dict(code=code,name='name '+code,market='tse',instrument_type='stock',industry='industry',**kw)
class CatalogReads(unittest.TestCase):
 def setUp(self):s._normalized_catalog_cache=None
 def test_complete_pagination_singleflight_and_copy(self):
  rows=[row(str(i)) for i in range(1000,2259)];calls=[]
  def backend(path,params):
   q=dict(params);calls.append(q);self.assertEqual(path,'/security_catalog');self.assertEqual(q['order'],'code.asc')
   self.assertEqual(q['limit'],'500');offset=int(q['offset']);return 200,rows[offset:offset+500]
  with patch.object(s,'_cache_sb',backend),concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   results=list(pool.map(lambda _:s._normalized_catalog(),range(4)))
  self.assertEqual(len(calls),3);self.assertEqual(len(results[0]),1259)
  results[0]['1000']['name']='mutated';self.assertEqual(results[1]['1000']['name'],'name 1000')
 def test_partial_failure_never_cached_then_recovers(self):
  with patch.object(s,'_cache_sb',side_effect=[(200,[row(str(i)) for i in range(1000,1500)]),(503,None)]):
   self.assertIsNone(s._normalized_catalog());self.assertIsNone(s._normalized_catalog_cache)
  with patch.object(s,'_cache_sb',return_value=(200,[row('2330')])):
   self.assertEqual(len(s._normalized_catalog()),1)
 def test_empty_duplicate_invalid_rejected(self):
  for rows in ([],[row('2330'),row('2330')],[{'code':'2330'}]):
   with patch.object(s,'_cache_sb',return_value=(200,rows)):
    self.assertIsNone(s._normalized_catalog());self.assertIsNone(s._normalized_catalog_cache)
 def test_expiry_and_scope(self):
  with patch.object(s,'_cache_sb',return_value=(200,[row('2330')])) as read,patch.object(s.time,'time',side_effect=[0,1,301,302]):
   s._normalized_catalog();s._normalized_catalog();s._normalized_catalog()
   with patch.object(s,'SUPABASE_URL','https://other.example'):s._normalized_catalog()
  self.assertEqual(read.call_count,3)
 def test_industry_does_not_mix_etf_categories_and_no_official_fetch(self):
  catalog={'2330':row('2330'),'0050':dict(code='0050',name='ETF',instrument_type='etf',industry='Taiwan stocks'),'9999':dict(code='9999',name='unknown',instrument_type='stock',industry='')}
  with patch.object(s,'_normalized_catalog',return_value=catalog),patch.object(s,'_STOCK_INDUSTRY',{'2317':'fallback'}),patch.object(s.urllib.request,'urlopen',side_effect=AssertionError('no official fetch')):
   self.assertEqual(s._get_industry_map(),{'2317':'fallback','2330':'industry'});self.assertEqual(s._security_names_directory()['0050'],'ETF')
 def test_names_fallback_is_copy(self):
  with patch.object(s,'_normalized_catalog',return_value=None):
   result=s._security_names_directory();self.assertEqual(result,s._STOCK_NAMES);self.assertIsNot(result,s._STOCK_NAMES)
 def test_overview_only_fills_placeholders_without_mutating_quotes(self):
  data={'2330':dict(name='official',close=123,pct=2),'9999':dict(name='9999',close=90,pct=-2),'2317':dict(name='',close=100,pct=1)}
  with patch.object(s,'_current_security_names',return_value={'9999':'normalized'}) as read:
   result=s._fill_overview_names(data)
  self.assertEqual(set(read.call_args.args[0]),{'9999','2317'});self.assertEqual(result['2330'],data['2330']);self.assertEqual(result['9999'],dict(data['9999'],name='normalized'));self.assertEqual(data['9999']['name'],'9999');self.assertEqual(result['2317']['name'],s._STOCK_NAMES['2317'])
if __name__=='__main__':unittest.main()
