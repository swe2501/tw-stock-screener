import sys
sys.stderr.buffer.write(b"stderr-only\n")
sys.stderr.buffer.flush()
