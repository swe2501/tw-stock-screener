"""Fixed inert NO-MODEL runner. Windows native acceptance is NOT_RUN here.

R01: an existing ledger is validated before reservation or spawn.
A wrong schema is rejected in place. It is not deleted, rebuilt, or migrated.
R02: pin and config are parsed only from the byte snapshots that were hashed.
"""
import argparse, datetime, hashlib, json, os, platform, re, sqlite3, stat, subprocess, sys, time
from pathlib import Path

BASE = Path(__file__).resolve().parent
VERSION = 'WIN-RUNNER-OPS.v2'
LEDGER_USER_VERSION = 2
TASKS = {'normal': 'normal', 'failure': 'failure', 'deadline': 'wait', 'stoppable': 'wait'}
PINNED = ('runner.py', 'worker.py', 'run_config.json')
IDENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,47}')
WIN_PYTHON = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
LIMITS = {
    'active_child_poll_deadline_enforced': True,
    'poll_granularity_seconds': 0.01,
    'deadline_is_hard_bound': False,
    'sqlite_connect_timeout_seconds': 5.0,
    'sqlite_timeout_is_lock_wait_not_task_retry': True,
    'cleanup_observation_seconds': 0.5,
    'cleanup_is_hard_interrupt': False,
    'whole_controller_hard_deadline': False,
    'popen_start_bounded': False,
    'fsync_bounded': False,
    'io_reads_bounded': False,
    'process_tree_containment': False,
    'tree_closed': 'NOT_PROVEN',
    'windows_job_object': False,
    'power_loss_durable': False,
    'secure_append_only': False,
    'namespace': 'install_root+store+campaign+task',
    'global_dedup': False,
    'training_ready': False,
    'dataset_quality': 'NOT_ASSESSED',
    'pipeline_go': False,
    'external_commit_checked_by_runner': False,
    'source_pin_is_external_authority': False,
}

def _guard(synthetic):
    if synthetic is not True:
        raise ValueError('E_SYNTHETIC_LITERAL_TRUE')

def _now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()

def _ident(value, code='E_IDENTIFIER'):
    if type(value) is not str or IDENT.fullmatch(value) is None:
        raise ValueError(code)
    return value

def _reject_reparse(path):
    cursor = path
    while True:
        try:
            info = cursor.lstat()
        except FileNotFoundError:
            parent = cursor.parent
            if parent == cursor:
                break
            cursor = parent
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('E_REPARSE')
        if cursor != path and not stat.S_ISDIR(info.st_mode):
            raise ValueError('E_REPARSE')
        parent = cursor.parent
        if parent == cursor:
            break
        cursor = parent
    return path

def _encoding(raw):
    if raw.startswith(b'\xef\xbb\xbf') or b'\r' in raw:
        raise ValueError('E_ENCODING')
    raw.decode('utf-8', errors='strict')

