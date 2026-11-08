"""Linux rehearsal of the external-index writer. Windows is not run."""
import hashlib, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'deliver_external_index.py'
BLOB = '9fa534201e61678698cdc29c8a30edbc00a0f0da'
OLD_BLOB = '7894bc5b84c769994a324d98a1faaf464b4b31a9'
INDEX_SHA = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
PY = sys.executable


def load():
    spec = importlib.util.spec_from_file_location('deliver_external_index', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    module = load()
    bare = subprocess.run([PY, '-B', str(SCRIPT)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert bare.returncode == 3 and b'Traceback' not in bare.stderr
    assert json.loads(bare.stderr)['error'] == 'E_DEST'
    text = SCRIPT.read_text(encoding='utf-8')
    assert 'eval(' not in text and 'exec(' not in text and 'subprocess' not in text and 'os.system' not in text
    assert subprocess.check_output(['git', 'hash-object', str(SCRIPT)], text=True).strip() == BLOB
    assert BLOB != OLD_BLOB
    assert hashlib.sha256(module.INDEX_BYTES).hexdigest() == INDEX_SHA
    assert len(module.INDEX_BYTES) == 945
    bad = bytearray(module.INDEX_BYTES)
    bad[80] ^= 1
    try:
        module.require_payload(bytes(bad))
        raise SystemExit('single-byte payload was accepted')
    except ValueError as exc:
        assert str(exc) == 'E_PAYLOAD'
    with tempfile.TemporaryDirectory(prefix='wlr-index-') as raw:
        tmp = Path(raw)
        dest = tmp / 'WIN_RUNNER_RELEASE_5f5be6c35bed.json'
        missing = tmp / 'no-parent' / 'index.json'
        try:
            module.deliver(missing, fixture_linux=True)
            raise SystemExit('missing parent wrote a file')
        except ValueError as exc:
            assert str(exc) == 'E_PARENT_MISSING' and not (tmp / 'no-parent').exists()
        link = tmp / 'dangling.json'
        link.symlink_to(tmp / 'missing-referent')
        try:
            module.deliver(link, fixture_linux=True)
            raise SystemExit('dangling link was replaced')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS'
        assert link.is_symlink() and not (tmp / 'missing-referent').exists()
        held = tmp / 'already.json'
        held.write_bytes(b'keep-me')
        try:
            module.deliver(held, fixture_linux=True)
            raise SystemExit('existing file was overwritten')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS' and held.read_bytes() == b'keep-me'
        code = module.main(['--fixture-linux', '--dest', str(dest)])
        assert code == 0 and dest.read_bytes() == module.INDEX_BYTES
        again = module.main(['--fixture-linux', '--dest', str(dest)])
        assert again == 3 and dest.read_bytes() == module.INDEX_BYTES
        partial = tmp / 'partial.json'
        original_read = os.read

        def bad_read(fd, n):
            original_read(fd, n)
            return b''

        os.read = bad_read
        try:
            try:
                module.deliver(partial, fixture_linux=True)
                raise SystemExit('bad readback was accepted')
            except ValueError as exc:
                assert str(exc) == 'E_READBACK'
        finally:
            os.read = original_read
        assert partial.is_file() and partial.read_bytes() == module.INDEX_BYTES
        try:
            module.deliver(partial, fixture_linux=True)
            raise SystemExit('partial path was reused')
        except ValueError as exc:
            assert str(exc) == 'E_EXISTS' and partial.read_bytes() == module.INDEX_BYTES
        repo = tmp / 'repo'
        repo.mkdir()
        subprocess.run(['git', 'init'], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        staged = repo / 'deliver_external_index.py'
        staged.write_bytes(SCRIPT.read_bytes())
        subprocess.run(['git', 'add', '--', staged.name], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.run(['git', '-c', 'user.name=wlr-test', '-c', 'user.email=wlr-test@example.com', 'commit', '-m', 'deliver'], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        blob = subprocess.check_output(['git', 'rev-parse', 'HEAD:deliver_external_index.py'], cwd=repo, text=True).strip()
        assert blob == BLOB
        piped = tmp / 'from-git.json'
        proc = subprocess.run(
            ['git', '-C', str(repo), 'cat-file', 'blob', blob],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        )
        child = subprocess.run(
            [PY, '-B', '-', '--fixture-linux', '--dest', str(piped)],
            input=proc.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        assert child.returncode == 0, child.stderr.decode()
        receipt = json.loads(child.stdout)
        assert receipt['sha256'] == INDEX_SHA and receipt['size'] == 945 and receipt['readback'] == 'SAME_HANDLE'
        assert receipt['executed_payload'] is False and receipt['pipeline_go'] is False
        assert piped.read_bytes() == module.INDEX_BYTES
    print(json.dumps({'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'blob': BLOB, 'index_sha256': INDEX_SHA, 'executed_payload': False}))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        Path(evidence, 'deliver-index-linux.json').write_text(json.dumps({
            'PASS': 1, 'windows': 'NOT_RUN', 'blob': BLOB, 'index_sha256': INDEX_SHA,
            'size': 945, 'readback': 'SAME_HANDLE', 'single_byte': 'E_PAYLOAD',
            'dangling': 'E_EXISTS', 'existing': 'E_EXISTS', 'readback_failure_preserves_partial': True,
        }, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
