"""Linux checks for the C1 acquisition command. Not Windows and not the C4 suite."""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
PS1 = ROOT / 'ACQUIRE_FIRST.ps1'
PY = sys.executable
GIT = shutil.which('git')
FETCH = 'ef96dc38099f5f82643afc3831f82df8119b9421'
GATE_BLOB = '07374a1d2052908a366126eba0599f552a9896c0'
GATE_SHA = 'f91138a4067a82a47faf8cf3a584ecbc711d5970af75452999672132293842e5'
GATE_SIZE = 11774
RUNTIME = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
INDEX_SHA = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'


def payload_of(text):
    body = text.split("@'\n", 1)[1].rsplit("\n'@\n", 1)[0] + '\n'
    return body


def run_payload(payload, repo, dest, index):
    return subprocess.run(
        [PY, '-B', '-I', '-c', payload, '--fixture-linux', '--repo', str(repo), '--dest', str(dest), '--index', str(index), '--git', GIT, '--python', PY],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=tempfile.gettempdir(),
    )


def fetch_repo(root):
    repo = root / 'src'
    repo.mkdir()
    subprocess.run(['git', 'init'], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    proc = subprocess.run(['git', '-C', str(repo), 'fetch', '--no-tags', str(REPO), FETCH], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.returncode == 0, proc.stderr.decode()
    show = subprocess.run(['git', '--no-pager', '-C', str(repo), 'show-ref'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert show.stdout.strip() == b''
    kind = subprocess.run(['git', '-C', str(repo), 'cat-file', '-t', GATE_BLOB], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    assert kind.stdout == b'blob\n'
    assert subprocess.run(['git', '-C', str(repo), 'checkout', '--detach', RUNTIME], stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode == 0
    return repo


def main():
    text = PS1.read_text(encoding='ascii')
    raw = PS1.read_bytes()
    header = text.split("@'\n", 1)[0]
    assert b'\r' not in raw and '>' not in header and '|' not in header
    assert len(raw) == 4867
    assert hashlib.sha256(raw).hexdigest() == '4342b50a4121d0d71825070b3c6b9553266c45510b1fc3dc5aadd06b91eba05f'
    assert 'materialize_pinned_blob' not in text and 'FromBase64' not in text and 'CopyFromBox' not in text
    assert "Set-Location -LiteralPath 'C:\\Users\\User\\Desktop\\AI_RD_IMP'" in text
    assert "C:\\Users\\User\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe" in text
    assert "C:\\Program Files\\Git\\cmd\\git.exe" in text
    assert 'fetch --no-tags origin ' + FETCH in text
    assert 'cat-file -t ' + GATE_BLOB in text
    assert '$LASTEXITCODE' in text
    payload = payload_of(text)
    assert len(payload.encode('ascii')) == 4259
    assert hashlib.sha256(payload.encode('ascii')).hexdigest() == 'd90f9c5b54e7d425bf5c6de78f2a3f5b4f05daca21e32a1097e27309fcb73dc4'
    assert 'ACQUIRE_FIRST' not in payload
    gate = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', GATE_BLOB])
    assert len(gate) == GATE_SIZE and hashlib.sha256(gate).hexdigest() == GATE_SHA
    ns = {'__name__': 'acquire_static'}
    exec(compile(payload, 'ACQUIRE_FIRST.ps1', 'exec'), ns)
    try:
        ns['require_gate'](b'x' * GATE_SIZE)
        raise SystemExit('wrong gate bytes were accepted')
    except SystemExit as exc:
        assert exc.code == 3
    tool = Path(tempfile.mkdtemp(prefix='wlr-acquire-tool-')) / 'git.exe'
    tool.write_bytes(b'not-git')
    try:
        ns['require_tool'](str(tool), ns['GS'], ns['GH'])
        raise SystemExit('wrong git tool was accepted')
    except SystemExit as exc:
        assert exc.code == 3
    with tempfile.TemporaryDirectory(prefix='wlr-acquire-') as raw_dir:
        tmp = Path(raw_dir)
        repo = fetch_repo(tmp)
        held = tmp / 'held.py'
        held.write_bytes(b'KEEP')
        index = tmp / 'index.json'
        bad = run_payload(payload, repo, held, index)
        assert bad.returncode == 3 and held.read_bytes() == b'KEEP' and b'E_EXISTS' in bad.stderr and b'candidate_started' in bad.stderr
        assert not index.exists()
        folder = tmp / 'gate-dir'
        folder.mkdir()
        blocked = run_payload(payload, repo, folder, index)
        assert blocked.returncode == 3 and folder.is_dir() and b'E_EXISTS' in blocked.stderr
        link = tmp / 'dangling.py'
        link.symlink_to(tmp / 'missing-referent')
        linked = run_payload(payload, repo, link, index)
        assert linked.returncode == 3 and link.is_symlink() and not (tmp / 'missing-referent').exists()
        empty = tmp / 'empty'
        empty.mkdir()
        subprocess.run(['git', 'init'], cwd=empty, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        missing = tmp / 'missing.py'
        upstream = run_payload(payload, empty, missing, index)
        assert upstream.returncode != 0 and not missing.exists() and b'candidate_started' in upstream.stderr
        partial = tmp / 'partial.py'
        original = os.read

        def short_read(fd, count):
            original(fd, count)
            return b''

        os.read = short_read
        try:
            try:
                ns['place'](str(partial), b'abc')
                raise SystemExit('bad readback continued')
            except SystemExit as exc:
                assert exc.code == 3
        finally:
            os.read = original
        assert partial.read_bytes() == b'abc'
        again = run_payload(payload, repo, partial, index)
        assert again.returncode == 3 and partial.read_bytes() == b'abc'
        dest = tmp / 'WIN_RUNNER_ACCEPT_INDEX.py'
        ok = run_payload(payload, repo, dest, index)
        assert ok.returncode == 0, ok.stderr.decode()
        receipt = json.loads(ok.stdout)
        assert dest.read_bytes() == gate
        assert receipt['transfer_ok'] is True and receipt['python_starts'] == 1
        assert receipt['index_size'] == 945 and receipt['index_sha256'] == INDEX_SHA
        assert receipt['path_bound_after_close'] is False and receipt['installer_started'] is False
        assert receipt['writer_commit'] == '05994e1fddd754c9bf20e91aa5423858283fc367'
        assert receipt['acceptance_covers'] == 'CONSUMED_FD_XATTR' and receipt['stat_tuple_is_identity'] is False
        assert index.read_bytes() and hashlib.sha256(index.read_bytes()).hexdigest() == INDEX_SHA
    summary = {
        'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
        'c4_suite': 'NOT_RERUN', 'acquire_ps1_bytes': len(raw),
        'acquire_ps1_sha256': hashlib.sha256(raw).hexdigest(),
        'control_bytes': len(payload.encode('ascii')),
        'control_sha256': hashlib.sha256(payload.encode('ascii')).hexdigest(),
        'gate_blob': GATE_BLOB, 'git_tool_windows': 'NOT_RUN',
        'cwd': r'C:\Users\User\Desktop\AI_RD_IMP',
        'python': r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe',
        'git': r'C:\Program Files\Git\cmd\git.exe',
    }
    print(json.dumps(summary))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        Path(evidence, 'acquire-first-linux.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
