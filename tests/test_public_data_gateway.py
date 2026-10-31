import concurrent.futures
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs,urlsplit
spec=importlib.util.spec_from_file_location('public_prices',Path(__file__).parents[1]/'api/prices.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Response(io.BytesIO):
 def __init__(self,value,zipped=False):
  raw=json.dumps(value).encode();super().__init__(gzip.compress(raw) if zipped else raw);self.headers={'Content-Encoding':'gzip'} if zipped else {}
class Gateway(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,{'SUPABASE_URL':'https://example.supabase.co','SUPABASE_ANON_KEY':'public-test-key','SUPABASE_SERVICE_KEY':'must-not-use'});self.env.start();p._SNAPSHOT_CACHE.clear();p._SECURITY_CATALOG_CACHE=None
 def tearDown(self):self.env.stop()
 def test_snapshot_singleflight_and_expiry(self):
  calls=[];now=[0]
  def opener(req,timeout):
   calls.append(req);time.sleep(.01);return Response([{'kind':'themes','payload':{'category_version':2,'rows':[1]},'updated_at':'2026-11-01'}],True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   results=list(pool.map(lambda _:p._public_snapshot('themes','prod',opener,lambda:now[0]),range(4)))
  self.assertEqual(len(calls),1);self.assertEqual(results[0],results[3]);self.assertEqual(calls[0].get_header('Authorization'),'Bearer public-test-key')
  now[0]=121;p._public_snapshot('themes','prod',opener,lambda:now[0]);self.assertEqual(len(calls),2)
 def test_scope_separation_and_uat_priority(self):
  def opener(req,timeout):
   q=parse_qs(urlsplit(req.full_url).query)
   self.assertEqual(q['select'],['kind,payload,updated_at']);self.assertEqual(q['limit'],['2'])
   return Response([{'kind':'themes','payload':{'v':'prod'}},{'kind':'themes@uat','payload':{'v':'uat'}}] if q['kind'][0].startswith('in.') else [{'kind':'themes','payload':{'v':'prod'}}])
  self.assertEqual(p._public_snapshot('themes','uat',opener)[0]['payload']['v'],'uat');self.assertEqual(p._public_snapshot('themes','prod',opener)[0]['payload']['v'],'prod')
 def test_reject_arbitrary_tables_and_invalid_scope(self):
  for kind,scope in [('member_screen_records','prod'),('themes@uat','prod'),('themes','private'),('../auth/users','prod')]:
   with self.assertRaises(ValueError):p._public_snapshot(kind,scope,lambda *a,**k:self.fail('must not fetch'))
 def test_missing_and_error_not_cached(self):
  calls=[]
  def opener(req,timeout):calls.append(req);return Response([])
  p._public_snapshot('overview','prod',opener);p._public_snapshot('overview','prod',opener);self.assertEqual(len(calls),2)
 def test_invalid_payload_not_cached(self):
  with self.assertRaises(RuntimeError):p._public_snapshot('overview','prod',lambda *a,**k:Response([{'kind':'overview','payload':[]}]))
  self.assertFalse(p._SNAPSHOT_CACHE)
 def test_rt_freshness_separate(self):
  calls=[];now=[0]
  def opener(req,timeout):calls.append(req);return Response([{'kind':'overview_rt','payload':{'v':1}}])
  p._public_snapshot('overview_rt','prod',opener,lambda:now[0]);now[0]=16;p._public_snapshot('overview_rt','prod',opener,lambda:now[0]);self.assertEqual(len(calls),2)
 def test_catalog_pagination_and_anon_cache(self):
  calls=[];rows=[{'code':str(10000+i),'name':str(i),'market':'otc','instrument_type':'stock','industry':'test'} for i in range(1259)]
  def opener(req,timeout):
   calls.append(req);self.assertEqual(req.get_header('Authorization'),'Bearer public-test-key');q=parse_qs(urlsplit(req.full_url).query);off=int(q['offset'][0]);self.assertEqual(q['limit'],['500']);return Response(rows[off:off+500])
  a=p._security_catalog(opener);b=p._security_catalog(opener);self.assertEqual(len(a['items']),1259);self.assertEqual(a,b);self.assertEqual(len(calls),3)
 def test_catalog_failure_not_cached(self):
  with self.assertRaises(RuntimeError):p._security_catalog(lambda *a,**k:Response([]))
  self.assertIsNone(p._SECURITY_CATALOG_CACHE)
 def test_http_errors_no_store(self):
  h=p.handler.__new__(p.handler);h.path='/api/prices?action=public_snapshot&kind=member_screen_records';h.wfile=io.BytesIO();headers={};h.send_response=lambda status:headers.update(status=status);h.send_header=lambda k,v:headers.update({k:v});h.end_headers=lambda:None
  h.do_GET();self.assertEqual(headers['status'],400);self.assertEqual(headers['Cache-Control'],'no-store')
if __name__=='__main__':unittest.main()
