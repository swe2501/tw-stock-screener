"""Loopback-only screen preview, public read data and in-memory job receipts only."""
import argparse
import json
import re
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
from serve_web_preview import ROOT, load_focus_reader


def handler_for(screen, root=ROOT):
    jobs = {}
    lock = threading.Lock()
    class Preview(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root/'apps/web'),**kwargs)
        def permitted(self):
            origin=self.headers.get('Origin','')
            if not origin or origin=='null':return True
            value=urlsplit(origin)
            return value.scheme=='http' and value.hostname in ('localhost','127.0.0.1','::1')
        def send_json(self,status,data):
            body=json.dumps(data,ensure_ascii=False,allow_nan=False).encode('utf-8')
            self.send_response(status)
            if self.permitted():
                self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin') or '*')
                self.send_header('Vary','Origin')
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.end_headers();self.wfile.write(body)
        def do_OPTIONS(self):
            if not self.permitted():return self.send_json(403,{'error':'Local preview only'})
            self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin') or '*');self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type');self.end_headers()
        def do_GET(self):
            u=urlsplit(self.path);query=parse_qs(u.query)
            if u.path=='/api/screen':
                if not self.permitted():return self.send_json(403,{'error':'Local preview only'})
                if query.get('stat')==['hidden-capability']:return self.send_json(200,{'zhenming_hidden':True,'zhenming4':True,'local_preview':True})
                job=query.get('job_id',[''])[0]
                if job:
                    with lock:
                        receipt=jobs.get(job)
                    return self.send_json(200,receipt[1] if receipt else {'pending':True})
                return self.send_json(404,{'error':'Unsupported preview query'})
            super().do_GET()
        def do_POST(self):
            if urlsplit(self.path).path!='/api/screen':return self.send_json(404,{'error':'Unsupported preview route'})
            if not self.permitted():return self.send_json(403,{'error':'Local preview only'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=65536:raise ValueError('Request size invalid')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):raise ValueError('Request format invalid')
                job=body.pop('job_id',None)
                if job and not re.fullmatch(r'[a-zA-Z0-9-]{1,100}',str(job)):raise ValueError('Job ID invalid')
                result=screen(body)
                if job:
                    with lock:
                        now=time.monotonic()
                        for key in list(jobs):
                            if now-jobs[key][0]>900:jobs.pop(key,None)
                        if len(jobs)>=100:jobs.pop(next(iter(jobs)))
                        jobs[job]=(now,result)
                self.send_json(200,result)
            except Exception as error:self.send_json(400,{'error':str(error),'results':[]})
    return Preview

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=49675);args=parser.parse_args()
    reader=load_focus_reader()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(reader.__globals__['screen']))
    print(f'Hidden screener preview: http://127.0.0.1:{args.port}/',flush=True)
    server.serve_forever()
