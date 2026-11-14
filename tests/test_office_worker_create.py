"""Worker create (agent-sec only, 6/day Asia/Taipei) — offline, mocked DB, never touches Supabase.
Founder approvals: card t194s703 (16:15) and t195s712 (16:19), 2026-11-12."""
import datetime as dt, json, os, sys, unittest, uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
from test_office_tasks import MemoryRest
from test_office_agent_auth import AUTH, call as _agent_call, env_tokens, TOKENS
import test_office_worker_grok as grok
from lib import office_agents, office_tasks as service


def agent_call(body, **kw):
    return _agent_call(dict(body, action='office_worker'), **kw)


def card(**kw):
    b=dict(operation='create',id=str(uuid.uuid4()),title='P0 測試卡',brief='內容',criteria=['條件一'],department=9,execution='agent',assignee='sec')
    b.update(kw);return b


class WorkerCreate(unittest.TestCase):
    def setUp(self):
        self.rest=MemoryRest()
        e=patch.dict(os.environ,dict(env_tokens(),OFFICE_WORKER_TOKEN_GROK=grok.TOKEN),clear=False);e.start();self.addCleanup(e.stop)
        for mod in (AUTH,grok.AUTH):
            p=patch.object(mod,'_rest',side_effect=self.rest);p.start();self.addCleanup(p.stop)
        office_agents._nonces.clear()

    def stored(self,task_id):return service.read(self.rest,task_id)[0]

    def test_constant_whitelist_is_only_agent_sec(self):
        self.assertEqual(service.WORKER_CREATE_ACTOR,'agent-sec')
        self.assertEqual(service.WORKER_CREATE_DAILY_LIMIT,6)
        self.assertIn('create',AUTH.OFFICE_AGENT_OPS)
        self.assertNotIn('create',AUTH.OFFICE_WORKER_OPS)
        self.assertEqual(AUTH.OFFICE_AGENT_FORBIDDEN,("approve","cancel","retry","online"))

    def test_agent_sec_creates_via_hmac_gateway_with_forced_fields(self):
        body=card(status='approved',budget_usd=9.5,created_by='admin@example.com',worker='agent-ceo',revision=99,executor='claude-local')
        s,r=agent_call(body,key='sec');self.assertEqual(s,200,r)
        t=self.stored(body['id'])
        self.assertEqual((t['status'],t['budget_usd'],t['created_by'],t['revision']),('queued',0,'agent-sec',1))
        self.assertEqual((t['execution'],t['assignee'],t['department']),('agent','sec',9))
        self.assertEqual(t['history'][0]['actor'],'agent-sec');self.assertEqual(t['reserved_usd'],0);self.assertEqual(t['cost_usd'],0)
        # idempotent retry returns the same card and does not create another
        s2,r2=agent_call(dict(body),key='sec');self.assertEqual(s2,200,r2);self.assertEqual(r2['task']['id'],body['id'])
        self.assertEqual(sum(1 for k in self.rest.rows if k.startswith(service.PREFIX)),1)

    def test_other_agents_and_grok_sec_forbidden(self):
        for key in ('ceo','cto','eng','qa','mochi'):
            with self.subTest(key=key):
                body=card();s,r=agent_call(body,key=key);self.assertEqual(s,403,r)
        s,r=service.handle('worker',card(),'grok-sec',self.rest,worker=True);self.assertEqual(s,403,r)
        s,r=service.handle('worker',card(),'admin@example.com',self.rest,worker=True);self.assertEqual(s,403,r)
        self.assertEqual([k for k in self.rest.rows if k.startswith(service.PREFIX)],[])

    def test_shared_token_path_still_rejects_create(self):
        for role in ('sec','ceo'):
            with self.subTest(role=role):
                s,r=grok.call(dict(card(),action='office_worker',role=role),grok.TOKEN);self.assertEqual(s,400,r)
        self.assertEqual([k for k in self.rest.rows if k.startswith(service.PREFIX)],[])

    def test_seventh_card_same_taipei_day_is_429(self):
        for i in range(6):
            s,r=agent_call(card(title=f'卡 {i}'),key='sec');self.assertEqual(s,200,r)
        s,r=agent_call(card(title='第七張'),key='sec');self.assertEqual(s,429,r)
        self.assertEqual(sum(1 for k in self.rest.rows if k.startswith(service.PREFIX)),6)
        # admin-created cards and other days do not count; next Taipei day resets
        s,r=service.handle('admin_office_tasks_create',{k:v for k,v in card().items() if k!='operation'},'admin@example.com',self.rest);self.assertEqual(s,200,r)
        tomorrow=service.now()+dt.timedelta(days=1)
        with patch.object(service,'now',return_value=tomorrow):
            s,r=agent_call(card(title='隔天'),key='sec');self.assertEqual(s,200,r)

    def test_taipei_day_boundary(self):
        # 15:59 UTC = 23:59 Taipei; 16:00 UTC = next Taipei day
        late=dt.datetime(2026,11,12,15,59,tzinfo=dt.timezone.utc)
        with patch.object(service,'now',return_value=late):
            for i in range(6):self.assertEqual(service.handle('worker',card(),'agent-sec',self.rest,worker=True)[0],200)
            self.assertEqual(service.handle('worker',card(),'agent-sec',self.rest,worker=True)[0],429)
        with patch.object(service,'now',return_value=late+dt.timedelta(minutes=1)):
            self.assertEqual(service.handle('worker',card(),'agent-sec',self.rest,worker=True)[0],200)

    def test_original_create_validation_still_applies(self):
        for bad in (dict(execution='ai'),dict(department=16),dict(criteria=[]),dict(assignee='nobody'),dict(id='x'),dict(title=''),dict(executor='bogus')):
            with self.subTest(bad=bad):
                s,r=agent_call(card(**bad),key='sec');self.assertEqual(s,400,r)
        self.assertEqual(service.handle('worker',card(execution='manual'),'agent-sec',self.rest,worker=True)[0],200)

    def test_worker_cannot_approve_or_touch_others_cards(self):
        s,r=agent_call(card(),key='sec');t=r['task']
        s,r=agent_call(dict(operation='approve',id=t['id'],revision=t['revision'],checks=[True]),key='sec');self.assertEqual(s,403,r)
        s,r=service.handle('worker',dict(operation='approve',id=t['id'],revision=t['revision'],checks=[True]),'agent-sec',self.rest,worker=True)
        self.assertIn(s,(400,409),r);self.assertEqual(self.stored(t['id'])['status'],'queued')
        # another agent's running card: sec cannot heartbeat/submit it
        other=service.handle('admin_office_tasks_create',dict(id=str(uuid.uuid4()),title='x',brief='y',criteria=['z'],department=8,execution='agent',assignee='qa'),'admin@example.com',self.rest)[1]['task']
        claimed=service.handle('worker',dict(operation='claim',id=other['id'],revision=other['revision']),'agent-qa',self.rest,worker=True)[1]['task']
        s,r=service.handle('worker',dict(operation='submit',id=other['id'],revision=claimed['revision'],lease_token=claimed['lease_token'],result='r'),'agent-sec',self.rest,worker=True)
        self.assertEqual(s,403,r)
        # create cannot overwrite someone else's card id
        s,r=agent_call(card(id=other['id']),key='sec');self.assertEqual(s,409,r)

    def test_existing_agent_ops_unchanged(self):
        t=service.handle('admin_office_tasks_create',{k:v for k,v in card().items() if k!='operation'},'admin@example.com',self.rest)[1]['task']
        s,r=agent_call(dict(operation='list'),key='sec');self.assertEqual(s,200,r);self.assertEqual([x['id'] for x in r['tasks']],[t['id']])
        s,r=agent_call(dict(operation='get',id=t['id']),key='sec');self.assertEqual(s,200,r)
        s,r=agent_call(dict(operation='claim',id=t['id'],revision=t['revision']),key='sec');self.assertEqual(s,200,r)
        lease=r['task']['lease_token']
        s,r=agent_call(dict(operation='heartbeat',id=t['id'],revision=r['task']['revision'],lease_token=lease,note='進行中'),key='sec');self.assertEqual(s,200,r)
        s,r=agent_call(dict(operation='submit',id=t['id'],revision=r['task']['revision'],lease_token=lease,result='完成'),key='sec');self.assertEqual(s,200,r)
        for op in ('approve','cancel','retry','online'):
            with self.subTest(op=op):self.assertEqual(agent_call(dict(operation=op,id=t['id']),key='sec')[0],403)
        self.assertEqual(agent_call(dict(operation='delete',id=t['id']),key='sec')[0],400)
        self.assertEqual(agent_call(card(),key='sec',token='X'*32)[0],401)    # bad signature still 401 first

    def test_admin_create_path_unchanged(self):
        b={k:v for k,v in card(execution='ai',budget_usd=.5,assignee='').items() if k!='operation'}
        s,r=service.handle('admin_office_tasks_create',b,'admin@example.com',self.rest);self.assertEqual(s,200,r)
        t=self.stored(b['id']);self.assertEqual((t['budget_usd'],t['created_by'],t['status']),(.5,'admin@example.com','queued'))
        for i in range(8):   # no daily cap for admins
            self.assertEqual(service.handle('admin_office_tasks_create',{k:v for k,v in card().items() if k!='operation'},'admin@example.com',self.rest)[0],200)
        # a worker cannot reach admin create by naming the admin action
        s,r=service.handle('admin_office_tasks_create',dict(card(),operation='claim'),'agent-ceo',self.rest,worker=True);self.assertNotEqual(s,200)


if __name__=='__main__':
    unittest.main()
