"""OPS-02 new narrow reproductions, not the historical v1 suite. No native/Windows."""
from pathlib import Path
import hashlib,importlib.util,json,shutil,sqlite3,subprocess,sys
from unittest.mock import patch
Q=Path(__file__).resolve().parent;S=Q.parent/'WIN-RUNNER-OPS-01';E=Q/'repro-001';E.mkdir(exist_ok=False)
N=['install_candidate.py','v1/runner.py','v1/worker.py','v1/run_config.json','v1/source_pin.json'];H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={n:H(S/n) for n in N};results=[]
def copy(name):
 d=E/name;d.mkdir()
 for n in ['runner.py','worker.py','run_config.json','source_pin.json']:shutil.copyfile(S/'v1'/n,d/n)
 return d
# R01: a pre-existing incorrect schema is accepted because IF NOT EXISTS doesn't validate it.
d=copy('schema-case');st=d/'state';st.mkdir()
with sqlite3.connect(st/'ledger.sqlite3') as db:
 db.execute('CREATE TABLE attempts(campaign TEXT,task TEXT,run_id TEXT,status TEXT,pid INTEGER,created TEXT,updated TEXT,pin TEXT,exit_code INTEGER)')
commands=[]
for rid in ['one','two']:
 cmd=[sys.executable,'-B',str(d/'runner.py'),'run','--synthetic','--task','normal','--campaign','same-task','--run-id',rid,'--store','state']
 r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 (E/f'schema-{rid}.stdout.bin').write_bytes(r.stdout);(E/f'schema-{rid}.stderr.bin').write_bytes(r.stderr);commands.append({'argv':cmd,'actual_exit':r.returncode});assert r.returncode==0
with sqlite3.connect(st/'ledger.sqlite3') as db:rows=db.execute('SELECT campaign,task,run_id,status,pid FROM attempts').fetchall()
assert len(rows)==2
results.append({'id':'R01','reproduction':'CONFIRMED','invariant_verdict':'FAIL','finding':'preexisting attempts schema lacks PK/UNIQUE; two real CLI workers accepted for same campaign/task','actual_rows':rows,'commands':commands,'boundary':'controlled malformed-store fixture, not proof of malicious OS protection'})
print('R01 CONFIRMED invariant FAIL: two duplicate task workers accepted against unsupported existing schema',flush=True)
# R02: controlled real-file swap between verified bytes and second config read.
d=copy('config-case');spec=importlib.util.spec_from_file_location('v1_config_case',d/'runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=d/'run_config.json';old=p.read_bytes();cfg=json.loads(old);cfg['tasks']['normal']['deadline_seconds']=2.0;new=(json.dumps(cfg,indent=2)+'\n').encode();original_read=Path.read_bytes;trigger=[]
def swap_after_read(path):
 raw=original_read(path)
 if path==p and not trigger:
  trigger.append(True);p.write_bytes(new)
 return raw
with patch.object(Path,'read_bytes',swap_after_read):accepted,reported_pin=m.verify(synthetic=True)
assert trigger and accepted['tasks']['normal']['deadline_seconds']==2.0
pin=json.loads((d/'source_pin.json').read_text());assert hashlib.sha256(new).hexdigest()!=pin['files']['run_config.json']['sha256']
(E/'config-case.verified-before.bin').write_bytes(old)
results.append({'id':'R02','reproduction':'CONFIRMED','invariant_verdict':'FAIL','finding':'verify decodes a second disk read instead of verified config bytes; unpinned config accepted','original_config_sha256':hashlib.sha256(old).hexdigest(),'actual_accepted_config_sha256':hashlib.sha256(new).hexdigest(),'returned_deadline':accepted['tasks']['normal']['deadline_seconds'],'injection':'deterministic hook swaps own sandbox config immediately after the first real file read; not a probabilistic concurrency or malicious OS security claim','worker_launches':0})
print('R02 CONFIRMED invariant FAIL: config accepted from unpinned second read',flush=True)
after={n:H(S/n) for n in N};assert before==after
(E/'results.json').write_text(json.dumps({'scope':'two new Linux/local real-file reproductions only; not v1 suite/native','reproductions_confirmed':2,'observed_invariant_FAIL':2,'author_v1_before':before,'author_v1_after':after,'frozen_v1_unchanged':True,'results':results,'Windows':'NOT_RUN'},indent=2))
