"""Persistent department tasks in existing admin_settings rows; compare-and-swap writes.
No schema change, network call, model run, or seed data at import time.
"""
import copy
import datetime as dt
import hashlib
import json
import math
import os
import secrets
import uuid
from urllib.parse import quote
from lib.office_departments import DEPARTMENTS

PREFIX = 'office-task-uat-v1-'
WORKER_KEY = 'office_task_worker_uat_v1'
STATES = ('queued','running','blocked','review','approved','cancelled','failed')
LEASE_SECONDS = 180

class Problem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def now():
    return dt.datetime.now(dt.timezone.utc)


def iso():
    return now().isoformat()


def identifier(value):
    try:
        value = str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise Problem(400, '任務識別碼無效')
    return value


def text(value, maximum, label, required=False):
    if not isinstance(value, str) or len(value) > maximum or '\x00' in value:
        raise Problem(400, label+'格式或長度不正確')
    value=value.strip()
    if required and not value:
        raise Problem(400, '請填寫'+label)
    return value


def scope_guard():
    if os.environ.get('VERCEL') == '1' and os.environ.get('VERCEL_GIT_COMMIT_REF') != 'uat':
        raise Problem(403, '任務中心目前僅在 UAT 啟用')


def read(rest, task_id):
    st, rows=rest('/admin_settings?select=key,value,updated_at&key=eq.'+PREFIX+identifier(task_id))
    if st!=200 or not isinstance(rows,list):raise Problem(503,'任務暫時無法讀取')
    if not rows:raise Problem(404,'找不到任務')
    try:
        task=json.loads(rows[0]['value'])
        if task['id']!=task_id or task['status'] not in STATES:raise ValueError()
        return task,rows[0]
    except (KeyError,ValueError,TypeError):raise Problem(503,'任務紀錄格式異常，未覆寫資料')


def all_tasks(rest):
    tasks=[]
    for offset in range(0,1000,25):
        st,rows=rest('/admin_settings?select=key,value,updated_at&key=like.'+PREFIX+'*&order=key.asc&offset='+str(offset)+'&limit=25')
        if st!=200 or not isinstance(rows,list):raise Problem(503,'任務清單暫時無法讀取')
        for row in rows:
            try:
                task=json.loads(row['value'])
                if row['key']!=PREFIX+identifier(task['id']) or task['status'] not in STATES:raise ValueError()
                tasks.append(task)
            except (KeyError,ValueError,TypeError):raise Problem(503,'任務清單包含異常紀錄，請管理者檢查')
        if len(rows)<25:return tasks
    raise Problem(503,'任務數量超過目前讀取上限，請先封存舊任務')


def public(task):
    result=copy.deepcopy(task)
    result.pop('lease_token',None)
    return result


def summary(task):
    keys=('id','title','department','execution','due_date','depends_on','created_at','updated_at','revision','status','current_step','lease_until','cost_usd','reserved_usd','budget_usd','attempts')
    result={k:task[k] for k in keys if k in task}
    result['brief']=task.get('brief','')[:200]
    result['criteria_count']=len(task.get('criteria',[]))
    return result


def event(task, actor, message):
    task['history']=(task.get('history',[])+[{'at':iso(),'actor':actor,'status':task['status'],'message':message}])[-100:]


def save(rest, task, old=None):
    timestamp=now()
    if old:
        try:prior=dt.datetime.fromisoformat(old['updated_at'].replace('Z','+00:00'))
        except (KeyError,ValueError,TypeError):raise Problem(503,'任務缺少版本時間，未覆寫資料')
        timestamp=max(timestamp,prior+dt.timedelta(microseconds=1))
    task['updated_at']=timestamp.isoformat()
    value=json.dumps(task,ensure_ascii=False,separators=(',',':'))
    row={'key':PREFIX+task['id'],'value':value,'updated_at':task['updated_at']}
    if old:
        # Timestamp predicate keeps even large deliverables out of the request URL.
        path='/admin_settings?key=eq.'+row['key']+'&updated_at=eq.'+quote(old['updated_at'],safe='')
        st,rows=rest(path,method='PATCH',body={'value':value,'updated_at':row['updated_at']},prefer='return=representation')
    else:st,rows=rest('/admin_settings',method='POST',body=[row],prefer='return=representation')
    if st==409 or st==200 and rows==[]:raise Problem(409,'任務已被其他人更新，請重新整理')
    if st not in (200,201) or not isinstance(rows,list) or len(rows)!=1:raise Problem(503,'儲存未確認成功，請重新整理確認後再試')
    return task


