"""Exactly one fresh R01 scenario and one deterministic R02 scenario. Box only."""
from pathlib import Path
import hashlib,json,sqlite3,subprocess,sys,importlib.util
from unittest.mock import patch
from datetime import datetime
from zoneinfo import ZoneInfo
A=Path(__file__).resolve().parent;S=A.parent/'WIN-RUNNER-OPS-01/v1';P=A.parent/'WIN-RUNNER-OPS-02';E=A/'known-gaps-002';E.mkdir(exist_ok=False)
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();J=lambda p:json.loads(p.read_text());names=['runner.py','worker.py','run_config.json','source_pin.json'];gate=J(A/'reviewed_source_gate.json');assert sys.platform=='linux' and all(H(S/n)==gate[n] for n in names)
protected=[P/n for n in ['delivery_pin.json','README-handoff.md','reproduce_v1_gaps.py','before_after.json','R02-snapshot-suggestion.NOT_APPLIED.patch']];before={str(p):{'sha256':H(p),'size':p.stat().st_size} for p in protected};assert H(P/'delivery_pin.json')=='21fe3f05582db9c2c6d4904c2113f7a42f3d7fbf44b7b4ecbc51c0600fcb31c3';(E/'source_before.json').write_text(json.dumps(before,indent=2)+'\n')
def clone(label):
 d=E/label;d.mkdir()
 for n in names:(d/n).write_bytes((S/n).read_bytes())
 assert all(H(d/n)==gate[n] for n in names)
 return d
# R01: one malformed store, exactly two required CLI invocations.
d=clone('R01');store=d/'state';store.mkdir();dbp=store/'ledger.sqlite3'
with sqlite3.connect(dbp) as c:c.execute('CREATE TABLE attempts(campaign TEXT,task TEXT,run_id TEXT,status TEXT,pid INTEGER,created TEXT,updated TEXT,pin TEXT,exit_code INTEGER)')
(E/'R01.ledger.before.bin').write_bytes(dbp.read_bytes());cmds=[]
for rid in ['first','second']:
 cmd=[sys.executable,'-B',str(d/'runner.py'),'run','--synthetic','--task','normal','--campaign','same-task','--run-id',rid,'--store','state'];t=datetime.now(ZoneInfo('Asia/Taipei')).isoformat();r=subprocess.run(cmd,cwd=E,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 (E/f'R01.{rid}.stdout.bin').write_bytes(r.stdout);(E/f'R01.{rid}.stderr.bin').write_bytes(r.stderr);cmds.append({'argv':cmd,'cwd':str(E),'at_asia_taipei':t,'exit':r.returncode,'stdout_sha256':hashlib.sha256(r.stdout).hexdigest(),'stderr_sha256':hashlib.sha256(r.stderr).hexdigest()})
with sqlite3.connect('file:'+str(dbp)+'?mode=ro',uri=True) as c:
 schema=[list(r) for r in c.execute('PRAGMA table_info(attempts)')];indexes=[list(r) for r in c.execute('PRAGMA index_list(attempts)')];rows=[list(r) for r in c.execute('SELECT campaign,task,run_id,status,pid,exit_code FROM attempts')]
(E/'R01.ledger.after.bin').write_bytes(dbp.read_bytes());launches=[J(p) for p in store.glob('*/launch.json')];results=[J(p) for p in store.glob('*/result.json')]
r01=all(r['exit']==0 for r in cmds) and len(rows)==2 and len({r['pid'] for r in launches})==2 and len(launches)==2 and len(results)==2 and all(r['actual_process_exit']==0 for r in results) and not indexes and not any(r[5] for r in schema)
# R02: deterministic actual-file swap after old bytes return; no run/spawn call.
d=clone('R02');spec=importlib.util.spec_from_file_location('auditor_linux_fixed_runner_gap',d/'runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);assert Path(m.__file__).resolve()==d/'runner.py' and H(Path(m.__file__))==gate['runner.py']
p=d/'run_config.json';old=p.read_bytes();cfg=json.loads(old);cfg['tasks']['normal']['deadline_seconds']=2.0;new=(json.dumps(cfg,indent=2)+'\n').encode();original_read=Path.read_bytes;events=[]
def swapped(path):
 raw=original_read(path)
 if path==p and not events:
  events.append({'event':'verified_read_captured_then_own_sandbox_write','returned_bytes_sha256':hashlib.sha256(raw).hexdigest(),'written_bytes_sha256':hashlib.sha256(new).hexdigest()});p.write_bytes(new)
 return raw
with patch.object(Path,'read_bytes',swapped):accepted,reported_pin=m.verify(synthetic=True)
(E/'R02.original_config.bin').write_bytes(old);(E/'R02.swapped_config.bin').write_bytes(new);pin=J(d/'source_pin.json');r02=bool(events) and accepted['tasks']['normal']['deadline_seconds']==2.0 and H(p)!=pin['files']['run_config.json']['sha256']
after={str(p):{'sha256':H(p),'size':p.stat().st_size} for p in protected};assert before==after and all(H(S/n)==gate[n] for n in names)
r={'at_asia_taipei':datetime.now(ZoneInfo('Asia/Taipei')).isoformat(),'scope':'one scenario per known defect, not historical suite','reproductions_confirmed':int(r01)+int(r02),'product_invariant_FAIL':int(r01)+int(r02),'product_invariant_PASS':0,'real_runner_CLI_calls':2,'R02_direct_verify_calls':1,'R02_worker_launches':0,'R01':{'confirmed':r01,'verdict':'FAIL' if r01 else 'NOT_REPRODUCED','commands':cmds,'schema':schema,'indexes':indexes,'rows':rows,'launches':launches,'results':results,'minimal_fix_source_lines':'runner.py 44-49: validate existing schema/required PK and UNIQUE before accepting reservation or spawn'},'R02':{'confirmed':r02,'verdict':'FAIL' if r02 else 'NOT_REPRODUCED','import_file':m.__file__,'source_sha256':H(Path(m.__file__)),'event_trace':events,'verified_config_sha256':pin['files']['run_config.json']['sha256'],'accepted_disk_config_sha256':H(p),'accepted_config':accepted,'reported_pin':reported_pin,'minimal_fix_source_lines':'runner.py 28-42: single verified pin/config byte snapshot; parse only those verified config bytes'},'originals_unchanged':True,'Windows':'NOT_RUN','fixed_release':'PENDING','harness_exit0_meaning':'both failures independently reproduced, not functionality PASS'}
(E/'results.json').write_text(json.dumps(r,indent=2)+'\n');(E/'source_after.json').write_text(json.dumps(after,indent=2)+'\n');print(json.dumps({'reproductions_confirmed':r['reproductions_confirmed'],'product_invariant_FAIL':r['product_invariant_FAIL'],'real_runner_CLI_calls':2,'R02_direct_verify_calls':1,'source_unchanged':True}));raise SystemExit(0 if r01 and r02 else 1)
