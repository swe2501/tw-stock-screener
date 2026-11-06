"""HMAC office-agent worker path (offline, mocked). Never writes env token files."""
import hashlib,hmac,io,json,os,secrets,sys,time,unittest,uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
from test_office_tasks import MemoryRest
from lib import office_agents, office_tasks as service
import importlib.util
spec=importlib.util.spec_from_file_location('agent_auth',ROOT/'api/auth.py')
AUTH=importlib.util.module_from_spec(spec);spec.loader.exec_module(AUTH)

TOKENS={
    'ceo':'C'*32,
    'cto':'T'*32,
    'eng':'E'*32,
    'qa':'Q'*32,
    'sec':'S'*32,
    'mochi':'M'*32,
}

def env_tokens():
    return {'VERCEL':'0', **{office_agents.token_env_name(k):v for k,v in TOKENS.items()}}

def sign(body, key, token=None, timestamp=None, nonce=None):
    raw=json.dumps(body,ensure_ascii=False).encode()
    ts=str(int(time.time()) if timestamp is None else timestamp)
    nonce=nonce or secrets.token_hex(16)
    digest=hashlib.sha256(raw).hexdigest()
    message=f"{ts}\n{nonce}\n{body.get('operation')}\n{body.get('id') or ''}\n{digest}"
    sig=hmac.new((token or TOKENS[key]).encode(),message.encode(),hashlib.sha256).hexdigest()
    headers={
        'Content-Length':str(len(raw)),
        'x-office-agent-key':key,
        'x-office-agent-timestamp':ts,
        'x-office-agent-nonce':nonce,
        'x-office-agent-signature':sig,
    }
    return raw, headers

def call(body, key='ceo', token=None, timestamp=None, nonce=None, headers=None):
    raw, signed = sign(body, key, token=token, timestamp=timestamp, nonce=nonce)
    hd = headers if headers is not None else signed
    if 'Content-Length' not in hd:
        hd=dict(hd); hd['Content-Length']=str(len(raw))
    h=object.__new__(AUTH.handler)
    h.headers=hd
    h.rfile=io.BytesIO(raw)
    h._json=lambda s,r:(s,r)
    return h.do_POST()

