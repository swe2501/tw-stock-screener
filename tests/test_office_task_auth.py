"""HTTP authorization boundaries for office task endpoints (offline)."""
import importlib.util,io,json,os,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
from test_office_tasks import MemoryRest

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
AUTH=load('office_auth',ROOT/'api/auth.py');ALERT=load('office_alert',ROOT/'api/alert.py')
def request(module,body,headers=None):
 h=object.__new__(module.handler);raw=json.dumps(body).encode();h.headers={'Content-Length':str(len(raw)),**(headers or {})};h.rfile=io.BytesIO(raw);h._json=lambda status,result:(status,result);h.command='POST';h.path='/api/alert?kind=boss_tasks';return h
class Boundary(unittest.TestCase):
 def test_guest_cannot_list_or_create(self):
  for action in ['admin_office_tasks_list','admin_office_tasks_get','admin_office_tasks_create','admin_office_tasks_update']:
   h=request(AUTH,{'action':action})
   with patch.object(AUTH,'_verify_admin',return_value=None),patch.object(AUTH,'_rest') as store:
    self.assertEqual(h.do_POST()[0],403);store.assert_not_called()
 def test_verified_admin_dispatches_to_task_store(self):
  h=request(AUTH,{'action':'admin_office_tasks_list'},{'Authorization':'Bearer unit'})
  with patch.dict(os.environ,{'VERCEL':'0'}),patch.object(AUTH,'_verify_admin',return_value='admin'),patch.object(AUTH,'_rest',side_effect=MemoryRest()):self.assertEqual(h.do_POST()[0],200)
if __name__=='__main__':unittest.main()
