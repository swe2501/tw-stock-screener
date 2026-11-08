"""Fail-closed W1/W2 gate. One entry, not a second writer or installer.

Git is run first. Python starts only after that process exit is 0 and the
bytes are the pinned writer. A Python exit of 0 without this receipt is not
delivery. Windows has not been run.
"""
import hashlib, json, os, stat, subprocess, sys

RUNTIME_COMMIT = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
OLD_WRITER_COMMIT = '08dffd8bb87a4329e0f2608b87d4a6a2c9ca9d2a'
WRITER_COMMIT = 'd33b0a41e126cd17c24edd0dd0df10cd302eabbd'
OLD_WRITER_BLOB = '7894bc5b84c769994a324d98a1faaf464b4b31a9'
WRITER_BLOB = '9fa534201e61678698cdc29c8a30edbc00a0f0da'
WRITER_SHA256 = '9323c406040352938f58dad45e6299dfaa19337eca1e422b1fd4e69394d8e293'
WRITER_SIZE = 5089
WRITER_PATH = 'tools/windows-local-runner/deliver_external_index.py'
INDEX_SHA256 = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
INDEX_SIZE = 945
WINDOWS_DEST = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_RELEASE_5f5be6c35bed.json'

def _git(repo, args):
    if args[0] not in {'cat-file', 'rev-parse'}:
        raise ValueError('E_GIT_ARGV')
    proc = subprocess.run(
        ['git', '--no-pager', '-C', repo, *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr

def classify_source(exit_code, data):
    if exit_code != 0:
        raise ValueError('E_GIT_UPSTREAM')
    if not data:
        raise ValueError('E_GIT_EMPTY')
    if len(data) != WRITER_SIZE or hashlib.sha256(data).hexdigest() != WRITER_SHA256:
        raise ValueError('E_WRITER_BYTES')
    if WRITER_BLOB == OLD_WRITER_BLOB:
        raise ValueError('E_WRITER_BLOB')
    blob = hashlib.sha1(('blob %d\0' % len(data)).encode() + data).hexdigest()
    if blob != WRITER_BLOB:
        raise ValueError('E_WRITER_BLOB')
    return data

def judge_delivery(receipt, file_size, file_sha, dest):
    """Both the fresh receipt and the file must match. A stale file has no receipt."""
    if not isinstance(receipt, dict):
        raise ValueError('E_RECEIPT')
    if receipt.get('readback') != 'SAME_HANDLE' or receipt.get('executed_payload') is not False:
        raise ValueError('E_RECEIPT')
    if receipt.get('size') != INDEX_SIZE or receipt.get('sha256') != INDEX_SHA256:
        raise ValueError('E_RECEIPT')
    wrote = receipt.get('wrote')
    if type(wrote) is not str or os.path.normcase(os.path.abspath(wrote)) != os.path.normcase(os.path.abspath(dest)):
        raise ValueError('E_RECEIPT')
    if type(file_size) is not int or file_size != INDEX_SIZE or file_sha != INDEX_SHA256:
        raise ValueError('E_INDEX_BYTES')
    return True

def _occupied(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return False
    return True

def _writer_commit(repo):
    """The writer commit object must exist. A branch ref is not required.

    git fetch of a raw commit updates FETCH_HEAD only. git log --all does not
    walk FETCH_HEAD, so it can be empty while the commit and blob exist.
    """
    code, _out, _err = _git(repo, ['cat-file', '-e', WRITER_COMMIT + '^{commit}'])
    if code != 0:
        raise ValueError('E_WRITER_UNREACHABLE')
    rev_code, rev_out, _rev_err = _git(repo, ['rev-parse', '--verify', WRITER_COMMIT + ':' + WRITER_PATH])
    if rev_code != 0 or rev_out.decode().strip() != WRITER_BLOB:
        raise ValueError('E_WRITER_UNREACHABLE')
    if WRITER_COMMIT == OLD_WRITER_COMMIT or WRITER_BLOB == OLD_WRITER_BLOB:
        raise ValueError('E_WRITER_UNREACHABLE')
    return WRITER_COMMIT

def run(repo, dest, *, fixture_linux=False, state=None):
    state = state if state is not None else {'python_starts': 0}
    repo = os.path.abspath(repo)
    dest = os.path.abspath(dest)
    if os.name == 'nt':
        if fixture_linux is True:
            raise RuntimeError('E_FIXTURE_FLAG_ON_WINDOWS')
        if os.path.normcase(dest) != os.path.normcase(WINDOWS_DEST):
            raise ValueError('E_DEST')
    elif fixture_linux is not True:
        raise RuntimeError('E_LINUX_FIXTURE_REQUIRED')
    if os.path.normcase(repo) == os.path.normcase(dest) or os.path.normcase(dest).startswith(os.path.normcase(repo) + os.sep):
        raise ValueError('E_INDEX_LOCATION')
    if _occupied(dest):
        raise ValueError('E_EXISTS')
    parent = os.path.dirname(dest)
    try:
        info = os.lstat(parent)
    except FileNotFoundError as exc:
        raise ValueError('E_PARENT_MISSING') from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ValueError('E_PARENT')
    head_code, head_out, _head_err = _git(repo, ['rev-parse', 'HEAD'])
    if head_code != 0 or head_out.decode().strip() != RUNTIME_COMMIT:
        raise ValueError('E_HEAD')
    writer_commit = _writer_commit(repo)
    code, data, _err = _git(repo, ['cat-file', 'blob', WRITER_BLOB])
    source = classify_source(code, data)
    state['python_starts'] += 1
    argv = [sys.executable, '-B', '-']
    if fixture_linux:
        argv.extend(['--fixture-linux', '--dest', dest])
    proc = subprocess.run(argv, input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False)
    if proc.returncode != 0 or not proc.stdout:
        raise ValueError('E_WRITER_EXIT')
    try:
        receipt = json.loads(proc.stdout.decode('utf-8'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('E_RECEIPT') from exc
    try:
        file_bytes = open(dest, 'rb').read()
    except OSError as exc:
        raise ValueError('E_INDEX_BYTES') from exc
    judge_delivery(receipt, len(file_bytes), hashlib.sha256(file_bytes).hexdigest(), dest)
    return {
        'transfer_ok': True,
        'next_stage': True,
        'installer_started': False,
        'python_starts': state['python_starts'],
        'upstream_exit': code,
        'writer_exit': proc.returncode,
        'writer_commit': writer_commit,
        'writer_blob': WRITER_BLOB,
        'old_writer_blob_rejected': OLD_WRITER_BLOB,
        'index_size': len(file_bytes),
        'index_sha256': hashlib.sha256(file_bytes).hexdigest(),
        'readback': receipt.get('readback'),
        'pipeline_go': False,
        'windows': 'NOT_RUN' if os.name != 'nt' else 'LOCAL_GATE_NOT_AUDITOR_ACCEPTANCE',
    }

def main(argv=None):
    state = {'python_starts': 0}
    try:
        args = list(sys.argv[1:] if argv is None else argv)
        fixture = False
        source = None
        dest = None
        i = 0
        while i < len(args):
            item = args[i]
            if item == '--fixture-linux':
                fixture = True
            elif item == '--source' and i + 1 < len(args):
                i += 1
                source = args[i]
            elif item == '--dest' and i + 1 < len(args):
                i += 1
                dest = args[i]
            else:
                raise ValueError('E_ARGUMENTS')
            i += 1
        if source is None:
            raise ValueError('E_SOURCE')
        if os.name == 'nt':
            dest = WINDOWS_DEST if dest is None else dest
        elif dest is None:
            raise ValueError('E_DEST')
        print(json.dumps(run(source, dest, fixture_linux=fixture, state=state), ensure_ascii=True), flush=True)
        return 0
    except Exception as exc:
        print(json.dumps({
            'error': str(exc), 'type': type(exc).__name__, 'no_retry': True,
            'python_starts': state['python_starts'], 'transfer_ok': False,
            'next_stage': False, 'installer_started': False,
        }, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3

if __name__ == '__main__':
    sys.exit(main())