class AgentAuth(unittest.TestCase):
    def setUp(self):
        self.rest=MemoryRest()
        e=patch.dict(os.environ,env_tokens(),clear=False)
        e.start();self.addCleanup(e.stop)
        p=patch.object(AUTH,'_rest',side_effect=self.rest)
        p.start();self.addCleanup(p.stop)
        office_agents._nonces.clear()

    def make(self, department=0, assignee=None, execution='agent', **kw):
        body=dict(id=str(uuid.uuid4()),title='t',brief='b',criteria=['c'],department=department,execution=execution)
        if assignee:body['assignee']=assignee
        body.update(kw)
        s,r=service.handle('admin_office_tasks_create',body,'admin',self.rest)
        self.assertEqual(s,200,r)
        return r['task']

    def payload(self, operation, **kw):
        body=dict(action='office_worker',operation=operation,**kw)
        return body

    def test_catalog_is_exactly_six(self):
        catalog=office_agents.public_catalog()
        self.assertEqual([a['key'] for a in catalog],['ceo','cto','eng','qa','sec','mochi'])
        self.assertFalse(office_agents.lookup('mochi')['can_claim'])
        self.assertEqual(office_agents.lookup('cto')['department'],6)
        self.assertEqual(office_agents.token_env_name('ceo'),'OFFICE_AGENT_TOKEN_CEO')

    def test_body_identity_spoof_is_ignored(self):
        task=self.make(department=8,assignee='qa')
        body=self.payload('list',role='qa',worker='agent-qa',agent_id=office_agents.lookup('qa')['agent_id'])
        s,r=call(body,key='ceo')
        self.assertEqual(s,200,r)
        self.assertEqual(r['tasks'],[])
        s,r=call(self.payload('claim',id=task['id'],revision=1,role='qa',worker='agent-qa'),key='ceo')
        self.assertEqual(s,403,r)

    def test_token_a_cannot_list_or_claim_b(self):
        qa=self.make(department=8)
        sec=self.make(department=9)
        s,r=call(self.payload('list'),key='qa')
        self.assertEqual(s,200,r)
        self.assertEqual([t['id'] for t in r['tasks']],[qa['id']])
        self.assertNotIn(sec['id'],[t['id'] for t in r['tasks']])
        s,r=call(self.payload('claim',id=sec['id'],revision=1),key='qa')
        self.assertEqual(s,403,r)

    def test_expired_timestamp_and_replay_nonce(self):
        body=self.payload('list')
        s,r=call(body,key='ceo',timestamp=int(time.time())-400)
        self.assertEqual(s,401,r)
        raw, headers=sign(body,'ceo')
        s1,r1=call(body,key='ceo',headers=headers)
        self.assertEqual(s1,200,r1)
        s2,r2=call(body,key='ceo',headers=headers)
        self.assertEqual(s2,401,r2)

    def test_cannot_approve(self):
        task=self.make(department=0)
        claimed=call(self.payload('claim',id=task['id'],revision=1),key='ceo')
        self.assertEqual(claimed[0],200,claimed[1])
        submitted=call(self.payload('submit',id=task['id'],revision=2,lease_token=claimed[1]['task']['lease_token'],result='done'),key='ceo')
        self.assertEqual(submitted[0],200,submitted[1])
        s,r=call(self.payload('approve',id=task['id'],revision=3,checks=[True]),key='ceo')
        self.assertEqual(s,403,r)

    def test_second_running_is_conflict(self):
        a=self.make(department=0)
        b=self.make(department=0)
        self.assertEqual(call(self.payload('claim',id=a['id'],revision=1),key='ceo')[0],200)
        self.assertEqual(call(self.payload('claim',id=b['id'],revision=1),key='ceo')[0],409)

    def test_mochi_cannot_claim(self):
        task=self.make(department=20,assignee='mochi')
        s,r=call(self.payload('claim',id=task['id'],revision=1),key='mochi')
        self.assertEqual(s,403,r)
        s,r=call(self.payload('list'),key='mochi')
        self.assertEqual(s,200,r)
        self.assertEqual(r['tasks'],[])

    def test_department_six_requires_matching_assignee(self):
        missing=self.make(department=6)
        wrong=self.make(department=6,assignee='eng')
        mine=self.make(department=6,assignee='cto')
        self.assertEqual(call(self.payload('claim',id=missing['id'],revision=1),key='cto')[0],403)
        self.assertEqual(call(self.payload('claim',id=wrong['id'],revision=1),key='cto')[0],403)
        s,r=call(self.payload('claim',id=mine['id'],revision=1),key='cto')
        self.assertEqual(s,200,r)
        self.assertEqual(r['task']['worker'],'agent-cto')

    def test_lifecycle_claim_heartbeat_submit(self):
        task=self.make(department=9)
        s,r=call(self.payload('claim',id=task['id'],revision=1),key='sec')
        self.assertEqual(s,200,r)
        self.assertEqual(r['task']['status'],'running')
        self.assertEqual(r['task']['current_step'],'已領取，開始執行')
        token=r['task']['lease_token']
        s,r=call(self.payload('heartbeat',id=task['id'],revision=2,lease_token=token,note='檢查資產清單'),key='sec')
        self.assertEqual(s,200,r)
        self.assertEqual(r['task']['current_step'],'檢查資產清單')
        s,r=call(self.payload('submit',id=task['id'],revision=3,lease_token=token,result='完成盤點',evidence=['https://example.org/proof'],usage_week=12),key='sec')
        self.assertEqual(s,200,r)
        self.assertEqual(r['task']['status'],'review')
        self.assertEqual(r['task']['result'],'完成盤點')
        self.assertEqual(r['task']['evidence'],['https://example.org/proof'])
        self.assertEqual(r['task']['usage_week'],12)
        self.assertTrue(r['task'].get('cost_uncertain'))
        listed=service.handle('admin_office_tasks_list',{},'admin',self.rest)[1]
        self.assertIn('office_agents',listed)
        row=next(t for t in listed['tasks'] if t['id']==task['id'])
        self.assertIn('overdue',row)
        self.assertEqual(row['usage_week'],12)

    def test_missing_token_is_unauthorized(self):
        with patch.dict(os.environ,{'OFFICE_AGENT_TOKEN_CEO':''},clear=False):
            self.assertEqual(call(self.payload('list'),key='ceo')[0],401)
        with patch.dict(os.environ,{'OFFICE_AGENT_TOKEN_CEO':'short'},clear=False):
            self.assertEqual(call(self.payload('list'),key='ceo')[0],401)

    def test_old_path_cannot_mint_agent_identity(self):
        grok='g'*48
        with patch.dict(os.environ,{'OFFICE_WORKER_TOKEN_GROK':grok},clear=False):
            raw=json.dumps({'action':'office_worker','operation':'list','role':'ceo','worker':'agent-ceo'}).encode()
            h=object.__new__(AUTH.handler)
            h.headers={'Content-Length':str(len(raw)),'x-office-worker-token':grok}
            h.rfile=io.BytesIO(raw);h._json=lambda s,r:(s,r)
            s,r=h.do_POST()
            self.assertEqual(s,200,r)
            # list itself does not echo actor; create+claim through old path
            task=self.make(department=7,execution='ai',budget_usd=.5,executor='grok')
            raw=json.dumps({'action':'office_worker','operation':'claim','role':'ceo','id':task['id'],'revision':1,'worker':'agent-ceo'}).encode()
            h=object.__new__(AUTH.handler)
            h.headers={'Content-Length':str(len(raw)),'x-office-worker-token':grok}
            h.rfile=io.BytesIO(raw);h._json=lambda s,r:(s,r)
            s,r=h.do_POST()
            self.assertEqual(s,200,r)
            self.assertEqual(r['task']['worker'],'grok-ceo')
            self.assertFalse(r['task']['worker'].startswith('agent-'))

    def test_claude_and_manual_still_work(self):
        manual=self.make(department=7,execution='manual')
        claude=self.make(department=7,execution='ai',budget_usd=.5)
        grok=self.make(department=7,execution='ai',budget_usd=.5,executor='grok')
        agent=self.make(department=0,execution='agent')
        listed=service.handle('worker',{'operation':'list'},'claude-local',self.rest,True)[1]
        ids={t['id'] for t in listed['tasks']}
        self.assertIn(claude['id'],ids)
        self.assertNotIn(grok['id'],ids)
        self.assertNotIn(agent['id'],ids)
        self.assertNotIn(manual['id'],ids)
        s,r=service.handle('worker',dict(operation='claim',id=claude['id'],revision=1,worker='w1'),'claude-local',self.rest,True)
        self.assertEqual(s,200,r)
        s,r=service.handle('admin_office_tasks_update',dict(operation='claim',id=manual['id'],revision=1),'admin',self.rest)
        self.assertEqual(s,200,r)

if __name__=='__main__':
    unittest.main()
