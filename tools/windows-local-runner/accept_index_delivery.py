"""Fail-closed W1/W2 gate. One entry, not a second writer or installer.

Git is run first. Python starts only after that process exit is 0 and the
bytes are the pinned writer. A Python exit of 0 without this receipt is not
delivery. Windows has not been run.
"""
import array, hashlib, json, os, socket, stat, subprocess, sys

RUNTIME_COMMIT = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
OLD_WRITER_COMMIT = '05994e1fddd754c9bf20e91aa5423858283fc367'
WRITER_COMMIT = '4cc6358efbd14f79dc3b21db89b14e8aabd05b02'
OLD_WRITER_BLOB = '494ff457f61d79d18e90be73b41c55735bcf477f'
WRITER_BLOB = '7b42097dc3bff8196e686721e255bf4e26c5a741'
WRITER_SHA256 = '18a3fc758128439f0b210903e8ac1f8ee0dec097960e2fbb96cfb46ba3c8357f'
WRITER_SIZE = 8818
WRITER_PATH = 'tools/windows-local-runner/deliver_external_index.py'
INDEX_SHA256 = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
INDEX_SIZE = 945
HANDOFF = 'WIN.RUNNER.INDEX_HANDOFF.v5'
WINDOWS_DEST = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
# MLOps Shell on O211102, exit 0, Get-Command unique non-reparse. Metadata only.
# Parent has not read that raw record. Not a signature check. Not a Git runtime test.
GIT_TOOL_EVIDENCE = 'MLOPS_SHELL_O211102_METADATA_ONLY'
GIT_TOOL_PARENT_VERIFIED = False
GIT_TOOL_PATH = 'C:\\Program Files\\Git\\cmd\\git.exe'
GIT_TOOL_SIZE = 46968
GIT_TOOL_SHA256 = 'd90e36cafd656d52984f7546bfcb5b065d73e2e66957c952b7a4a1cd260e8f36'
GIT_TOOL_FILE_VERSION = '2.46.1.windows.1'

def verify_git_tool(path, size, digest):
    """Hash the opened file. A reported path is not evidence that these bytes match."""
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise ValueError('E_GIT_TOOL') from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ValueError('E_GIT_TOOL')
    flags = os.O_RDONLY
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise ValueError('E_GIT_TOOL') from exc
    try:
        data = os.read(fd, size + 1)
    finally:
        os.close(fd)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('E_GIT_TOOL')
    return path

def git_binary():
    """Windows uses the reported absolute file after a local byte check. Linux does not."""
    if os.name == 'nt':
        return verify_git_tool(GIT_TOOL_PATH, GIT_TOOL_SIZE, GIT_TOOL_SHA256)
    return 'git'

def _git(repo, args):
    if args[0] not in {'cat-file', 'rev-parse'}:
        raise ValueError('E_GIT_ARGV')
    proc = subprocess.run(
        [git_binary(), '--no-pager', '-C', repo, *args],
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

def recv_fd(sock_fd):
    held = socket.fromfd(int(sock_fd), socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        _msg, ancdata, _flags, _addr = held.recvmsg(8, socket.CMSG_SPACE(array.array('i').itemsize))
        for level, typ, data in ancdata:
            if level == socket.SOL_SOCKET and typ == socket.SCM_RIGHTS:
                fds = array.array('i')
                fds.frombytes(data[:fds.itemsize])
                return int(fds[0])
    finally:
        held.close()
    raise ValueError('E_HANDOFF')

def judge_delivery(receipt, consumed, dest):
    """Bytes were read from the held create handle. The path is not bound after that handle closes."""
    if not isinstance(receipt, dict) or not isinstance(consumed, (bytes, bytearray)):
        raise ValueError('E_RECEIPT')
    if receipt.get('readback') != 'SAME_HANDLE' or receipt.get('executed_payload') is not False:
        raise ValueError('E_RECEIPT')
    if receipt.get('handoff') != HANDOFF or receipt.get('identity_from') != 'CREATE_FD_SENT':
        raise ValueError('E_RECEIPT')
    if receipt.get('path_bound_after_close') is not False or receipt.get('stat_tuple_is_identity') is not False:
        raise ValueError('E_RECEIPT')
    if receipt.get('size') != INDEX_SIZE or receipt.get('sha256') != INDEX_SHA256:
        raise ValueError('E_RECEIPT')
    wrote = receipt.get('wrote')
    if type(wrote) is not str or os.path.normcase(os.path.abspath(wrote)) != os.path.normcase(os.path.abspath(dest)):
        raise ValueError('E_RECEIPT')
    if len(consumed) != INDEX_SIZE or hashlib.sha256(consumed).hexdigest() != INDEX_SHA256:
        raise ValueError('E_INDEX_BYTES')
    return True

def consume_held(fd, dest):
    """Read the held descriptor. Compare its inode to the path only while that descriptor is open."""
    os.lseek(fd, 0, os.SEEK_SET)
    data = os.read(fd, INDEX_SIZE + 1)
    held = os.fstat(fd)
    if not stat.S_ISREG(held.st_mode):
        raise ValueError('E_INDEX_IDENTITY')
    flags = os.O_RDONLY
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    try:
        path_fd = os.open(dest, flags)
    except OSError as exc:
        raise ValueError('E_INDEX_IDENTITY') from exc
    try:
        current = os.fstat(path_fd)
    finally:
        os.close(path_fd)
    if (int(held.st_dev), int(held.st_ino)) != (int(current.st_dev), int(current.st_ino)):
        raise ValueError('E_INDEX_IDENTITY')
    return data

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
    argv = [sys.executable, '-B', '-I', '-']
    pass_fds = ()
    parent_sock = None
    child_sock = None
    if os.name == 'nt':
        argv.extend(['--parent-pid', str(os.getpid())])
    else:
        parent_sock, child_sock = socket.socketpair()
        argv.extend(['--handoff-fd', str(child_sock.fileno())])
        pass_fds = (child_sock.fileno(),)
    if fixture_linux:
        argv.extend(['--fixture-linux', '--dest', dest])
    try:
        proc = subprocess.run(argv, input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False, pass_fds=pass_fds)
    finally:
        if child_sock is not None:
            child_sock.close()
    if proc.returncode != 0 or not proc.stdout:
        if parent_sock is not None:
            parent_sock.close()
        raise ValueError('E_WRITER_EXIT')
    try:
        receipt = json.loads(proc.stdout.decode('utf-8'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        if parent_sock is not None:
            parent_sock.close()
        raise ValueError('E_RECEIPT') from exc
    if parent_sock is None:
        raise ValueError('E_HANDOFF')
    try:
        held = recv_fd(parent_sock.fileno())
    finally:
        parent_sock.close()
    try:
        file_bytes = consume_held(held, dest)
    finally:
        os.close(held)
    judge_delivery(receipt, file_bytes, dest)
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
        'handoff': HANDOFF,
        'stat_tuple_is_identity': False,
        'identity_scope': 'HELD_CREATE_FD',
        'acceptance_covers': 'HELD_CREATE_FD',
        'path_bound_after_close': False,
        'index_bytes_from': 'CONSUMED_FD',
        'index_size': len(file_bytes),
        'index_sha256': hashlib.sha256(file_bytes).hexdigest(),
        'readback': receipt.get('readback'),
        'git_tool_checked': os.name == 'nt',
        'git_tool_evidence': GIT_TOOL_EVIDENCE,
        'git_tool_parent_verified': GIT_TOOL_PARENT_VERIFIED,
        'git_tool_file_version_reported': GIT_TOOL_FILE_VERSION,
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
