"""Real reviewed v1 runner tests, BOX LINUX ONLY. No model/diagnostic payload or installer.
Rerun only with a fresh --out name; immutable source gate refuses changed product bytes."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import argparse,hashlib,json,os,shutil,sqlite3,subprocess,sys,time
A=Path(__file__).resolve().parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
J=lambda p:json.loads(p.read_text())
p=argparse.ArgumentParser();p.add_argument('--out',default='execution-001');a=p.parse_args()
if sys.platform!='linux':raise SystemExit('BOX_LINUX_ONLY; NO WINDOWS APPROVAL')
if not a.out.replace('-','').isalnum():raise SystemExit('NEW_AUDITOR_SUBDIRECTORY_ONLY')
O=A/a.out;O.mkdir(exist_ok=False)
P=A/'sources/WIN-RUNNER-OPS-01/v1';gate=J(A/'reviewed_source_gate.json')
if not all(H(P/n)==s for n,s in gate.items()):raise SystemExit('SOURCE_CHANGED_STOP_REVIEW_REQUIRED')
V=O/'product-copy';V.mkdir();W=O/'caller-cwd';W.mkdir();L=O/'logs';L.mkdir();clones=[]
for n in gate:shutil.copyfile(P/n,V/n)
records=[];cases=[];observations=[];unexpected=[];last_class=None;streak=0
now=lambda:datetime.now(ZoneInfo('Asia/Taipei')).isoformat()
def json_bytes(value):
 if isinstance(value,bytes):return {'bytes_hex':value.hex(),'byte_count':len(value)}
 raise TypeError('Unsupported evidence type: '+type(value).__name__)
def save(path,v):path.write_text(json.dumps(v,ensure_ascii=False,indent=2,default=json_bytes)+'\n')
def args(task,campaign,rid,store='audit-store'):
 return ['run','--synthetic','--task',task,'--campaign',campaign,'--run-id',rid,'--store',store]
def launch(label,arguments,base=V):
 argv=[sys.executable,'-B',str(base/'runner.py'),*arguments];t=time.monotonic();proc=subprocess.Popen(argv,cwd=W,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,shell=False)
 return {'label':label,'argv':argv,'cwd':str(W),'parent_pid':os.getpid(),'controller_pid':proc.pid,'started_monotonic':t,'at_asia_taipei':now(),'proc':proc}
def finish(rec,timeout=6):
 proc=rec.pop('proc');timeout_fault=False
 try:out,err=proc.communicate(timeout=timeout)
 except subprocess.TimeoutExpired:
  timeout_fault=True;proc.kill();out,err=proc.communicate(timeout=2) # retained OWN controller only
 (L/(rec['label']+'.stdout.bin')).write_bytes(out);(L/(rec['label']+'.stderr.bin')).write_bytes(err)
 rec.update(exit=proc.returncode,elapsed_seconds=time.monotonic()-rec['started_monotonic'],timeout=timeout_fault,stdout_sha256=hashlib.sha256(out).hexdigest(),stderr_sha256=hashlib.sha256(err).hexdigest(),stdout_bytes=len(out),stderr_bytes=len(err));records.append(rec)
 if timeout_fault:raise RuntimeError('OUTER_TIMEOUT_STOP_NO_RETRY')
 return proc.returncode,out,err

def invoke(label,arguments,expected=0,base=V):
 code,out,err=finish(launch(label,arguments,base));assert code==expected,('RUNNER_EXIT',label,code,expected,err)
 return out,err

def check(label,fn,kind='real_runner_subprocess'):
 global last_class,streak
 try:detail=fn() or {};cases.append({'case':label,'PASS':True,'kind':kind,'detail':detail});streak=0;last_class=None;save(O/'cases_checkpoint.json',cases)
 except Exception as e:
  failure=type(e).__name__+': '+str(e);failure_class=type(e).__name__
  cases.append({'case':label,'PASS':False,'kind':kind,'error':failure});unexpected.append(failure)
  streak=streak+1 if last_class==failure_class else 1;last_class=failure_class
  save(O/'cases_checkpoint.json',cases)
  if streak>=2 or 'OUTER_TIMEOUT' in failure:
   save(O/'stopped_for_RCA.json',{'at_asia_taipei':now(),'reason':failure,'same_class_streak':streak,'remaining_cases':'NOT_RUN','no_retry':True});raise RuntimeError('STOP_FOR_RCA')

def rows(store='audit-store'):
 with sqlite3.connect(V/store/'ledger.sqlite3') as db:
  return [list(x) for x in db.execute('SELECT campaign,task,run_id,status,pid,pin,exit_code FROM attempts ORDER BY campaign,task')]
def result(rid,store='audit-store'):return J(V/store/rid/'result.json')
def validate_files(rid,expected_child,store='audit-store'):
 d=V/store/rid;r=J(d/'result.json');worker=J(d/'stdout.bin');launch_record=J(d/'launch.json');reservation=J(d/'reservation.json')
 assert r['actual_process_exit']==expected_child and r['child_pid']==worker['pid']==launch_record['pid']
 assert worker['ppid']==launch_record['controller_pid'] and worker['run_id']==rid
 assert (d/'stderr.bin').read_bytes()==b'FIXED_WORKER_STDERR\n'
 assert r['tree_closed']=='NOT_PROVEN' and r['exit_source']=='SAME_RETAINED_POPEN_POLL_WAIT'
 assert reservation['pin_sha256']==gate['source_pin.json'] and reservation['retries']==r['retries']==0
 return {'worker_pid':worker['pid'],'worker_exit':expected_child,'result':r,'files':{x.name:{'size':x.stat().st_size,'sha256':H(x)} for x in d.iterdir() if x.is_file()}}

def normal():
 out,_=invoke('normal',args('normal','campaign-normal','normal'))
 assert json.loads(out)['actual_process_exit']==0
 return validate_files('normal',0)
def failure():
 invoke('failure',args('failure','campaign-failure','failure'),2)
 return validate_files('failure',7)
def duplicate():
 before=rows();files={str(x.relative_to(V/'audit-store')):H(x) for x in (V/'audit-store/normal').iterdir() if x.is_file()}
 invoke('duplicate',args('normal','campaign-normal','different-run-id'),3)
 assert rows()==before and not (V/'audit-store/different-run-id').exists()
 assert files=={str(x.relative_to(V/'audit-store')):H(x) for x in (V/'audit-store/normal').iterdir() if x.is_file()}
 return {'ledger_before_after_unchanged':before}
def deadline():
 invoke('deadline',args('deadline','campaign-deadline','deadline'),2);r=result('deadline');assert r['status']=='TIMED_OUT' and r['actual_process_exit'] is not None
 return {'result':r,'not_whole_process_deadline_proof':True}
def stop_and_binding():
 r=launch('stop-controller',args('stoppable','campaign-stop','stop'));proc=r['proc'];end=time.monotonic()+1.0;observed=None
 try:
  while time.monotonic()<end:
   try:
    l=J(V/'audit-store/stop/launch.json');w=J(V/'audit-store/stop/stdout.bin')
    if l['pid']==w['pid'] and l['controller_pid']==w['ppid']==proc.pid:
     pid=l['pid'];d=Path('/proc')/str(pid);stat_text=(d/'stat').read_text();tail=stat_text.split(') ',1)[1].split();observed={'worker_pid':pid,'proc_ppid':int(tail[1]),'proc_startticks':int(tail[19]),'cwd':os.readlink(d/'cwd'),'exe':os.readlink(d/'exe'),'controller_pid':proc.pid,'at_asia_taipei':now()}
     assert observed['proc_ppid']==proc.pid and Path(observed['cwd'])==V.resolve() and Path(observed['exe']).resolve()==Path(sys.executable).resolve();break
   except (FileNotFoundError,json.JSONDecodeError,ProcessLookupError):pass
   time.sleep(.01) # bounded owned fixture readiness observation, not a delivery wait
  assert observed,'OWN_FIXTURE_IDENTITY_NOT_OBSERVED'
  observations.append(observed);invoke('stop-request',['stop','--synthetic','--task','stoppable','--campaign','campaign-stop','--store','audit-store'])
  code,_,_=finish(r);assert code==2 and result('stop')['status']=='STOPPED' and result('stop')['actual_process_exit'] is not None
  return {'actual_owned_proc_observation':observed,'result':result('stop')}
 finally:
  if proc.poll() is None:proc.kill();proc.communicate(timeout=2)

def race():
 active=[launch('race-a',args('normal','campaign-race','race-a')),launch('race-b',args('normal','campaign-race','race-b'))];codes=[]
 try:
  for r in active:codes.append(finish(r)[0])
  assert sorted(codes)==[0,3] and len([r for r in rows() if r[0]=='campaign-race'])==1
  launches=[p for p in (V/'audit-store').glob('race-*/launch.json')];assert len(launches)==1
  return {'controller_exits':codes,'worker_launch_records':len(launches),'ledger':rows()}
 finally:
  for r in active:
   if 'proc' in r and r['proc'].poll() is None:r['proc'].kill();r['proc'].communicate(timeout=2)
def deny(task,label):
 before=rows();invoke(label,args(task,'deny-'+label,label),3);assert rows()==before and not (V/'audit-store'/label).exists()
def negative(kind):
 D=O/('negative-'+kind);D.mkdir();clones.append(D)
 for n in gate:shutil.copyfile(P/n,D/n)
 pin=J(D/'source_pin.json')
 if kind=='size':(D/'worker.py').write_bytes((D/'worker.py').read_bytes()+b'\n# AUDITOR CORRUPT SIZE FIXTURE\n')
 elif kind=='hash':
  b=(D/'worker.py').read_bytes();assert b.startswith(b'"""Only');(D/'worker.py').write_bytes(b.replace(b'Only',b'only',1))
 elif kind=='version':pin['version']='AUDITOR_WRONG_VERSION'
 elif kind=='encoding':
  b=b'\xef\xbb\xbf'+(D/'worker.py').read_bytes();(D/'worker.py').write_bytes(b);pin['files']['worker.py']={'size':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 else:
  config=J(D/'run_config.json');config['tasks']['train']={'mode':'normal','deadline_seconds':1.0};b=json.dumps(config).encode();(D/'run_config.json').write_bytes(b);pin['files']['run_config.json']={'size':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 if kind in ['version','encoding','task']:save(D/'source_pin.json',pin)
 invoke('negative-'+kind,['verify','--synthetic'],3,D);assert not (D/'runs').exists()
 return {'runner_unchanged':H(D/'runner.py')==gate['runner.py'],'input_fixture_hashes':{n:H(D/n) for n in gate}}
def sticky():
 with sqlite3.connect(V/'audit-store/ledger.sqlite3') as db:db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',('campaign-reserved','normal','reserved-only','RESERVED',None,'AUDITOR_METADATA_ONLY','AUDITOR_METADATA_ONLY',gate['source_pin.json'],None))
 before=rows();invoke('reserved',args('normal','campaign-reserved','reserved-again'),3);assert rows()==before and not (V/'audit-store/reserved-again').exists()
 return {'real_controller_crash_test':False,'metadata_fixture':'RESERVED committed only'}
def namespace():
 invoke('new-store',args('normal','campaign-normal','normal','different-store'));r=validate_files('normal',0,'different-store')
 assert len(rows('different-store'))==1
 return {'expected_per_declared_contract':'new store is different namespace, not duplicate bypass defect or authorization','new_store':r}
def unique_runid():
 before=rows();invoke('unique-runid',args('failure','new-campaign','normal'),3);assert rows()==before

try:
 check('C01_fixed_verify',lambda:invoke('verify',['verify','--synthetic']) and {'integrity':'verified'})
 check('C02_normal_streams_persistence_actual_exit0',normal)
 check('C03_worker_exit7_separate_runner_exit2',failure)
 check('C04_cross_controller_duplicate_changed_runid',duplicate)
 check('C05_active_child_deadline',deadline)
 check('C06_owned_stop_and_real_cwd_executable_binding',stop_and_binding)
 check('C07_two_controller_single_winner',race)
 check('C08_train_DENY',lambda:deny('train','train'))
 check('C09_arbitrary_shell_task_DENY',lambda:deny('sh -c anything','shell'))
 check('C10_default_synthetic_DENY',lambda:invoke('no-synthetic',['verify'],3))
 for i,kind in enumerate(['size','hash','version','encoding','task'],11):check('C%02d_%s_reject_prelaunch'%(i,kind),lambda kind=kind:negative(kind))
 check('C16_RESERVED_sticky',sticky,kind='metadata_reservation_plus_real_rejection_CLI_NOT_crash')
 check('C17_different_store_declared_namespace',namespace)
 check('C18_UNIQUE_runid_different_task',unique_runid)
finally:
 save(O/'commands_results.json',records);save(O/'cases.json',cases);save(O/'owned_proc_observations.json',observations)
 save(O/'main_store_ledger_rows.json',rows())
 save(O/'product_source_after.json',{n:{'sha256':H(V/n),'unchanged':H(V/n)==s} for n,s in gate.items()})
 summary={'at_asia_taipei':now(),'cases':len(cases),'PASS':sum(x['PASS'] for x in cases),'FAIL':sum(not x['PASS'] for x in cases),'subprocess_invocations':len(records),'real_subprocess_cases':sum(x['kind']=='real_runner_subprocess' for x in cases),'metadata_cases':sum(x['kind']!='real_runner_subprocess' for x in cases),'Windows':'NOT_RUN','installer_runs':0,'diagnostic_payload_or_model_runs':0,'author17_or_installer4_not_used_as_own':True,'unexpected_failures':unexpected,'rerun_requires_new_out':True,'namespace':'store+campaign+task; no global dedup/authorization claim','source_gate':gate}
 save(O/'summary.json',summary);print(json.dumps(summary,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(x['PASS'] for x in cases) and len(cases)==18 else 1)
