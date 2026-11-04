"""Offline lifecycle/concurrency tests. Never access Supabase or call a model."""
import copy
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import threading
import unittest
import uuid
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib import office_tasks as service

class MemoryRest:
    def __init__(self):self.rows={};self.lock=threading.Lock();self.paths=[]
    def __call__(self,path,method='GET',body=None,prefer=None):
        with self.lock:
            self.paths.append((method,path))
            q=parse_qs(urlsplit(path).query); k=q.get('key',[''])[0]
            if method=='GET':
                rows=list(self.rows.values())
                if k.startswith('eq.'):rows=[r for r in rows if r['key']==k[3:]]
                elif k.startswith('like.'):rows=[r for r in rows if r['key'].startswith(k[5:].rstrip('*'))]
                rows.sort(key=lambda r:r['key']);offset=int(q.get('offset',[0])[0]);limit=int(q.get('limit',[10000])[0])
                return 200,copy.deepcopy(rows[offset:offset+limit])
            if method=='POST':
                key=body[0]['key']
                if key in self.rows and not q.get('on_conflict'):return 409,{}
                self.rows[key]=copy.deepcopy(body[0]);return 201,[copy.deepcopy(body[0])]
            if method=='PATCH':
                row=self.rows.get(k[3:])
                if not row or row['updated_at']!=q['updated_at'][0][3:]:return 200,[]
                row.update(copy.deepcopy(body));return 200,[copy.deepcopy(row)]
            raise AssertionError(method)

