# Native verification for Aiden

Windows has not been run. Do not treat a Linux rehearsal as a Windows result. Do not merge or deploy. `pipeline_go` stays false. Do not run a model task.

The runnable source is a new Git worktree at one commit, plus one external index file that is not inside that worktree. The delivered tar has no `.git`. `install.py` stops with `E_GIT_OBJECT` on that tree. Do not unpack the tar and call it the source.

Commit `5f5be6c` still contains an older copy of this file with a commit placeholder and `C:\path\outside`. Detach that commit, then follow the commands on this page.

## Fixed paths

Parent, must already exist, must be a directory, must not be a reparse point:

```text
C:\Users\User\Desktop\AI_RD_IMP
```

These four must have no directory entry yet, including a dangling link. If any entry exists, or the check fails, stop. Do not delete, rename, or retry on another path.

```text
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_ACCEPT_INDEX.py
```

Do not use `C:\Users\User\Desktop\AI型態判斷` or `D:\StockAI`.

## Why the previous index step was not a delivery

Telling Aiden to place an already downloaded file is not a create. CopyFromBox does not guarantee no-clobber, and a preflight listing is not an atomic create. The index is created by `deliver_external_index.py`. Its payload is the 945 index bytes. The program writes those bytes with an exclusive open and reads them back on the same handle. It does not execute the JSON.

The pipe in the withdrawn sequence is not an entry. On Linux Bash, a missing blob was `PIPE:128 0` and `BASH_LAST:0`, with stderr `bad file`, and no index. That measurement is not Windows PowerShell. Python exit 0 is not delivery.

The repaired writer blob is `9fa534201e61678698cdc29c8a30edbc00a0f0da` (5089 bytes, SHA-256 `9323c406040352938f58dad45e6299dfaa19337eca1e422b1fd4e69394d8e293`). Commit `08dffd8bb87a4329e0f2608b87d4a6a2c9ca9d2a` and blob `7894bc5b84c769994a324d98a1faaf464b4b31a9` are the previous writer, not this fix. Without `--dest` on Linux, the repaired writer exits 3 and prints JSON `E_DEST`, not a traceback.

## 1. Stop check, then clone

