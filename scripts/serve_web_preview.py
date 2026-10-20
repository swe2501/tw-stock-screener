"""Loopback website preview with the real, read-only focus snapshot endpoint.

Only the public Supabase URL/anon key already shipped in index.html are used.
No env files, service key, Auth setting, production writes or scheduler changes.
Other API routes are not emulated; existing remote website routes stay unchanged.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs,urlsplit

ROOT=Path(__file__).resolve().parents[1]


def load_focus_reader(root=ROOT):
    source=(root/'apps/web/index.html').read_text(encoding='utf-8-sig')
    base=re.search(r"const SIG_SB_URL\s*=\s*'([^']+)'",source).group(1)
    anon=re.search(r"const SIG_SB_ANON\s*=\s*'([^']+)'",source).group(1)
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co',base):
        raise ValueError('Preview accepts only the website public Supabase project')
    spec=importlib.util.spec_from_file_location('local_focus_preview',root/'api/screen.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.SUPABASE_URL=base;module.SUPABASE_KEY=anon
    return module._read_focus_snapshot


def handler_for(reader,root=ROOT):
    class Preview(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root/'apps/web'),**kwargs)
        def do_GET(self):
            url=urlsplit(self.path)
            if url.path=='/api/screen' and parse_qs(url.query).get('stat')==['focus']:
                try:
                    n=int(parse_qs(url.query).get('n',['30'])[0])
                    payload=reader(max(1,min(n,50)))
                    body=json.dumps(payload,ensure_ascii=False,allow_nan=False).encode('utf-8')
                    self.send_response(503 if payload.get('error') else 200)
                except Exception:
                    body=json.dumps({'error':'focus preview temporarily unavailable'}).encode('utf-8');self.send_response(503)
                self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
                return
            super().do_GET()
    return Preview


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=49674);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(load_focus_reader()))
    print(f'Website preview: http://127.0.0.1:{args.port}/ (read-only focus endpoint)',flush=True)
    server.serve_forever()
