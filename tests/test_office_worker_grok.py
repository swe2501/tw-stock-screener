"""Grok worker endpoint + executor routing (offline, mocked)."""
import importlib.util,io,json,os,sys,unittest,uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
from test_office_tasks import MemoryRest
from lib import office_tasks as service
spec=importlib.util.spec_from_file_location('grok_auth',ROOT/'api/auth.py');AUTH=importlib.util.module_from_spec(spec);spec.loader.exec_module(AUTH)
TOKEN='t'*48
def call(body,token=None):
    h=object.__new__(AUTH.handler);raw=json.dumps(body).encode();hd={'Content-Length':str(len(raw))}
    if token is not None:hd['x-office-worker-token']=token
    h.headers=hd;h.rfile=io.BytesIO(raw);h._json=lambda s,r:(s,r);return h.do_POST()
class Grok(unittest.TestCase):
    def setUp(self):
        self.rest=MemoryRest();e=patch.dict(os.environ,{'VERCEL':'0','OFFICE_WORKER_TOKEN_GROK':TOKEN});e.start();self.addCleanup(e.stop)
        p=patch.object(AUTH,'_rest',side_effect=self.rest);p.start();self.addCleanup(p.stop)
    def make(self,executor=None):
        b=dict(id=str(uuid.uuid4()),title='t',brief='b',criteria=['c'],department=7,execution='ai',budget_usd=.5)
        if executor is not None:b['executor']=executor
        s,r=service.handle('admin_office_tasks_create',b,'admin',self.rest);self.assertEqual(s,200,r);return r['task']
    def g(self,op,role='ceo',token=TOKEN,**kw):return call(dict(action='office_worker',operation=op,role=role,**kw),token)
    def test_token_checks(self):
        self.assertEqual(self.g('list',token=None)[0],401)
        self.assertEqual(self.g('list',token='short')[0],401)
        self.assertEqual(self.g('list',token='x'*48)[0],401)
        with patch.dict(os.environ,{'OFFICE_WORKER_TOKEN_GROK':''}):self.assertEqual(self.g('list')[0],401)
        with patch.dict(os.environ,{'OFFICE_WORKER_TOKEN_GROK':'s'*20}):self.assertEqual(self.g('list',token='s'*20)[0],401)
        self.assertNotIn(TOKEN,json.dumps(self.g('list',token='x'*48)[1]))
    def test_role_and_ops(self):
        self.assertEqual(self.g('list',role='admin')[0],400)
        for op in ('approve','get','online','cancel'):self.assertEqual(self.g(op)[0],400)
    def test_list_and_claim_routing(self):
        gt=self.make('grok');ct=self.make('claude-local');et=self.make()
        s,r=self.g('list');self.assertEqual(s,200);self.assertEqual([t['id'] for t in r['tasks']],[gt['id']])
        self.assertEqual(self.g('claim',id=ct['id'],revision=1)[0],403)
        self.assertEqual(self.g('claim',id=et['id'],revision=1)[0],403)
        s,r=self.g('claim',id=gt['id'],revision=1,worker='spoof');self.assertEqual(s,200,r);self.assertEqual(r['task']['worker'],'grok-ceo')
    def test_claude_regression(self):
        gt=self.make('grok');et=self.make();ct=self.make('claude-local')
        s,r=service.handle('worker',{'operation':'list'},'claude-local',self.rest,True)
        self.assertEqual({t['id'] for t in r['tasks']},{et['id'],ct['id']})
        self.assertEqual(service.handle('worker',dict(operation='claim',id=gt['id'],revision=1,worker='w1'),'claude-local',self.rest,True)[0],403)
        s,r=service.handle('worker',dict(operation='claim',id=et['id'],revision=1,worker='w1'),'claude-local',self.rest,True);self.assertEqual(s,200,r)
        self.assertEqual(service.handle('worker',dict(operation='online',worker='w1'),'claude-local',self.rest,True)[0],200)
        self.assertEqual(json.loads(self.rest.rows[service.WORKER_KEY]['value'])['mode'],'claude')
        self.assertNotIn(service.WORKER_KEY+':grok',self.rest.rows)
    def test_grok_online_key(self):
        self.assertEqual(service.handle('worker',dict(operation='online',worker='grok-eng'),'grok-eng',self.rest,True)[0],200)
        self.assertEqual(json.loads(self.rest.rows[service.WORKER_KEY+':grok']['value'])['mode'],'grok');self.assertNotIn(service.WORKER_KEY,self.rest.rows)
    def test_one_running_per_worker(self):
        a=self.make('grok');b=self.make('grok')
        self.assertEqual(self.g('claim',id=a['id'],revision=1)[0],200)
        self.assertEqual(self.g('claim',id=b['id'],revision=1)[0],409)
        self.assertEqual(self.g('claim',role='eng',id=b['id'],revision=1)[0],200)
    def test_approve_self_rejected(self):
        a=self.make('grok');s,r=self.g('claim',id=a['id'],revision=1)
        s,r=self.g('submit',id=a['id'],revision=2,lease_token=r['task']['lease_token'],result='done',cost_usd=.1);self.assertEqual(s,200,r)
        s,r=service.handle('admin_office_tasks_update',dict(operation='approve',id=a['id'],revision=3,checks=[True]),'grok-ceo',self.rest);self.assertEqual(s,403)
        self.assertIn(service.handle('worker',dict(operation='approve',id=a['id'],revision=3,checks=[True]),'grok-ceo',self.rest,True)[0],(400,409))
        self.assertEqual(service.handle('admin_office_tasks_update',dict(operation='approve',id=a['id'],revision=3,checks=[True]),'admin',self.rest)[0],200)
    def test_errors_no_traceback(self):
        with patch.object(service,'handle',side_effect=RuntimeError('boom secret')):
            s,r=self.g('list')
        self.assertEqual((s,r),(500,{'error':'internal error'}))
    def test_invalid_executor(self):
        s,r=service.handle('admin_office_tasks_create',dict(id=str(uuid.uuid4()),title='t',brief='b',criteria=['c'],department=7,execution='ai',budget_usd=.5,executor='x'),'admin',self.rest);self.assertEqual(s,400)
if __name__=='__main__':unittest.main()
