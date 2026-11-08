Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
& 'C:\Program Files\Git\cmd\git.exe' -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed' fetch --no-tags origin ef96dc38099f5f82643afc3831f82df8119b9421
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$kind = & 'C:\Program Files\Git\cmd\git.exe' -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed' cat-file -t 07374a1d2052908a366126eba0599f552a9896c0
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($kind -ne 'blob') { exit 3 }
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -I -c @'
import hashlib, json, os, stat, subprocess, sys
G = r'C:\Program Files\Git\cmd\git.exe'
P = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
R = r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed'
D = r'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_ACCEPT_INDEX.py'
B = '07374a1d2052908a366126eba0599f552a9896c0'
N = 11774
H = 'f91138a4067a82a47faf8cf3a584ecbc711d5970af75452999672132293842e5'
GS = 46968
GH = 'd90e36cafd656d52984f7546bfcb5b065d73e2e66957c952b7a4a1cd260e8f36'
def die(code):
    sys.stderr.write('{"error":"%s","candidate_started":false}\n' % code)
    raise SystemExit(3)
def read_regular(path, limit):
    try:
        info = os.lstat(path)
    except OSError:
        die('E_GIT_TOOL')
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        die('E_GIT_TOOL')
    flags = os.O_RDONLY
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    try:
        fd = os.open(path, flags)
    except OSError:
        die('E_GIT_TOOL')
    try:
        return os.read(fd, limit + 1)
    finally:
        os.close(fd)
def require_tool(path, size, digest):
    data = read_regular(path, size)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        die('E_GIT_TOOL')
    return data
def absent(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return
    except OSError:
        die('E_UNKNOWN')
    die('E_EXISTS')
def parent_ok(path):
    try:
        info = os.lstat(os.path.dirname(path))
    except FileNotFoundError:
        die('E_PARENT_MISSING')
    except OSError:
        die('E_UNKNOWN')
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        die('E_PARENT')
def require_gate(data):
    if len(data) != N or hashlib.sha256(data).hexdigest() != H:
        die('E_GATE_BYTES')
    return data
def place(dest, payload):
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    try:
        fd = os.open(dest, flags, 0o600)
    except FileExistsError:
        die('E_EXISTS')
    except OSError:
        die('E_UNKNOWN')
    try:
        if os.write(fd, payload) != len(payload):
            die('E_SHORT_WRITE')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, len(payload) + 1) != payload:
            die('E_READBACK')
    finally:
        os.close(fd)
def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    fx = False
    repo = dest = git = py = index = None
    i = 0
    while i < len(args):
        item = args[i]
        if item == '--fixture-linux':
            fx = True
        elif item in ('--repo', '--dest', '--git', '--python', '--index') and i + 1 < len(args):
            i += 1
            if item == '--repo':
                repo = args[i]
            elif item == '--dest':
                dest = args[i]
            elif item == '--git':
                git = args[i]
            elif item == '--python':
                py = args[i]
            else:
                index = args[i]
        else:
            die('E_ARGUMENTS')
        i += 1
    if os.name == 'nt':
        if fx:
            die('E_FIXTURE')
        git, py, repo, dest = G, P, R, D
        require_tool(git, GS, GH)
    elif not fx or None in (repo, dest, git, py, index):
        die('E_ARGUMENTS')
    parent_ok(dest)
    absent(dest)
    proc = subprocess.run([git, '--no-pager', '-C', repo, 'cat-file', 'blob', B], stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, shell=False)
    if proc.returncode != 0:
        sys.stderr.buffer.write(proc.stderr)
        sys.stderr.write('{"error":"E_GIT","git_exit":%d,"candidate_started":false}\n' % proc.returncode)
        raise SystemExit(proc.returncode)
    data = require_gate(proc.stdout)
    place(dest, data)
    cmd = [py, '-B', '-I', '-', '--source', os.path.abspath(repo)]
    if fx:
        cmd.extend(['--fixture-linux', '--dest', os.path.abspath(index)])
    child = subprocess.run(cmd, input=data, shell=False)
    raise SystemExit(child.returncode)
if __name__ == '__main__':
    main()
'@
