"""Fixed inert task runner. No shell/ML/native Job capability. Windows NOT_RUN."""
import argparse,datetime,hashlib,json,os,re,sqlite3,stat,subprocess,sys,time
from pathlib import Path
BASE=Path(__file__).resolve().parent
VERSION='WIN-RUNNER-OPS.v1'
TASKS={'normal':'normal','failure':'failure','deadline':'wait','stoppable':'wait'}
TERMINAL={'SUCCEEDED','FAILED','TIMED_OUT','STOPPED','CLEANUP_PENDING','UNKNOWN'}
def _guard(synthetic):
    if synthetic is not True:raise ValueError('E_SYNTHETIC_LITERAL_TRUE')
def _now():return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
def _name(s):
    if type(s) is not str or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,47}',s):raise ValueError('E_IDENTIFIER')
    return s
def _safe(path):
    for p in [path,*path.parents]:
        try:s=p.lstat()
        except FileNotFoundError:continue
        if stat.S_ISLNK(s.st_mode) or getattr(s,'st_file_attributes',0)&0x400:raise ValueError('E_REPARSE')
    return path
def _store(relative):
    if type(relative) is not str or Path(relative).is_absolute() or '..' in Path(relative).parts:raise ValueError('E_PATH_ESCAPE')
    p=BASE/relative
    if p==BASE or not p.resolve().is_relative_to(BASE):raise ValueError('E_PATH_ESCAPE')
    _safe(p);p.mkdir(parents=True,exist_ok=True);return p

def verify(*,synthetic=False):
    _guard(synthetic)
    p=_safe(BASE/'source_pin.json');pin=json.loads(p.read_text(encoding='ascii'))
    if set(pin)!={'schema','version','encoding','files'} or pin['schema']!='WIN.RUNNER.PIN.v1' or pin['version']!=VERSION or pin['encoding']!='UTF-8-no-BOM-LF':raise ValueError('E_PIN_FORMAT')
    if set(pin['files'])!={'runner.py','worker.py','run_config.json'}:raise ValueError('E_SOURCE_ALLOWLIST')
    for n,row in pin['files'].items():
        if set(row)!={'size','sha256'} or type(row['size']) is not int or not 0<row['size']<65536 or not re.fullmatch('[0-9a-f]{64}',row['sha256']):raise ValueError('E_PIN_ROW')
        raw=_safe(BASE/n).read_bytes()
        if len(raw)!=row['size'] or hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('E_INTEGRITY:'+n)
        if raw.startswith(b'\xef\xbb\xbf') or b'\r' in raw:raise ValueError('E_ENCODING')
        raw.decode('utf-8',errors='strict')
    cfg=json.loads((BASE/'run_config.json').read_text(encoding='utf-8'))
    if set(cfg)!={'version','synthetic','tasks','cleanup_seconds'} or cfg['version']!=VERSION or cfg['synthetic'] is not True or cfg['cleanup_seconds']!=0.5 or type(cfg['cleanup_seconds']) is not float:raise ValueError('E_CONFIG')
    if set(cfg['tasks'])!=set(TASKS):raise ValueError('E_TASK_ALLOWLIST')
    for name,row in cfg['tasks'].items():
        if set(row)!={'mode','deadline_seconds'} or row['mode']!=TASKS[name] or type(row['deadline_seconds']) is not float or not 0.1<=row['deadline_seconds']<=2.0:raise ValueError('E_TASK_CONFIG')
    return cfg,hashlib.sha256(p.read_bytes()).hexdigest()

def _db(store):
    for n in ['ledger.sqlite3','ledger.sqlite3-journal','ledger.sqlite3-wal','ledger.sqlite3-shm']:_safe(store/n)
    db=sqlite3.connect(store/'ledger.sqlite3',timeout=2,isolation_level=None)
    db.execute('PRAGMA synchronous=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS attempts(campaign TEXT,task TEXT,run_id TEXT UNIQUE,status TEXT,pid INTEGER,created TEXT,updated TEXT,pin TEXT,exit_code INTEGER,PRIMARY KEY(campaign,task))')
    return db

def _write(path,data):
    with path.open('x',encoding='ascii') as f:json.dump(data,f,ensure_ascii=True,indent=2);f.flush();os.fsync(f.fileno())
def _update(db,campaign,task,status,pid=None,code=None):
    db.execute('BEGIN IMMEDIATE')
    try:
        db.execute('UPDATE attempts SET status=?,pid=coalesce(?,pid),exit_code=?,updated=? WHERE campaign=? AND task=?',(status,pid,code,_now(),campaign,task));db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:db.execute('ROLLBACK')
        raise

