"""Checkout entry. The trust root is one detached full commit SHA.

This file does not change the five frozen runtime files. Windows has not been run.
Child stdout and stderr are the raw pipe bytes, written with os.write.
"""
import datetime, hashlib, json, os, platform, re, shutil, sqlite3, subprocess, sys, tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
MANIFEST_NAME = 'runner_manifest.json'
IDENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,47}')
TASKS = {
    'runner_ok': 'payloads/runner_ok.py',
    'exit_3': 'payloads/exit_3.py',
    'stderr_only': 'payloads/stderr_only.py',
    'exception': 'payloads/exception.py',
    'resnet18_preflight': 'payloads/resnet18_preflight.py',
}
WIN_PYTHON = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
WIN_PYTHON_SIZE = 106208
WIN_PYTHON_SHA256 = '3adbbf2af609e206e3ca18cd55fc7c4b52f5c8bb8218dd99fd5a9e50d7a193cd'
WIN_GIT = r'C:\Program Files\Git\cmd\git.exe'
WIN_GIT_SHA256 = 'd90e36cafd656d52984f7546bfcb5b065d73e2e66957c952b7a4a1cd260e8f36'
REPO_PREFIX = 'tools/windows-local-runner/'
RUN_ID_SEMANTICS = 'A RunID is unique. (campaign, task) is one attempt ever. A different RunID for the same campaign and task is refused as a duplicate, by design.'
REPO_URL = 'https://github.com/swe2501/tw-stock-screener.git'
LEDGER_SQL = (
    'CREATE TABLE attempts('
    'campaign TEXT NOT NULL, task TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, '
    'pid INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL, pin TEXT NOT NULL, exit_code INTEGER, '
    'PRIMARY KEY(campaign, task), UNIQUE(run_id))'
)
EXIT_TABLE = {
    '0': 'payload exited 0; ledger status SUCCEEDED; runner returns 0',
    '2': 'payload exited nonzero; ledger status FAILED; actual_process_exit is the payload code; runner returns 2',
    '3': 'refused before the payload; child_launches 0; stderr JSON; no retry',
}
TERMINAL_STATES = ['SUCCEEDED', 'FAILED']
NONTERMINAL_STATES = ['RESERVED']


