"""Executor tests use a tiny Python fixture, never Claude or paid APIs."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from test_office_tasks import MemoryRest
from lib import office_tasks as service
spec=importlib.util.spec_from_file_location('office_worker',ROOT/'scripts/office_task_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class LocalClient:
    def __init__(self,rest):self.rest=rest;self.cancel=False;self.lost=False
    def call(self,operation,**fields):
        if self.cancel and operation=='get':
            t,_=service.read(self.rest,fields['id'])
            service.handle('admin_office_tasks_update',dict(id=t['id'],revision=t['revision'],operation='cancel'),'admin',self.rest)
        if self.lost and operation=='submit':raise worker.RemoteError(503,'simulated delivery failure')
        st,data=service.handle('worker',dict(operation=operation,**fields),'worker',self.rest,worker=True)
        if st!=200:raise worker.RemoteError(st,data['error'])
        return data

class Executor(unittest.TestCase):
    def setUp(self):
        import uuid
        self.rest=MemoryRest();self.env=patch.dict(os.environ,{'VERCEL':'0'});self.env.start();self.addCleanup(self.env.stop)
        st,r=service.handle('admin_office_tasks_create',dict(id=str(uuid.uuid4()),title='測試',brief='研究公開資訊',criteria=['附來源'],department=7,execution='ai',budget_usd=.5),'admin',self.rest)
        self.client=LocalClient(self.rest);t=r['task']
        self.task=self.client.call('claim',id=t['id'],revision=t['revision'],worker='fixture')['task']
    def fixture(self,output,delay=0):
        code='import sys,time;sys.stdin.read();time.sleep('+str(delay)+');print('+repr(json.dumps(output))+',flush=True)'
        return patch.object(worker,'command',return_value=[sys.executable,'-c',code])
    def current(self):return service.read(self.rest,self.task['id'])[0]
    def test_result_waits_for_human_review(self):
        with self.fixture({'type':'result','subtype':'success','is_error':False,'total_cost_usd':.01,'structured_output':{'report':'研究成果與來源','blocker':''}}):worker.execute(self.task,self.client,'fixture','test')
        t=self.current();self.assertEqual(t['status'],'review');self.assertEqual(t['result'],'研究成果與來源');self.assertEqual(t['cost_usd'],.01)
    def test_auth_or_model_error_not_fake_success(self):
        with self.fixture({'type':'result','subtype':'error','is_error':True,'total_cost_usd':.02}):worker.execute(self.task,self.client,'fixture','test')
        self.assertEqual(self.current()['status'],'failed')
    def test_timeout_stops_process_and_preserves_budget(self):
        with self.fixture({},delay=2):worker.execute(self.task,self.client,'fixture','test',timeout=.05,heartbeat_interval=.01)
        t=self.current();self.assertEqual(t['status'],'failed');self.assertEqual(t['cost_usd'],.5);self.assertTrue(t['cost_uncertain'])
    def test_cancel_cannot_be_overwritten_by_worker(self):
        self.client.cancel=True
        with self.fixture({},delay=2):worker.execute(self.task,self.client,'fixture','test',heartbeat_interval=.01)
        self.assertEqual(self.current()['status'],'cancelled')
    def test_lost_submission_does_not_automatically_rerun(self):
        self.client.lost=True
        with self.fixture({'type':'result','subtype':'success','total_cost_usd':.01,'structured_output':{'report':'成果','blocker':''}}):
            with self.assertRaises(worker.RemoteError):worker.execute(self.task,self.client,'fixture','test')
        self.assertEqual(self.current()['status'],'running');self.assertEqual(self.current()['attempts'],1)
    def test_model_has_only_research_tools_and_no_service_secrets(self):
        args=worker.command('fixture',.5)
        self.assertIn('--safe-mode',args);self.assertIn('--max-budget-usd',args);self.assertIn('--strict-mcp-config',args)
        self.assertEqual(args[args.index('--tools')+1],'WebSearch,WebFetch')
        self.assertNotIn('--dangerously-skip-permissions',args)
        with patch.dict(os.environ,{'BOSS_TOKEN':'secret','SUPABASE_SERVICE_KEY':'secret','ANTHROPIC_API_KEY':'secret','ANTHROPIC_BASE_URL':'https://example.org'}):
            env=worker.model_environment();self.assertFalse(any(k in env for k in ['BOSS_TOKEN','SUPABASE_SERVICE_KEY','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL']))
    def test_direct_mode_does_not_pass_service_key_to_model(self):
        client=worker.DirectClient({'SUPABASE_URL':'https://example.org','SUPABASE_SERVICE_KEY':'unit-service-key'})
        with patch.object(client.boss,'_req',return_value=[]) as req:
            self.assertEqual(client.call('list')['tasks'],[])
            self.assertTrue(req.called)
        self.assertNotIn('SUPABASE_SERVICE_KEY',worker.model_environment())
if __name__=='__main__':unittest.main()
