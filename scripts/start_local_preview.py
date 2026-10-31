"""Start the loopback screener before opening the local website; no autostart registration."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
HEALTH = 'http://127.0.0.1:49675/api/screen?stat=hidden-capability'


def ready(port=49675):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/screen?stat=hidden-capability', timeout=1) as response:
            payload = json.load(response)
        return isinstance(payload, dict) and payload.get('zhenming_hidden') is True and payload.get('local_preview') is True and payload.get('zhenming4') is True
    except (OSError, ValueError):
        return False


def start(open_browser=True):
    port=next((p for p in (49675,49676) if ready(p)),None)
    if port is None:
        import socket
        for candidate in (49675,49676):
            with socket.socket() as probe:
                if probe.connect_ex(('127.0.0.1',candidate)) != 0:
                    port=candidate
                    break
        if port is None:
            raise RuntimeError('Local preview ports are in use; no existing process was stopped.')
        folder = Path(tempfile.gettempdir()) / 'foresight-local-preview'
        folder.mkdir(exist_ok=True)
        flags = (subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP) if os.name == 'nt' else 0
        with (folder / 'screen.log').open('ab') as log:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / 'scripts/serve_hidden_screen_preview.py'),'--port',str(port)],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                creationflags=flags, close_fds=True,
            )
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if ready(port):
                break
            if process.poll() is not None:
                raise RuntimeError(f'Local preview could not start. See {folder / "screen.log"}')
            time.sleep(.2)
        else:
            raise RuntimeError(f'Local preview did not become ready. See {folder / "screen.log"}')
    if open_browser:
        webbrowser.open((ROOT / 'apps/web/index.html').as_uri() + '#screen')
    print(f'Local screener ready: http://127.0.0.1:{port}/')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    try:
        start(not args.no_open)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