def occupied(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return False
    return True


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def taipei_now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()


def process_argv():
    return list(sys.orig_argv)


def git_bin():
    if os.name == 'nt':
        return WIN_GIT
    return 'git'


def ident(value):
    if type(value) is not str or IDENT.fullmatch(value) is None:
        raise ValueError('E_IDENTIFIER')
    return value


def rel_under(root, name):
    path = Path(name)
    if path.is_absolute() or not path.parts or any(part in ('', '.', '..') for part in path.parts):
        raise ValueError('E_MANIFEST')
    dest = root.joinpath(*path.parts)
    if occupied(dest) and dest.is_symlink():
        raise ValueError('E_REPARSE')
    return dest


def load_manifest(source):
    path = rel_under(Path(source), MANIFEST_NAME)
    if not path.is_file() or path.is_symlink():
        raise ValueError('E_MANIFEST')
    doc = json.loads(path.read_bytes().decode('utf-8'))
    if doc.get('schema') != 'WIN.RUNNER.MVP_MANIFEST.v1' or not isinstance(doc.get('files'), dict):
        raise ValueError('E_MANIFEST')
    return doc


def check_tree(source, manifest):
    source = Path(source)
    checked = {}
    for name, row in manifest['files'].items():
        path = rel_under(source, name)
        if not path.is_file() or path.is_symlink():
            raise ValueError('E_MISSING:' + name)
        data = path.read_bytes()
        if len(data) != row['size'] or sha256(data) != row['sha256']:
            raise ValueError('E_SHA:' + name)
        checked[name] = row['sha256']
    return checked


def write_new(path, data):
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    fd = os.open(path, flags, 0o600)
    try:
        view = memoryview(data)
        while view:
            wrote = os.write(fd, view)
            if wrote <= 0:
                raise OSError('E_SHORT_WRITE')
            view = view[wrote:]
        os.fsync(fd)
    finally:
        os.close(fd)


def copy_exclusive(src, dst):
    data = Path(src).read_bytes()
    dst.parent.mkdir(parents=True, exist_ok=True)
    write_new(dst, data)
    return data


def stage_tree(source, manifest):
    stage = Path(tempfile.mkdtemp(prefix='wlr-mvp-'))
    for name in manifest['files']:
        received = copy_exclusive(rel_under(Path(source), name), stage / name)
        if sha256(received) != sha256(rel_under(Path(source), name).read_bytes()):
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
        if sha256((target / name).read_bytes()) != sha256(rel_under(source, name).read_bytes()):
            raise ValueError('E_STAGE:' + name)
    copy_exclusive(source / MANIFEST_NAME, target / MANIFEST_NAME)
    return {'staged': str(stage), 'target': str(target), 'files': sorted(manifest['files'])}


def tree_hash(root):
    root = Path(root)
    rows = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames.sort()
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        rows.append('dir\t' + (rel_dir or '.'))
        for name in sorted(filenames):
            path = Path(dirpath) / name
            rel = path.relative_to(root).as_posix()
            if path.is_symlink():
                rows.append('link\t' + rel)
                continue
            data = path.read_bytes()
            rows.append('file\t' + rel + '\t' + str(len(data)) + '\t' + sha256(data))
    return sha256(('\n'.join(rows) + '\n').encode('utf-8'))


def _ledger_rows(path):
    path = Path(path)
    raw = path.read_bytes()
    scratch = Path(tempfile.mkdtemp(prefix='wlr-ledger-'))
    db = None
    try:
        copy = scratch / 'ledger.sqlite3'
        write_new(copy, raw)
        db = sqlite3.connect(copy, timeout=5, isolation_level=None)
        rows = list(db.execute(
            'SELECT campaign, task, run_id, status, exit_code FROM attempts ORDER BY campaign, task, run_id'
        ))
        return raw, rows
    finally:
        if db is not None:
            db.close()
        shutil.rmtree(scratch, ignore_errors=True)


def ledger_logical(path):
    path = Path(path)
    if not occupied(path):
        return None
    raw, rows = _ledger_rows(path)
    body = ''.join('%s|%s|%s|%s|%s\n' % row for row in rows).encode('utf-8')
    return {
        'rows': len(rows),
        'logical_sha256': sha256(body),
        'raw_sha256': sha256(raw),
    }


def _index_columns(db, index_name):
    if re.fullmatch(r'[A-Za-z0-9_]+', index_name) is None:
        raise ValueError('E_LEDGER_SCHEMA')
    return [row[2] for row in db.execute('PRAGMA index_info(' + index_name + ')')]


def validate_existing_ledger(path):
    path = Path(path)
    if not occupied(path):
        return
    raw = path.read_bytes()
    scratch = Path(tempfile.mkdtemp(prefix='wlr-ledger-'))
    db = None
    try:
        copy = scratch / 'ledger.sqlite3'
        write_new(copy, raw)
        db = sqlite3.connect(copy, timeout=5, isolation_level=None)
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        if tables != ['attempts']:
            raise ValueError('E_LEDGER_SCHEMA')
        version = db.execute('PRAGMA user_version').fetchone()
        if version is None or version[0] != 2:
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
        if _index_columns(db, origins['pk'][0]) != ['campaign', 'task'] or _index_columns(db, origins['u'][0]) != ['run_id']:
            raise ValueError('E_LEDGER_SCHEMA')
    finally:
        if db is not None:
            db.close()
        shutil.rmtree(scratch, ignore_errors=True)


def ledger_conflict(path, campaign, task, run_id):
    path = Path(path)
    if not occupied(path):
        return False
    _raw, rows = _ledger_rows(path)
    for camp, tsk, rid, _status, _code in rows:
        if rid == run_id or (camp == campaign and tsk == task):
            return True
    return False


def create_ledger(path):
    write_new(path, b'')
    db = sqlite3.connect(path, timeout=5, isolation_level=None)
    try:
        db.execute('PRAGMA journal_mode=DELETE')
        db.execute('PRAGMA synchronous=FULL')
        db.execute('BEGIN IMMEDIATE')
        db.execute(LEDGER_SQL)
        db.execute('PRAGMA user_version=2')
        db.execute('COMMIT')
    finally:
        db.close()


def head_state(checkout, require_detached):
    checkout = str(checkout)
    sym = subprocess.run([git_bin(), '-C', checkout, 'symbolic-ref', '-q', 'HEAD'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    detached = sym.returncode != 0
    if require_detached and not detached:
        raise ValueError('E_NOT_DETACHED')
    rev = subprocess.run([git_bin(), '-C', checkout, 'rev-parse', 'HEAD'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    text = rev.stdout.decode('ascii', 'replace').strip()
    if rev.returncode != 0 or len(text) != 40 or any(char not in '0123456789abcdef' for char in text):
        raise ValueError('E_GIT')
    return {'head': text, 'detached': detached, 'pin_source': 'git rev-parse HEAD', 'refused': ['branch name', 'short SHA', 'FETCH_HEAD']}


def checkout_root():
    proc = subprocess.run([git_bin(), '-C', str(BASE), 'rev-parse', '--show-toplevel'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise ValueError('E_GIT')
    return Path(proc.stdout.decode().strip())


def require_git_sha(digest):
    pin = load_manifest(BASE)['windows_tools']
    if pin.get('git_sha256_enforced') is not True or digest != pin.get('git_sha256') or digest != WIN_GIT_SHA256:
        raise ValueError('E_GIT')


def require_resolved_python(expected_path):
    exe = Path(sys.executable).resolve()
    try:
        want = Path(expected_path).resolve()
    except OSError:
        want = Path(expected_path)
    if os.path.normcase(str(exe)) != os.path.normcase(str(want)):
        raise ValueError('E_PYTHON')


def git_blob_id(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def ls_tree_blobs(checkout, rev):
    proc = subprocess.run([git_bin(), '-C', str(checkout), 'ls-tree', '-r', rev], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise ValueError('E_GIT')
    found = {}
    for line in proc.stdout.split(b'\n'):
        if not line:
            continue
        meta, path = line.split(b'\t', 1)
        found[path.decode('utf-8')] = meta.split()[-1].decode('ascii')
    return found


def bind_bytes(root, require_detached):
    root = Path(root)
    manifest_path = rel_under(root, MANIFEST_NAME)
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise ValueError('E_MANIFEST')
    manifest_bytes = manifest_path.read_bytes()
    head = head_state(checkout_root(), require_detached)
    blobs = ls_tree_blobs(checkout_root(), head['head'])
    if blobs.get(REPO_PREFIX + MANIFEST_NAME) != git_blob_id(manifest_bytes):
        raise ValueError('E_BLOB')
    manifest = json.loads(manifest_bytes.decode('utf-8'))
    if manifest.get('schema') != 'WIN.RUNNER.MVP_MANIFEST.v1' or not isinstance(manifest.get('files'), dict):
        raise ValueError('E_MANIFEST')
    checked = {}
    held = {}
    for name, row in manifest['files'].items():
        path = rel_under(root, name)
        if not path.is_file() or path.is_symlink():
            raise ValueError('E_MISSING:' + name)
        data = path.read_bytes()
        if len(data) != row['size'] or sha256(data) != row['sha256']:
            raise ValueError('E_SHA:' + name)
        if blobs.get(REPO_PREFIX + name) != git_blob_id(data):
            raise ValueError('E_BLOB')
        checked[name] = row['sha256']
        held[name] = data
    return manifest, checked, held, head


def windows_tools():
    pin = load_manifest(BASE)['windows_tools']
    reported = {
        'python_checked': False,
        'git_checked': False,
        'powershell': 'NOT_RUN',
        'python_pin_sha256': pin['python_sha256'],
        'python_pin_size': pin['python_size'],
        'python_pin_version': pin['python_version'],
        'git_pin_path': pin['git_path'],
        'git_pin_version': pin['git_version'],
        'git_pin_size': pin['git_size'],
        'git_sha256_enforced': pin['git_sha256_enforced'],
        'git_pin_sha256': pin.get('git_sha256'),
        'git_pin_source': pin['git_pin_source'],
        'python314_dll_recorded': False,
    }
    if os.name != 'nt':
        return reported
    data = Path(pin['python_path']).read_bytes()
    digest = sha256(data)
    if len(data) != pin['python_size'] or digest != pin['python_sha256'] or platform.python_version() != pin['python_version']:
        raise ValueError('E_PYTHON')
    if os.path.normcase(str(Path(sys.executable).resolve())) != os.path.normcase(str(Path(pin['python_path']).resolve())):
        raise ValueError('E_PYTHON')
    git_bytes = Path(pin['git_path']).read_bytes()
    git_digest = sha256(git_bytes)
    if len(git_bytes) != pin['git_size']:
        raise ValueError('E_GIT')
    require_git_sha(git_digest)
    dll = Path(pin['python_path']).with_name('python314.dll')
    reported['python314_dll_recorded'] = False
    if dll.is_file():
        dll_bytes = dll.read_bytes()
        reported['python314_dll_recorded'] = True
        reported['python314_dll_path'] = str(dll)
        reported['python314_dll_size'] = len(dll_bytes)
        reported['python314_dll_sha256'] = sha256(dll_bytes)
    git = subprocess.run([pin['git_path'], '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    git_text = git.stdout.decode('ascii', 'replace').strip()
    if git.returncode != 0 or not git_text.startswith('git version ' + pin['git_version']):
        raise ValueError('E_GIT')
    ps = subprocess.run(['powershell.exe', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if ps.returncode != 0:
        raise ValueError('E_POWERSHELL')
    reported.update({
        'python_checked': True,
        'python_sha256': digest,
        'python_size': len(data),
        'git_checked': True,
        'git_version': git_text,
        'git_size': len(git_bytes),
        'git_sha256': git_digest,
        'powershell': 'RAW',
        'powershell_argv': ['powershell.exe', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
        'powershell_exit': ps.returncode,
        'powershell_stdout': ps.stdout.decode('utf-8', 'replace'),
        'powershell_stderr': ps.stderr.decode('utf-8', 'replace'),
        'powershell_stdout_sha256': sha256(ps.stdout),
        'powershell_stderr_sha256': sha256(ps.stderr),
    })
    return reported


def python_vv():
    proc = subprocess.run([sys.executable, '-VV'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = proc.stdout.decode('utf-8', 'replace').strip()
    err = proc.stderr.decode('utf-8', 'replace').strip()
    return {
        'exit': proc.returncode,
        'stdout_sha256': sha256(proc.stdout),
        'stderr_sha256': sha256(proc.stderr),
        'stdout_text': out,
        'stderr_text': err,
        'text': out or err,
    }


def log_is_inside(root, log_dir):
    root_r = Path(root).resolve()
    log_r = Path(log_dir).resolve()
    return log_r == root_r or root_r in log_r.parents


def write_evidence(log_dir, payload, stdout, stderr):
    if type(payload.get('run_id')) is not str or payload['run_id'] == '':
        raise ValueError('E_RECORD')
    log_dir = Path(log_dir)
    if occupied(log_dir):
        raise ValueError('E_EXISTS')
    log_dir.mkdir()
    write_new(log_dir / 'argv.txt', (json.dumps(payload['argv']) + '\n').encode('ascii'))
    write_new(log_dir / 'cwd.txt', (payload['cwd'] + '\n').encode('utf-8'))
    write_new(log_dir / 'exit.txt', (str(payload['exit']) + '\n').encode('ascii'))
    if stdout is not None:
        write_new(log_dir / 'stdout.bin', stdout)
    if stderr is not None:
        write_new(log_dir / 'stderr.bin', stderr)
    write_new(log_dir / 'child_launches.txt', (str(payload['child_launches']) + '\n').encode('ascii'))
    write_new(log_dir / 'evidence.json', (json.dumps(payload, indent=2, sort_keys=True) + '\n').encode('ascii'))
    return payload


def run_task(root, task, campaign, run_id, store, log_dir, *, require_detached=None, marker_dir=None):
    root = Path(root)
    log_dir = Path(log_dir)
    started = taipei_now()
    if require_detached is None:
        require_detached = os.name == 'nt'
    tree_before = tree_hash(root)
    ledger_path = root / store / 'ledger.sqlite3'
    ledger_before = ledger_logical(ledger_path)
    child_stdout = None
    child_stderr = None
    launches = 0
    error = None
    actual = None
    status = None
    runner_exit = 3
    checked = None
    tools = None
    head = None
    vv = None
    marker_name = None
    try:
        if log_is_inside(root, log_dir):
            raise ValueError('E_LOG_INSIDE')
        ident(campaign)
        ident(run_id)
        ident(store)
        if task not in TASKS:
            raise ValueError('E_TASK')
        _manifest, checked, held, head = bind_bytes(root, require_detached)
        tools = windows_tools()
        vv = python_vv()
        payload_bytes = held[TASKS[task]]
        validate_existing_ledger(ledger_path)
        if ledger_conflict(ledger_path, campaign, task, run_id):
            raise ValueError('E_DUPLICATE_STICKY_NO_RETRY')
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        if not occupied(ledger_path):
            create_ledger(ledger_path)
        db = sqlite3.connect(ledger_path, timeout=5, isolation_level=None)
        try:
            db.execute('BEGIN IMMEDIATE')
            db.execute(
                'INSERT INTO attempts(campaign, task, run_id, status, pid, created, updated, pin, exit_code) VALUES(?,?,?,?,?,?,?,?,?)',
                (campaign, task, run_id, 'RESERVED', None, started, started, head['head'], None),
            )
            db.execute('COMMIT')
        except sqlite3.IntegrityError:
            if db.in_transaction:
                db.execute('ROLLBACK')
            db.close()
            raise ValueError('E_DUPLICATE_STICKY_NO_RETRY')
        child_cwd = str(root.resolve())
        if marker_dir is None:
            marker_dir = Path(tempfile.gettempdir()) / 'wlr-markers'
        marker_dir = Path(marker_dir)
        if log_is_inside(root, marker_dir):
            raise ValueError('E_MARKER_INSIDE')
        marker_dir.mkdir(parents=True, exist_ok=True)
        marker_name = campaign + '-' + task + '-' + run_id
        launches = 1
        env = os.environ.copy()
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        env['WLR_MARKER_DIR'] = str(marker_dir.resolve())
        env['WLR_MARKER_NAME'] = marker_name
        proc = subprocess.Popen([sys.executable, '-B', '-'], cwd=child_cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, shell=False)
        child_stdout, child_stderr = proc.communicate(payload_bytes)
        actual = proc.returncode
        status = 'SUCCEEDED' if actual == 0 else 'FAILED'
        runner_exit = 0 if actual == 0 else 2
        ended = taipei_now()
        db.execute('BEGIN IMMEDIATE')
        db.execute(
            'UPDATE attempts SET status=?, pid=?, exit_code=?, updated=? WHERE run_id=? AND status=?',
            (status, proc.pid, actual, ended, run_id, 'RESERVED'),
        )
        db.execute('COMMIT')
        db.close()
        folder = ledger_path.parent / run_id
        folder.mkdir()
        write_new(folder / 'stdout.bin', child_stdout)
        write_new(folder / 'stderr.bin', child_stderr)
    except ValueError as exc:
        if launches:
            raise
        error = str(exc)
        launches = 0
        runner_exit = 3
        child_stdout = None
        child_stderr = json.dumps({'error': error, 'no_retry': True, 'child_launches': 0, 'run_id': run_id}, ensure_ascii=True).encode('ascii')
        marker_name = None
        actual = None
        status = None
        ended = taipei_now()
    tree_after = tree_hash(root)
    ledger_after = ledger_logical(ledger_path)
    evidence = {
        'argv': process_argv(),
        'cwd': str(Path.cwd()),
        'child_argv': None if launches == 0 else [sys.executable, '-B', '-'],
        'marker_name': marker_name,
        'child_cwd': None if launches == 0 else str(root.resolve()),
        'exit': runner_exit,
        'actual_process_exit': actual,
        'status': status,
        'error': error,
        'child_launches': launches,
        'payload_started': launches == 1,
        'started_at_taipei': started,
        'ended_at_taipei': ended,
        'commit_sha': None if head is None else head['head'],
        'detached': None if head is None else head['detached'],
        'pin_source': None if head is None else head['pin_source'],
        'receiver_sha256': checked,
        'python_vv': vv,
        'windows_tools': tools,
        'tree_hash_before': tree_before,
        'tree_hash_after': tree_after,
        'tree_hash_equal': tree_before == tree_after,
        'ledger_before': ledger_before,
        'ledger_after': ledger_after,
        'ledger_equal': ledger_before == ledger_after,
        'stdout_sha256': None if child_stdout is None else sha256(child_stdout),
        'stderr_sha256': None if child_stderr is None else sha256(child_stderr),
        'stdout_len': None if child_stdout is None else len(child_stdout),
        'stderr_len': None if child_stderr is None else len(child_stderr),
        'capture': 'subprocess.PIPE then os.write; no shell and no PowerShell Out-File',
        'exit_table': EXIT_TABLE,
        'terminal_states': TERMINAL_STATES,
        'nonterminal_states': NONTERMINAL_STATES,
        'ledger_sql': LEDGER_SQL,
        'run_id_pattern': IDENT.pattern,
        'task': task,
        'campaign': campaign,
        'run_id': run_id,
        'run_id_semantics': RUN_ID_SEMANTICS,
        'store': store,
        'repository_url': REPO_URL,
        'credential': 'none',
        'windows': 'NOT_RUN' if os.name != 'nt' else 'RUN',
    }
    if not log_is_inside(root, log_dir):
        write_evidence(log_dir, evidence, child_stdout, child_stderr)
    return evidence


def verify(root, log_dir, run_id):
    root = Path(root)
    started = taipei_now()
    tree_before = tree_hash(root)
    _manifest, checked, _held, head = bind_bytes(root, os.name == 'nt')
    evidence = {
        'argv': process_argv(),
        'cwd': str(Path.cwd()),
        'exit': 0,
        'child_launches': 0,
        'payload_started': False,
        'run_id': run_id,
        'run_id_semantics': RUN_ID_SEMANTICS,
        'result': 'MANIFEST_OK',
        'commit_sha': head['head'],
        'detached': head['detached'],
        'pin_source': head['pin_source'],
        'receiver_sha256': checked,
        'python_vv': python_vv(),
        'windows_tools': windows_tools(),
        'started_at_taipei': started,
        'ended_at_taipei': taipei_now(),
        'tree_hash_before': tree_before,
        'tree_hash_after': tree_hash(root),
        'capture': 'no child; no shell redirection',
        'exit_table': EXIT_TABLE,
        'windows': 'NOT_RUN' if os.name != 'nt' else 'RUN',
    }
    evidence['tree_hash_equal'] = evidence['tree_hash_before'] == evidence['tree_hash_after']
    if log_dir is not None and not log_is_inside(root, log_dir):
        write_evidence(log_dir, evidence, None, None)
    return evidence


def run_tests(work, run_id):
    work = Path(work)
    work.mkdir()
    (work / 'logs').mkdir()
    src = work / 'source'
    src.mkdir()
    manifest = load_manifest(BASE)
    copy_exclusive(BASE / MANIFEST_NAME, src / MANIFEST_NAME)
    for name in manifest['files']:
        copy_exclusive(rel_under(BASE, name), src / name)
    target = work / 'target'
    delivered = deliver(src, target)
    results = {}
    markers = work / 'markers'
    markers.mkdir()
    verified = verify(target, work / 'logs' / 'TEST-01', run_id)
    git_negative = None
    try:
        require_git_sha('0' * 64)
    except ValueError as exc:
        git_negative = str(exc)
    git_positive = True
    try:
        require_git_sha(WIN_GIT_SHA256)
    except ValueError:
        git_positive = False
    python_negative = None
    try:
        require_resolved_python(r'C:\does-not-exist\python.exe')
    except ValueError as exc:
        python_negative = str(exc)
    python_positive = True
    try:
        require_resolved_python(sys.executable)
    except ValueError:
        python_positive = False
    write_evidence(work / 'logs' / 'TEST-01-git', {
        'argv': process_argv(), 'cwd': str(Path.cwd()), 'exit': 3, 'child_launches': 0,
        'run_id': run_id + 'git', 'error': git_negative,
    }, None, json.dumps({'error': git_negative, 'child_launches': 0, 'run_id': run_id + 'git'}).encode('ascii'))
    write_evidence(work / 'logs' / 'TEST-01-python', {
        'argv': process_argv(), 'cwd': str(Path.cwd()), 'exit': 3, 'child_launches': 0,
        'run_id': run_id + 'py', 'error': python_negative,
    }, None, json.dumps({'error': python_negative, 'child_launches': 0, 'run_id': run_id + 'py'}).encode('ascii'))
    results['TEST-01'] = {
        'run_id': run_id,
        'exit': verified['exit'],
        'child_launches': verified['child_launches'],
        'wrong_python': python_negative,
        'git_sha_negative': git_negative,
        'pass': verified['exit'] == 0 and verified['child_launches'] == 0 and verified['result'] == 'MANIFEST_OK' and verified['tree_hash_equal'] and python_negative == 'E_PYTHON' and python_positive and git_negative == 'E_GIT' and git_positive and len(list(markers.iterdir())) == 0,
    }
    normal = run_task(target, 'runner_ok', 'c02', run_id + 'ok', 's02', work / 'logs' / 'TEST-02', marker_dir=markers)
    expected = b'Runner OK\n' if os.name != 'nt' else b'Runner OK\r\n'
    raw = (work / 'logs' / 'TEST-02' / 'stdout.bin').read_bytes()
    results['TEST-02'] = {
        'run_id': run_id + 'ok',
        'exit': normal['exit'],
        'child_launches': normal['child_launches'],
        'stdout_len': len(raw),
        'stdout_sha256': sha256(raw),
        'stdout_hex': raw.hex(),
        'pass': normal['exit'] == 0 and normal['child_launches'] == 1 and raw == expected,
        'windows_expected_len': 11,
        'windows_expected_hex': b'Runner OK\r\n'.hex(),
        'windows_observed': os.name == 'nt',
    }
    exit3 = run_task(target, 'exit_3', 'c03', run_id + 'e3', 's03', work / 'logs' / 'TEST-03-exit3', marker_dir=markers)
    err_only = run_task(target, 'stderr_only', 'c03b', run_id + 'se', 's03b', work / 'logs' / 'TEST-03-stderr', marker_dir=markers)
    exploded = run_task(target, 'exception', 'c03c', run_id + 'ex', 's03c', work / 'logs' / 'TEST-03-exception', marker_dir=markers)
    raw_err = (work / 'logs' / 'TEST-03-stderr' / 'stderr.bin').read_bytes()
    raw_ex = (work / 'logs' / 'TEST-03-exception' / 'stderr.bin').read_bytes()
    results['TEST-03'] = {
        'run_id': run_id + 'e3',
        'exit3_runner_exit': exit3['exit'],
        'exit3_child': exit3['actual_process_exit'],
        'exit3_stdout_len': exit3['stdout_len'],
        'exit3_stderr_len': exit3['stderr_len'],
        'stderr_only_len': len(raw_err),
        'stderr_only_sha256': sha256(raw_err),
        'exception_child': exploded['actual_process_exit'],
        'exception_runner_exit': exploded['exit'],
        'pass': (
            exit3['exit'] == 2 and exit3['actual_process_exit'] == 3 and exit3['stdout_len'] == 0 and exit3['stderr_len'] == 0
            and err_only['exit'] == 0 and raw_err == b'stderr-only\n' and (work / 'logs' / 'TEST-03-stderr' / 'stdout.bin').read_bytes() == b''
            and exploded['exit'] == 2 and exploded['actual_process_exit'] == 1 and b'fixed-exception' in raw_ex and b'RuntimeError' in raw_ex
        ),
    }
    mismatched = False
    for name, row in manifest['files'].items():
        if sha256((target / name).read_bytes()) != row['sha256'] or sha256((src / name).read_bytes()) != row['sha256']:
            mismatched = True
    results['TEST-04'] = {'run_id': run_id + 't04', 'pass': not mismatched, 'files': sorted(manifest['files'])}
    missing = work / 'missing'
    missing.mkdir()
    copy_exclusive(src / MANIFEST_NAME, missing / MANIFEST_NAME)
    for name in manifest['files']:
        if name != 'payloads/runner_ok.py':
            copy_exclusive(src / name, missing / name)
    missing_run = run_task(missing, 'runner_ok', 'c05', run_id + 'miss', 's05', work / 'logs' / 'TEST-05', marker_dir=markers)
    def missing_one(label, filename, campaign, rid):
        root = work / label
        root.mkdir()
        copy_exclusive(src / MANIFEST_NAME, root / MANIFEST_NAME)
        for name in manifest['files']:
            if name != filename:
                copy_exclusive(src / name, root / name)
        before = sorted(p.name for p in markers.iterdir())
        result = run_task(root, 'runner_ok', campaign, rid, 's05x', work / 'logs' / label, marker_dir=markers)
        after = sorted(p.name for p in markers.iterdir())
        err = (work / 'logs' / label / 'stderr.bin').read_bytes()
        return result, before == after, err
    config_run, config_marks, config_err = missing_one('TEST-05-config', 'run_config.json', 'c05c', run_id + 'cfg')
    pin_run, pin_marks, pin_err = missing_one('TEST-05-pin', 'source_pin.json', 'c05n', run_id + 'pin')
    pos05 = work / 'pos05'
    deliver(src, pos05)
    pos05_run = run_task(pos05, 'runner_ok', 'c05p', run_id + 'mpos', 's05p', work / 'logs' / 'TEST-05-positive', marker_dir=markers)
    payload_err = (work / 'logs' / 'TEST-05' / 'stderr.bin').read_bytes()
    results['TEST-05'] = {
        'run_id': run_id + 'miss',
        'error': missing_run['error'],
        'child_launches': missing_run['child_launches'],
        'tree_hash_equal': missing_run['tree_hash_equal'],
        'ledger_equal': missing_run['ledger_equal'],
        'missing_config': config_run['error'],
        'missing_pin': pin_run['error'],
        'positive_control': {'child_launches': pos05_run['child_launches'], 'exit': pos05_run['exit'], 'stdout_len': pos05_run['stdout_len']},
        'pass': (
            missing_run['error'] == 'E_MISSING:payloads/runner_ok.py' and b'E_MISSING:payloads/runner_ok.py' in payload_err
            and missing_run['child_launches'] == 0 and missing_run['tree_hash_equal'] and missing_run['ledger_equal']
            and config_run['error'] == 'E_MISSING:run_config.json' and config_run['child_launches'] == 0 and config_marks and b'E_MISSING:run_config.json' in config_err
            and pin_run['error'] == 'E_MISSING:source_pin.json' and pin_run['child_launches'] == 0 and pin_marks and b'E_MISSING:source_pin.json' in pin_err
            and pos05_run['child_launches'] == 1 and pos05_run['exit'] == 0
        ),
    }
    bad = work / 'bad'
    bad.mkdir()
    copy_exclusive(src / MANIFEST_NAME, bad / MANIFEST_NAME)
    for name in manifest['files']:
        data = (src / name).read_bytes()
        if name == 'payloads/runner_ok.py':
            data = b'x' + data[1:]
        dest = bad / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        write_new(dest, data)
    bad_run = run_task(bad, 'runner_ok', 'c06', run_id + 'bad', 's06', work / 'logs' / 'TEST-06', marker_dir=markers)
    def planted(label, campaign, rid, mutate):
        root = work / label
        deliver(src, root)
        mutate(root)
        before = sorted(p.name for p in markers.iterdir())
        result = run_task(root, 'runner_ok', campaign, rid, 's06x', work / 'logs' / label, marker_dir=markers)
        after = sorted(p.name for p in markers.iterdir())
        err = (work / 'logs' / label / 'stderr.bin').read_bytes()
        return result, before == after, err
    def grow(root):
        path = root / 'payloads' / 'runner_ok.py'
        path.write_bytes(path.read_bytes() + b'\n')
    def swap(root):
        (root / 'payloads' / 'runner_ok.py').write_bytes((src / 'payloads' / 'exit_3.py').read_bytes())
    def pin_mismatch(root):
        path = root / 'source_pin.json'
        data = bytearray(path.read_bytes())
        data[0] ^= 1
        path.write_bytes(bytes(data))
    def combined(root):
        path = root / 'preflight.py'
        data = bytearray(path.read_bytes())
        data[0] ^= 1
        data = bytes(data)
        path.write_bytes(data)
        doc = json.loads((root / MANIFEST_NAME).read_text(encoding='utf-8'))
        doc['files']['preflight.py']['size'] = len(data)
        doc['files']['preflight.py']['sha256'] = sha256(data)
        (root / MANIFEST_NAME).write_text(json.dumps(doc, indent=2) + '\n', encoding='utf-8')
    size_run, size_marks, size_err = planted('TEST-06-size', 'c06s', run_id + 'sz', grow)
    swap_run, swap_marks, swap_err = planted('TEST-06-swap', 'c06w', run_id + 'sw', swap)
    pin_run6, pin_marks6, pin_err6 = planted('TEST-06-pin', 'c06n', run_id + 'pn', pin_mismatch)
    blob_run, blob_marks, blob_err = planted('TEST-06-blob', 'c06b', run_id + 'bb', combined)
    pos06 = work / 'pos06'
    deliver(src, pos06)
    pos06_run = run_task(pos06, 'runner_ok', 'c06p', run_id + 'bpos', 's06p', work / 'logs' / 'TEST-06-positive', marker_dir=markers)
    same_err = (work / 'logs' / 'TEST-06' / 'stderr.bin').read_bytes()
    results['TEST-06'] = {
        'run_id': run_id + 'bad',
        'error': bad_run['error'],
        'child_launches': bad_run['child_launches'],
        'tree_hash_equal': bad_run['tree_hash_equal'] and size_run['tree_hash_equal'] and swap_run['tree_hash_equal'] and pin_run6['tree_hash_equal'] and blob_run['tree_hash_equal'],
        'ledger_equal': bad_run['ledger_equal'] and size_run['ledger_equal'] and blob_run['ledger_equal'],
        'different_size': size_run['error'],
        'swapped': swap_run['error'],
        'pin_mismatch': pin_run6['error'],
        'combined_tamper': blob_run['error'],
        'positive_control': {'child_launches': pos06_run['child_launches'], 'exit': pos06_run['exit'], 'stdout_len': pos06_run['stdout_len']},
        'pass': (
            bad_run['error'] == 'E_SHA:payloads/runner_ok.py' and bad_run['child_launches'] == 0 and b'E_SHA:payloads/runner_ok.py' in same_err
            and size_run['error'] == 'E_SHA:payloads/runner_ok.py' and size_run['child_launches'] == 0 and size_marks and b'E_SHA:payloads/runner_ok.py' in size_err
            and swap_run['error'] == 'E_SHA:payloads/runner_ok.py' and swap_run['child_launches'] == 0 and swap_marks and b'E_SHA:payloads/runner_ok.py' in swap_err
            and pin_run6['error'] == 'E_SHA:source_pin.json' and pin_run6['child_launches'] == 0 and pin_marks6 and b'E_SHA:source_pin.json' in pin_err6
            and blob_run['error'] == 'E_BLOB' and blob_run['child_launches'] == 0 and blob_marks and b'E_BLOB' in blob_err
            and pos06_run['child_launches'] == 1 and pos06_run['exit'] == 0
        ),
    }
    dup_root = work / 'dup'
    deliver(src, dup_root)
    first = run_task(dup_root, 'runner_ok', 'c07', run_id + 'dup', 's07', work / 'logs' / 'TEST-07-positive', marker_dir=markers)
    second = run_task(dup_root, 'runner_ok', 'c07', run_id + 'dup', 's07', work / 'logs' / 'TEST-07', marker_dir=markers)
    ledger_file = dup_root / 's07' / 'ledger.sqlite3'
    before_other = ledger_file.read_bytes()
    before_marks = sorted(p.name for p in markers.iterdir())
    other_id = run_task(dup_root, 'runner_ok', 'c07', run_id + 'oth', 's07', work / 'logs' / 'TEST-07-other-id', marker_dir=markers)
    other_marks_equal = sorted(p.name for p in markers.iterdir()) == before_marks
    content_root = work / 'content'
    deliver(src, content_root)
    content_first = run_task(content_root, 'runner_ok', 'c07b', run_id + 'same', 's07b', work / 'logs' / 'TEST-07-content-positive', marker_dir=markers)
    content_second = run_task(content_root, 'exit_3', 'c07b', run_id + 'same', 's07b', work / 'logs' / 'TEST-07-content', marker_dir=markers)
    results['TEST-07'] = {
        'run_id': run_id + 'dup',
        'exit': second['exit'],
        'error': second['error'],
        'child_launches': second['child_launches'],
        'tree_hash_before': second['tree_hash_before'],
        'tree_hash_after': second['tree_hash_after'],
        'tree_hash_equal': second['tree_hash_equal'],
        'ledger_before': second['ledger_before'],
        'ledger_after': second['ledger_after'],
        'ledger_equal': second['ledger_equal'],
        'positive_control': {'child_launches': first['child_launches'], 'exit': first['exit'], 'stdout_len': first['stdout_len']},
        'other_run_id': other_id['error'],
        'other_bytes_equal': ledger_file.read_bytes() == before_other,
        'same_run_id_other_task': content_second['error'],
        'content_positive': {'child_launches': content_first['child_launches'], 'exit': content_first['exit']},
        'pass': first['child_launches'] == 1 and first['exit'] == 0 and second['child_launches'] == 0 and second['exit'] == 3 and second['error'] == 'E_DUPLICATE_STICKY_NO_RETRY' and second['tree_hash_equal'] and second['ledger_equal'] and other_id['error'] == 'E_DUPLICATE_STICKY_NO_RETRY' and other_id['child_launches'] == 0 and ledger_file.read_bytes() == before_other and other_marks_equal and content_first['child_launches'] == 1 and content_second['error'] == 'E_DUPLICATE_STICKY_NO_RETRY' and content_second['child_launches'] == 0 and b'E_DUPLICATE_STICKY_NO_RETRY' in (work / 'logs' / 'TEST-07' / 'stderr.bin').read_bytes(),
    }
    schema_root = work / 'schema'
    deliver(src, schema_root)
    schema_store = schema_root / 's07'
    schema_store.mkdir()
    schema_db = schema_store / 'ledger.sqlite3'
    bad_db = sqlite3.connect(schema_db)
    bad_db.execute('CREATE TABLE attempts(campaign TEXT, task TEXT, run_id TEXT, status TEXT, pid INTEGER, created TEXT, updated TEXT, pin TEXT, exit_code INTEGER)')
    bad_db.commit()
    bad_db.close()
    schema_before = schema_db.read_bytes()
    schema_run = run_task(schema_root, 'runner_ok', 'c07r01', 'run07r01', 's07', work / 'logs' / 'TEST-07-schema', marker_dir=markers)
    schema_pos = work / 'schema-pos'
    deliver(src, schema_pos)
    (schema_pos / 's07p').mkdir()
    create_ledger(schema_pos / 's07p' / 'ledger.sqlite3')
    schema_pos_run = run_task(schema_pos, 'runner_ok', 'c07p', run_id + 'schp', 's07p', work / 'logs' / 'TEST-07-schema-positive', marker_dir=markers)
    results['TEST-07']['schema_error'] = schema_run['error']
    results['TEST-07']['schema_exit'] = schema_run['exit']
    results['TEST-07']['schema_child_launches'] = schema_run['child_launches']
    results['TEST-07']['schema_bytes_equal'] = schema_db.read_bytes() == schema_before
    results['TEST-07']['schema_positive'] = {'child_launches': schema_pos_run['child_launches'], 'exit': schema_pos_run['exit']}
    results['TEST-07']['pass'] = results['TEST-07']['pass'] and schema_run['error'] == 'E_LEDGER_SCHEMA' and schema_run['exit'] == 3 and schema_run['child_launches'] == 0 and schema_db.read_bytes() == schema_before and schema_pos_run['child_launches'] == 1 and schema_pos_run['exit'] == 0
    results['TEST-08'] = {'run_id': run_id, 'windows': 'NOT_RUN', 'pass': None}
    missing_ids = []
    for name, item in results.items():
        if type(item.get('run_id')) is not str or item['run_id'] == '':
            missing_ids.append(name)
    for path in (work / 'logs').rglob('evidence.json'):
        doc = json.loads(path.read_text(encoding='utf-8'))
        if type(doc.get('run_id')) is not str or doc['run_id'] == '':
            missing_ids.append(str(path))
    passed = all(item.get('pass') is True for key, item in results.items() if key != 'TEST-08') and not missing_ids
    summary = {
        'run_id': run_id,
        'argv': sys.argv,
        'cwd': str(Path.cwd()),
        'exit': 0 if passed else 1,
        'tests': results,
        'delivered': delivered,
        'windows': 'NOT_RUN',
        'commit_sha': head_state(checkout_root(), False)['head'],
        'exit_table': EXIT_TABLE,
        'ledger_sql': LEDGER_SQL,
        'run_id_pattern': IDENT.pattern,
        'run_id_semantics': RUN_ID_SEMANTICS,
        'terminal_states': TERMINAL_STATES,
        'missing_run_id': missing_ids,
    }
    summary_dir = work / 'logs' / run_id
    write_evidence(summary_dir, {
        'argv': process_argv(),
        'cwd': str(Path.cwd()),
        'run_id': run_id,
        'run_id_semantics': RUN_ID_SEMANTICS,
        'exit': summary['exit'],
        'child_launches': 0,
        'commit_sha': summary['commit_sha'],
        'started_at_taipei': taipei_now(),
        'ended_at_taipei': taipei_now(),
        'tests': results,
        'windows': 'NOT_RUN',
        'python_vv': python_vv(),
        'windows_tools': windows_tools(),
        'exit_table': EXIT_TABLE,
        'ledger_sql': LEDGER_SQL,
        'pin_source': 'git rev-parse HEAD',
    }, json.dumps(results).encode('ascii'), b'')
    print(json.dumps({'exit': summary['exit'], 'commit_sha': summary['commit_sha'], 'windows': 'NOT_RUN'}, ensure_ascii=True), flush=True)
    return summary['exit']


def parse_pairs(args, names):
    found = {name: None for name in names}
    index = 0
    while index < len(args):
        if args[index] in names and index + 1 < len(args):
            found[args[index]] = args[index + 1]
            index += 2
            continue
        raise ValueError('E_ARGUMENTS')
    return found


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if not args or args[0] not in ('verify', 'deliver', 'run', 'test', 'pin-check'):
            raise ValueError('E_ARGUMENTS')
        if args[0] == 'pin-check':
            checkout = None
            require = False
            index = 1
            while index < len(args):
                if args[index] == '--require-detached':
                    require = True
                    index += 1
                elif args[index] == '--checkout' and index + 1 < len(args):
                    checkout = args[index + 1]
                    index += 2
                else:
                    raise ValueError('E_ARGUMENTS')
            state = head_state(Path(checkout) if checkout else checkout_root(), require)
            print(json.dumps(state, ensure_ascii=True), flush=True)
            return 0
        if args[0] == 'verify':
            evidence = verify(BASE, None, 'verify')
            print(json.dumps({'result': evidence['result'], 'commit_sha': evidence['commit_sha'], 'windows': evidence['windows']}, ensure_ascii=True), flush=True)
            return 0
        if args[0] == 'deliver':
            found = parse_pairs(args[1:], ('--target',))
            if not found['--target']:
                raise ValueError('E_ARGUMENTS')
            print(json.dumps(deliver(BASE, found['--target']), ensure_ascii=True), flush=True)
            return 0
        if args[0] == 'run':
            found = parse_pairs(args[1:], ('--root', '--task', '--campaign', '--run-id', '--store', '--log'))
            if any(found[key] is None for key in found):
                raise ValueError('E_ARGUMENTS')
            evidence = run_task(found['--root'], found['--task'], found['--campaign'], found['--run-id'], found['--store'], found['--log'])
            message = json.dumps({'exit': evidence['exit'], 'error': evidence['error'], 'child_launches': evidence['child_launches'], 'actual_process_exit': evidence['actual_process_exit']}, ensure_ascii=True)
            print(message, flush=True)
            if evidence['exit'] == 3:
                print(message, file=sys.stderr, flush=True)
            return evidence['exit']
        found = parse_pairs(args[1:], ('--run-id', '--work'))
        if not found['--run-id'] or not found['--work']:
            raise ValueError('E_ARGUMENTS')
        if occupied(found['--work']):
            raise ValueError('E_EXISTS')
        return run_tests(found['--work'], found['--run-id'])
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__, 'no_retry': True, 'child_launches': 0}, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3


if __name__ == '__main__':
    sys.exit(main())
