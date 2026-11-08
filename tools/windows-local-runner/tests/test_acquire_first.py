"""Linux checks for the clean-start acquisition text. Not Windows and not the C4 suite."""
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
FETCH = 'bdceacf1e610cd3c7bda31de5f110907753a0a61'
RUNTIME = '5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3'
BLOB = '3f474cc0b36061926deafa406c206c6fbcc40035'
SOURCE_SHA = '43e7d2105982ff37814aba33f8be4f44495f99e9a04f8697cae30e3a86d3b9b4'
SOURCE_SIZE = 3125
INDEX_SHA = '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19'
PS1_SHA = 'c48247da7e6404529a281b03aebe799a64f8cdd20f56d98cc8b0c47c99b8dc86'
CONTROL_SHA = 'af70d1c5ccb030bf43f9ce95b209f6d428e215c7ff2f842cf33234d420fba32a'


def payload_of(text):
    return text.split("@'\n", 1)[1].rsplit("\n'@\n", 1)[0] + '\n'


def run_acquire(payload, parent, origin, commit, gate, index):
    driver = (
        'ns={"__name__":"acquire_static"}\n'
        'exec(open(0,"rb").read().decode("ascii"), ns)\n'
        'ns["acquire"](%r,%r,%r,%r,%r,%r,%r)\n'
    ) % (str(parent), str(origin), GIT, PY, commit, str(gate), str(index))
    script = parent / '_drive.py'
    script.write_text(driver, encoding='ascii')
    return subprocess.run(
        [PY, '-B', '-I', str(script)], input=payload.encode('ascii'),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(parent),
    )


def main():
    text = PS1.read_text(encoding='ascii')
    raw = PS1.read_bytes()
    header = text.split("@'\n", 1)[0]
    assert b'\r' not in raw and '>' not in header and '|' not in header
    assert len(raw) == 3458 and hashlib.sha256(raw).hexdigest() == PS1_SHA
    assert 'FromBase64' not in text and 'CopyFromBox' not in text
    assert "Set-Location -LiteralPath 'C:\\Users\\User\\Desktop\\AI_RD_IMP'" in text
    assert BLOB in text and SOURCE_SHA in text and FETCH in text
    payload = payload_of(text)
    assert len(payload.encode('ascii')) == 3314
    assert hashlib.sha256(payload.encode('ascii')).hexdigest() == CONTROL_SHA
    launcher = (ROOT / 'FIRST_ENTRY.ps1').read_bytes()
    assert len(launcher) == 257
    assert hashlib.sha256(launcher).hexdigest() == 'd5bb66361fad904fed28792aa4a9e56f1da691052740770ba4a7e1dd77482b51'
    assert b'materialize_pinned_blob.py' in launcher.splitlines()[1]
    assert len(raw) != len(launcher)
    blob = subprocess.check_output(['git', '-C', str(REPO), 'cat-file', 'blob', BLOB])
    assert len(blob) == SOURCE_SIZE and hashlib.sha256(blob).hexdigest() == SOURCE_SHA
    missing_dir = Path(tempfile.mkdtemp(prefix='wlr-clean-'))
    missing = missing_dir / 'materialize_pinned_blob.py'
    clean_argv = [PY, '-B', '-I', str(missing)]
    clean = subprocess.run(clean_argv, cwd=str(missing_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert clean.returncode != 0 and not missing.exists()
    host = subprocess.run([PY, '-B', '-I', '-c', payload], cwd=str(missing_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert host.returncode == 3 and b'E_HOST' in host.stderr and b'candidate_started' in host.stderr
    with tempfile.TemporaryDirectory(prefix='wlr-acquire-') as raw_dir:
        parent = Path(raw_dir)
        gate = parent / 'WIN_RUNNER_ACCEPT_INDEX.py'
        index = parent / 'WIN_RUNNER_RELEASE_5f5be6c35bed.json'
        ok = run_acquire(payload, parent, REPO, FETCH, gate, index)
        assert ok.returncode == 0, ok.stderr.decode()
        script = parent / 'WIN_RUNNER_SOURCE_5f5be6c35bed' / 'tools' / 'windows-local-runner' / 'materialize_pinned_blob.py'
        assert script.read_bytes() == blob
        receipt = json.loads(ok.stdout)
        assert receipt['transfer_ok'] is True and receipt['python_starts'] == 1
        assert receipt['acceptance_covers'] == 'HELD_CREATE_FD' and receipt['path_bound_after_close'] is False
        assert receipt['index_sha256'] == INDEX_SHA and index.is_file()
        marker = parent / 'WIN_RUNNER_SOURCE_5f5be6c35bed' / 'marker.txt'
        marker.write_text('keep', encoding='ascii')
        again = run_acquire(payload, parent, REPO, FETCH, gate, index)
        assert again.returncode == 3 and b'E_EXISTS' in again.stderr and marker.read_text(encoding='ascii') == 'keep'
        link_parent = parent / 'link-parent'
        link_parent.mkdir()
        link = link_parent / 'WIN_RUNNER_SOURCE_5f5be6c35bed'
        link.symlink_to(parent / 'missing-source')
        linked = run_acquire(payload, link_parent, REPO, FETCH, link_parent / 'gate.py', link_parent / 'index.json')
        assert linked.returncode == 3 and b'E_EXISTS' in linked.stderr and link.is_symlink()
        bad_parent = parent / 'bad'
        bad_parent.mkdir()
        bad = run_acquire(payload, bad_parent, REPO, RUNTIME, bad_parent / 'gate.py', bad_parent / 'index.json')
        assert bad.returncode != 0 and b'candidate_started' in bad.stderr
        assert not (bad_parent / 'WIN_RUNNER_SOURCE_5f5be6c35bed' / 'tools' / 'windows-local-runner' / 'materialize_pinned_blob.py').exists()
    summary = {
        'PASS': 1, 'FAIL': 0, 'windows': 'NOT_RUN', 'powershell': 'NOT_RUN',
        'c4_suite': 'NOT_RERUN', 'c1': 'DISTINCT_CONTROL_TEXT',
        'acquire_ps1_bytes': len(raw), 'acquire_ps1_sha256': PS1_SHA,
        'control_bytes': len(payload.encode('ascii')), 'control_sha256': CONTROL_SHA,
        'source_blob': BLOB, 'source_bytes': SOURCE_SIZE, 'source_sha256': SOURCE_SHA,
        'later_launcher_bytes': 257,
        'clean_start_launcher_argv': clean_argv,
        'clean_start_launcher_cwd': str(missing_dir),
        'clean_start_launcher_exit': clean.returncode,
        'host_argv': [PY, '-B', '-I', '-c', '<ACQUIRE_FIRST control text>'],
        'host_cwd': str(missing_dir), 'host_exit': host.returncode,
        'success_exit': ok.returncode,
    }
    print(json.dumps(summary))
    evidence = os.environ.get('WLR_EVIDENCE_DIR')
    if evidence:
        out = Path(evidence)
        (out / 'acquire-clean.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
        (out / 'acquire-clean-host.stderr').write_bytes(host.stderr)
        (out / 'acquire-clean-success.stdout').write_bytes(ok.stdout)
        (out / 'acquire-clean-success.stderr').write_bytes(ok.stderr)
        (out / 'acquire-clean-exists.stderr').write_bytes(again.stderr)
        (out / 'acquire-clean-link.stderr').write_bytes(linked.stderr)
        (out / 'acquire-clean-bad-source.stderr').write_bytes(bad.stderr)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('FAIL', type(exc).__name__, exc, file=sys.stderr)
        raise SystemExit(1)
