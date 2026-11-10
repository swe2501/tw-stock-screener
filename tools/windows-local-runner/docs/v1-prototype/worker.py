"""Only fixed inert fixture; no shell, subprocess, model or training capability."""
import argparse,json,os,sys,time
p=argparse.ArgumentParser();p.add_argument('--task',choices=['normal','failure','deadline','stoppable'],required=True);p.add_argument('--mode',choices=['normal','failure','wait'],required=True);p.add_argument('--run-id',required=True);a=p.parse_args()
if {'normal':'normal','failure':'failure','deadline':'wait','stoppable':'wait'}[a.task]!=a.mode:sys.exit(91)
print(json.dumps({'pid':os.getpid(),'ppid':os.getppid(),'run_id':a.run_id,'task':a.task,'synthetic':True,'text':'inert fixture'}),flush=True)
print('FIXED_WORKER_STDERR',file=sys.stderr,flush=True)
if a.mode=='wait':time.sleep(2)
sys.exit(7 if a.mode=='failure' else 0)
