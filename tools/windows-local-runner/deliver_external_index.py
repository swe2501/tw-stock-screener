"""Exclusive create of the external release index.

The payload below is data. This program writes those bytes and does not
execute them. A directory listing before the call is not an atomic guarantee;
the create itself is exclusive. Windows has not been run.
"""
import array, ctypes, hashlib, json, os, socket, stat, sys

EXPECTED_SHA256 = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
EXPECTED_SIZE = 945
EXECUTION_COMMIT = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
HANDOFF = 'WIN.RUNNER.INDEX_HANDOFF.v5'
_WIN_SYMBOLS = ('OpenProcess', 'DuplicateHandle', 'GetCurrentProcess', 'ReadFile', 'SetFilePointerEx', 'CloseHandle')
WINDOWS_DEST = 'C:\\Users\\User\\Desktop\\AI_RD_IMP\\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
INDEX_BYTES = b"""{
  "schema": "WIN.RUNNER.RELEASE_INDEX.v2",
  "version": "WIN-RUNNER-OPS.v2",
  "repository": "https://github.com/swe2501/tw-stock-screener",
  "prefix": "tools/windows-local-runner/",
  "commit": "5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3",
  "authority": "EXTERNAL",
  "files": {
    "install.py": {
      "size": 15601,
      "sha256": "e00c4ae49dca23d12f491b0e776b899fd720de4dcf1854b3ecfb6a0f6b946cc9"
    },
    "runner.py": {
      "size": 22143,
      "sha256": "9a31acf81b988aacc288981f99f9fb2054209ca64ac0665355abc24cf37948af"
    },
    "worker.py": {
      "size": 1257,
      "sha256": "febba05a0e3ece874e399c24d704c346e878e2e29e42a4acae023e4f2b5937df"
    },
    "run_config.json": {
      "size": 997,
      "sha256": "4fbe36c80e95af6a9e83058eb8019076854d00dd00b44b4633b351a5b5d3c11f"
    },
    "source_pin.json": {
      "size": 513,
      "sha256": "c750112670b6bdfacf156a0ced6d182b79c9cbecb25872b5f99d3d1b62cee53e"
    }
  }
}
"""

def require_payload(payload):
    if type(payload) is not bytes or len(payload) != EXPECTED_SIZE:
        raise ValueError('E_PAYLOAD')
    if hashlib.sha256(payload).hexdigest() != EXPECTED_SHA256:
        raise ValueError('E_PAYLOAD')
    if payload.startswith(b'\xef\xbb\xbf') or b'\r' in payload:
        raise ValueError('E_PAYLOAD')
    doc = json.loads(payload.decode('utf-8'))
    if doc.get('authority') != 'EXTERNAL' or doc.get('commit') != EXECUTION_COMMIT:
        raise ValueError('E_PAYLOAD')
    if doc.get('schema') != 'WIN.RUNNER.RELEASE_INDEX.v2':
        raise ValueError('E_PAYLOAD')
    return payload

def require_named(obj, names):
    for name in names:
        if not hasattr(obj, name):
            raise ValueError('E_HANDOFF')

def require_handoff_api():
    """Refuse before creating a file when this process cannot pass the original handle."""
    if os.name == 'nt':
        try:
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        except OSError as exc:
            raise ValueError('E_HANDOFF') from exc
        require_named(kernel, _WIN_SYMBOLS)
        return
    require_named(socket, ('SCM_RIGHTS',))
    require_named(socket.socket, ('sendmsg',))

def send_fd(sock_fd, file_fd):
    held = socket.fromfd(int(sock_fd), socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        held.sendmsg([b'1'], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array('i', [int(file_fd)]).tobytes())])
    finally:
        held.close()

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

