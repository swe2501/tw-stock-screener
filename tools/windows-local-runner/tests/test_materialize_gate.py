"""Linux checks for the first gate landing. Not Windows and not the runtime suite."""
import hashlib, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
ENTRY = ROOT / 'materialize_pinned_blob.py'
GATE = ROOT / 'accept_index_delivery.py'
PY = sys.executable
RUNTIME = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'


def load():
    spec = importlib.util.spec_from_file_location('materialize_pinned_blob', ENTRY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(repo, *args):
    return subprocess.run(['git', '--no-pager', '-C', str(repo), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def main():
    mod = load()
    gate_bytes = GATE.read_bytes()
    gate_bytes = GATE.read_bytes()
    assert len(gate_bytes) == mod.GATE_SIZE
    assert hashlib.sha256(gate_bytes).hexdigest() == mod.GATE_SHA256
    assert hashlib.sha1(('blob %d\0' % len(gate_bytes)).encode() + gate_bytes).hexdigest() == mod.GATE_BLOB
    assert subprocess.check_output(['git', 'hash-object', str(GATE)], text=True).strip() == mod.GATE_BLOB
    try:
        mod.classify_gate(128, b'')
        raise SystemExit('upstream 128 classified as runnable')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_UPSTREAM'
    try:
        mod.classify_gate(0, b'')
        raise SystemExit('empty source classified as runnable')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_EMPTY'
    try:
        mod.classify_gate(0, b'x' * mod.GATE_SIZE)
        raise SystemExit('wrong digest classified as runnable')
    except ValueError as exc:
        assert str(exc) == 'E_GATE_BYTES'
    redirect_target = Path(tempfile.mkdtemp(prefix='wlr-redirect-')) / 'old.py'
    redirect_target.write_bytes(b'KEEP')
    pipe = subprocess.run(
        "git cat-file blob 0000000000000000000000000000000000000000 > " + str(redirect_target),
        shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert pipe.returncode == 128 and redirect_target.read_bytes() == b''
    with tempfile.TemporaryDirectory(prefix='wlr-first-') as raw:
        tmp = Path(raw)
        source = tmp / 'source'
        subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(source)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert git(source, 'checkout', '--detach', RUNTIME).returncode == 0
        assert git(source, 'hash-object', '-w', str(GATE)).stdout.decode().strip() == mod.GATE_BLOB
        dest = tmp / 'WIN_RUNNER_ACCEPT_INDEX.py'
        calls = []
        original_exec = os.execv

        def record_exec(program, argv):
            calls.append(argv)
            raise RuntimeError('E_EXEC_INTERCEPTED')

        os.execv = record_exec
        try:
            code = mod.main(['--fixture-linux', '--repo', str(source), '--dest', str(dest), '--index', str(tmp / 'index.json')])
        finally:
            os.execv = original_exec
        assert code == 3 and len(calls) == 1, (code, calls)
        assert os.path.normcase(calls[0][2]) == os.path.normcase(os.path.abspath(dest)), (calls[0], dest)
        assert dest.read_bytes() == gate_bytes, (len(dest.read_bytes()), len(gate_bytes))
        held = tmp / 'already.py'
        held.write_bytes(gate_bytes)
        try:
            mod.materialize(source, held)
            raise SystemExit('existing correct gate was overwritten')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS', str(exc)
            assert held.read_bytes() == gate_bytes
        folder = tmp / 'gate-dir'
        folder.mkdir()
        try:
            mod.materialize(source, folder)
            raise SystemExit('directory destination was accepted')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS' and folder.is_dir()
        link = tmp / 'dangling.py'
        link.symlink_to(tmp / 'missing-referent')
        try:
            mod.materialize(source, link)
            raise SystemExit('dangling link was replaced')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS'
        assert link.is_symlink() and not (tmp / 'missing-referent').exists()
        empty_repo = tmp / 'empty'
        empty_repo.mkdir()
        subprocess.run(['git', 'init'], cwd=empty_repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        missing = tmp / 'missing-blob.py'
        try:
            mod.materialize(empty_repo, missing)
            raise SystemExit('missing blob created a candidate')
        except ValueError as exc:
            assert str(exc) == 'E_GIT_UPSTREAM' and not missing.exists()
        partial = tmp / 'partial.py'
        original_read = os.read

        def bad_read(fd, n):
            original_read(fd, n)
            return b''

        os.read = bad_read
        try:
            try:
                mod.write_exclusive(partial, gate_bytes)
                raise SystemExit('bad readback executed')
            except ValueError as exc:
                assert str(exc) == 'E_READBACK', str(exc)
        finally:
            os.read = original_read
        assert partial.is_file() and partial.read_bytes() == gate_bytes
        try:
            mod.materialize(source, partial)
            raise SystemExit('partial path was reused')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS'
    fetched = Path(tempfile.mkdtemp(prefix='wlr-fetch-'))
    fetched_repo = fetched / 'src'
    fetched_repo.mkdir()
    subprocess.run(['git', 'init'], cwd=fetched_repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    fetch = subprocess.run(['git', '-C', str(fetched_repo), 'fetch', '--no-tags', str(REPO), 'd33b0a41e126cd17c24edd0dd0df10cd302eabbd'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert fetch.returncode == 0, fetch.stderr.decode()
    refs_before = git(fetched_repo, 'show-ref').stdout
    log_before = git(fetched_repo, 'log', '--all', '--format=%H', '--find-object=9fa534201e61678698cdc29c8a30edbc00a0f0da')
    assert log_before.returncode == 0 and log_before.stdout.strip() == b''
    assert git(fetched_repo, 'rev-parse', 'd33b0a41e126cd17c24edd0dd0df10cd302eabbd:tools/windows-local-runner/deliver_external_index.py').stdout.decode().strip() == '9fa534201e61678698cdc29c8a30edbc00a0f0da'
    assert git(fetched_repo, 'checkout', '--detach', RUNTIME).returncode == 0
    absent_gate = fetched / 'no-gate.py'
    try:
        mod.materialize(fetched_repo, absent_gate)
        raise SystemExit('unfetched gate blob was materialized')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_UPSTREAM', str(exc)
    assert not absent_gate.exists()
    assert git(fetched_repo, 'hash-object', '-w', str(GATE)).stdout.decode().strip() == mod.GATE_BLOB
    refs_after = git(fetched_repo, 'show-ref').stdout
    assert refs_before == refs_after
    landed = fetched / 'WIN_RUNNER_ACCEPT_INDEX.py'
    produced = mod.materialize(fetched_repo, landed)
    assert produced['executed'] is False and landed.read_bytes() == gate_bytes
    index = fetched / 'WIN_RUNNER_RELEASE_5f5be6c35bed.json'
    gated = subprocess.run([PY, '-B', str(landed), '--fixture-linux', '--source', str(fetched_repo), '--dest', str(index)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert gated.returncode == 0, gated.stderr.decode()
    receipt = json.loads(gated.stdout)
    assert receipt['transfer_ok'] is True and receipt['python_starts'] == 1 and receipt['index_size'] == 945
    assert receipt['index_sha256'] == '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
    assert receipt['writer_commit'] == 'd33b0a41e126cd17c24edd0dd0df10cd302eabbd'
    assert git(fetched_repo, 'show-ref').stdout == refs_after
    inline_root = Path(tempfile.mkdtemp(prefix='wlr-inline-'))
    inline_repo = inline_root / 'repo'
    inline_repo.mkdir()
    subprocess.run(['git', 'init'], cwd=inline_repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    inline_dest = inline_root / 'absent.py'
    inline = subprocess.run([PY, '-c', ENTRY.read_text(encoding='utf-8'), '--fixture-linux', '--repo', str(inline_repo), '--dest', str(inline_dest), '--index', str(inline_root / 'index.json')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert inline.returncode == 3 and not inline_dest.exists() and b'E_GIT_UPSTREAM' in inline.stderr
    print(json.dumps({
        'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
        'linux_shell_redirect_exit': pipe.returncode, 'gate_blob': mod.GATE_BLOB,
        'runtime_suite': 'NOT_RERUN',
    }))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        Path(evidence, 'first-entry-linux.json').write_text(json.dumps({
            'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
            'linux_shell_redirect_creates_empty_on_git_128': True,
            'materializer_refuses_existing_file_dir_dangling': True,
            'partial_preserved': True, 'gate_blob': mod.GATE_BLOB,
        }, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
