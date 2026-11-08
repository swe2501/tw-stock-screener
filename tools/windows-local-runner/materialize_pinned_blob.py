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
