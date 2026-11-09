"""Entry from one git checkout. The commit SHA is the trust root.

Windows has not been run. The five runtime files are not modified here.
"""
import hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
MANIFEST_NAME = 'runner_manifest.json'


def occupied(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return False
    return True


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_manifest(source):
    path = Path(source) / MANIFEST_NAME
    if not path.is_file() or path.is_symlink():
        raise ValueError('E_MANIFEST')
    doc = json.loads(path.read_bytes().decode('utf-8'))
    if doc.get('schema') != 'WIN.RUNNER.MVP_MANIFEST.v1' or not isinstance(doc.get('files'), dict):
        raise ValueError('E_MANIFEST')
    return doc


def check_tree(source, manifest):
    for name, row in manifest['files'].items():
        path = Path(source) / name
        if not path.is_file() or path.is_symlink():
            raise ValueError('E_MISSING:' + name)
        data = path.read_bytes()
        if len(data) != row['size'] or sha256(data) != row['sha256']:
            raise ValueError('E_SHA:' + name)
    return True


def copy_exclusive(src, dst):
    data = Path(src).read_bytes()
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(dst, flags, 0o600)
    try:
        if os.write(fd, data) != len(data):
            raise OSError('E_SHORT_WRITE')
        os.fsync(fd)
    finally:
        os.close(fd)
    return data


def stage_tree(source, manifest):
    stage = Path(tempfile.mkdtemp(prefix='wlr-mvp-'))
    for name in manifest['files']:
        received = copy_exclusive(Path(source) / name, stage / name)
        if sha256(received) != sha256((Path(source) / name).read_bytes()):
            raise ValueError('E_STAGE:' + name)
    return stage


def deliver(source, target):
    source = Path(source)
    target = Path(target)
    if occupied(target):
        raise ValueError('E_EXISTS')
    manifest = load_manifest(source)
    check_tree(source, manifest)
    stage = stage_tree(source, manifest)
    os.mkdir(target)
    for name in manifest['files']:
        copy_exclusive(stage / name, target / name)
        if sha256((target / name).read_bytes()) != sha256((source / name).read_bytes()):
            raise ValueError('E_STAGE:' + name)
    return {'staged': str(stage), 'target': str(target), 'files': sorted(manifest['files'])}


def run_runner(root, args):
    return subprocess.run(
        [sys.executable, '-B', str(Path(root) / 'runner.py'), *args],
        cwd=str(root), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )


def write_log(log_dir, run_id, argv, cwd, exit_code, stdout, stderr, extra):
    parent = Path(log_dir)
    if occupied(parent):
        raise ValueError('E_EXISTS')
    parent.mkdir()
    dest = parent / run_id
    dest.mkdir()
    (dest / 'argv.txt').write_text(json.dumps(argv) + '\n', encoding='utf-8')
    (dest / 'cwd.txt').write_text(str(cwd) + '\n', encoding='utf-8')
    (dest / 'exit.txt').write_text(str(exit_code) + '\n', encoding='utf-8')
    (dest / 'stdout.txt').write_bytes(stdout)
    (dest / 'stderr.txt').write_bytes(stderr)
    summary = {
        'run_id': run_id, 'argv': argv, 'cwd': str(cwd), 'exit': exit_code,
        'stdout_sha256': sha256(stdout), 'stderr_sha256': sha256(stderr),
    }
    summary.update(extra)
    (dest / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    return summary


def _copy_source(work):
    src = work / 'source'
    os.mkdir(src)
    manifest = load_manifest(BASE)
    for name in manifest['files']:
        copy_exclusive(BASE / name, src / name)
    copy_exclusive(BASE / MANIFEST_NAME, src / MANIFEST_NAME)
    return src


def run_tests(work, run_id, log_dir):
    work = Path(work)
    os.makedirs(work, exist_ok=True)
    src = _copy_source(work)
    target = work / 'target'
    delivered = deliver(src, target)
    results = {}
    start = run_runner(target, ['verify', '--synthetic'])
    results['TEST-01'] = {'exit': start.returncode, 'pass': start.returncode == 0}
    normal = run_runner(target, ['run', '--synthetic', '--task', 'normal', '--campaign', 'mvp', '--run-id', run_id + 'n', '--store', 'runs'])
    child_out = (target / 'runs' / (run_id + 'n') / 'stdout.bin').read_bytes()
    child_err = (target / 'runs' / (run_id + 'n') / 'stderr.bin').read_bytes()
    results['TEST-02'] = {
        'exit': normal.returncode,
        'pass': normal.returncode == 0 and b'inert fixture' in child_out and b'"task": "normal"' in child_out,
        'child_stdout': child_out.decode('ascii', 'replace').strip(),
        'note': 'frozen worker prints inert fixture JSON, not the literal Runner OK',
    }
    failure = run_runner(target, ['run', '--synthetic', '--task', 'failure', '--campaign', 'mvp', '--run-id', run_id + 'f', '--store', 'runs'])
    results['TEST-03'] = {
        'normal_exit': normal.returncode,
        'failure_exit': failure.returncode,
        'child_stdout_sha256': sha256(child_out),
        'child_stderr': child_err.decode('ascii', 'replace').strip(),
        'pass': normal.returncode == 0 and failure.returncode == 2 and b'FIXED_WORKER_STDERR' in child_err and b'"actual_process_exit": 7' in failure.stdout,
    }
    mismatched = False
    manifest = load_manifest(src)
    for name, row in manifest['files'].items():
        if sha256((target / name).read_bytes()) != row['sha256'] or sha256((src / name).read_bytes()) != row['sha256']:
            mismatched = True
    results['TEST-04'] = {'pass': not mismatched}
    missing_root = work / 'missing'
    os.mkdir(missing_root)
    for name in manifest['files']:
        if name != 'worker.py':
            copy_exclusive(src / name, missing_root / name)
    copy_exclusive(src / MANIFEST_NAME, missing_root / MANIFEST_NAME)
    missing_target = work / 'missing-target'
    missing_error = None
    try:
        deliver(missing_root, missing_target)
    except ValueError as exc:
        missing_error = str(exc)
    results['TEST-05'] = {'error': missing_error, 'pass': missing_error == 'E_MISSING:worker.py' and not occupied(missing_target)}
    bad_root = work / 'bad'
    os.mkdir(bad_root)
    for name in manifest['files']:
        data = (src / name).read_bytes()
        if name == 'worker.py':
            data = b'x' + data[1:]
        flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
        fd = os.open(bad_root / name, flags, 0o600)
        os.write(fd, data)
        os.close(fd)
    copy_exclusive(src / MANIFEST_NAME, bad_root / MANIFEST_NAME)
    bad_target = work / 'bad-target'
    ran = False
    bad_error = None
    try:
        deliver(bad_root, bad_target)
        ran = True
    except ValueError as exc:
        bad_error = str(exc)
    results['TEST-06'] = {'error': bad_error, 'pass': bad_error == 'E_SHA:worker.py' and ran is False and not occupied(bad_target)}
    dup = run_runner(target, ['run', '--synthetic', '--task', 'normal', '--campaign', 'mvp', '--run-id', run_id + 'n', '--store', 'runs'])
    folders = [p for p in (target / 'runs').iterdir() if p.is_dir()]
    results['TEST-07'] = {
        'exit': dup.returncode,
        'pass': dup.returncode == 3 and b'E_DUPLICATE_STICKY_NO_RETRY' in dup.stderr and len(folders) == 2,
    }
    results['TEST-08'] = {'windows': 'NOT_RUN', 'pass': None}
    extra = {'tests': results, 'delivered': delivered, 'windows': 'NOT_RUN'}
    summary = write_log(log_dir=work / 'logs', run_id=run_id, argv=sys.argv, cwd=Path.cwd(), exit_code=0 if all(item.get('pass') for item in results.values() if item.get('pass') is not None) else 1, stdout=json.dumps(results).encode('utf-8'), stderr=b'', extra=extra)
    print(json.dumps(summary, ensure_ascii=True), flush=True)
    return 0 if summary['exit'] == 0 else 1


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if not args or args[0] not in ('verify', 'deliver', 'test'):
            raise ValueError('E_ARGUMENTS')
        if args[0] == 'verify':
            check_tree(BASE, load_manifest(BASE))
            print(json.dumps({'result': 'MANIFEST_OK', 'windows': 'NOT_RUN'}), flush=True)
            return 0
        if args[0] == 'deliver':
            target = None
            i = 1
            while i < len(args):
                if args[i] == '--target' and i + 1 < len(args):
                    i += 1
                    target = args[i]
                else:
                    raise ValueError('E_ARGUMENTS')
                i += 1
            if target is None:
                raise ValueError('E_ARGUMENTS')
            print(json.dumps(deliver(BASE, target), ensure_ascii=True), flush=True)
            return 0
        run_id = None
        work = None
        i = 1
        while i < len(args):
            if args[i] == '--run-id' and i + 1 < len(args):
                i += 1
                run_id = args[i]
            elif args[i] == '--work' and i + 1 < len(args):
                i += 1
                work = args[i]
            else:
                raise ValueError('E_ARGUMENTS')
            i += 1
        if not run_id or not work:
            raise ValueError('E_ARGUMENTS')
        if occupied(work):
            raise ValueError('E_EXISTS')
        return run_tests(work, run_id, work)
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__, 'no_retry': True}, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3


if __name__ == '__main__':
    sys.exit(main())