def _snapshot(path):
    _reject_reparse(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('E_SOURCE_ENTRY')
    # One read. Callers must parse this object and must not read the path again.
    return path.read_bytes()

def _bind(cfg):
    binding = cfg['platform_binding']
    if binding['cwd_policy'] != 'ABSOLUTE_INSTALL_ROOT' or not BASE.is_absolute():
        raise ValueError('E_CWD_BINDING')
    expected_root = binding['expected_install_root']
    if expected_root is not None:
        if type(expected_root) is not str:
            raise ValueError('E_CWD_BINDING')
        if os.path.normcase(str(Path(expected_root).resolve())) != os.path.normcase(str(BASE)):
            raise ValueError('E_CWD_BINDING')
    exe = Path(sys.executable).resolve()
    if not exe.is_absolute() or not exe.is_file():
        raise ValueError('E_PYTHON_BINDING')
    system = platform.system()
    if system == 'Windows':
        win = binding['windows']
        if os.path.normcase(str(exe)) != os.path.normcase(win['python_executable']):
            raise ValueError('E_PYTHON_BINDING')
        if platform.python_version() != win['python_version']:
            raise ValueError('E_PYTHON_VERSION')
        if platform.node() != win['machine_node']:
            raise ValueError('E_WRONG_MACHINE')
    elif system == 'Linux':
        fix = binding['linux_fixture']
        if fix['python_executable_policy'] != 'RESOLVED_SYS_EXECUTABLE' or fix['python_version_policy'] != 'RECORD_ACTUAL' or fix['windows_claim'] is not False:
            raise ValueError('E_PYTHON_BINDING')
        must = fix['resolved_python_must_equal']
        if must is not None and os.path.normcase(str(Path(must).resolve())) != os.path.normcase(str(exe)):
            raise ValueError('E_PYTHON_BINDING')
    else:
        raise ValueError('E_PLATFORM')
    return exe

def _validate_config(cfg):
    if set(cfg) != {'version', 'synthetic', 'tasks', 'cleanup_seconds', 'platform_binding'}:
        raise ValueError('E_CONFIG')
    if cfg['version'] != VERSION or cfg['synthetic'] is not True or type(cfg['cleanup_seconds']) is not float or cfg['cleanup_seconds'] != 0.5:
        raise ValueError('E_CONFIG')
    if set(cfg['tasks']) != set(TASKS):
        raise ValueError('E_TASK_ALLOWLIST')
    for name, row in cfg['tasks'].items():
        if set(row) != {'mode', 'deadline_seconds'} or row['mode'] != TASKS[name]:
            raise ValueError('E_TASK_CONFIG')
        if type(row['deadline_seconds']) is not float or not 0.1 <= row['deadline_seconds'] <= 2.0:
            raise ValueError('E_TASK_CONFIG')
    binding = cfg['platform_binding']
    if set(binding) != {'cwd_policy', 'expected_install_root', 'windows', 'linux_fixture'}:
        raise ValueError('E_CONFIG')
    win = binding['windows']
    if set(win) != {'python_executable', 'python_version', 'powershell_version', 'git_version', 'machine_node'}:
        raise ValueError('E_CONFIG')
    if win['python_executable'] != WIN_PYTHON or win['python_version'] != '3.14.5' or win['powershell_version'] != '5.1.19041.6456' or win['git_version'] != '2.46.1' or win['machine_node'] != 'O211102':
        raise ValueError('E_CONFIG')
    fix = binding['linux_fixture']
    if set(fix) != {'python_executable_policy', 'python_version_policy', 'windows_claim', 'resolved_python_must_equal'}:
        raise ValueError('E_CONFIG')
    _bind(cfg)

def verify(*, synthetic=False):
    _guard(synthetic)
    pin_raw = _snapshot(BASE / 'source_pin.json')
    _encoding(pin_raw)
    pin = json.loads(pin_raw.decode('ascii'))
    if set(pin) != {'schema', 'version', 'encoding', 'files'} or pin['schema'] != 'WIN.RUNNER.PIN.v2' or pin['version'] != VERSION or pin['encoding'] != 'UTF-8-no-BOM-LF':
        raise ValueError('E_PIN_FORMAT')
    if set(pin['files']) != set(PINNED):
        raise ValueError('E_SOURCE_ALLOWLIST')
    snapshots = {}
    for name, row in pin['files'].items():
        if set(row) != {'size', 'sha256'} or type(row['size']) is not int or not 0 < row['size'] < 262144 or re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is None:
            raise ValueError('E_PIN_ROW')
        raw = _snapshot(BASE / name)
        if len(raw) != row['size'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise ValueError('E_INTEGRITY:' + name)
        _encoding(raw)
        snapshots[name] = raw
    # Config and the reported pin identity both come from these snapshots, never a later path read.
    cfg = json.loads(snapshots['run_config.json'].decode('utf-8'))
    _validate_config(cfg)
    return cfg, hashlib.sha256(pin_raw).hexdigest()

def _store(relative):
    _ident(relative, 'E_PATH_ESCAPE')
    if Path(relative).name != relative or Path(relative).is_absolute():
        raise ValueError('E_PATH_ESCAPE')
    target = BASE / relative
    if not target.resolve().is_relative_to(BASE):
        raise ValueError('E_PATH_ESCAPE')
    _reject_reparse(target)
    target.mkdir(exist_ok=True)
    _reject_reparse(target)
    info = target.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise ValueError('E_PATH_ESCAPE')
    return target

def _columns(db, index_name):
    if re.fullmatch(r'[A-Za-z0-9_]+', index_name) is None:
        raise ValueError('E_LEDGER_SCHEMA')
    return [row[2] for row in db.execute('PRAGMA index_info(' + index_name + ')')]

def _validate_ledger(db):
    version = db.execute('PRAGMA user_version').fetchone()
    if version is None or version[0] != LEDGER_USER_VERSION:
        raise ValueError('E_LEDGER_SCHEMA')
    tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    if tables != ['attempts']:
        raise ValueError('E_LEDGER_SCHEMA')
    info = list(db.execute('PRAGMA table_info(attempts)'))
    expected = [
        ('campaign', 'TEXT', 1, 1),
        ('task', 'TEXT', 1, 2),
        ('run_id', 'TEXT', 1, 0),
        ('status', 'TEXT', 1, 0),
        ('pid', 'INTEGER', 0, 0),
        ('created', 'TEXT', 1, 0),
        ('updated', 'TEXT', 1, 0),
        ('pin', 'TEXT', 1, 0),
        ('exit_code', 'INTEGER', 0, 0),
    ]
    got = [(row[1], str(row[2]).upper(), row[3], row[5]) for row in info]
    if got != expected:
        raise ValueError('E_LEDGER_SCHEMA')
    indexes = list(db.execute('PRAGMA index_list(attempts)'))
    if len(indexes) != 2:
        raise ValueError('E_LEDGER_SCHEMA')
    origins = {}
    for item in indexes:
        if len(item) < 5 or item[4]:
            raise ValueError('E_LEDGER_SCHEMA')
        origins.setdefault(item[3], []).append(item[1])
    if sorted(origins) != ['pk', 'u'] or len(origins['pk']) != 1 or len(origins['u']) != 1:
        raise ValueError('E_LEDGER_SCHEMA')
    if _columns(db, origins['pk'][0]) != ['campaign', 'task'] or _columns(db, origins['u'][0]) != ['run_id']:
        raise ValueError('E_LEDGER_SCHEMA')

def _ro_uri(path):
    return path.resolve().as_uri() + '?mode=ro&immutable=1'

def _validate_existing_readonly(path):
    _reject_reparse(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('E_LEDGER_SCHEMA')
    try:
        db = sqlite3.connect(_ro_uri(path), uri=True, timeout=5, isolation_level=None)
    except sqlite3.Error as exc:
        raise ValueError('E_LEDGER_SCHEMA') from exc
    try:
        _validate_ledger(db)
    finally:
        db.close()

def _create_ledger(path):
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    os.close(fd)
    db = sqlite3.connect(path, timeout=5, isolation_level=None)
    try:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('BEGIN IMMEDIATE')
        db.execute(
            'CREATE TABLE attempts('
            'campaign TEXT NOT NULL, task TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, '
            'pid INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL, pin TEXT NOT NULL, exit_code INTEGER, '
            'PRIMARY KEY(campaign, task), UNIQUE(run_id))'
        )
        db.execute('PRAGMA user_version=2')
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        db.close()
        raise
    db.close()
    _validate_existing_readonly(path)

def _prepare_ledger(path):
    for suffix in ('-journal', '-wal', '-shm'):
        side = Path(str(path) + suffix)
        if side.exists() or side.is_symlink():
            _reject_reparse(side)
    if path.exists() or path.is_symlink():
        _validate_existing_readonly(path)
        return
    try:
        _create_ledger(path)
    except BaseException:
        # A partial new file, if any, stays where it is. No delete and no second path.
        raise

def _connect_rw(path):
    db = sqlite3.connect(path, timeout=5, isolation_level=None)
    db.execute('PRAGMA synchronous=FULL')
    return db

def _write_json(path, payload):
    data = (json.dumps(payload, ensure_ascii=True, indent=2) + '\n').encode('ascii')
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    try:
        if os.write(fd, data) != len(data):
            raise OSError('E_SHORT_WRITE')
        os.fsync(fd)
    finally:
        os.close(fd)

def _update(db, campaign, task, status, pid=None, code=None):
    db.execute('BEGIN IMMEDIATE')
    try:
        cur = db.execute(
            'UPDATE attempts SET status=?, pid=COALESCE(?, pid), exit_code=?, updated=? '
            'WHERE campaign=? AND task=? AND status IN (\'RESERVED\', \'RUNNING\')',
            (status, pid, code, _now(), campaign, task),
        )
        if cur.rowcount != 1:
            raise ValueError('E_LEDGER_TRANSITION')
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise

def _child_env():
    env = {'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONNOUSERSITE': '1', 'PYTHONSAFEPATH': '1', 'PYTHONIOENCODING': 'utf-8'}
    for key in ('PATH', 'SYSTEMROOT', 'WINDIR', 'PATHEXT', 'HOME', 'LANG', 'LC_ALL', 'TMP', 'TEMP', 'TMPDIR'):
        if key in os.environ:
            env[key] = os.environ[key]
    return env

def _windows_field():
    return 'NOT_RUN' if platform.system() != 'Windows' else 'LOCAL_PROCESS_NOT_AUDITOR_ACCEPTANCE'

def run(task, campaign, run_id, *, store='runs', synthetic=False):
    _guard(synthetic)
    _ident(campaign)
    _ident(run_id)
    if task not in TASKS:
        raise ValueError('E_TASK_ALLOWLIST')
    cfg, pin = verify(synthetic=True)
    exe = _bind(cfg)
    deadline = cfg['tasks'][task]['deadline_seconds']
    cleanup = cfg['cleanup_seconds']
    root = _store(store)
    db_path = root / 'ledger.sqlite3'
    _prepare_ledger(db_path)
    db = _connect_rw(db_path)
    child = None
    folder = root / run_id
    try:
        db.execute('BEGIN IMMEDIATE')
        try:
            _validate_ledger(db)
            db.execute(
                'INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',
                (campaign, task, run_id, 'RESERVED', None, _now(), _now(), pin, None),
            )
            db.execute('COMMIT')
        except sqlite3.IntegrityError:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise ValueError('E_DUPLICATE_STICKY_NO_RETRY')
        except BaseException:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise
        try:
            _reject_reparse(folder)
            folder.mkdir(exist_ok=False)
            argv = [str(exe), '-B', str(BASE / 'worker.py'), '--task', task, '--mode', TASKS[task], '--run-id', run_id]
            _write_json(folder / 'reservation.json', {
                'version': VERSION, 'campaign': campaign, 'task': task, 'run_id': run_id,
                'pin_sha256': pin, 'reserved_at_asia_taipei': _now(), 'argv': argv,
                'shell': False, 'cwd': str(BASE), 'attempts': 1, 'retries': 0,
            })
            out_flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
            if hasattr(os, 'O_NOFOLLOW'):
                out_flags |= os.O_NOFOLLOW
            out_fd = os.open(folder / 'stdout.bin', out_flags, 0o600)
            err_fd = os.open(folder / 'stderr.bin', out_flags, 0o600)
            out = os.fdopen(out_fd, 'wb', buffering=0)
            err = os.fdopen(err_fd, 'wb', buffering=0)
            try:
                started = time.monotonic()
                child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=out, stderr=err, shell=False, cwd=str(BASE), env=_child_env())
                _update(db, campaign, task, 'RUNNING', child.pid)
                _write_json(folder / 'launch.json', {
                    'pid': child.pid, 'controller_pid': os.getpid(), 'retained_popen': True,
                    'started_monotonic': started, 'at_asia_taipei': _now(), 'argv': argv,
                    'cwd': str(BASE), 'python_executable': str(exe),
                    'identity_limit': 'retained own Popen; not Windows Job/tree identity proof',
                })
                status = None
                stop_reason = None
                while child.poll() is None:
                    signal = folder / 'STOP'
                    try:
                        signal.lstat()
                        requested = True
                    except FileNotFoundError:
                        requested = False
                    if requested:
                        status = 'STOPPED'
                        stop_reason = 'EXPLICIT_OWN_TASK_STOP'
                        break
                    if time.monotonic() - started >= deadline:
                        status = 'TIMED_OUT'
                        stop_reason = 'DEADLINE'
                        break
                    time.sleep(0.01)
                code = child.poll()
                if status is not None and code is None:
                    end = time.monotonic() + cleanup
                    child.terminate()
                    try:
                        code = child.wait(timeout=max(0.001, (end - time.monotonic()) / 2))
                    except subprocess.TimeoutExpired:
                        child.kill()
                        try:
                            code = child.wait(timeout=max(0.001, end - time.monotonic()))
                        except subprocess.TimeoutExpired:
                            status = 'CLEANUP_PENDING'
                            code = child.poll()
                if status is None:
                    status = 'SUCCEEDED' if code == 0 else 'FAILED'
                    stop_reason = 'NATURAL_EXIT'
                result = {
                    'version': VERSION, 'campaign': campaign, 'task': task, 'run_id': run_id,
                    'status': status, 'child_pid': child.pid, 'actual_process_exit': code,
                    'exit_source': 'SAME_RETAINED_POPEN_POLL_WAIT', 'stop_reason': stop_reason,
                    'at_asia_taipei': _now(), 'elapsed_seconds': time.monotonic() - started,
                    'tree_closed': 'NOT_PROVEN', 'Windows': _windows_field(), 'attempts': 1, 'retries': 0,
                    'limits': LIMITS, 'python_executable': str(exe), 'cwd': str(BASE),
                    'platform': platform.system(), 'python_version_observed': platform.python_version(),
                    'training_ready': False, 'dataset_quality': 'NOT_ASSESSED', 'pipeline_go': False,
                }
                out.flush()
                err.flush()
                os.fsync(out.fileno())
                os.fsync(err.fileno())
            finally:
                out.close()
                err.close()
            _write_json(folder / 'result.json', result)
            _update(db, campaign, task, status, code=code)
            print(json.dumps(result, ensure_ascii=True), flush=True)
            return 0 if status == 'SUCCEEDED' else 2
        except BaseException:
            if child is not None and child.poll() is None:
                try:
                    child.kill()
                    child.wait(timeout=0.5)
                except Exception:
                    pass
            observed = None if child is None else child.poll()
            try:
                _update(db, campaign, task, 'UNKNOWN', code=observed)
            except Exception:
                pass
            if folder.exists() and not (folder / 'error.json').exists():
                try:
                    _write_json(folder / 'error.json', {
                        'status': 'UNKNOWN', 'no_retry': True, 'tree_closed': 'NOT_PROVEN',
                        'actual_process_exit': observed, 'preserved_stdio': True,
                    })
                except Exception:
                    pass
            raise
    finally:
        db.close()

def stop(campaign, task, *, store='runs', synthetic=False):
    _guard(synthetic)
    _ident(campaign)
    if task not in TASKS:
        raise ValueError('E_TASK_ALLOWLIST')
    verify(synthetic=True)
    root = _store(store)
    path = root / 'ledger.sqlite3'
    if not path.exists():
        raise ValueError('E_STOP_NOT_RUNNING')
    _validate_existing_readonly(path)
    db = sqlite3.connect(_ro_uri(path), uri=True, timeout=5, isolation_level=None)
    try:
        row = db.execute('SELECT run_id, status FROM attempts WHERE campaign=? AND task=?', (campaign, task)).fetchone()
    finally:
        db.close()
    if row is None or row[1] != 'RUNNING':
        raise ValueError('E_STOP_NOT_RUNNING')
    _ident(row[0])
    folder = _reject_reparse(root / row[0])
    _write_json(folder / 'STOP', {'requested_at_asia_taipei': _now(), 'only_owned_task': True})
    print('STOP_REQUEST_RECORDED', flush=True)
    return 0

class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('E_ARGUMENTS')

def main(argv=None):
    parser = Parser(prog='runner.py')
    parser.add_argument('operation', choices=['run', 'stop', 'verify'])
    parser.add_argument('--synthetic', action='store_true')
    parser.add_argument('--task')
    parser.add_argument('--campaign')
    parser.add_argument('--run-id')
    parser.add_argument('--store', default='runs')
    try:
        args = parser.parse_args(argv)
        if args.operation == 'verify':
            cfg, pin = verify(synthetic=args.synthetic)
            print(json.dumps({
                'version': VERSION, 'result': 'INTEGRITY_OK', 'pin_sha256': pin,
                'normal_deadline_seconds': cfg['tasks']['normal']['deadline_seconds'],
                'Windows': _windows_field(), 'external_commit_checked_by_runner': False,
            }, ensure_ascii=True), flush=True)
            return 0
        if args.operation == 'stop':
            return stop(args.campaign, args.task, store=args.store, synthetic=args.synthetic)
        return run(args.task, args.campaign, args.run_id, store=args.store, synthetic=args.synthetic)
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__, 'no_retry': True}, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3

if __name__ == '__main__':
    sys.exit(main())
