import importlib.util
import unittest
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
spec=importlib.util.spec_from_file_location('credential',Path(__file__).resolve().parents[1]/'scripts/verify_vercel_credential.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_expiry_thresholds(self):
  now=datetime(2026,11,10,tzinfo=timezone.utc)
  for date,expect in [('2026-11-18T00:00:00Z','valid'),('2026-11-17T00:00:00Z','due'),('2026-11-10T00:00:00Z','expired')]:self.assertEqual(m.expiry_state(date,now),expect)
  for date in ['','bad','2026-11-18']:
   with self.assertRaises(ValueError):m.expiry_state(date,now)
 def test_only_fixed_projects_read_and_no_secret_in_failures(self):
  env={'VERCEL_TOKEN':'fake-secret-never-print','VERCEL_DEPLOY_TOKEN_EXPIRES_AT':'2099-01-01T00:00:00Z'}
  seen=[]
  class Response:
   status=200
   def __enter__(self):return self
   def __exit__(self,*a):pass
  def request(req,**kwargs):seen.append(req.full_url);self.assertEqual(req.get_method(),'GET');return Response()
  m.verify(env,request);self.assertEqual(len(seen),2);self.assertTrue(all(x.startswith('https://api.vercel.com/v9/projects/') for x in seen))
  for status in [401,403,429]:
   def fail(req,**kw):raise HTTPError(req.full_url,status,'fake-secret-never-print',None,None)
   with self.assertRaises(ValueError) as error:m.verify(env,fail)
   self.assertNotIn('fake-secret',str(error.exception))
if __name__=='__main__':unittest.main()
