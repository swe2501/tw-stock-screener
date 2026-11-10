"""Install four runtime files into a new inbox after an external release index matches git blobs.

This is not a second runner and it does not launch a worker.
CopyFromBox / Copy-Item no-clobber is not used and is not claimed.
Linux mode bits are not a Windows ACL proof.
"""
import argparse, hashlib, json, os, platform, re, stat, subprocess, sys
from pathlib import Path

VERSION = 'WIN-RUNNER-OPS.v2'
EXPECTED_SOURCE_PIN_SHA256 = 'c750112670b6bdfacf156a0ced6d182b79c9cbecb25872b5f99d3d1b62cee53e'
REPOSITORY = 'https://github.com/swe2501/tw-stock-screener'
PREFIX = 'tools/windows-local-runner/'
RELEASE_FILES = ('install.py', 'runner.py', 'worker.py', 'run_config.json', 'source_pin.json')
RUNTIME_FILES = ('runner.py', 'worker.py', 'run_config.json', 'source_pin.json')
MANAGED_WINDOWS_TARGET = r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2'
WIN_PYTHON = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
COMMIT_RE = re.compile(r'[0-9a-f]{40}')
FORBIDDEN_MARKERS = ('AI型態判斷', 'D:\\StockAI', 'D:/StockAI')

def _guard(synthetic):
    if synthetic is not True:
        raise ValueError('E_SYNTHETIC_LITERAL_TRUE')

def _encoding(raw):
    if raw.startswith(b'\xef\xbb\xbf') or b'\r' in raw:
        raise ValueError('E_ENCODING')
    raw.decode('utf-8', errors='strict')

