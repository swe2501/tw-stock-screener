"""Public data only, trusted LAN development; no credentials or database required."""
import argparse
import importlib.util
from pathlib import Path
from http.server import ThreadingHTTPServer

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8788)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('preview', Path(__file__).parent / 'api/prices.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    print(f'Public daily market API: http://{args.host}:{args.port}/api/prices?action=market_summary', flush=True)
    ThreadingHTTPServer((args.host, args.port), module.handler).serve_forever()