def ready(task, rest):
    for task_id in task.get('depends_on',[]):
        if read(rest,task_id)[0]['status']!='approved':return False
    return True


def create(body, actor, rest):
    task_id=identifier(body.get('id'))
    title=text(body.get('title'),120,'任務名稱',True)
    brief=text(body.get('brief'),10000,'任務內容',True)
    criteria=body.get('criteria')
    if not isinstance(criteria,list) or not 1<=len(criteria)<=12:raise Problem(400,'請填寫 1 至 12 項驗收條件')
    criteria=[text(x,300,'驗收條件',True) for x in criteria]
    dept=body.get('department')
    if type(dept)!=int or not 0<=dept<len(DEPARTMENTS) or not DEPARTMENTS[dept]['enabled']:raise Problem(400,'部門無效或尚未啟用')
    execution=body.get('execution')
    if execution not in ('manual','ai'):raise Problem(400,'請指定執行方式')
    budget=body.get('budget_usd',0)
    if type(budget) not in (int,float) or not math.isfinite(budget) or execution=='ai' and not 0.05<=budget<=10:raise Problem(400,'AI 任務預算須介於 US$0.05 與 US$10')
    due=body.get('due_date','')
    if due:
        try:dt.date.fromisoformat(due)
        except (ValueError,TypeError):raise Problem(400,'截止日期格式錯誤')
    dependencies=body.get('depends_on',[])
    if not isinstance(dependencies,list) or len(dependencies)>8:raise Problem(400,'前置任務最多 8 項')
    dependencies=list(dict.fromkeys(identifier(x) for x in dependencies))
    if task_id in dependencies:raise Problem(400,'不能依賴自己')
    for dependency in dependencies:
        if read(rest,dependency)[0]['status']=='cancelled':raise Problem(400,'前置任務已取消')
    payload=dict(title=title,brief=brief,criteria=criteria,department=dept,execution=execution,budget_usd=round(budget,2) if execution=='ai' else 0,due_date=due,depends_on=dependencies)
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    try:existing,_=read(rest,task_id)
    except Problem as e:
        if e.status!=404:raise
    else:
        if existing.get('request_hash')!=digest or existing['created_by']!=actor:raise Problem(409,'此任務識別碼已被使用')
        return public(existing)
    task=dict(payload,id=task_id,request_hash=digest,created_by=actor,created_at=iso(),revision=1,status='queued',current_step='等待執行',result='',blocker='',checks=[False]*len(criteria),cost_usd=0,reserved_usd=0,attempts=0,history=[])
    event(task,actor,'建立任務，指派 '+DEPARTMENTS[dept]['name'])
    return public(save(rest,task))


def lease_live(task):
    try:return dt.datetime.fromisoformat(task['lease_until'])>now()
    except (KeyError,ValueError,TypeError):return False


