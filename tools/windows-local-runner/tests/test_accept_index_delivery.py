"""Linux negative controls for the W1/W2 gate. Not a runtime suite and not Windows."""
import hashlib, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
GATE = ROOT / 'accept_index_delivery.py'
WRITER = ROOT / 'deliver_external_index.py'
RUNTIME = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
OLD_COMMIT = '08dffd8bb87a4329e0f2608b87d4a6a2c9ca9d2a'
OLD_BLOB = '7894bc5b84c769994a324d98a1faaf464b4b31a9'
INDEX_SHA = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
PY = sys.executable


def load():
    spec = importlib.util.spec_from_file_location('accept_index_delivery', GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(repo, *args):
    return subprocess.run(['git', '--no-pager', '-C', str(repo), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def main():
    gate = load()
    text = GATE.read_text(encoding='utf-8')
    assert 'shell=True' not in text and 'eval(' not in text and 'exec(' not in text
    assert gate.WRITER_BLOB != OLD_BLOB and gate.OLD_WRITER_BLOB == OLD_BLOB
    assert subprocess.check_output(['git', 'hash-object', str(WRITER)], text=True).strip() == gate.WRITER_BLOB
    old = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', OLD_BLOB])
    try:
        gate.classify_source(0, old)
        raise SystemExit('old writer bytes were accepted')
    except ValueError as exc:
        assert str(exc) == 'E_WRITER_BYTES'
    try:
        gate.classify_source(128, b'')
        raise SystemExit('upstream 128 reached Python')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_UPSTREAM'
    try:
        gate.classify_source(0, b'')
        raise SystemExit('empty source reached Python')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_EMPTY'
    try:
        gate.classify_source(0, b'x' * gate.WRITER_SIZE)
        raise SystemExit('wrong sha reached Python')
    except ValueError as exc:
        assert str(exc) == 'E_WRITER_BYTES'
    try:
        gate.judge_delivery(None, 945, INDEX_SHA, '/tmp/index.json')
        raise SystemExit('missing receipt accepted a matching file')
    except ValueError as exc:
        assert str(exc) == 'E_RECEIPT'
    receipt = {'wrote': '/tmp/index.json', 'size': 945, 'sha256': INDEX_SHA, 'readback': 'SAME_HANDLE', 'executed_payload': False}
    try:
        gate.judge_delivery(receipt, 945, '0' * 64, receipt['wrote'])
        raise SystemExit('wrong index sha accepted')
    except ValueError as exc:
        assert str(exc) == 'E_INDEX_BYTES'
    try:
        gate.judge_delivery(receipt, 944, INDEX_SHA, receipt['wrote'])
        raise SystemExit('wrong length with the pinned digest string was accepted')
    except ValueError as exc:
        assert str(exc) == 'E_INDEX_BYTES'
    pipe = subprocess.run(
        'git cat-file blob 0000000000000000000000000000000000000000 | python3 -B -',
        shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert pipe.returncode == 0
    with tempfile.TemporaryDirectory(prefix='wlr-gate-') as raw:
        tmp = Path(raw)
        source = tmp / 'source'
        subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(source)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert git(source, 'checkout', '--detach', RUNTIME).returncode == 0
        dest = tmp / 'WIN_RUNNER_RELEASE_5f5be6c35bed.json'
        state = {'python_starts': 0}
        try:
            gate.run(source, dest, fixture_linux=True, state=state)
            raise SystemExit('missing writer blob started delivery')
        except ValueError as exc:
            assert str(exc) in {'E_GIT_UPSTREAM', 'E_WRITER_UNREACHABLE'}
        assert state['python_starts'] == 0 and not dest.exists()
        assert git(source, 'checkout', '-B', 'writer-pin', OLD_COMMIT).returncode == 0
        writer_text = WRITER.read_bytes()
        target = source / 'tools' / 'windows-local-runner' / 'deliver_external_index.py'
        target.write_bytes(writer_text)
        subprocess.run(['git', '-C', str(source), 'add', '--', 'tools/windows-local-runner/deliver_external_index.py'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.run(['git', '-C', str(source), '-c', 'user.name=wlr-test', '-c', 'user.email=wlr-test@example.com', 'commit', '-m', 'writer pin'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        new_commit = git(source, 'rev-parse', 'HEAD').stdout.decode().strip()
        assert new_commit != OLD_COMMIT and new_commit != RUNTIME
        assert git(source, 'rev-parse', 'HEAD:tools/windows-local-runner/deliver_external_index.py').stdout.decode().strip() == gate.WRITER_BLOB
        assert git(source, 'checkout', '--detach', RUNTIME).returncode == 0
        spec = importlib.util.spec_from_file_location('writer_mod', WRITER)
        writer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(writer)
        index_bytes = writer.INDEX_BYTES
        stale = dest
        stale.write_bytes(index_bytes)
        before = stale.read_bytes()
        state = {'python_starts': 0}
        try:
            gate.run(source, stale, fixture_linux=True, state=state)
            raise SystemExit('preexisting correct index was accepted')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS'
        assert state['python_starts'] == 0 and stale.read_bytes() == before
        link = tmp / 'dangling.json'
        link.symlink_to(tmp / 'missing-referent')
        state = {'python_starts': 0}
        try:
            gate.run(source, link, fixture_linux=True, state=state)
            raise SystemExit('dangling index path was replaced')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS'
        assert state['python_starts'] == 0 and link.is_symlink() and not (tmp / 'missing-referent').exists()
        dest.unlink()
        state = {'python_starts': 0}
        result = gate.run(source, dest, fixture_linux=True, state=state)
        assert state['python_starts'] == 1 and result['transfer_ok'] is True and result['next_stage'] is True
        assert result['installer_started'] is False and result['upstream_exit'] == 0 and result['writer_exit'] == 0
        assert result['index_size'] == 945 and result['index_sha256'] == INDEX_SHA
        assert result['writer_blob'] == gate.WRITER_BLOB and result['writer_commit'] == new_commit
        assert dest.read_bytes() == index_bytes
        assert git(source, 'rev-parse', 'HEAD').stdout.decode().strip() == RUNTIME
    pipe_note = {'platform': 'Linux Bash', 'windows': 'NOT_RUN', 'pipe_exit': pipe.returncode, 'observed': 'PIPE 128 then Python 0 yields outer 0'}
    summary = {'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN', 'linux_bash_pipe_outer_exit': pipe.returncode, 'writer_blob': gate.WRITER_BLOB, 'old_writer_blob': OLD_BLOB, 'runtime_commit': RUNTIME, 'runtime_suite': 'NOT_RERUN'}
    print(json.dumps(summary))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        Path(evidence, 'w1-w2-linux.json').write_text(json.dumps({'summary': summary, 'pipe_not_windows': pipe_note}, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
