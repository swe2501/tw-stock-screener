import importlib.util,io,json,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit,parse_qs
spec=importlib.util.spec_from_file_location('chart_market',Path(__file__).parents[1]/'api/chart.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class MarketLookup(unittest.TestCase):
 def setUp(self): c._MARKET_CACHE.clear()
 def test_targeted_normalized_lookup_and_cache(self):
  calls=[]
  def read(req,timeout):
   calls.append(req.full_url)
   self.assertEqual(parse_qs(urlsplit(req.full_url).query),{'select':['market'],'code':['eq.6488'],'limit':['1']})
   return io.BytesIO(json.dumps([{'market':'otc'}]).encode())
  with patch.object(c.urllib.request,'urlopen',read):
   self.assertTrue(c._is_otc('6488'));self.assertTrue(c._is_otc('6488'))
  self.assertEqual(len(calls),1)
 def test_listed_and_expiry(self):
  with patch.object(c.time,'monotonic',side_effect=[0,301]),patch.object(c.urllib.request,'urlopen',side_effect=[io.BytesIO(b'[{"market":"tse"}]'),io.BytesIO(b'[{"market":"otc"}]')]) as read:
   self.assertFalse(c._is_otc('2330'));self.assertTrue(c._is_otc('2330'));self.assertEqual(read.call_count,2)
 def test_failure_fallback_is_targeted_and_recovers(self):
  calls=[]
  def read(req,timeout):
   calls.append(req.full_url)
   if len(calls)==1: raise OSError('temporary')
   return io.BytesIO(b'[{"code":"6488"}]' if 'otc_names?' in req.full_url else b'[{"market":"otc"}]')
  with patch.object(c.urllib.request,'urlopen',read):
   self.assertTrue(c._is_otc('6488'));self.assertTrue(c._is_otc('6488'))
  self.assertEqual(len(calls),3)
  self.assertEqual(parse_qs(urlsplit(calls[1]).query)['code'],['eq.6488'])
 def test_invalid_code_never_queries(self):
  with patch.object(c.urllib.request,'urlopen') as read:
   for code in ('^TWII','2330&select=*','', 'A'*11): self.assertFalse(c._is_otc(code))
   read.assert_not_called()
if __name__=='__main__': unittest.main()
