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
OLD_COMMIT = '9dbbe3ae108ab50db1a0bf147b9abf1808372fba'
OLD_BLOB = '59fd64b9e5d5d4c7978219bc06f84aeb36cae5c1'
EARLIER_BLOB = '7894bc5b84c769994a324d98a1faaf464b4b31a9'
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
    assert gate.WRITER_COMMIT == '05994e1fddd754c9bf20e91aa5423858283fc367'
    assert gate.GIT_TOOL_PATH == r'C:\Program Files\Git\cmd\git.exe'
    assert gate.GIT_TOOL_SIZE == 46968
    assert gate.GIT_TOOL_SHA256 == 'd90e36cafd656d52984f7546bfcb5b065d73e2e66957c952b7a4a1cd260e8f36'
    assert gate.GIT_TOOL_FILE_VERSION == '2.46.1.windows.1'
    assert gate.GIT_TOOL_EVIDENCE == 'MLOPS_SHELL_O211102_METADATA_ONLY'
    assert gate.GIT_TOOL_PARENT_VERIFIED is False
    assert gate.git_binary() == 'git'
    assert subprocess.check_output(['git', 'hash-object', str(WRITER)], text=True).strip() == gate.WRITER_BLOB
    old = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', OLD_BLOB])
    earlier = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', EARLIER_BLOB])
    for rejected in (old, earlier):
        try:
            gate.classify_source(0, rejected)
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
        gate.judge_delivery(None, b'', {'st_dev': 1, 'st_ino': 2, 'token': 'ab' * 32}, '/tmp/index.json')
        raise SystemExit('missing receipt accepted a matching file')
    except ValueError as exc:
        assert str(exc) == 'E_RECEIPT'
    token = 'ab' * 32
    ident = {'st_dev': 1, 'st_ino': 2, 'token': token}
    receipt = {
        'wrote': '/tmp/index.json', 'size': 945, 'sha256': INDEX_SHA,
        'readback': 'SAME_HANDLE', 'executed_payload': False,
        'handoff': gate.HANDOFF, 'identity_from': 'CREATE_FD_XATTR',
        'stat_tuple_is_identity': False,
        'path_bound_after_close': False, 'object_id': ident,
    }
    try:
        gate.judge_delivery(receipt, b'x' * 945, ident, receipt['wrote'])
        raise SystemExit('wrong index sha accepted')
    except ValueError as exc:
        assert str(exc) == 'E_INDEX_BYTES'
    reused = {'st_dev': 1, 'st_ino': 2, 'token': 'cd' * 32}
    try:
        gate.judge_delivery(receipt, b'x' * 945, reused, receipt['wrote'])
        raise SystemExit('reused stat tuple without token was accepted')
    except ValueError as exc:
        assert str(exc) == 'E_INDEX_IDENTITY'
    try:
        gate.judge_delivery(receipt, b'x' * 944, ident, receipt['wrote'])
        raise SystemExit('wrong length was accepted')
    except ValueError as exc:
        assert str(exc) == 'E_INDEX_BYTES'
    tool = Path(tempfile.mkdtemp(prefix='wlr-git-tool-')) / 'git.exe'
    tool.write_bytes(b'not-the-reported-tool')
    try:
        gate.verify_git_tool(tool, gate.GIT_TOOL_SIZE, gate.GIT_TOOL_SHA256)
        raise SystemExit('wrong git tool bytes were accepted')
    except ValueError as exc:
        assert str(exc) == 'E_GIT_TOOL'
    exact = b'g' * 32
    tool.write_bytes(exact)
    assert gate.verify_git_tool(str(tool), len(exact), hashlib.sha256(exact).hexdigest()) == str(tool)
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
        fresh = tmp / 'fresh.json'
        fresh_receipt = writer.deliver(fresh, fixture_linux=True)
        fresh_bytes, fresh_id = gate.consume_index(fresh)
        assert fresh_id == fresh_receipt['object_id']
        assert gate.judge_delivery(fresh_receipt, fresh_bytes, fresh_id, fresh) is True
        collided = False
        replaced = b''
        replaced_id = None
        for _ in range(40):
            fresh.unlink()
            fresh.write_bytes(index_bytes)
            replaced, replaced_id = gate.consume_index(fresh)
            st = os.stat(fresh)
            same_tuple = (
                st.st_dev == fresh_receipt['object_id']['st_dev']
                and st.st_ino == fresh_receipt['object_id']['st_ino']
                and st.st_ctime_ns == fresh_receipt['observed_ctime_ns']
            )
            try:
                gate.judge_delivery(fresh_receipt, replaced, replaced_id, fresh)
                raise SystemExit('same-content replacement accepted')
            except ValueError as exc:
                assert str(exc) == 'E_INDEX_IDENTITY'
            assert replaced_id != fresh_receipt['object_id']
            assert replaced == index_bytes and fresh.read_bytes() == index_bytes
            if same_tuple:
                collided = True
                break
        assert collided, 'unlink/recreate did not reuse dev, ino, and ctime'
        fresh.unlink()
        fresh.write_bytes(b'D' * 20)
        other, other_id = gate.consume_index(fresh)
        try:
            gate.judge_delivery(fresh_receipt, other, other_id, fresh)
            raise SystemExit('different-content replacement accepted')
        except ValueError as exc:
            assert str(exc) == 'E_INDEX_IDENTITY'
        assert other_id != fresh_receipt['object_id']
        assert fresh.read_bytes() == b'D' * 20 and other == b'D' * 20
        mutated = tmp / 'mutated.json'
        mutated_receipt = writer.deliver(mutated, fixture_linux=True)
        mutable = os.open(mutated, os.O_WRONLY)
        try:
            os.write(mutable, b'x' * 945)
            os.fsync(mutable)
        finally:
            os.close(mutable)
        changed, changed_id = gate.consume_index(mutated)
        try:
            gate.judge_delivery(mutated_receipt, changed, changed_id, mutated)
            raise SystemExit('same inode with different bytes accepted')
        except ValueError as exc:
            same = changed_id == mutated_receipt['object_id']
            assert str(exc) == ('E_INDEX_BYTES' if same else 'E_INDEX_IDENTITY')
        assert changed == b'x' * 945 and mutated.read_bytes() == b'x' * 945
        linked = tmp / 'linked.json'
        writer.deliver(linked, fixture_linux=True)
        linked.unlink()
        elsewhere = tmp / 'elsewhere.json'
        elsewhere.write_bytes(index_bytes)
        linked.symlink_to(elsewhere)
        try:
            gate.consume_index(linked)
            raise SystemExit('replaced symlink was followed')
        except ValueError as exc:
            assert str(exc) == 'E_INDEX_IDENTITY'
        assert linked.is_symlink() and elsewhere.read_bytes() == index_bytes
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
        assert result['writer_blob'] == gate.WRITER_BLOB and result['writer_commit'] == gate.WRITER_COMMIT
        assert result['handoff'] == gate.HANDOFF and result['path_bound_after_close'] is False
        assert result['acceptance_covers'] == 'CONSUMED_FD_XATTR' and result['stat_tuple_is_identity'] is False
        assert result['git_tool_checked'] is False and result['git_tool_parent_verified'] is False
        assert result['object_id']['token'] and 'st_ctime_ns' not in result['object_id']
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
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
