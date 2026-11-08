"""Linux NO-MODEL regression for WIN-RUNNER-OPS.v2.

A v1 reproducer process exit of 0 means the defect was reproduced, not that the
repair passed. known_gaps v2 in docs/auditor-oracles is archived reference only:
its own full execution remains NOT_RUN and its paths are not this repository.
"""
import hashlib, importlib.util, json, os, shutil, signal, sqlite3, subprocess, sys, tempfile, time
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

PRODUCT = Path(__file__).resolve().parents[1]
V1 = PRODUCT / 'docs' / 'v1-prototype'
RUNTIME = ('runner.py', 'worker.py', 'run_config.json', 'source_pin.json')
RELEASE = ('install.py', 'runner.py', 'worker.py', 'run_config.json', 'source_pin.json')
V1_SHA = {
    'install_candidate.py': 'b66b495aa06e64f0e7111c09e6b5919ea2b61f54282522833e31fc98b882154c',
    'runner.py': 'fe176fee3e3daf3b94d36e14b8d1e4c267837af62ffa0722becd7f06faaa9dd6',
    'worker.py': '61dc434218434cc040646a9128daea6a2b28671856fb6be076494dcb042e82f4',
    'run_config.json': 'a5a9ddc820177def7d58160485da565caead3a5078992a493fb0086f279d9887',
    'source_pin.json': '26750f8d67ce6543f54bc3defe54f4db67472c605428eb2703b9cba6bd5cf768',
}
H = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
J = lambda p: json.loads(Path(p).read_text())
NOW = lambda: datetime.now(ZoneInfo('Asia/Taipei')).isoformat()
CHECKS = []
EVIDENCE = []
LAST_CLASS = None
STREAK = 0


def check(name, fn):
    global LAST_CLASS, STREAK
    try:
        detail = fn() or {}
        CHECKS.append({'case': name, 'PASS': True, 'detail': detail})
        print('PASS', name, flush=True)
        LAST_CLASS = None
        STREAK = 0
    except Exception as exc:
        kind = type(exc).__name__
        CHECKS.append({'case': name, 'PASS': False, 'error': kind + ': ' + str(exc)})
        print('FAIL', name, kind, exc, flush=True)
        STREAK = STREAK + 1 if LAST_CLASS == kind else 1
        LAST_CLASS = kind
        if STREAK >= 2:
            raise RuntimeError('STOP_FOR_RCA ' + kind)


def copy_files(src, dst, names):
    dst.mkdir(parents=True)
    for name in names:
        target = dst / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / name, target)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def invoke(base, args, timeout=6):
    cmd = [sys.executable, '-B', str(base / 'runner.py'), *args]
    started = time.monotonic()
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, cwd=base)
    EVIDENCE.append({'argv': cmd, 'exit': proc.returncode, 'elapsed_seconds': time.monotonic() - started, 'stdout': proc.stdout.decode('utf-8', 'replace'), 'stderr': proc.stderr.decode('utf-8', 'replace')})
    return proc


def shipped_pin():
    pin = J(PRODUCT / 'source_pin.json')
    assert set(pin['files']) == {'runner.py', 'worker.py', 'run_config.json'}
    for name, row in pin['files'].items():
        raw = (PRODUCT / name).read_bytes()
        assert len(raw) == row['size'] and H(PRODUCT / name) == row['sha256']
        assert not raw.startswith(b'\xef\xbb\xbf') and b'\r' not in raw
    pin_sha = H(PRODUCT / 'source_pin.json')
    assert "EXPECTED_SOURCE_PIN_SHA256 = '%s'" % pin_sha in (PRODUCT / 'install.py').read_text(encoding='utf-8')
    assert 'CREATE TABLE IF NOT EXISTS' not in (PRODUCT / 'runner.py').read_text(encoding='utf-8')
    assert 'DROP ' not in (PRODUCT / 'runner.py').read_text(encoding='utf-8')
    assert 'ALTER ' not in (PRODUCT / 'runner.py').read_text(encoding='utf-8')
    joined = '\n'.join((PRODUCT / name).read_text(encoding='utf-8') for name in ('runner.py', 'worker.py', 'install.py'))
    assert 'shell=True' not in joined and 'os.system' not in joined and 'Invoke-Expression' not in joined
    return {'source_pin_sha256': pin_sha, 'windows': 'NOT_RUN'}


def archive_bytes():
    for name, sha in V1_SHA.items():
        assert H(V1 / name) == sha
    text = (PRODUCT / 'docs' / 'auditor-oracles' / 'known_gaps_v2_status.json').read_text(encoding='utf-8')
    assert '"full_script_execution": "NOT_RUN"' in text
    return {'v1_unchanged': True, 'known_gaps_v2_full_execution': 'NOT_RUN', 'script_exit0_is_not_repair_pass': True}