class Tasks(unittest.TestCase):
    def setUp(self):
        self.rest=MemoryRest();self.env=patch.dict(os.environ,{'VERCEL':'0'});self.env.start();self.addCleanup(self.env.stop)
    def request(self,action,body,worker=False,expected=200):
        status,result=service.handle(action,body,'worker' if worker else 'admin',self.rest,worker)
        self.assertEqual(status,expected,result);return result
    def make(self,**kw):
        body=dict(id=str(uuid.uuid4()),title='研究測試',brief='整理公開來源並說明未知事項',criteria=['附來源','附日期'],department=7,execution='manual',budget_usd=.5)
        body.update(kw);return self.request('admin_office_tasks_create',body)['task']
    def update(self,t,op,is_worker=False,expected=200,**kw):
        body=dict(id=t['id'],revision=t['revision'],operation=op);body.update(kw)
        return self.request('worker' if is_worker else 'admin_office_tasks_update',body,is_worker,expected)
    def test_manual_lifecycle_and_handoff(self):
        t=self.make();t=self.update(t,'claim')['task'];t=self.update(t,'progress',note='已核對一項來源')['task']
        self.update(t,'approve',checks=[True,True],expected=409)
        t=self.update(t,'submit',result='## 研究成果\n來源 https://example.org')['task']
        self.update(t,'approve',checks=[True,False],expected=400)
        t=self.update(t,'approve',checks=[True,True])['task']
        child=self.make(depends_on=[t['id']],department=14)
        self.assertEqual(self.update(child,'claim')['task']['status'],'running')
        self.update(t,'cancel',expected=409)
    def test_dependency_waits_and_logistics_disabled(self):
        parent=self.make();child=self.make(depends_on=[parent['id']])
        self.update(child,'claim',expected=409)
        self.request('admin_office_tasks_create',dict(id=str(uuid.uuid4()),department=16),expected=400)
    def test_version_conflict_and_atomic_cas(self):
        t=self.make();raw,old=service.read(self.rest,t['id'])
        changed=self.update(t,'claim')['task']
        self.update(t,'claim',expected=409)
        with self.assertRaises(service.Problem) as exc:service.save(self.rest,raw,old)
        self.assertEqual(exc.exception.status,409)
        self.assertEqual(service.read(self.rest,t['id'])[0]['revision'],changed['revision'])
    def test_ai_claim_is_not_a_manual_claim(self):
        t=self.make(execution='ai');self.update(t,'claim',expected=403)
        claimed=self.update(t,'claim',is_worker=True,worker='unit-worker',run_budget_usd=.15)['task']
        self.assertEqual(claimed['reserved_usd'],.15)
        self.assertTrue(claimed['lease_token'])
        shown=self.request('admin_office_tasks_list',{})['tasks'][0];self.assertNotIn('lease_token',shown)
        self.update(claimed,'submit',expected=409)
        self.update(claimed,'heartbeat',is_worker=True,lease_token='wrong',note='測試',expected=409)
        done=self.update(claimed,'submit',is_worker=True,lease_token=claimed['lease_token'],result='成果',cost_usd=.05)['task']
        self.assertEqual(done['status'],'review');self.assertEqual(done['cost_usd'],.05)
        self.assertNotIn('lease_token',done)
    def test_cancel_blocks_late_worker_and_reserves_unknown_cost(self):
        t=self.make(execution='ai');t=self.update(t,'claim',is_worker=True,worker='test')['task']
        cancelled=self.update(t,'cancel')['task'];self.assertEqual(cancelled['cost_usd'],.5)
        self.update(t,'submit',is_worker=True,lease_token=t['lease_token'],result='晚到成果',expected=409)
        self.assertEqual(service.read(self.rest,t['id'])[0]['status'],'cancelled')
    def test_heartbeat_expiry_and_recovery(self):
        t=self.make(execution='ai');t=self.update(t,'claim',is_worker=True,worker='test')['task']
        self.update(t,'recover',expected=409)
        future=service.now()+dt.timedelta(seconds=service.LEASE_SECONDS+1)
        with patch.object(service,'now',return_value=future):
            self.update(t,'heartbeat',is_worker=True,lease_token=t['lease_token'],note='late',expected=409)
            t=self.update(t,'recover')['task']
        self.assertEqual(t['status'],'blocked');self.assertEqual(t['cost_usd'],.5)
        self.update(t,'retry',note='重試',expected=409)
    def test_retry_feedback_and_total_budget(self):
        t=self.make(execution='ai');t=self.update(t,'claim',is_worker=True,worker='test')['task']
        t=self.update(t,'submit',is_worker=True,lease_token=t['lease_token'],result='成果',cost_usd=.1)['task']
        t=self.update(t,'retry',note='請補上資料日期')['task'];self.assertEqual(t['feedback'],'請補上資料日期')
        t=self.update(t,'claim',is_worker=True,worker='test')['task'];self.assertAlmostEqual(t['reserved_usd'],.4)
        self.assertEqual(t['attempts'],2)
    def test_no_model_calls_and_failed_persistence_not_success(self):
        t=self.make()
        with patch.object(self,'rest',lambda *a,**kw:(503,{})):
            self.request('admin_office_tasks_list',{},expected=503)
        self.assertEqual(service.read(self.rest,t['id'])[0]['status'],'queued')
    def test_duplicate_create_is_idempotent(self):
        t=self.make()
        body={k:t[k] for k in ('id','title','brief','criteria','department','execution','budget_usd','due_date','depends_on')}
        result=self.request('admin_office_tasks_create',body)['task'];self.assertEqual(result['id'],t['id'])
        body['brief']='不同內容';self.request('admin_office_tasks_create',body,expected=409)
        self.assertEqual(len(self.rest.rows),1)
    def test_validation_and_production_guard(self):
        self.request('admin_office_tasks_create',{},expected=400)
        self.request('admin_office_tasks_create',dict(id=str(uuid.uuid4()),title='t',brief='x',criteria=['x'],department=7,execution='ai',budget_usd=float('nan')),expected=400)
        with patch.dict(os.environ,{'VERCEL':'1','VERCEL_GIT_COMMIT_REF':'prod'}):self.request('admin_office_tasks_list',{},expected=403)
    def test_large_results_use_short_timestamp_cas_url(self):
        t=self.make();t=self.update(t,'claim')['task'];t=self.update(t,'submit',result='研'*39999)['task']
        t=self.update(t,'approve',checks=[True,True])['task']
        self.assertTrue(all(len(path)<250 for method,path in self.rest.paths if method=='PATCH'))
    def test_worker_list_only_ai_and_no_self_acceptance(self):
        manual=self.make();ai=self.make(execution='ai')
        result=self.request('worker',{'operation':'list'},True);self.assertEqual([t['id'] for t in result['tasks']],[ai['id']])
        self.request('worker',{'operation':'get','id':manual['id']},True,expected=403)
        self.update(ai,'approve',is_worker=True,expected=409)
    def test_two_workers_cannot_claim_the_same_task(self):
        t=self.make(execution='ai');barrier=threading.Barrier(2);out=[]
        def rest(path,**kwargs):
            result=self.rest(path,**kwargs)
            if kwargs.get('method','GET')=='GET' and 'key=eq.'+service.PREFIX in path:barrier.wait(timeout=3)
            return result
        def claim():out.append(service.handle('worker',dict(operation='claim',id=t['id'],revision=1,worker='test'),'worker',rest,worker=True)[0])
        threads=[threading.Thread(target=claim) for _ in range(2)]
        for th in threads:th.start()
        for th in threads:th.join(timeout=5)
        self.assertEqual(sorted(out),[200,409])
    def test_approved_dependency_content_is_handed_to_ai(self):
        t=self.make();t=self.update(t,'claim')['task'];t=self.update(t,'submit',result='已查核的前置成果')['task'];t=self.update(t,'approve',checks=[True,True])['task']
        child=self.make(execution='ai',depends_on=[t['id']]);claimed=self.update(child,'claim',is_worker=True,worker='test')['task']
        self.assertEqual(claimed['dependency_outputs'][0]['result'],'已查核的前置成果')
    def test_department_disabled_is_enforced_with_valid_payload(self):
        payload=dict(id=str(uuid.uuid4()),title='test',brief='test',criteria=['test'],department=16,execution='manual')
        self.request('admin_office_tasks_create',payload,expected=400)
    def test_worker_online_and_department_catalog(self):
        self.request('worker',{'operation':'online','worker':'unit'},True)
        listed=self.request('admin_office_tasks_list',{})
        self.assertEqual(len(listed['departments']),32);self.assertFalse(listed['departments'][16]['enabled']);self.assertEqual(listed['worker']['name'],'unit')

if __name__=='__main__':unittest.main()
