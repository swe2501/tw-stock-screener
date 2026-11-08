"""First entry. The installed Python reads one pinned Git blob and creates it.

Shell redirection is not used. Bytes are checked before the candidate runs.
An existing path is refused and left unchanged. A failed write is left in
place and is not executed. Windows has not been run.
"""
import hashlib, json, os, stat, subprocess, sys

GATE_BLOB = 'b1e55bfd7d5d46fc0591cc69c55e8904cfb60f6e'
GATE_SIZE = 7665
GATE_SHA256 = '0ad70dad694bca145338ac99c3a071966690462bf8cd2435b3f2ee3e3c401232'
WINDOWS_SOURCE = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_SOURCE_5f5be6c35bed'
WINDOWS_GATE = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_ACCEPT_INDEX.py'
WINDOWS_INDEX = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_RELEASE_5f5be6c35bed.json'

def classify_gate(exit_code, data):
    if exit_code != 0:
        raise ValueError('E_GIT_UPSTREAM')
    if not data:
        raise ValueError('E_GIT_EMPTY')
    if len(data) != GATE_SIZE or hashlib.sha256(data).hexdigest() != GATE_SHA256:
        raise ValueError('E_GATE_BYTES')
    blob = hashlib.sha1(('blob %d\0' % len(data)).encode() + data).hexdigest()
    if blob != GATE_BLOB:
        raise ValueError('E_GATE_BLOB')
    return data

def assert_absent(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        raise ValueError('E_UNKNOWN') from exc
    raise ValueError('E_EXISTS')

def write_exclusive(dest, payload):
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    fd = os.open(dest, flags, 0o600)
    try:
        if os.write(fd, payload) != len(payload):
            raise OSError('E_SHORT_WRITE')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        got = os.read(fd, len(payload) + 1)
        if got != payload:
            raise ValueError('E_READBACK')
    finally:
        os.close(fd)

def fetch_gate(repo):
    proc = subprocess.run(
        ['git', '--no-pager', '-C', repo, 'cat-file', 'blob', GATE_BLOB],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False,
    )
    return classify_gate(proc.returncode, proc.stdout), proc.returncode

def materialize(repo, dest):
    repo = os.path.abspath(repo)
    dest = os.path.abspath(dest)
    parent = os.path.dirname(dest)
    try:
        info = os.lstat(parent)
    except FileNotFoundError as exc:
        raise ValueError('E_PARENT_MISSING') from exc
    except OSError as exc:
        raise ValueError('E_UNKNOWN') from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ValueError('E_PARENT')
    assert_absent(dest)
    data, upstream = fetch_gate(repo)
    try:
        write_exclusive(dest, data)
    except FileExistsError as exc:
        raise ValueError('E_EXISTS') from exc
    return {'upstream_exit': upstream, 'bytes': data, 'executed': False}

def main(argv=None):
    try:
        args = list(sys.argv[1:] if argv is None else argv)
        fixture = False
        repo = None
        dest = None
        index = None
        i = 0
        while i < len(args):
            item = args[i]
            if item == '--fixture-linux':
                fixture = True
            elif item == '--repo' and i + 1 < len(args):
                i += 1
                repo = args[i]
            elif item == '--dest' and i + 1 < len(args):
                i += 1
                dest = args[i]
            elif item == '--index' and i + 1 < len(args):
                i += 1
                index = args[i]
            else:
                raise ValueError('E_ARGUMENTS')
            i += 1
        if os.name == 'nt':
            if fixture:
                raise RuntimeError('E_FIXTURE_FLAG_ON_WINDOWS')
            repo = WINDOWS_SOURCE if repo is None else repo
            dest = WINDOWS_GATE if dest is None else dest
            if os.path.normcase(os.path.abspath(dest)) != os.path.normcase(WINDOWS_GATE):
                raise ValueError('E_DEST')
        elif fixture is not True or repo is None or dest is None or index is None:
            raise ValueError('E_ARGUMENTS')
        materialize(repo, dest)
        forwarded = [sys.executable, '-B', os.path.abspath(dest), '--source', os.path.abspath(repo)]
        if fixture:
            forwarded.extend(['--fixture-linux', '--dest', os.path.abspath(index)])
        os.execv(sys.executable, forwarded)
    except Exception as exc:
        print(json.dumps({
            'error': str(exc), 'type': type(exc).__name__, 'no_retry': True,
            'executed': False, 'candidate_started': False,
        }, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3

if __name__ == '__main__':
    sys.exit(main())
