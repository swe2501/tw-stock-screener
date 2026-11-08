"""Fixed fresh-directory synchronization proposal. Windows NOT_RUN; no train files touched."""
import argparse,hashlib,json,os,platform,stat
from pathlib import Path
TARGET=Path(r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS01_v1_20261108_f2e638ac901d')
# Filled from the frozen v1 manifest; no command source generated at runtime.
EXPECTED_PIN_SHA256='26750f8d67ce6543f54bc3defe54f4db67472c605428eb2703b9cba6bd5cf768'
FILES=('runner.py','worker.py','run_config.json','source_pin.json')
def install(*,synthetic=False):
    if synthetic is not True:raise ValueError('E_SYNTHETIC_LITERAL_TRUE')
    if platform.system()!='Windows' or platform.node()!='O211102':raise RuntimeError('E_WRONG_MACHINE')
    source=Path(__file__).resolve().parent/'v1'
    data={}
    for n in FILES:
        p=source/n;s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or getattr(s,'st_file_attributes',0)&0x400:raise ValueError('E_SOURCE_ENTRY')
        data[n]=p.read_bytes()
    if hashlib.sha256(data['source_pin.json']).hexdigest()!=EXPECTED_PIN_SHA256:raise ValueError('E_FIXED_PIN')
    pin=json.loads(data['source_pin.json'].decode('ascii'))
    if set(pin['files'])!=set(FILES)-{'source_pin.json'}:raise ValueError('E_MEMBER_ALLOWLIST')
    for n,row in pin['files'].items():
        if len(data[n])!=row['size'] or hashlib.sha256(data[n]).hexdigest()!=row['sha256']:raise ValueError('E_SOURCE_HASH')
    _install_verified_data(TARGET,data)
    print(json.dumps({'installed':str(TARGET),'pin_sha256':EXPECTED_PIN_SHA256,'files':FILES,'launched_tasks':0,'no_retry':True}))
    return 0
def _install_verified_data(target,data):
    for p in target.parents:
        s=p.lstat()
        if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or getattr(s,'st_file_attributes',0)&0x400:raise ValueError('E_PARENT')
    target.mkdir(exist_ok=False) # OS atomic collision refusal, including dangling final links
    # No overwrite/cleanup/retry. A partial generation stays occupied on any failure.
    for n in FILES:
        with (target/n).open('x+b',buffering=0) as f:
            if f.write(data[n])!=len(data[n]):raise OSError('E_SHORT_WRITE')
            f.flush();os.fsync(f.fileno());f.seek(0)
            if f.read()!=data[n]:raise ValueError('E_SAME_HANDLE_READBACK')

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--synthetic',action='store_true');x=a.parse_args();raise SystemExit(install(synthetic=x.synthetic))
