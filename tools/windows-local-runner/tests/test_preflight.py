"""Linux run of preflight TEST-01..07. TEST-08 is Windows and is not run."""
import hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
PRE = ROOT / 'preflight.py'
PY = sys.executable


def crlf_rejects(parent):
    root = parent / 'crlf-root'
    root.mkdir()
    manifest = json.loads((ROOT / 'runner_manifest.json').read_text(encoding='utf-8'))
    for name in manifest['files']:
        data = (ROOT / name).read_bytes()
        if name == 'install.py':
            data = data.replace(b'\n', b'\r\n')
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    (root / 'runner_manifest.json').write_bytes((ROOT / 'runner_manifest.json').read_bytes())
    log = parent / 'crlf-log'
    proc = subprocess.run(
        [PY, '-B', str(PRE), 'run', '--root', str(root), '--task', 'runner_ok', '--campaign', 'crlf', '--run-id', 'crlf001', '--store', 'runs', '--log', str(log)],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert proc.returncode == 3, proc.stderr.decode()
    body = json.loads(proc.stdout.decode())
    assert body['error'] == 'E_SHA:install.py' and body['child_launches'] == 0
    assert b'E_SHA:install.py' in proc.stderr and b'"child_launches": 0' in proc.stderr
    evidence = json.loads((log / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['child_launches'] == 0 and evidence['error'] == 'E_SHA:install.py'
    assert not (root / 'runs').exists()
    return evidence


def attributes_keep_lf(parent):
    original = (ROOT / 'install.py').read_bytes()
    assert b'\r' not in original
    attr_line = (REPO / '.gitattributes').read_bytes()
    assert attr_line == b'tools/windows-local-runner/** -text\n'

    def make_repo(path, attributes):
        path.mkdir()
        subprocess.check_call(['git', '-C', str(path), 'init'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.check_call(['git', '-C', str(path), 'config', 'user.email', 'wlr@example.com'])
        subprocess.check_call(['git', '-C', str(path), 'config', 'user.name', 'wlr'])
        dest = path / 'tools' / 'windows-local-runner' / 'install.py'
        dest.parent.mkdir(parents=True)
        dest.write_bytes(original)
        if attributes:
            (path / '.gitattributes').write_bytes(attr_line)
        subprocess.check_call(['git', '-C', str(path), 'add', '--', '.'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.check_call(['git', '-C', str(path), 'commit', '-m', 'pin'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def clone(src, dest, config):
        argv = ['git']
        for item in config:
            argv.extend(['-c', item])
        argv.extend(['clone', Path(src).resolve().as_uri(), str(dest)])
        subprocess.check_call(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    with_attr = parent / 'attr-src'
    plain = parent / 'plain-src'
    make_repo(with_attr, True)
    make_repo(plain, False)
    kept = parent / 'attr-co'
    changed = parent / 'plain-co'
    clone(with_attr, kept, ['core.autocrlf=true', 'core.eol=crlf'])
    clone(plain, changed, ['core.autocrlf=true', 'core.eol=crlf'])
    forced = parent / 'plain-lf'
    clone(plain, forced, ['core.autocrlf=false', 'core.eol=lf'])
    return {
        'original': original,
        'with_attributes': (kept / 'tools' / 'windows-local-runner' / 'install.py').read_bytes(),
        'without_attributes': (changed / 'tools' / 'windows-local-runner' / 'install.py').read_bytes(),
        'explicit_lf': (forced / 'tools' / 'windows-local-runner' / 'install.py').read_bytes(),
    }


def main():
    parent = Path(tempfile.mkdtemp(prefix='wlr-preflight-'))
    work = parent / 'work'
    argv = [PY, '-B', str(PRE), 'test', '--run-id', 'mvp001', '--work', str(work)]
    proc = subprocess.run(argv, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    evidence = json.loads((work / 'logs' / 'mvp001' / 'evidence.json').read_text(encoding='utf-8'))
    tests = evidence['tests']
    assert proc.returncode == 0, proc.stderr.decode()
    for name in ('TEST-01', 'TEST-02', 'TEST-03', 'TEST-04', 'TEST-05', 'TEST-06', 'TEST-07'):
        assert tests[name]['pass'] is True, (name, tests[name])
    assert tests['TEST-08']['windows'] == 'NOT_RUN' and tests['TEST-08']['pass'] is None
    assert tests['TEST-07']['schema_error'] == 'E_LEDGER_SCHEMA'
    assert tests['TEST-07']['schema_exit'] == 3 and tests['TEST-07']['schema_child_launches'] == 0
    assert tests['TEST-07']['schema_bytes_equal'] is True
    assert tests['TEST-07']['schema_positive']['child_launches'] == 1
    manifest = json.loads((ROOT / 'runner_manifest.json').read_text(encoding='utf-8'))
    for name in ('preflight.py', 'BOOTSTRAP.ps1'):
        data = (ROOT / name).read_bytes()
        assert manifest['files'][name]['size'] == len(data)
        assert manifest['files'][name]['sha256'] == hashlib.sha256(data).hexdigest()
    raw = (work / 'logs' / 'TEST-02' / 'stdout.bin').read_bytes()
    assert raw == b'Runner OK\n' and len(raw) == 10
    run_evidence = json.loads((work / 'logs' / 'TEST-02' / 'evidence.json').read_text(encoding='utf-8'))
    assert len(run_evidence['commit_sha']) == 40
    assert run_evidence['argv'] and run_evidence['cwd']
    assert run_evidence['started_at_taipei'] and run_evidence['ended_at_taipei']
    assert run_evidence['receiver_sha256']['payloads/runner_ok.py']
    assert (work / 'logs' / 'TEST-02' / 'stderr.bin').is_file()
    assert (work / 'logs' / 'TEST-02' / 'child_launches.txt').read_bytes() == b'1\n'
    assert (work / 'logs' / 'TEST-03-exit3' / 'stdout.bin').read_bytes() == b''
    assert (work / 'logs' / 'TEST-03-exit3' / 'stderr.bin').read_bytes() == b''
    assert (work / 'logs' / 'TEST-03-stderr' / 'stderr.bin').read_bytes() == b'stderr-only\n'
    for name in ('TEST-05', 'TEST-06', 'TEST-07'):
        row = tests[name]
        assert row['child_launches'] == 0
        assert row['tree_hash_equal'] is True
        assert row['ledger_equal'] is True
        assert row['positive_control']['child_launches'] == 1
        assert (work / 'logs' / name / 'child_launches.txt').read_bytes() == b'0\n'
        assert not (work / 'logs' / name / 'stdout.bin').exists()
    assert len(evidence['commit_sha']) == 40
    assert evidence['python_vv']['text'].startswith('Python ')
    assert evidence['started_at_taipei'] and evidence['ended_at_taipei']
    assert evidence['windows_tools']['powershell'] == 'NOT_RUN'
    bootstrap = (ROOT / 'BOOTSTRAP.ps1').read_text(encoding='utf-8')
    assert 'checkout --detach' in bootstrap and 'https://github.com/swe2501/tw-stock-screener.git' in bootstrap
    assert '-c core.autocrlf=false -c core.eol=lf' in bootstrap
    assert 'WIN_RUNNER_MVP_STAGE_003' in bootstrap and 'WIN_RUNNER_MVP_WORK_003' in bootstrap and 'mvp003' in bootstrap
    assert 'PIN_COMMIT_SHA' not in bootstrap and 'Remove-Item' not in bootstrap and '--no-hardlinks' not in bootstrap
    assert '>' not in bootstrap and 'Out-File' not in bootstrap and 'x-access-token' not in bootstrap
    assert evidence['windows_tools']['git_pin_size'] == 46968
    assert evidence['windows_tools']['git_sha256_enforced'] is False
    assert evidence['windows_tools']['git_checked'] is False
    crlf_log = crlf_rejects(parent)
    attr = attributes_keep_lf(parent)
    assert crlf_log['child_launches'] == 0 and crlf_log['error'] == 'E_SHA:install.py'
    assert attr['with_attributes'] == attr['original'] and attr['without_attributes'] != attr['original']
    assert attr['explicit_lf'] == attr['original']
    assert b'\r\n' in attr['without_attributes'] and b'\r' not in attr['with_attributes']
    branch = subprocess.run([PY, '-B', str(PRE), 'pin-check', '--require-detached'], cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert branch.returncode == 3 and b'E_NOT_DETACHED' in branch.stderr
    occupied = work / 'occupied-stage'
    occupied.mkdir()
    (occupied / 'keep.txt').write_text('keep', encoding='ascii')
    blocked = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(occupied)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert blocked.returncode != 0 and (occupied / 'keep.txt').read_text(encoding='ascii') == 'keep'
    fresh = work / 'fresh-stage'
    cloned = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(fresh)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert cloned.returncode == 0, cloned.stderr.decode()
    full = subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], text=True).strip()
    assert len(full) == 40
    detached = subprocess.run(['git', '-C', str(fresh), 'checkout', '--detach', full], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert detached.returncode == 0, detached.stderr.decode()
    pinned = subprocess.run([PY, '-B', str(PRE), 'pin-check', '--require-detached', '--checkout', str(fresh)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert pinned.returncode == 0, pinned.stderr.decode()
    body = json.loads(pinned.stdout.decode())
    assert body['head'] == full and body['detached'] is True
    again = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(fresh)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert again.returncode != 0
    out = {
        'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
        'argv': argv, 'cwd': str(ROOT), 'exit': proc.returncode,
        'commit_sha': evidence['commit_sha'],
        'TEST-02_stdout_hex': raw.hex(), 'TEST-02_stdout_len': len(raw),
        'tests': {key: {'pass': tests[key]['pass']} for key in tests},
    }
    print(json.dumps(out))
    evidence_dir = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence_dir:
        dest = Path(evidence_dir)
        (dest / 'preflight-linux.json').write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
        (dest / 'preflight-linux.stdout').write_bytes(proc.stdout)
        (dest / 'preflight-linux.stderr').write_bytes(proc.stderr)
        (dest / 'preflight-linux-evidence.json').write_text((work / 'logs' / 'mvp001' / 'evidence.json').read_text(encoding='utf-8'), encoding='utf-8')
        (dest / 'preflight-test02-stdout.bin').write_bytes(raw)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
