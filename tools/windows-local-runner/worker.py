"""Only fixed inert fixture. No shell, subprocess, or model capability."""
import argparse, json, os, sys, time

TASK_MODE = {
    'normal': 'normal',
    'failure': 'failure',
    'deadline': 'wait',
    'stoppable': 'wait',
}

def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument('--task', choices=sorted(TASK_MODE), required=True)
    p.add_argument('--mode', choices=['normal', 'failure', 'wait'], required=True)
    p.add_argument('--run-id', required=True)
    a = p.parse_args(argv)
    if TASK_MODE[a.task] != a.mode:
        return 91
    if not a.run_id or any(c in a.run_id for c in '/\\'):
        return 91
    payload = {
        'pid': os.getpid(),
        'ppid': os.getppid(),
        'run_id': a.run_id,
        'task': a.task,
        'synthetic': True,
        'text': 'inert fixture',
        'cwd': os.getcwd(),
        'executable': sys.executable,
        'model': False,
    }
    sys.stdout.buffer.write((json.dumps(payload) + '\n').encode('ascii'))
    sys.stdout.buffer.flush()
    sys.stderr.buffer.write(b'FIXED_WORKER_STDERR\n')
    sys.stderr.buffer.flush()
    if a.mode == 'wait':
        time.sleep(2)
    return 7 if a.mode == 'failure' else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