def send_handle_to_parent(file_fd, parent_pid):
    """Windows path. Not executed on Linux. Duplicate the kernel handle into the parent."""
    import msvcrt
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    kernel.DuplicateHandle.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p), ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32,
    ]
    kernel.DuplicateHandle.restype = ctypes.c_int
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.restype = ctypes.c_int
    parent = kernel.OpenProcess(0x0040, 0, int(parent_pid))
    if not parent:
        raise ValueError('E_HANDOFF')
    target = ctypes.c_void_p()
    source = msvcrt.get_osfhandle(file_fd)
    ok = kernel.DuplicateHandle(kernel.GetCurrentProcess(), source, parent, ctypes.byref(target), 0, 0, 0x0002)
    kernel.CloseHandle(parent)
    if not ok or not target.value:
        raise ValueError('E_HANDOFF')
    return int(target.value)

def write_exclusive(dest, payload):
    """Create dest once. A later failure leaves the partial file in place."""
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    fd = os.open(dest, flags, 0o600)
    try:
        written = os.write(fd, payload)
        if written != len(payload):
            raise OSError('E_SHORT_WRITE')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        got = os.read(fd, len(payload) + 1)
        if got != payload:
            raise ValueError('E_READBACK')
        return got, fd
    except Exception:
        os.close(fd)
        raise

def deliver(dest, *, fixture_linux=False, handoff_fd=None, parent_pid=None):
    payload = require_payload(INDEX_BYTES)
    path = os.path.abspath(dest)
    if os.name == 'nt':
        if fixture_linux is True:
            raise RuntimeError('E_FIXTURE_FLAG_ON_WINDOWS')
        if os.path.normcase(path) != os.path.normcase(WINDOWS_DEST):
            raise ValueError('E_DEST')
    elif fixture_linux is not True:
        raise RuntimeError('E_LINUX_FIXTURE_REQUIRED')
    parent = os.path.dirname(path)
    try:
        info = os.lstat(parent)
    except FileNotFoundError as exc:
        raise ValueError('E_PARENT_MISSING') from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ValueError('E_PARENT')
    require_handoff_api()
    try:
        os.lstat(path)
    except FileNotFoundError:
        pass
    else:
        raise ValueError('E_EXISTS')
    if os.name == 'nt':
        if parent_pid is None:
            raise ValueError('E_HANDOFF')
    elif handoff_fd is None:
        raise ValueError('E_HANDOFF')
    try:
        got, fd = write_exclusive(path, payload)
    except FileExistsError as exc:
        raise ValueError('E_EXISTS') from exc
    try:
        if os.name == 'nt':
            send_handle_to_parent(fd, parent_pid)
        else:
            send_fd(handoff_fd, fd)
    finally:
        os.close(fd)
    return {
        'wrote': path,
        'size': len(got),
        'sha256': hashlib.sha256(got).hexdigest(),
        'readback': 'SAME_HANDLE',
        'stat_tuple_is_identity': False,
        'handoff': HANDOFF,
        'identity_from': 'CREATE_FD_SENT',
        'path_bound_after_close': False,
        'executed_payload': False,
        'preflight_is_atomic_guarantee': False,
        'windows': 'NOT_RUN' if os.name != 'nt' else 'LOCAL_WRITE_NOT_AUDITOR_ACCEPTANCE',
        'pipeline_go': False,
    }

def main(argv=None):
    try:
        args = list(sys.argv[1:] if argv is None else argv)
        fixture = False
        dest = None
        handoff_fd = None
        parent_pid = None
        i = 0
        while i < len(args):
            item = args[i]
            if item == '--fixture-linux':
                fixture = True
            elif item == '--dest' and i + 1 < len(args):
                i += 1
                dest = args[i]
            elif item == '--handoff-fd' and i + 1 < len(args):
                i += 1
                handoff_fd = int(args[i])
            elif item == '--parent-pid' and i + 1 < len(args):
                i += 1
                parent_pid = int(args[i])
            else:
                raise ValueError('E_ARGUMENTS')
            i += 1
        if os.name == 'nt':
            dest = WINDOWS_DEST if dest is None else dest
        elif dest is None:
            raise ValueError('E_DEST')
        print(json.dumps(deliver(dest, fixture_linux=fixture, handoff_fd=handoff_fd, parent_pid=parent_pid), ensure_ascii=True), flush=True)
        return 0
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__, 'no_retry': True, 'executed_payload': False}, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3

if __name__ == '__main__':
    sys.exit(main())