def mutate(body, actor, rest, worker=False):
    task,old=read(rest,identifier(body.get('id')))
    if body.get('revision')!=task['revision']:raise Problem(409,'任務已更新，請重新整理')
    operation=body.get('operation')
    if operation=='claim':
        if task['status']!='queued' or not ready(task,rest):raise Problem(409,'任務尚未可執行，或前置任務尚未驗收')
        if worker != (task['execution']=='ai'):raise Problem(403,'執行方式不符')
        if task['attempts']>=3:raise Problem(409,'已達 3 次執行上限，請建立新任務')
        if worker:
            remaining=round(task['budget_usd']-task['cost_usd'],6)
            if remaining<0.01:raise Problem(409,'任務預算已用完')
            run_budget=body.get('run_budget_usd',remaining)
            if type(run_budget) not in (int,float) or not math.isfinite(run_budget) or not .01<=run_budget<=remaining:raise Problem(400,'執行預算無效')
            task['reserved_usd']=run_budget
            task['lease_token']=secrets.token_urlsafe(32)
            task['lease_until']=(now()+dt.timedelta(seconds=LEASE_SECONDS)).isoformat()
            task['worker']=text(body.get('worker'),100,'執行端',True)
        else:task['worker']=actor
        task.update(status='running',current_step='已領取，開始執行',blocker='',attempts=task['attempts']+1)
        event(task,actor,'領取任務')
    elif worker:
        if task['execution']!='ai' or task['status']!='running' or not lease_live(task) or not secrets.compare_digest(str(body.get('lease_token') or ''),task.get('lease_token','')):raise Problem(409,'任務已取消、租約失效或執行權已變更')
        if operation=='heartbeat':
            task['lease_until']=(now()+dt.timedelta(seconds=LEASE_SECONDS)).isoformat()
            task['current_step']=text(body.get('note'),300,'執行進度',True)
        elif operation in ('submit','fail','block'):
            result=text(body.get('result',''),40000,'交付內容',operation=='submit')
            note=text(body.get('note',''),2000,'執行說明',operation!='submit')
            cost=body.get('cost_usd')
            if type(cost) not in (int,float) or not math.isfinite(cost) or cost<0:
                cost=task['reserved_usd'];task['cost_uncertain']=True
            task['cost_usd']=round(task['cost_usd']+cost,6)
            task.update(status={'submit':'review','fail':'failed','block':'blocked'}[operation],result=result or task['result'],blocker=note,current_step='待管理者驗收' if operation=='submit' else note,reserved_usd=0)
            task.pop('lease_token',None)
            event(task,actor,'提交成果，等待驗收' if operation=='submit' else note)
        else:raise Problem(400,'不支援的執行端操作')
    else:
        if operation=='cancel':
            if task['status'] in ('approved','cancelled'):raise Problem(409,'此任務已結案')
            if task['reserved_usd']:
                task['cost_usd']+=task['reserved_usd'];task['cost_uncertain']=True
            task.update(status='cancelled',reserved_usd=0,current_step='管理者取消；執行端收到後停止')
            task.pop('lease_token',None);event(task,actor,'取消任務')
        elif operation=='retry':
            if task['status'] not in ('failed','blocked','review'):raise Problem(409,'此狀態不能重派')
            if task['attempts']>=3:raise Problem(409,'已達執行次數上限，請建立新任務')
            if task['execution']=='ai' and task['cost_usd']>=task['budget_usd']:raise Problem(409,'預算已用完，請建立新任務並明確核定預算')
            note=text(body.get('note',''),2000,'退回／重派原因',True)
            task.update(status='queued',blocker='',current_step='已退回，等待重新執行',feedback=note,checks=[False]*len(task['criteria']))
            event(task,actor,'重派：'+note)
        elif operation=='approve':
            if task['status']!='review':raise Problem(409,'只有待驗收成果可以結案')
            checks=body.get('checks')
            if not isinstance(checks,list) or len(checks)!=len(task['criteria']) or any(x is not True for x in checks):raise Problem(400,'請逐項確認所有驗收條件')
            task.update(status='approved',checks=checks,reviewed_by=actor,reviewed_at=iso(),current_step='驗收完成')
            event(task,actor,'逐項驗收通過')
        elif operation in ('progress','submit','block'):
            if task['execution']!='manual' or task['status']!='running':raise Problem(409,'只有人工執行中的任務可以回報')
            note=text(body.get('note',''),2000,'進度或卡點',operation!='submit')
            if operation=='submit':task.update(result=text(body.get('result',''),40000,'交付內容',True),status='review',current_step='待管理者驗收',blocker='')
            elif operation=='block':task.update(status='blocked',blocker=note,current_step=note)
            else:task['current_step']=note
            event(task,actor,'提交成果，等待驗收' if operation=='submit' else note)
        elif operation=='recover':
            if task['status']!='running' or task['execution']!='ai' or lease_live(task):raise Problem(409,'執行端仍在回報，或此任務無需回復')
            task['cost_usd']+=task['reserved_usd'];task['cost_uncertain']=True
            task.update(status='blocked',reserved_usd=0,current_step='執行端中斷，請確認額度與成果後重新派工',blocker='租約已逾時；未回報費用按已保留預算計入，避免重複消耗')
            task.pop('lease_token',None);event(task,actor,task['blocker'])
        else:raise Problem(400,'不支援的任務操作')
    task['revision']+=1
    save(rest,task,old)
    result=public(task)
    if worker and operation in ('claim','heartbeat'):result['lease_token']=task['lease_token']
    if worker and operation=='claim':
        result['dependency_outputs']=[{'id':p['id'],'title':p['title'],'result':p['result'][:3000],'truncated':len(p['result'])>3000} for p in (read(rest,k)[0] for k in task.get('depends_on',[]))]
    return result