def _git(cwd, args):
    if args[0] == 'cat-file':
        if args[1:] and args[1] != 'blob':
            raise ValueError('E_GIT_ARGV')
        spec = args[2]
        commit, _, rel = spec.partition(':')
        if COMMIT_RE.fullmatch(commit) is None or rel not in [PREFIX + name for name in RELEASE_FILES]:
            raise ValueError('E_GIT_ARGV')
    elif args == ['--version'] or args == ['rev-parse', 'HEAD'] or args == ['rev-parse', '--show-toplevel']:
        pass
    elif args[:3] == ['status', '--porcelain', '--'] and args[3:] == [PREFIX + name for name in RELEASE_FILES]:
        pass
    elif args == ['remote', 'get-url', 'origin']:
        pass
    else:
        raise ValueError('E_GIT_ARGV')
    proc = subprocess.run(
        ['git', '-C', str(cwd), *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False,
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'},
    )
    if args == ['remote', 'get-url', 'origin']:
        return proc
    if proc.returncode != 0:
        raise ValueError('E_GIT_OBJECT')
    return proc.stdout

def _origin_state(repo):
    proc = _git(repo, ['remote', 'get-url', 'origin'])
    if proc.returncode != 0:
        return 'NO_ORIGIN'
    text = proc.stdout.decode('utf-8', 'replace').strip()
    rest = text.split('://', 1)[-1].split('@', 1)[-1].rstrip('/')
    if rest.endswith('.git'):
        rest = rest[:-4]
    if rest.lower() != 'github.com/swe2501/tw-stock-screener':
        raise ValueError('E_REMOTE_MISMATCH')
    return 'MATCH'

def _load_index(path, repo):
    index_path = Path(path).resolve()
    if not index_path.is_absolute() or index_path.is_symlink() or not stat.S_ISREG(index_path.lstat().st_mode):
        raise ValueError('E_INDEX_LOCATION')
    repo_resolved = repo.resolve()
    if index_path == repo_resolved or repo_resolved in index_path.parents:
        raise ValueError('E_INDEX_LOCATION')
    raw = index_path.read_bytes()
    _encoding(raw)
    doc = json.loads(raw.decode('utf-8'))
    if set(doc) != {'schema', 'version', 'repository', 'prefix', 'commit', 'authority', 'files'}:
        raise ValueError('E_INDEX_SCHEMA')
    if doc['schema'] != 'WIN.RUNNER.RELEASE_INDEX.v2' or doc['version'] != VERSION or doc['repository'] != REPOSITORY or doc['prefix'] != PREFIX or doc['authority'] != 'EXTERNAL':
        raise ValueError('E_INDEX_SCHEMA')
    commit = doc['commit']
    if type(commit) is not str or COMMIT_RE.fullmatch(commit) is None or commit in {'0' * 40, '1' * 40}:
        raise ValueError('E_COMMIT_FORMAT')
    if set(doc['files']) != set(RELEASE_FILES):
        raise ValueError('E_INDEX_FILES')
    for name, row in doc['files'].items():
        if set(row) != {'size', 'sha256'} or type(row['size']) is not int or not 0 < row['size'] < 262144 or re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is None:
            raise ValueError('E_INDEX_ROW')
    return raw, doc

def _repo():
    return Path(_git(Path(__file__).resolve().parent, ['rev-parse', '--show-toplevel']).decode().strip())

def _snapshots_from_git(repo, doc):
    head = _git(repo, ['rev-parse', 'HEAD']).decode().strip()
    if head != doc['commit']:
        raise ValueError('E_COMMIT_MISMATCH')
    origin = _origin_state(repo)
    dirty = _git(repo, ['status', '--porcelain', '--', *[PREFIX + name for name in RELEASE_FILES]])
    if dirty.strip():
        raise ValueError('E_DIRTY')
    snapshots = {}
    for name in RELEASE_FILES:
        rel = PREFIX + name
        blob = _git(repo, ['cat-file', 'blob', doc['commit'] + ':' + rel])
        work = repo / rel
        info = work.lstat()
        if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('E_SOURCE_ENTRY')
        raw = work.read_bytes()
        if raw != blob:
            raise ValueError('E_WORKTREE_BLOB')
        _encoding(raw)
        row = doc['files'][name]
        if len(raw) != row['size'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise ValueError('E_RELEASE_MISMATCH:' + name)
        snapshots[name] = raw
    pin_raw = snapshots['source_pin.json']
    if hashlib.sha256(pin_raw).hexdigest() != EXPECTED_SOURCE_PIN_SHA256 or EXPECTED_SOURCE_PIN_SHA256 in {'0' * 64, '1' * 64}:
        raise ValueError('E_INSTALLER_PIN_DEPENDENCY')
    pin = json.loads(pin_raw.decode('ascii'))
    if set(pin.get('files', {})) != set(RUNTIME_FILES) - {'source_pin.json'}:
        raise ValueError('E_MEMBER_ALLOWLIST')
    for name, row in pin['files'].items():
        held = snapshots[name]
        if len(held) != row['size'] or hashlib.sha256(held).hexdigest() != row['sha256']:
            raise ValueError('E_SOURCE_HASH:' + name)
    return snapshots, origin

def _authorize(release_index):
    repo = _repo()
    _raw, doc = _load_index(release_index, repo)
    snapshots, origin = _snapshots_from_git(repo, doc)
    info = {
        'verified': True, 'commit': doc['commit'], 'origin': origin, 'files': list(RELEASE_FILES),
        'launched_tasks': 0, 'source_pin_sha256': hashlib.sha256(snapshots['source_pin.json']).hexdigest(),
        'git_identity': 'LOCAL_OBJECTS_ONLY', 'network_fetch': False,
    }
    return snapshots, info

def verify_index(*, synthetic, release_index):
    _guard(synthetic)
    _snapshots, info = _authorize(release_index)
    return info

def _reject_target_text(target):
    text = str(target)
    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            raise ValueError('E_TARGET_FORBIDDEN')

def _parents_ok(target):
    if not target.is_absolute():
        raise ValueError('E_TARGET')
    parent = target.parent
    if not parent.exists():
        raise ValueError('E_PARENT_MISSING')
    for candidate in [parent, *parent.parents]:
        info = candidate.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400 or not stat.S_ISDIR(info.st_mode):
            raise ValueError('E_PARENT')
        if candidate.parent == candidate:
            break

def prove_private_windows_acl(path):
    """Set and read back a protected one-ACE DACL. Linux must not call this a proof."""
    if os.name != 'nt':
        raise RuntimeError('E_WINDOWS_ACL_NOT_THIS_PLATFORM')
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    advapi32 = ctypes.WinDLL('advapi32', use_last_error=True)
    TOKEN_QUERY = 0x0008
    TokenUser = 1
    SE_FILE_OBJECT = 1
    DACL_SECURITY_INFORMATION = 0x4
    PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000
    FILE_ALL_ACCESS = 0x1F01FF
    ACL_REVISION = 2

    class SID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [('Sid', ctypes.c_void_p), ('Attributes', wintypes.DWORD)]

    class TOKEN_USER(ctypes.Structure):
        _fields_ = [('User', SID_AND_ATTRIBUTES)]

    def fail():
        raise RuntimeError('E_WINDOWS_ACL_UNCERTAIN')

    token = wintypes.HANDLE()
    if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), TOKEN_QUERY, ctypes.byref(token)):
        fail()
    try:
        needed = wintypes.DWORD(0)
        advapi32.GetTokenInformation(token, TokenUser, None, 0, ctypes.byref(needed))
        buf = ctypes.create_string_buffer(needed.value)
        if not advapi32.GetTokenInformation(token, TokenUser, buf, needed, ctypes.byref(needed)):
            fail()
        user = ctypes.cast(buf, ctypes.POINTER(TOKEN_USER)).contents
        sid_len = advapi32.GetLengthSid(user.User.Sid)
        sid_copy = ctypes.create_string_buffer(sid_len)
        if not advapi32.CopySid(sid_len, sid_copy, user.User.Sid):
            fail()
        sid = ctypes.cast(sid_copy, ctypes.c_void_p)
    finally:
        kernel32.CloseHandle(token)
    acl_size = 8 + 12 + sid_len - 4
    acl = ctypes.create_string_buffer(acl_size)
    if not advapi32.InitializeAcl(acl, acl_size, ACL_REVISION):
        fail()
    if not advapi32.AddAccessAllowedAce(acl, ACL_REVISION, FILE_ALL_ACCESS, sid):
        fail()
    status = advapi32.SetNamedSecurityInfoW(
        str(path), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
        None, None, acl, None,
    )
    if status != 0:
        fail()
    present = wintypes.BOOL()
    defaulted = wintypes.BOOL()
    dacl = ctypes.c_void_p()
    sd = ctypes.c_void_p()
    status = advapi32.GetNamedSecurityInfoW(
        str(path), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        None, None, ctypes.byref(dacl), None, ctypes.byref(sd),
    )
    if status != 0 or not dacl.value:
        fail()
    class ACL_SIZE(ctypes.Structure):
        _fields_ = [('AceCount', wintypes.DWORD), ('AclBytesInUse', wintypes.DWORD), ('AclBytesFree', wintypes.DWORD)]
    size_info = ACL_SIZE()
    if not advapi32.GetAclInformation(dacl, ctypes.byref(size_info), ctypes.sizeof(size_info), 2):
        fail()
    if size_info.AceCount != 1:
        fail()
    control = wintypes.WORD()
    revision = wintypes.DWORD()
    if not advapi32.GetSecurityDescriptorControl(sd, ctypes.byref(control), ctypes.byref(revision)):
        fail()
    if not control.value & 0x1000:
        fail()
    return {'proven': True, 'ace_count': 1, 'protected': True}