def v1_r01_defect(tmp):
    d = tmp / 'v1-r01'
    copy_files(V1, d, ('runner.py', 'worker.py', 'run_config.json', 'source_pin.json'))
    store = d / 'state'
    store.mkdir()
    dbp = store / 'ledger.sqlite3'
    with sqlite3.connect(dbp) as db:
        db.execute('CREATE TABLE attempts(campaign TEXT,task TEXT,run_id TEXT,status TEXT,pid INTEGER,created TEXT,updated TEXT,pin TEXT,exit_code INTEGER)')
    before = dbp.read_bytes()
    exits = []
    for rid in ('one', 'two'):
        proc = invoke(d, ['run', '--synthetic', '--task', 'normal', '--campaign', 'same-task', '--run-id', rid, '--store', 'state'])
        exits.append(proc.returncode)
    launches = list(store.glob('*/launch.json'))
    with sqlite3.connect(dbp.as_uri() + '?mode=ro', uri=True) as db:
        rows = db.execute('SELECT campaign,task,run_id,status FROM attempts').fetchall()
    assert exits == [0, 0] and len(launches) == 2 and len(rows) == 2
    return {
        'meaning': 'v1 process exit 0 reproduces the defect; it is not a repair pass',
        'invariant': 'FAIL', 'exits': exits, 'launches': len(launches),
        'ledger_bytes_changed': dbp.read_bytes() != before,
    }


def v1_r02_defect(tmp):
    d = tmp / 'v1-r02'
    copy_files(V1, d, ('runner.py', 'worker.py', 'run_config.json', 'source_pin.json'))
    module = load_module(d / 'runner.py', 'v1_r02_defect')
    path = d / 'run_config.json'
    old = path.read_bytes()
    cfg = json.loads(old)
    cfg['tasks']['normal']['deadline_seconds'] = 2.0
    new = (json.dumps(cfg, indent=2) + '\n').encode()
    original = Path.read_bytes
    seen = []

    def swap(self):
        raw = original(self)
        if Path(self).resolve() == path.resolve() and not seen:
            seen.append(True)
            path.write_bytes(new)
        return raw

    with patch.object(Path, 'read_bytes', swap):
        accepted, _pin = module.verify(synthetic=True)
    assert seen and accepted['tasks']['normal']['deadline_seconds'] == 2.0
    assert H(path) != J(d / 'source_pin.json')['files']['run_config.json']['sha256']
    return {'meaning': 'v1 accepted unpinned deadline 2.0; defect reproduction is not a repair pass', 'invariant': 'FAIL', 'accepted_deadline': 2.0}


def v2_r01(tmp):
    d = tmp / 'v2-r01'
    copy_files(PRODUCT, d, RUNTIME)
    store = d / 'state'
    store.mkdir()
    dbp = store / 'ledger.sqlite3'
    with sqlite3.connect(dbp) as db:
        db.execute('CREATE TABLE attempts(campaign TEXT,task TEXT,run_id TEXT,status TEXT,pid INTEGER,created TEXT,updated TEXT,pin TEXT,exit_code INTEGER)')
    before = dbp.read_bytes()
    schema_before = sqlite3.connect(dbp).execute("SELECT sql FROM sqlite_master WHERE name='attempts'").fetchone()[0]
    exits = []
    for rid in ('first', 'second'):
        proc = invoke(d, ['run', '--synthetic', '--task', 'normal', '--campaign', 'same-task', '--run-id', rid, '--store', 'state'])
        exits.append(proc.returncode)
        assert b'E_LEDGER_SCHEMA' in proc.stderr
    after = dbp.read_bytes()
    with sqlite3.connect(dbp.as_uri() + '?mode=ro', uri=True) as db:
        rows = db.execute('SELECT * FROM attempts').fetchall()
        schema = db.execute("SELECT sql FROM sqlite_master WHERE name='attempts'").fetchone()[0]
        indexes = list(db.execute('PRAGMA index_list(attempts)'))
    assert exits[0] != 0 and exits[1] != 0
    assert after == before and schema == schema_before and rows == [] and indexes == []
    assert list(store.glob('*/launch.json')) == [] and list(store.glob('*/result.json')) == []
    assert dbp.exists()
    return {'invariant': 'PASS', 'exits': exits, 'launches': 0, 'db_bytes_unchanged': True, 'deleted': False, 'migrated': False}


def v2_r01_no_migration(tmp):
    d = tmp / 'v2-r01b'
    copy_files(PRODUCT, d, RUNTIME)
    store = d / 'state'
    store.mkdir()
    dbp = store / 'ledger.sqlite3'
    with sqlite3.connect(dbp) as db:
        db.execute('CREATE TABLE attempts(campaign TEXT NOT NULL, task TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, pid INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL, pin TEXT NOT NULL, exit_code INTEGER, PRIMARY KEY(campaign, task))')
    before = dbp.read_bytes()
    proc = invoke(d, ['run', '--synthetic', '--task', 'normal', '--campaign', 'camp', '--run-id', 'rid', '--store', 'state'])
    with sqlite3.connect(dbp.as_uri() + '?mode=ro', uri=True) as db:
        version = db.execute('PRAGMA user_version').fetchone()[0]
        indexes = list(db.execute('PRAGMA index_list(attempts)'))
    assert proc.returncode == 3 and dbp.read_bytes() == before and version == 0
    assert [item[3] for item in indexes] == ['pk']
    return {'user_version_unchanged': 0, 'unique_not_added': True}