def handle(action, body, actor, rest, worker=False):
    try:
        scope_guard()
        if not isinstance(body,dict):raise Problem(400,'請提供物件格式')
        if action=='admin_office_tasks_get' and not worker:
            return 200,{'task':public(read(rest,identifier(body.get('id')))[0])}
        if worker and body.get('operation')=='get':
            task,_=read(rest,identifier(body.get('id')))
            if task['execution']!='ai':raise Problem(403,'執行端僅可讀取 AI 任務')
            return 200,{'task':public(task)}
        if worker and body.get('operation')=='online':
            state={'at':iso(),'name':text(body.get('worker'),100,'執行端',True),'mode':'claude','current_task':body.get('current_task') or None,'pause_reason':'daily_budget' if body.get('pause_reason')=='daily_budget' else '','daily_budget_usd':body.get('daily_budget_usd')}
            st,rows=rest('/admin_settings?on_conflict=key',method='POST',body=[{'key':WORKER_KEY,'value':json.dumps(state,ensure_ascii=False),'updated_at':iso()}],prefer='resolution=merge-duplicates,return=representation')
            if st not in (200,201):raise Problem(503,'執行端狀態無法回報')
            return 200,{'ok':True}
        if action=='admin_office_tasks_list' or worker and body.get('operation')=='list':
            tasks=all_tasks(rest)
            today=(now()+dt.timedelta(hours=8)).date()
            committed=sum(t.get('cost_usd',0)+t.get('reserved_usd',0) for t in tasks if (dt.datetime.fromisoformat(t['updated_at'])+dt.timedelta(hours=8)).date()==today)
            all_by_id={t['id']:t for t in tasks}
            if worker:tasks=[t for t in tasks if t['status']=='queued' and t['execution']=='ai']
            tasks.sort(key=lambda t:t['created_at'],reverse=not worker)
            st,rows=rest('/admin_settings?select=value&key=eq.'+WORKER_KEY)
            worker_state={}
            if st==200 and rows:
                try:worker_state=json.loads(rows[0]['value'])
                except (ValueError,KeyError,TypeError):pass
            dependencies={key:{'title':all_by_id[key]['title'],'status':all_by_id[key]['status']} for task in tasks[:200] for key in task.get('depends_on',[]) if key in all_by_id}
            return 200,{'dependencies':dependencies,'tasks':[summary(t) for t in tasks[:200]],'departments':DEPARTMENTS,'worker':worker_state,'scope':'uat','total':len(tasks),'committed_today_usd':committed}
        if action=='admin_office_tasks_create' and not worker:return 200,{'task':create(body,actor,rest)}
        if action=='admin_office_tasks_update' or worker:return 200,{'task':mutate(body,actor,rest,worker)}
        raise Problem(400,'未知的任務動作')
    except Problem as e:return e.status,{'error':e.message}
