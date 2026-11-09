"""Linux run of preflight TEST-01..07. TEST-08 is Windows and is not run."""
import json, os, subprocess, sys, tempfile
from pathlib import Path

if sys.platform != 'linux':
    print('LINUX_FIXTURE_ONLY windows=NOT_RUN')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
PRE = ROOT / 'preflight.py'
PY = sys.executable


def main():
    parent = Path(tempfile.mkdtemp(prefix='wlr-preflight-'))
    work = parent / 'work'
    argv = [PY, '-B', str(PRE), 'test', '--run-id', 'mvp001', '--work', str(work)]
    proc = subprocess.run(argv, cwd=str(REPO), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    summary = json.loads((work / 'logs' / 'mvp001' / 'summary.json').read_text(encoding='utf-8'))
    tests = summary['tests']
    assert proc.returncode == 0, proc.stderr.decode()
    for name in ('TEST-01', 'TEST-02', 'TEST-03', 'TEST-04', 'TEST-05', 'TEST-06', 'TEST-07'):
        assert tests[name]['pass'] is True, name
    assert tests['TEST-08']['windows'] == 'NOT_RUN' and tests['TEST-08']['pass'] is None
    occupied = work / 'occupied-stage'
    occupied.mkdir()
    (occupied / 'keep.txt').write_text('keep', encoding='ascii')
    blocked = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(occupied)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert blocked.returncode != 0 and (occupied / 'keep.txt').read_text(encoding='ascii') == 'keep'
    fresh = work / 'fresh-stage'
    cloned = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(fresh)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert cloned.returncode == 0, cloned.stderr.decode()
    head = subprocess.check_output(['git', '-C', str(fresh), 'rev-parse', 'HEAD'], text=True).strip()
    again = subprocess.run(['git', 'clone', '--no-checkout', str(REPO), str(fresh)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert again.returncode != 0
    assert subprocess.check_output(['git', '-C', str(fresh), 'rev-parse', 'HEAD'], text=True).strip() == head
    out = {
        'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
        'argv': argv, 'cwd': str(REPO), 'exit': proc.returncode,
        'tests': {key: {'pass': tests[key]['pass'], 'exit': tests[key].get('exit', tests[key].get('failure_exit'))} for key in tests},
        'clone_existing_exit': again.returncode,
        'TEST-02_note': tests['TEST-02'].get('note'),
        'TEST-02_child_stdout': tests['TEST-02'].get('child_stdout'),
    }
    print(json.dumps(out))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        dest = Path(evidence)
        (dest / 'preflight-linux.json').write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
        (dest / 'preflight-linux.stdout').write_bytes(proc.stdout)
        (dest / 'preflight-linux.stderr').write_bytes(proc.stderr)
        (dest / 'preflight-linux-summary.json').write_text((work / 'logs' / 'mvp001' / 'summary.json').read_text(encoding='utf-8'), encoding='utf-8')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