def v2_r02(tmp):
    d = tmp / 'v2-r02'
    copy_files(PRODUCT, d, RUNTIME)
    module = load_module(d / 'runner.py', 'v2_r02')
    path = d / 'run_config.json'
    pin_path = d / 'source_pin.json'
    old = path.read_bytes()
    pin_before = pin_path.read_bytes()
    cfg = json.loads(old)
    cfg['tasks']['normal']['deadline_seconds'] = 2.0
    new = (json.dumps(cfg, indent=2) + '\n').encode()
    original_bytes = Path.read_bytes
    original_text = Path.read_text
    counts = {}

    def swap(self):
        counts[str(Path(self).resolve())] = counts.get(str(Path(self).resolve()), 0) + 1
        raw = original_bytes(self)
        if Path(self).resolve() == path.resolve() and counts[str(path.resolve())] == 1:
            path.write_bytes(new)
        return raw

    def no_text(self, *args, **kwargs):
        raise AssertionError('read_text is not part of the verified snapshot')

    with patch.object(Path, 'read_bytes', swap), patch.object(Path, 'read_text', no_text):
        accepted, reported = module.verify(synthetic=True)
    assert accepted == json.loads(old)
    assert accepted['tasks']['normal']['deadline_seconds'] == 1.0
    assert reported == hashlib.sha256(pin_before).hexdigest()
    assert pin_path.read_bytes() == pin_before
    assert path.read_bytes() == new
    assert H(path) != J(pin_path)['files']['run_config.json']['sha256']
    for name in RUNTIME:
        assert counts[str((d / name).resolve())] == 1
    return {'invariant': 'PASS', 'accepted_deadline': 1.0, 'pin_rewritten': False, 'unverified_deadline_accepted': False}


def v2_r02_run_uses_snapshot(tmp):
    d = tmp / 'v2-r02-run'
    copy_files(PRODUCT, d, RUNTIME)
    module = load_module(d / 'runner.py', 'v2_r02_run')
    path = d / 'run_config.json'
    pin_before = (d / 'source_pin.json').read_bytes()
    cfg = json.loads(path.read_bytes())
    cfg['tasks']['deadline']['deadline_seconds'] = 30.0
    new = (json.dumps(cfg, indent=2) + '\n').encode()
    original = Path.read_bytes

    def swap(self):
        raw = original(self)
        if Path(self).resolve() == path.resolve():
            path.write_bytes(new)
        return raw

    with patch.object(Path, 'read_bytes', swap):
        started = time.monotonic()
        code = module.run('deadline', 'snap', 'snap-run', store='state', synthetic=True)
        elapsed = time.monotonic() - started
    assert code == 2
    result = J(d / 'state' / 'snap-run' / 'result.json')
    assert result['status'] == 'TIMED_OUT' and result['actual_process_exit'] is not None and elapsed < 1.5
    assert (d / 'source_pin.json').read_bytes() == pin_before
    assert path.read_bytes() == new
    return {'status': result['status'], 'elapsed_seconds': elapsed, 'pin_unchanged': True, 'unverified_deadline_used': False}