def run(task,campaign,run_id,*,store='runs',synthetic=False):
    _guard(synthetic)
    _name(campaign);_name(run_id)
    if task not in TASKS:raise ValueError('E_TASK_ALLOWLIST')
    cfg,pin=verify(synthetic=True);root=_store(store);db=_db(root)
    # Atomic, permanent exclusive key across processes and run-id changes. Never recycle.
    db.execute('BEGIN IMMEDIATE')
    try:
        db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',(campaign,task,run_id,'RESERVED',None,_now(),_now(),pin,None));db.execute('COMMIT')
    except sqlite3.IntegrityError:
        db.execute('ROLLBACK');db.close();raise ValueError('E_DUPLICATE_STICKY_NO_RETRY')
    except BaseException:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close();raise
    child=None;result=None;folder=root/run_id
    try:
        _safe(folder);folder.mkdir(exist_ok=False)
        argv=[sys.executable,'-B',str(BASE/'worker.py'),'--task',task,'--mode',TASKS[task],'--run-id',run_id]
        _write(folder/'reservation.json',{'version':VERSION,'campaign':campaign,'task':task,'run_id':run_id,'pin_sha256':pin,'reserved_at_asia_taipei':_now(),'argv':argv,'shell':False,'attempts':1,'retries':0})
        with (folder/'stdout.bin').open('xb') as out,(folder/'stderr.bin').open('xb') as err:
            started=time.monotonic()
            child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=out,stderr=err,shell=False,cwd=BASE)
            _update(db,campaign,task,'RUNNING',child.pid)
            _write(folder/'launch.json',{'pid':child.pid,'controller_pid':os.getpid(),'retained_popen':True,'started_monotonic':started,'at_asia_taipei':_now(),'argv':argv,'identity_limit':'retained own Popen; not Windows Job/tree identity proof'})
            status=None;stop_reason=None
            while child.poll() is None:
                signal=_safe(folder/'STOP')
                try:signal.lstat();requested=True
                except FileNotFoundError:requested=False
                if requested:status='STOPPED';stop_reason='EXPLICIT_OWN_TASK_STOP';break
                if time.monotonic()-started>=cfg['tasks'][task]['deadline_seconds']:status='TIMED_OUT';stop_reason='DEADLINE';break
                time.sleep(.01)
            if status is not None and child.poll() is None:
                end=time.monotonic()+cfg['cleanup_seconds']
                child.terminate() # exact retained child only, never PID scan/tree enumeration
                try:child.wait(timeout=max(0.001,(end-time.monotonic())/2))
                except subprocess.TimeoutExpired:
                    child.kill()
                    try:child.wait(timeout=max(.001,end-time.monotonic()))
                    except subprocess.TimeoutExpired:status='CLEANUP_PENDING'
            code=child.poll()
            if status is None:status='SUCCEEDED' if code==0 else 'FAILED';stop_reason='NATURAL_EXIT'
            result={'version':VERSION,'campaign':campaign,'task':task,'run_id':run_id,'status':status,'child_pid':child.pid,'actual_process_exit':code,'exit_source':'SAME_RETAINED_POPEN_POLL_WAIT','stop_reason':stop_reason,'at_asia_taipei':_now(),'elapsed_seconds':time.monotonic()-started,'tree_closed':'NOT_PROVEN','Windows':'NOT_RUN','attempts':1,'retries':0}
            out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
        _write(folder/'result.json',result);_update(db,campaign,task,status,code=code)
        print(json.dumps(result,ensure_ascii=True),flush=True)
        return 0 if status=='SUCCEEDED' else 2
    except BaseException:
        # Consume is sticky on crash/error. No claim of general tree cleanup.
        if child is not None and child.poll() is None:
            child.kill()
            try:child.wait(timeout=.5)
            except subprocess.TimeoutExpired:pass
        _update(db,campaign,task,'UNKNOWN',code=None if child is None else child.poll());raise
    finally:db.close()

def stop(campaign,task,*,store='runs',synthetic=False):
    _guard(synthetic);_name(campaign)
    if task not in TASKS:raise ValueError('E_TASK_ALLOWLIST')
    verify(synthetic=True);root=_store(store);db=_db(root)
    try:row=db.execute('SELECT run_id,status FROM attempts WHERE campaign=? AND task=?',(campaign,task)).fetchone()
    finally:db.close()
    if row is None or row[1]!='RUNNING':raise ValueError('E_STOP_NOT_RUNNING')
    _name(row[0]);folder=_safe(root/row[0]);_write(folder/'STOP',{'requested_at_asia_taipei':_now(),'only_owned_task':True});print('STOP_REQUEST_RECORDED')
    return 0

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['run','stop','verify']);p.add_argument('--synthetic',action='store_true');p.add_argument('--task');p.add_argument('--campaign');p.add_argument('--run-id');p.add_argument('--store',default='runs');a=p.parse_args()
    try:
        if a.operation=='verify':verify(synthetic=a.synthetic);print(VERSION+' INTEGRITY_OK');return 0
        if a.operation=='stop':return stop(a.campaign,a.task,store=a.store,synthetic=a.synthetic)
        return run(a.task,a.campaign,a.run_id,store=a.store,synthetic=a.synthetic)
    except Exception as e:print(json.dumps({'error':str(e),'type':type(e).__name__,'no_retry':True}),file=sys.stderr);return 3
if __name__=='__main__':sys.exit(main())
