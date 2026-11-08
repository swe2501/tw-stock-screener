"""Linux rehearsal of the source bootstrap. Windows is not run.

The five runtime files stay the bytes of commit 5f5be6c. A tree without .git
cannot satisfy install.py. The published index digest authorizes that commit
only.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

COMMIT = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
INDEX_SHA = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
BLOBS = {
    'install.py': '5cdfd24bf985573febe877be82adb24ea3df3bbd',
    'runner.py': '079d7d832f507558f4ee585389ffc64fbfada17b',
    'worker.py': 'e0ff01aae364236c0b77c1a03af30599af605836',
    'run_config.json': 'd80e8e79fd50c1cf1cecc3ecacec85b74958dad1',
    'source_pin.json': '7d640de56b002fecee6a465e8a694a481bd0a917',
}
REPO = Path(__file__).resolve().parents[3]
PY = sys.executable
CHECKS = []


def run(cmd, cwd=None):
    proc = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def check(name, fn):
    try:
        detail = fn() or {}
        CHECKS.append({'case': name, 'PASS': True, 'detail': detail})
        print('PASS', name, flush=True)
    except Exception as exc:
        CHECKS.append({'case': name, 'PASS': False, 'error': type(exc).__name__ + ': ' + str(exc)})
        print('FAIL', name, exc, flush=True)
        raise


def published_index(dest):
    files = {}
    for name, blob in BLOBS.items():
        raw = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', COMMIT + ':tools/windows-local-runner/' + name])
        assert hashlib.sha256(raw).hexdigest()
        files[name] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        got = subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', COMMIT + ':tools/windows-local-runner/' + name], text=True).strip()
        assert got == blob
    doc = {
        'schema': 'WIN.RUNNER.RELEASE_INDEX.v2',
        'version': 'WIN-RUNNER-OPS.v2',
        'repository': 'https://github.com/swe2501/tw-stock-screener',
        'prefix': 'tools/windows-local-runner/',
        'commit': COMMIT,
        'authority': 'EXTERNAL',
        'files': files,
    }
    raw = (json.dumps(doc, indent=2) + '\n').encode()
    assert hashlib.sha256(raw).hexdigest() == INDEX_SHA
    assert len(raw) == 945
    dest.write_bytes(raw)
    return dest


def runtime_unchanged():
    root = REPO / 'tools' / 'windows-local-runner'
    for name in ('install.py', 'runner.py', 'worker.py', 'run_config.json', 'source_pin.json'):
        raw = (root / name).read_bytes()
        committed = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', COMMIT + ':tools/windows-local-runner/' + name])
        assert raw == committed
    return {'runtime_delta': 'none', 'commit': COMMIT}


def main():
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    with tempfile.TemporaryDirectory(prefix='wlr-boot-') as raw_tmp:
        tmp = Path(raw_tmp)
        index = published_index(tmp / 'release-index.json')

        def no_git():
            loose = tmp / 'loose' / 'tools' / 'windows-local-runner'
            loose.mkdir(parents=True)
            for name in BLOBS:
                blob = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', COMMIT + ':tools/windows-local-runner/' + name])
                (loose / name).write_bytes(blob)
            leaf = tmp / 'loose-leaf'
            code, _out, err = run([PY, '-B', str(loose / 'install.py'), 'verify-index', '--synthetic', '--release-index', str(index)])
            assert code == 3 and 'E_GIT_OBJECT' in err and not leaf.exists()
            return {'exit': code, 'error': 'E_GIT_OBJECT'}

        def sparse_source():
            source = tmp / 'WIN_RUNNER_SOURCE_5f5be6c35bed'
            code, _out, err = run(['git', 'clone', '--filter=blob:none', '--sparse', '--no-checkout', str(REPO), str(source)])
            assert code == 0, err
            assert run(['git', '-C', str(source), 'sparse-checkout', 'set', '--cone', 'tools/windows-local-runner'])[0] == 0
            assert run(['git', '-C', str(source), 'checkout', '--detach', COMMIT])[0] == 0
            head = run(['git', '-C', str(source), 'rev-parse', 'HEAD'])[1].strip()
            assert head == COMMIT
            for name, blob in BLOBS.items():
                got = run(['git', '-C', str(source), 'rev-parse', 'HEAD:tools/windows-local-runner/' + name])[1].strip()
                assert got == blob
            code, _out, err = run(['git', 'clone', '--filter=blob:none', '--sparse', '--no-checkout', str(REPO), str(source)])
            assert code != 0 and source.is_dir()
            assert run(['git', '-C', str(source), 'remote', 'set-url', 'origin', 'https://github.com/swe2501/tw-stock-screener.git'])[0] == 0
            install = source / 'tools' / 'windows-local-runner' / 'install.py'
            code, out, err = run([PY, '-B', str(install), 'verify-index', '--synthetic', '--release-index', str(index)])
            assert code == 0 and 'E_' not in err, err
            inside = source / 'inside-index.json'
            shutil.copyfile(index, inside)
            code, _out, err = run([PY, '-B', str(install), 'verify-index', '--synthetic', '--release-index', str(inside)])
            assert code == 3 and 'E_INDEX_LOCATION' in err
            marker = source / 'tools' / 'windows-local-runner' / 'docs' / 'TIP_ONLY.txt'
            marker.write_text('not the execution commit\n', encoding='ascii')
            assert run(['git', '-C', str(source), 'add', '--', 'tools/windows-local-runner/docs/TIP_ONLY.txt'])[0] == 0
            assert run(['git', '-C', str(source), '-c', 'user.name=wlr-test', '-c', 'user.email=wlr-test@example.com', 'commit', '-m', 'tip'])[0] == 0
            leaf = tmp / 'leaf-from-tip'
            code, _out, err = run([PY, '-B', str(install), 'install', '--synthetic', '--fixture-linux', '--release-index', str(index), '--target', str(leaf)])
            assert code == 3 and 'E_COMMIT_MISMATCH' in err and not leaf.exists()
            assert run(['git', '-C', str(source), 'checkout', '--detach', COMMIT])[0] == 0
            leaf = tmp / 'leaf'
            code, out, err = run([PY, '-B', str(install), 'install', '--synthetic', '--fixture-linux', '--release-index', str(index), '--target', str(leaf)])
            assert code == 0, err
            receipt = json.loads(out)
            assert receipt['launched_tasks'] == 0 and receipt['permission_proof']['windows_acl'] == 'NOT_RUN'
            code, out, err = run([PY, '-B', str(leaf / 'runner.py'), 'run', '--synthetic', '--task', 'normal', '--campaign', 'demo001', '--run-id', 'r001', '--store', 'runs'])
            assert code == 0, err
            result = json.loads(out)
            assert result['actual_process_exit'] == 0 and result['pipeline_go'] is False
            code, _out, err = run([PY, '-B', str(leaf / 'runner.py'), 'run', '--synthetic', '--task', 'normal', '--campaign', 'demo001', '--run-id', 'r002', '--store', 'runs'])
            assert code == 3 and 'E_DUPLICATE_STICKY_NO_RETRY' in err
            code, _out, err = run([PY, '-B', str(install), 'install', '--synthetic', '--fixture-linux', '--release-index', str(index), '--target', str(leaf)])
            assert code == 3 and 'E_TARGET_EXISTS' in err
            dangling = tmp / 'dangling-source'
            dangling.symlink_to(tmp / 'missing-referent')
            code, _out, err = run(['git', 'clone', '--sparse', '--no-checkout', str(REPO), str(dangling)])
            assert code != 0 and dangling.is_symlink() and not (tmp / 'missing-referent').exists()
            return {'head': head, 'normal_exit': 0, 'duplicate_exit': 3, 'windows': 'NOT_RUN'}

        check('runtime bytes still commit 5f5be6c', runtime_unchanged)
        check('archive without git is not a source', no_git)
        check('sparse git source, index digest, and occupied paths', sparse_source)
    failed = [item for item in CHECKS if not item['PASS']]
    summary = {'PASS': len(CHECKS) - len(failed), 'FAIL': len(failed), 'checks': CHECKS, 'windows': 'NOT_RUN', 'index_sha256': INDEX_SHA, 'commit': COMMIT, 'source_pin_is_not_this_digest': True}
    print(json.dumps({'PASS': summary['PASS'], 'FAIL': summary['FAIL'], 'windows': 'NOT_RUN'}))
    if evidence:
        dest = Path(evidence)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / 'bootstrap-linux-rehearsal.json').write_text(json.dumps(summary, indent=2) + '\n')
    return 0 if not failed else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        raise SystemExit(1)