def matrix(tmp):
    d = tmp / 'matrix'
    copy_files(PRODUCT, d, RUNTIME)
    pin_sha = H(d / 'source_pin.json')

    def args(task, campaign, rid, store='audit-store'):
        return ['run', '--synthetic', '--task', task, '--campaign', campaign, '--run-id', rid, '--store', store]

    def rows(store='audit-store'):
        with sqlite3.connect(d / store / 'ledger.sqlite3') as db:
            return [list(row) for row in db.execute('SELECT campaign,task,run_id,status,pid,pin,exit_code FROM attempts ORDER BY campaign,task')]

    def validate(rid, child, store='audit-store'):
        folder = d / store / rid
        result = J(folder / 'result.json')
        worker = J(folder / 'stdout.bin')
        launch = J(folder / 'launch.json')
        reservation = J(folder / 'reservation.json')
        assert result['actual_process_exit'] == child and result['child_pid'] == worker['pid'] == launch['pid']
        assert worker['ppid'] == launch['controller_pid'] and worker['run_id'] == rid
        assert (folder / 'stderr.bin').read_bytes() == b'FIXED_WORKER_STDERR\n'
        assert result['tree_closed'] == 'NOT_PROVEN' and result['exit_source'] == 'SAME_RETAINED_POPEN_POLL_WAIT'
        assert reservation['pin_sha256'] == pin_sha and reservation['retries'] == result['retries'] == 0
        assert Path(worker['cwd']).resolve() == d.resolve()
        assert Path(worker['executable']).resolve() == Path(sys.executable).resolve()
        return result

    proc = invoke(d, ['verify', '--synthetic'])
    assert proc.returncode == 0 and b'INTEGRITY_OK' in proc.stdout
    proc = invoke(d, args('normal', 'campaign-normal', 'normal'))
    assert proc.returncode == 0 and json.loads(proc.stdout)['actual_process_exit'] == 0
    validate('normal', 0)
    proc = invoke(d, args('failure', 'campaign-failure', 'failure'))
    assert proc.returncode == 2
    assert validate('failure', 7)['actual_process_exit'] == 7
    before = rows()
    files = {path.name: H(path) for path in (d / 'audit-store' / 'normal').iterdir() if path.is_file()}
    proc = invoke(d, args('normal', 'campaign-normal', 'different-run-id'))
    assert proc.returncode == 3 and b'E_DUPLICATE_STICKY_NO_RETRY' in proc.stderr
    assert rows() == before and not (d / 'audit-store' / 'different-run-id').exists()
    assert files == {path.name: H(path) for path in (d / 'audit-store' / 'normal').iterdir() if path.is_file()}
    proc = invoke(d, args('deadline', 'campaign-deadline', 'deadline'))
    assert proc.returncode == 2
    result = J(d / 'audit-store' / 'deadline' / 'result.json')
    assert result['status'] == 'TIMED_OUT' and result['actual_process_exit'] is not None and result['limits']['deadline_is_hard_bound'] is False
    cmd = [sys.executable, '-B', str(d / 'runner.py'), *args('stoppable', 'campaign-stop', 'stop')]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    observed = None
    try:
        end = time.monotonic() + 1.2
        while time.monotonic() < end:
            try:
                launch = J(d / 'audit-store' / 'stop' / 'launch.json')
                worker = J(d / 'audit-store' / 'stop' / 'stdout.bin')
                if launch['pid'] == worker['pid'] and launch['controller_pid'] == worker['ppid'] == proc.pid:
                    stat_text = Path('/proc', str(launch['pid']), 'stat').read_text()
                    tail = stat_text.split(') ', 1)[1].split()
                    observed = {
                        'worker_pid': launch['pid'], 'proc_ppid': int(tail[1]),
                        'cwd': os.readlink('/proc/%s/cwd' % launch['pid']),
                        'exe': os.readlink('/proc/%s/exe' % launch['pid']),
                    }
                    assert observed['proc_ppid'] == proc.pid
                    assert Path(observed['cwd']).resolve() == d.resolve()
                    assert Path(observed['exe']).resolve() == Path(sys.executable).resolve()
                    break
            except (FileNotFoundError, json.JSONDecodeError, ProcessLookupError):
                pass
            time.sleep(0.01)
        assert observed, 'OWN_FIXTURE_IDENTITY_NOT_OBSERVED'
        stop = invoke(d, ['stop', '--synthetic', '--task', 'stoppable', '--campaign', 'campaign-stop', '--store', 'audit-store'])
        assert stop.returncode == 0
        out, err = proc.communicate(timeout=4)
        assert proc.returncode == 2 and J(d / 'audit-store' / 'stop' / 'result.json')['status'] == 'STOPPED'
        EVIDENCE.append({'argv': cmd, 'exit': proc.returncode, 'stdout': out.decode('utf-8', 'replace'), 'stderr': err.decode('utf-8', 'replace')})
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.communicate(timeout=2)
    active = []
    try:
        for rid in ('race-a', 'race-b'):
            cmd = [sys.executable, '-B', str(d / 'runner.py'), *args('normal', 'campaign-race', rid)]
            active.append(subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE))
        codes = []
        for proc in active:
            proc.communicate(timeout=5)
            codes.append(proc.returncode)
        assert sorted(codes) == [0, 3]
        assert len([row for row in rows() if row[0] == 'campaign-race']) == 1
        assert len(list((d / 'audit-store').glob('race-*/launch.json'))) == 1
    finally:
        for proc in active:
            if proc.poll() is None:
                proc.kill()
                proc.communicate(timeout=2)
    before = rows()
    for task, label in (('train', 'train'), ('sh -c anything', 'shell')):
        proc = invoke(d, args(task, 'deny-' + label, label))
        assert proc.returncode == 3 and rows() == before and not (d / 'audit-store' / label).exists()
    proc = invoke(d, ['verify'])
    assert proc.returncode == 3
    for kind in ('size', 'hash', 'version', 'encoding', 'task'):
        copy = tmp / ('negative-' + kind)
        copy_files(d, copy, RUNTIME)
        pin = J(copy / 'source_pin.json')
        if kind == 'size':
            (copy / 'worker.py').write_bytes((copy / 'worker.py').read_bytes() + b'\n# size fixture\n')
        elif kind == 'hash':
            raw = (copy / 'worker.py').read_bytes()
            assert raw.startswith(b'"""Only')
            (copy / 'worker.py').write_bytes(raw.replace(b'Only', b'only', 1))
        elif kind == 'version':
            pin['version'] = 'AUDITOR_WRONG_VERSION'
        elif kind == 'encoding':
            raw = b'\xef\xbb\xbf' + (copy / 'worker.py').read_bytes()
            (copy / 'worker.py').write_bytes(raw)
            pin['files']['worker.py'] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        else:
            config = J(copy / 'run_config.json')
            config['tasks']['train'] = {'mode': 'normal', 'deadline_seconds': 1.0}
            raw = json.dumps(config).encode()
            (copy / 'run_config.json').write_bytes(raw)
            pin['files']['run_config.json'] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        if kind in ('version', 'encoding', 'task'):
            (copy / 'source_pin.json').write_text(json.dumps(pin, indent=2) + '\n', encoding='ascii')
        proc = invoke(copy, ['verify', '--synthetic'])
        assert proc.returncode == 3 and not (copy / 'runs').exists()
    before = rows()
    with sqlite3.connect(d / 'audit-store' / 'ledger.sqlite3') as db:
        db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)', ('campaign-reserved', 'normal', 'reserved-only', 'RESERVED', None, 'METADATA_ONLY', 'METADATA_ONLY', pin_sha, None))
    held = rows()
    proc = invoke(d, args('normal', 'campaign-reserved', 'reserved-again'))
    assert proc.returncode == 3 and rows() == held and not (d / 'audit-store' / 'reserved-again').exists()
    assert before != held
    proc = invoke(d, args('normal', 'campaign-normal', 'normal', 'different-store'))
    assert proc.returncode == 0
    validate('normal', 0, 'different-store')
    before = rows()
    proc = invoke(d, args('failure', 'new-campaign', 'normal'))
    assert proc.returncode == 3 and rows() == before
    proc = invoke(d, ['run', '--synthetic', '--task', 'normal', '--campaign', 'escape', '--run-id', 'r', '--store', '../outside'])
    assert proc.returncode == 3 and not (d.parent / 'outside').exists()
    link = d / 'dangling-store'
    link.symlink_to(d / 'not-created')
    proc = invoke(d, ['run', '--synthetic', '--task', 'normal', '--campaign', 'symlink', '--run-id', 'r', '--store', 'dangling-store'])
    assert proc.returncode == 3 and not (d / 'not-created').exists() and link.is_symlink()
    return {'cases': 'C01-C18 plus path and symlink', 'windows': 'NOT_RUN', 'owned_stop_cwd': observed['cwd']}


