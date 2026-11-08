Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -I -c @'
import hashlib, os, stat, subprocess, sys
G = r'C:\Program Files\Git\cmd\git.exe'
P = r'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
PARENT = r'C:\Users\User\Desktop\AI_RD_IMP'
SRC = 'WIN_RUNNER_SOURCE_5f5be6c35bed'
REL = 'tools/windows-local-runner/materialize_pinned_blob.py'
ORIGIN = 'https://github.com/swe2501/tw-stock-screener.git'
COMMIT = 'bdceacf1e610cd3c7bda31de5f110907753a0a61'
BLOB = '3f474cc0b36061926deafa406c206c6fbcc40035'
N = 3125
H = '43e7d2105982ff37814aba33f8be4f44495f99e9a04f8697cae30e3a86d3b9b4'
RUNTIME = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
def die(code, git_exit=None):
    if git_exit is None:
        sys.stderr.write('{"error":"%s","candidate_started":false}\n' % code)
        raise SystemExit(3)
    sys.stderr.write('{"error":"E_GIT","git_exit":%d,"candidate_started":false}\n' % git_exit)
    raise SystemExit(git_exit)
def occupied(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return False
    except OSError:
        die('E_UNKNOWN')
    return True
def git(exe, args):
    proc = subprocess.run([exe, '--no-pager', *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
    if proc.returncode != 0:
        sys.stderr.buffer.write(proc.stderr)
        die('E_GIT', proc.returncode)
    return proc.stdout
def place(dest, data):
    if occupied(dest):
        die('E_EXISTS')
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    if hasattr(os, 'O_BINARY'):
        flags |= os.O_BINARY
    fd = os.open(dest, flags, 0o600)
    try:
        if os.write(fd, data) != len(data):
            die('E_SHORT_WRITE')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, len(data) + 1) != data:
            die('E_READBACK')
    finally:
        os.close(fd)
def parents(path):
    root = os.path.dirname(path)
    missing = []
    cur = root
    while not occupied(cur):
        missing.append(cur)
        cur = os.path.dirname(cur)
    info = os.lstat(cur)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        die('E_PARENT')
    for directory in reversed(missing):
        os.mkdir(directory)
def acquire(parent, origin, git_exe, py, commit, gate=None, index=None):
    repo = os.path.join(parent, SRC)
    script = os.path.join(repo, REL)
    if occupied(repo):
        die('E_EXISTS')
    try:
        os.mkdir(repo)
    except FileNotFoundError:
        die('E_PARENT_MISSING')
    git(git_exe, ['-C', repo, 'init'])
    git(git_exe, ['-C', repo, 'fetch', '--no-tags', origin, commit])
    data = git(git_exe, ['-C', repo, 'cat-file', 'blob', BLOB])
    if len(data) != N or hashlib.sha256(data).hexdigest() != H:
        die('E_SOURCE')
    git(git_exe, ['-C', repo, 'checkout', '--detach', RUNTIME])
    if occupied(script):
        die('E_EXISTS')
    parents(script)
    place(script, data)
    cmd = [py, '-B', '-I', '-']
    if gate is not None:
        cmd.extend(['--fixture-linux', '--repo', repo, '--dest', gate, '--index', index])
    child = subprocess.run(cmd, input=data)
    raise SystemExit(child.returncode)
def main():
    if os.name != 'nt' or sys.argv[1:]:
        die('E_HOST')
    acquire(PARENT, ORIGIN, G, P, COMMIT)
if __name__ == '__main__':
    main()
'@