One stock Python check, using the interpreter already installed. It does not write the index. If the parent is missing, or any of the three names already has a directory entry, including a dangling link, it exits 3.

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -c "import os,stat,sys; p=r'C:\Users\User\Desktop\AI_RD_IMP'; s=os.lstat(p); assert not stat.S_ISLNK(s.st_mode) and stat.S_ISDIR(s.st_mode); names=['WIN_RUNNER_SOURCE_5f5be6c35bed','WIN_RUNNER_RELEASE_5f5be6c35bed.json','WIN_RUNNER_OPS02_v2','WIN_RUNNER_ACCEPT_INDEX.py']; assert not any(os.path.lexists(os.path.join(p,n)) for n in names); print('ABSENT')"
```

`os.path.lexists` is true for a dangling link. Any exception or a missing parent is a stop. This check is not the create.

## 2. Create the Git source

Git may create a missing parent. The check above must run first. Do not pass `--depth`. A shallow tip will not be this commit once the branch moves. If clone or checkout fails, stop. Do not delete a partial source and do not choose another directory.

Fetch the writer commit named in the pull request before detaching runtime. A clone of only `5f5be6c` does not contain the repaired writer. Do not use `--depth`.

```text
git clone --no-checkout --no-hardlinks https://github.com/swe2501/tw-stock-screener.git C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed fetch --no-tags origin 897362e7dd42ff477cb59ace5b04e81b001ea2da
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -t 9fa534201e61678698cdc29c8a30edbc00a0f0da
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -e 5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3^{commit}
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed checkout --detach 5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD
```

`rev-parse HEAD` must print exactly `5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3`. Then these blob ids must match before any repository Python runs:

```text
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/install.py
5cdfd24bf985573febe877be82adb24ea3df3bbd
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/runner.py
079d7d832f507558f4ee585389ffc64fbfada17b
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/worker.py
e0ff01aae364236c0b77c1a03af30599af605836
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/run_config.json
d80e8e79fd50c1cf1cecc3ecacec85b74958dad1
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/source_pin.json
7d640de56b002fecee6a465e8a694a481bd0a917
```

`git fetch` of that commit writes `FETCH_HEAD` only. `git log --all` does not read `FETCH_HEAD`, so an empty log does not mean the blob is missing. The gate now checks `git rev-parse d33b0a41e126cd17c24edd0dd0df10cd302eabbd:tools/windows-local-runner/deliver_external_index.py`. Do not pipe `cat-file` into Python and do not use shell `>` to create the gate. PowerShell `>` is `Out-File` and can overwrite; that behavior was read from documentation, not from a Windows run.

The complete first command is below. cwd is `C:\Users\User\Desktop\AI_RD_IMP`. Python is `C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe`. Quoting is one PowerShell 5.1 single-quoted here-string; it does not expand `$`. That quoting was not executed on Windows and is not PowerShell proof. The `-c` payload is 3119 bytes, SHA-256 `85b98822af10dc35d4dac582dd10a2771101205cf9172dcdada0154e13e3d039`. The script is 3260 bytes, SHA-256 `0027e48a4013f789ca7c0c3d31a4d5383bf4fcfdc84ee36afe4b83468d4aab7c`. Fetch `897362e7dd42ff477cb59ace5b04e81b001ea2da`, confirm gate blob `b1e55bfd7d5d46fc0591cc69c55e8904cfb60f6e`, then detach `5f5be6c`. This process `os.execv`s the gate once. Do not start the gate again. A 4778-byte copy of an older materializer is not this command. This length is the whole check. No installed Git or PowerShell command is shorter and still does an exclusive raw create plus a SHA check before `os.execv`.

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -c @'
import hashlib,json,os,stat,subprocess,sys
R=r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed'
D=r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_ACCEPT_INDEX.py'
B=GATE_BLOB='b1e55bfd7d5d46fc0591cc69c55e8904cfb60f6e'
S=GATE_SIZE=7665
H=GATE_SHA256='0ad70dad694bca145338ac99c3a071966690462bf8cd2435b3f2ee3e3c401232'
def classify_gate(code,data):
 if code!=0:raise ValueError('E_GIT_UPSTREAM')
 if not data:raise ValueError('E_GIT_EMPTY')
 if len(data)!=S or hashlib.sha256(data).hexdigest()!=H:raise ValueError('E_GATE_BYTES')
 if hashlib.sha1(('blob %d\0'%len(data)).encode()+data).hexdigest()!=B:raise ValueError('E_GATE_BLOB')
 return data
def assert_absent(path):
 try:os.lstat(path)
 except FileNotFoundError:return
 except OSError as e:raise ValueError('E_UNKNOWN') from e
 raise ValueError('E_EXISTS')
def write_exclusive(dest,payload):
 fl=os.O_CREAT|os.O_EXCL|os.O_RDWR
 if hasattr(os,'O_NOFOLLOW'):fl|=os.O_NOFOLLOW
 if hasattr(os,'O_BINARY'):fl|=os.O_BINARY
 fd=os.open(dest,fl,0o600)
 try:
  if os.write(fd,payload)!=len(payload):raise OSError('E_SHORT_WRITE')
  os.fsync(fd);os.lseek(fd,0,0)
  if os.read(fd,len(payload)+1)!=payload:raise ValueError('E_READBACK')
 finally:os.close(fd)
def fetch_gate(repo):
 p=subprocess.run(['git','--no-pager','-C',repo,'cat-file','blob',B],stdout=subprocess.PIPE,stderr=subprocess.PIPE,shell=False)
 return classify_gate(p.returncode,p.stdout),p.returncode
def materialize(repo,dest):
 repo,dest=os.path.abspath(repo),os.path.abspath(dest)
 try:info=os.lstat(os.path.dirname(dest))
 except FileNotFoundError as e:raise ValueError('E_PARENT_MISSING') from e
 except OSError as e:raise ValueError('E_UNKNOWN') from e
 if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):raise ValueError('E_PARENT')
 assert_absent(dest)
 data,upstream=fetch_gate(repo)
 try:write_exclusive(dest,data)
 except FileExistsError as e:raise ValueError('E_EXISTS') from e
 return {'upstream_exit':upstream,'bytes':data,'executed':False}
def main(argv=None):
 try:
  a=list(sys.argv[1:] if argv is None else argv);fx=False;repo=dest=index=None;i=0
  while i<len(a):
   if a[i]=='--fixture-linux':fx=True
   elif a[i] in ('--repo','--dest','--index') and i+1<len(a):
    i+=1
    if a[i-1]=='--repo':repo=a[i]
    elif a[i-1]=='--dest':dest=a[i]
    else:index=a[i]
   else:raise ValueError('E_ARGUMENTS')
   i+=1
  if os.name=='nt':
   if fx:raise RuntimeError('E_FIXTURE_FLAG_ON_WINDOWS')
   repo=R if repo is None else repo;dest=D if dest is None else dest
   if os.path.normcase(os.path.abspath(dest))!=os.path.normcase(D):raise ValueError('E_DEST')
  elif not fx or repo is None or dest is None or index is None:raise ValueError('E_ARGUMENTS')
  materialize(repo,dest)
  cmd=[sys.executable,'-B',os.path.abspath(dest),'--source',os.path.abspath(repo)]
  if fx:cmd+=['--fixture-linux','--dest',os.path.abspath(index)]
  os.execv(sys.executable,cmd)
 except SystemExit:raise
 except Exception as e:
  print(json.dumps({'error':str(e),'type':type(e).__name__,'no_retry':True,'candidate_started':False}),file=sys.stderr);return 3
if __name__=='__main__':sys.exit(main())
'@
```

Stdout must show `transfer_ok` true, `python_starts` 1, `upstream_exit` 0, `index_size` 945, and `index_sha256` `0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19`. Exit 3 stops the sequence. Do not install. An existing index, a dangling link, or an older correct file is `E_EXISTS`: it is left in place and is not this attempt. A missing blob does not start the writer.

The archived pipe result `PIPE:128 0` and `BASH_LAST:0` is Linux Bash, not Windows PowerShell. The runtime outer-suite exit was not in the auditor export. R01 database bytes and the R02 snapshot were not exported. Those limits are not filled in here. Linux gate tests passed. Windows was not run.

## 3. Installer and one inert run

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed\tools\windows-local-runner\install.py' verify-index --synthetic --release-index 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed\tools\windows-local-runner\install.py' install --synthetic --release-index 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' verify --synthetic
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' run --synthetic --task normal --campaign demo001 --run-id r001 --store runs
```

Expected exits are 0, 0, 0, 0. `result.json` must show `actual_process_exit` 0 and `pipeline_go` false. The Windows install also requires Python 3.14.5, Git 2.46.1, machine `O211102`, and a DACL read-back. Any miss stops. A failed install leaves the partial leaf. Do not delete it and do not try another leaf.

One negative control, only after that normal run exited 0. This is not a retry of a failed command:

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' run --synthetic --task normal --campaign demo001 --run-id r002 --store runs
```

Expected exit is 3 and `E_DUPLICATE_STICKY_NO_RETRY`. There must be no second worker. Do not run `stop` in this pass. Do not run the `Invoke-Wlr*.ps1` files. They are not in the five-file index.