def _posix_mode(path, expected):
    os.chmod(path, expected)
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode) or (mode & 0o777) != expected:
        raise ValueError('E_POSIX_MODE')
    return format(mode & 0o777, '04o')

def write_exclusive_files(target, snapshots):
    """Write runtime files from memory. On failure leave partial files and do not choose another root."""
    written = []
    try:
        for name in RUNTIME_FILES:
            dest = target / name
            payload = snapshots[name]
            flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
            if hasattr(os, 'O_NOFOLLOW'):
                flags |= os.O_NOFOLLOW
            fd = os.open(dest, flags, 0o600)
            try:
                if os.write(fd, payload) != len(payload):
                    raise OSError('E_SHORT_WRITE')
                os.fsync(fd)
                os.lseek(fd, 0, os.SEEK_SET)
                got = os.read(fd, len(payload) + 1)
                if got != payload:
                    raise ValueError('E_SAME_HANDLE_READBACK')
            finally:
                os.close(fd)
            if os.name != 'nt':
                _posix_mode(dest, 0o600)
            else:
                prove_private_windows_acl(dest)
            written.append(name)
        if os.name != 'nt':
            fd = os.open(target, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    except BaseException:
        raise
    return written

def _resolve_target(target, fixture_linux):
    system = platform.system()
    if system == 'Windows':
        if fixture_linux is True:
            raise RuntimeError('E_FIXTURE_FLAG_ON_WINDOWS')
        if platform.node() != 'O211102':
            raise RuntimeError('E_WRONG_MACHINE')
        exe = Path(sys.executable).resolve()
        if os.path.normcase(str(exe)) != os.path.normcase(WIN_PYTHON) or platform.python_version() != '3.14.5':
            raise RuntimeError('E_PYTHON_BINDING')
        version = _git(Path(__file__).resolve().parent, ['--version']).decode().strip()
        if re.fullmatch(r'git version 2\.46\.1(\.windows\.\d+)?', version) is None:
            raise RuntimeError('E_GIT_VERSION')
        chosen = Path(MANAGED_WINDOWS_TARGET if target is None else target)
        if os.path.normcase(str(chosen)) != os.path.normcase(MANAGED_WINDOWS_TARGET):
            raise RuntimeError('E_TARGET_NOT_MANAGED')
        return chosen
    if system != 'Linux' or fixture_linux is not True:
        raise RuntimeError('E_LINUX_FIXTURE_REQUIRED')
    if target is None:
        raise RuntimeError('E_TARGET_REQUIRED')
    return Path(target)

def install(*, synthetic, release_index, target=None, fixture_linux=False):
    _guard(synthetic)
    chosen = _resolve_target(target, fixture_linux)
    _reject_target_text(chosen)
    snapshots, info = _authorize(release_index)
    try:
        chosen.lstat()
    except FileNotFoundError:
        pass
    else:
        raise ValueError('E_TARGET_EXISTS')
    _parents_ok(chosen)
    chosen.mkdir(exist_ok=False)
    proof = {'windows_acl_proven': False, 'windows_acl': 'NOT_RUN', 'posix_is_not_windows_acl': True}
    try:
        if os.name == 'nt':
            acl = prove_private_windows_acl(chosen)
            if acl.get('proven') is not True:
                raise RuntimeError('E_WINDOWS_ACL_UNCERTAIN')
            proof = {'windows_acl_proven': True, 'windows_acl': acl, 'posix_is_not_windows_acl': True}
        else:
            proof['posix_dir_mode'] = _posix_mode(chosen, 0o700)
        write_exclusive_files(chosen, snapshots)
    except BaseException:
        raise
    result = {
        'installed': str(chosen), 'commit': info['commit'], 'origin': info['origin'],
        'files': RUNTIME_FILES, 'launched_tasks': 0, 'no_retry': True, 'permission_proof': proof,
        'network_fetch': False, 'copy_tool': None, 'windows_runtime': 'NOT_RUN' if platform.system() != 'Windows' else 'LOCAL_INSTALL_NOT_AUDITOR_ACCEPTANCE',
    }
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return 0

def main(argv=None):
    parser = argparse.ArgumentParser(prog='install.py')
    parser.add_argument('operation', choices=['verify-index', 'install'])
    parser.add_argument('--synthetic', action='store_true')
    parser.add_argument('--release-index', required=True)
    parser.add_argument('--target')
    parser.add_argument('--fixture-linux', action='store_true')
    try:
        args = parser.parse_args(argv)
        if args.operation == 'verify-index':
            print(json.dumps(verify_index(synthetic=args.synthetic, release_index=args.release_index), ensure_ascii=True), flush=True)
            return 0
        return install(synthetic=args.synthetic, release_index=args.release_index, target=args.target, fixture_linux=args.fixture_linux)
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__, 'no_retry': True, 'launched_tasks': 0}, ensure_ascii=True), file=sys.stderr, flush=True)
        return 3

if __name__ == '__main__':
    sys.exit(main())
