import os, sys
_d, _n = os.environ.get('WLR_MARKER_DIR'), os.environ.get('WLR_MARKER_NAME')
if _d and _n and _n not in ('.', '..') and '/' not in _n and '\\' not in _n:
    _f = os.open(os.path.join(_d, _n), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.write(_f, b'1')
    os.close(_f)
sys.stderr.buffer.write(b"stderr-only\n")
sys.stderr.buffer.flush()