def binding_and_env(tmp):
    d = tmp / 'binding'
    copy_files(PRODUCT, d, RUNTIME)
    marker = tmp / 'python-startup-marker'
    startup = tmp / 'startup.py'
    startup.write_text('open(%r, "w").write("ran")\n' % str(marker), encoding='ascii')
    env = os.environ.copy()
    env['PYTHONSTARTUP'] = str(startup)
    env['PYTHONPATH'] = str(tmp)
    cmd = [sys.executable, '-B', str(d / 'runner.py'), 'run', '--synthetic', '--task', 'normal', '--campaign', 'envcamp', '--run-id', 'env-run', '--store', 'state']
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=6, env=env, cwd=d)
    assert proc.returncode == 0 and not marker.exists()
    wrong = tmp / 'wrong-python'
    copy_files(d, wrong, RUNTIME)
    cfg = J(wrong / 'run_config.json')
    cfg['platform_binding']['linux_fixture']['resolved_python_must_equal'] = '/tmp/not-the-real-python'
    raw = (json.dumps(cfg, indent=2) + '\n').encode()
    (wrong / 'run_config.json').write_bytes(raw)
    pin = J(wrong / 'source_pin.json')
    pin['files']['run_config.json'] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    (wrong / 'source_pin.json').write_text(json.dumps(pin, indent=2) + '\n', encoding='ascii')
    proc = invoke(wrong, ['run', '--synthetic', '--task', 'normal', '--campaign', 'pycamp', '--run-id', 'py-run', '--store', 'state'])
    assert proc.returncode == 3 and b'E_PYTHON_BINDING' in proc.stderr and not (wrong / 'state').exists()
    cwd_case = tmp / 'wrong-cwd'
    copy_files(d, cwd_case, RUNTIME)
    cfg = J(cwd_case / 'run_config.json')
    cfg['platform_binding']['expected_install_root'] = '/tmp/not-the-install-root'
    raw = (json.dumps(cfg, indent=2) + '\n').encode()
    (cwd_case / 'run_config.json').write_bytes(raw)
    pin = J(cwd_case / 'source_pin.json')
    pin['files']['run_config.json'] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    (cwd_case / 'source_pin.json').write_text(json.dumps(pin, indent=2) + '\n', encoding='ascii')
    proc = invoke(cwd_case, ['run', '--synthetic', '--task', 'normal', '--campaign', 'cwdcamp', '--run-id', 'cwd-run', '--store', 'state'])
    assert proc.returncode == 3 and b'E_CWD_BINDING' in proc.stderr and not (cwd_case / 'state').exists()
    return {'pythonstartup_ran': False, 'windows_python_path_checked': False}


def preserve_logs(tmp):
    d = tmp / 'preserve'
    copy_files(PRODUCT, d, RUNTIME)
    module = load_module(d / 'runner.py', 'preserve_logs')
    original_popen = module.subprocess.Popen

    def boom(*args, **kwargs):
        raise OSError('boom')

    module.subprocess.Popen = boom
    try:
        try:
            module.run('normal', 'preservecamp', 'preserve-run', store='state', synthetic=True)
            raise AssertionError('spawn failure must not return success')
        except OSError as exc:
            if str(exc) != 'boom':
                raise
    finally:
        module.subprocess.Popen = original_popen
    folder = d / 'state' / 'preserve-run'
    assert (folder / 'stdout.bin').exists() and (folder / 'stderr.bin').exists()
    with sqlite3.connect(d / 'state' / 'ledger.sqlite3') as db:
        status = db.execute("SELECT status FROM attempts WHERE campaign='preservecamp'").fetchone()[0]
    assert status == 'UNKNOWN'
    try:
        module.run('normal', 'preservecamp', 'other-run', store='state', synthetic=True)
        raise AssertionError('second run must stay rejected')
    except ValueError as exc:
        assert str(exc) == 'E_DUPLICATE_STICKY_NO_RETRY'
    assert (folder / 'stdout.bin').exists()
    return {'status': 'UNKNOWN', 'stdio_preserved': True, 'retried': False}


def controller_killed(tmp):
    d = tmp / 'crash'
    copy_files(PRODUCT, d, RUNTIME)
    cmd = [sys.executable, '-B', str(d / 'runner.py'), 'run', '--synthetic', '--task', 'stoppable', '--campaign', 'crashcamp', '--run-id', 'crash-run', '--store', 'state']
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    child = None
    try:
        end = time.monotonic() + 1.2
        while time.monotonic() < end:
            db_path = d / 'state' / 'ledger.sqlite3'
            if db_path.exists():
                try:
                    with sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True) as db:
                        row = db.execute("SELECT status,pid FROM attempts WHERE campaign='crashcamp'").fetchone()
                except sqlite3.Error:
                    row = None
                if row and row[0] == 'RUNNING':
                    child = row[1]
                    break
            time.sleep(0.01)
        assert child, 'RUNNING was not observed'
        os.kill(proc.pid, signal.SIGKILL)
        proc.wait(timeout=2)
        try:
            os.kill(child, 0)
            child_alive_after_controller_kill = True
        except OSError:
            child_alive_after_controller_kill = False
        again = invoke(d, ['run', '--synthetic', '--task', 'stoppable', '--campaign', 'crashcamp', '--run-id', 'crash-other', '--store', 'state'])
        with sqlite3.connect(d / 'state' / 'ledger.sqlite3') as db:
            status = db.execute("SELECT status FROM attempts WHERE campaign='crashcamp'").fetchone()[0]
            count = db.execute("SELECT count(*) FROM attempts WHERE campaign='crashcamp'").fetchone()[0]
        assert again.returncode == 3 and status == 'RUNNING' and count == 1
        result_path = d / 'state' / 'crash-run' / 'result.json'
        if result_path.exists():
            assert J(result_path).get('tree_closed') != True
        return {
            'controller_killed': True, 'child_alive_observed': child_alive_after_controller_kill,
            'tree_closed_by_runner': 'NOT_PROVEN', 'reentry': 'rejected', 'real_crash_replay': True,
        }
    finally:
        if proc.poll() is None:
            os.kill(proc.pid, signal.SIGKILL)
            proc.wait(timeout=2)
        if child:
            try:
                os.kill(child, signal.SIGKILL)
            except OSError:
                pass


def static_entries():
    for name in ('Invoke-WlrVerify.ps1', 'Invoke-WlrRun.ps1', 'Invoke-WlrStop.ps1'):
        raw = (PRODUCT / name).read_bytes()
        assert not raw.startswith(b'\xef\xbb\xbf') and b'\r' not in raw
        text = raw.decode('ascii')
        for token in ('Invoke-Expression', 'DownloadString', 'Invoke-WebRequest', 'cmd.exe', 'Start-Process', 'ExecutionPolicy', 'EncodedCommand', 'FromBase64', 'train', 'torch'):
            assert token not in text
        assert 'C:\\Users\\User\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe' in text
    return {'powershell_runtime': 'NOT_RUN', 'static_only': True}


def git_env(repo):
    env = os.environ.copy()
    env.update({'GIT_AUTHOR_NAME': 'wlr-test', 'GIT_AUTHOR_EMAIL': 'wlr-test@example.com', 'GIT_COMMITTER_NAME': 'wlr-test', 'GIT_COMMITTER_EMAIL': 'wlr-test@example.com'})
    return env


def make_repo(tmp):
    repo = tmp / 'repo'
    copy_files(PRODUCT, repo / 'tools' / 'windows-local-runner', RELEASE)
    env = git_env(repo)
    subprocess.run(['git', 'init'], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    subprocess.run(['git', 'add', '--', 'tools/windows-local-runner'], cwd=repo, check=True, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    subprocess.run(['git', '-c', 'user.name=wlr-test', '-c', 'user.email=wlr-test@example.com', 'commit', '-m', 'fixture'], cwd=repo, check=True, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return repo


def release_index(repo, dest, commit=None, mutate=None):
    files = {}
    for name in RELEASE:
        raw = (repo / 'tools' / 'windows-local-runner' / name).read_bytes()
        files[name] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    if mutate:
        mutate(files)
    if commit is None:
        commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo, check=True, stdout=subprocess.PIPE, text=True).stdout.strip()
    doc = {
        'schema': 'WIN.RUNNER.RELEASE_INDEX.v2', 'version': 'WIN-RUNNER-OPS.v2',
        'repository': 'https://github.com/swe2501/tw-stock-screener', 'prefix': 'tools/windows-local-runner/',
        'commit': commit, 'authority': 'EXTERNAL', 'files': files,
    }
    dest.write_bytes((json.dumps(doc, indent=2) + '\n').encode())
    return dest


def delivery(tmp):
    repo = make_repo(tmp / 'delivery')
    outside = tmp / 'outside'
    outside.mkdir()
    index = release_index(repo, outside / 'release-index.json')
    target = outside / 'inbox'
    cmd = [sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'install', '--synthetic', '--fixture-linux', '--release-index', str(index), '--target', str(target)]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert proc.returncode == 0, proc.stderr.decode()
    receipt = json.loads(proc.stdout)
    assert receipt['launched_tasks'] == 0 and receipt['permission_proof']['windows_acl_proven'] is False
    assert receipt['permission_proof']['windows_acl'] == 'NOT_RUN'
    assert receipt['permission_proof']['posix_dir_mode'] == '0700'
    assert not (target / 'runs').exists()
    mode = (target / 'runner.py').stat().st_mode & 0o777
    assert mode == 0o600
    run = invoke(target, ['run', '--synthetic', '--task', 'normal', '--campaign', 'demo001', '--run-id', 'r001', '--store', 'runs'])
    assert run.returncode == 0
    result = J(target / 'runs' / 'r001' / 'result.json')
    assert result['actual_process_exit'] == 0 and result['training_ready'] is False and result['pipeline_go'] is False
    assert Path(J(target / 'runs' / 'r001' / 'stdout.bin')['cwd']).resolve() == target.resolve()
    second = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert second.returncode == 3 and b'E_TARGET_EXISTS' in second.stderr
    assert H(target / 'runner.py') == H(repo / 'tools' / 'windows-local-runner' / 'runner.py')
    bad = release_index(repo, outside / 'bad-index.json', mutate=lambda files: files['worker.py'].update(sha256='ab' * 32))
    missing = outside / 'not-created-inbox'
    denied = subprocess.run([sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'install', '--synthetic', '--fixture-linux', '--release-index', str(bad), '--target', str(missing)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and not missing.exists()
    dummy = release_index(repo, outside / 'dummy-index.json', commit='1' * 40)
    dummy_target = outside / 'dummy-inbox'
    denied = subprocess.run([sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'verify-index', '--synthetic', '--release-index', str(dummy)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and b'E_COMMIT_FORMAT' in denied.stderr and not dummy_target.exists()
    insider = repo / 'tools' / 'windows-local-runner' / 'fake-index.json'
    release_index(repo, insider)
    denied = subprocess.run([sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'verify-index', '--synthetic', '--release-index', str(insider)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and b'E_INDEX_LOCATION' in denied.stderr
    denied = subprocess.run([sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'verify-index', '--synthetic', '--release-index', str(repo / 'tools' / 'windows-local-runner' / 'source_pin.json')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3
    (repo / 'tools' / 'windows-local-runner' / 'worker.py').write_bytes((repo / 'tools' / 'windows-local-runner' / 'worker.py').read_bytes() + b'\n')
    denied = subprocess.run([sys.executable, '-B', str(repo / 'tools' / 'windows-local-runner' / 'install.py'), 'verify-index', '--synthetic', '--release-index', str(index)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and (b'E_DIRTY' in denied.stderr or b'E_WORKTREE_BLOB' in denied.stderr)
    dangling = outside / 'dangling-inbox'
    dangling.symlink_to(outside / 'missing-referent')
    fresh = make_repo(tmp / 'delivery-dangling')
    fresh_index = release_index(fresh, outside / 'fresh-index.json')
    denied = subprocess.run([sys.executable, '-B', str(fresh / 'tools' / 'windows-local-runner' / 'install.py'), 'install', '--synthetic', '--fixture-linux', '--release-index', str(fresh_index), '--target', str(dangling)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and dangling.is_symlink() and not (outside / 'missing-referent').exists()
    orphan = outside / 'no-parent' / 'leaf'
    denied = subprocess.run([sys.executable, '-B', str(fresh / 'tools' / 'windows-local-runner' / 'install.py'), 'install', '--synthetic', '--fixture-linux', '--release-index', str(fresh_index), '--target', str(orphan)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    assert denied.returncode == 3 and not (outside / 'no-parent').exists()
    partial = outside / 'partial'
    partial.mkdir(mode=0o700)
    (partial / 'worker.py').mkdir()
    module = load_module(fresh / 'tools' / 'windows-local-runner' / 'install.py', 'install_partial')
    snapshots = {name: (fresh / 'tools' / 'windows-local-runner' / name).read_bytes() for name in ('runner.py', 'worker.py', 'run_config.json', 'source_pin.json')}
    try:
        module.write_exclusive_files(partial, snapshots)
        raise AssertionError('partial write must fail')
    except (OSError, NotADirectoryError, FileExistsError, IsADirectoryError):
        pass
    assert (partial / 'runner.py').is_file() and (partial / 'worker.py').is_dir() and not (partial / 'source_pin.json').exists()
    try:
        module.prove_private_windows_acl(partial)
        raise AssertionError('Linux must not prove Windows ACL')
    except RuntimeError as exc:
        assert str(exc) == 'E_WINDOWS_ACL_NOT_THIS_PLATFORM'
    return {'e2e_normal_exit': 0, 'windows_acl': 'NOT_RUN', 'inbox_reinstall': 'rejected', 'partial_preserved': True}


def main():
    evidence = Path(os.environ.get('WLR_EVIDENCE_DIR', '')) if os.environ.get('WLR_EVIDENCE_DIR') else None
    with tempfile.TemporaryDirectory(prefix='wlr-') as raw:
        tmp = Path(raw)
        steps = [
            ('shipped pin and installer dependency', shipped_pin),
            ('v1 archive bytes unchanged', archive_bytes),
            ('HISTORICAL v1 R01 defect reproduces; exit 0 is not a repair pass', lambda: v1_r01_defect(tmp)),
            ('HISTORICAL v1 R02 defect reproduces; accepted 2.0 is not a repair pass', lambda: v1_r02_defect(tmp)),
            ('v2 R01 rejects malformed ledger without delete or migration', lambda: v2_r01(tmp)),
            ('v2 R01 does not add a missing constraint', lambda: v2_r01_no_migration(tmp)),
            ('v2 R02 returns the verified config snapshot and does not repin', lambda: v2_r02(tmp)),
            ('v2 R02 run keeps the pinned deadline', lambda: v2_r02_run_uses_snapshot(tmp)),
            ('v2 normal matrix, duplicate, stop, race, deny, namespace', lambda: matrix(tmp)),
            ('v2 python cwd and startup bindings', lambda: binding_and_env(tmp)),
            ('v2 preserves stdio when spawn fails', lambda: preserve_logs(tmp)),
            ('v2 controller kill leaves the row sticky', lambda: controller_killed(tmp)),
            ('PowerShell entries static only', static_entries),
            ('git external index install and negative delivery', lambda: delivery(tmp)),
        ]
        try:
            for name, fn in steps:
                check(name, fn)
        except RuntimeError as exc:
            CHECKS.append({'case': 'STOPPED', 'PASS': False, 'error': str(exc)})
            print('STOP', exc, flush=True)
    failed = [item for item in CHECKS if not item['PASS']]
    summary = {
        'at_asia_taipei': NOW(), 'PASS': len(CHECKS) - len(failed), 'FAIL': len(failed), 'checks': CHECKS,
        'windows': 'NOT_RUN', 'powershell': 'NOT_RUN', 'training_ready': False, 'pipeline_go': False,
        'auditor_acceptance': 'NOT_CLAIMED', 'known_gaps_v2_full_execution': 'NOT_RUN',
        'v1_reproducer_exit0_meaning': 'defect reproduced, not repair pass',
        'independent_auditor': 'PENDING',
    }
    print(json.dumps({'PASS': summary['PASS'], 'FAIL': summary['FAIL'], 'windows': 'NOT_RUN'}, indent=2))
    if evidence:
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / 'linux-fixture-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        (evidence / 'linux-fixture-invocations.json').write_text(json.dumps(EVIDENCE, indent=2) + '\n')
    return 0 if not failed else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except RuntimeError:
        raise SystemExit(1)
