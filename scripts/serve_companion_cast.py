"""Loopback-only static art review server. Does not serve credentials or the repo.

python scripts/serve_companion_cast.py --models DIR --references DIR --port 51763
No web API/production Function is installed by this tool.
"""
import argparse
import json
import mimetypes
import re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--models',required=True);parser.add_argument('--references',required=True);parser.add_argument('--port',type=int,default=51763)
 args=parser.parse_args();models=Path(args.models).resolve();references=Path(args.references).resolve()
 assets=Path(__file__).resolve().parent.parent/'apps/web/assets';vendor=assets/'vendor/three-0.180.0'
 model_pattern=re.compile(r'^/(models|references)/(immortal|garden|mountain|space|castle|pet|ocean|gem|train)/(female|male|neutral)/([0-4])\.(glb|png)$')
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   route=unquote(urlparse(self.path).path)
   if route=='/cast-index.json':
    entries=[]
    for file in sorted(models.glob('*/*/[0-4].json')):
     info=json.loads(file.read_text(encoding='utf8'));glb=models/info['file']
     if glb.is_relative_to(models) and glb.is_file():
      entries.append({key:info[key] for key in ['id','file','bytes','triangles','bones','materials','status','features']})
    self.send_bytes(json.dumps({'approved':False,'required':135,'models':entries},ensure_ascii=False).encode('utf8'),'application/json; charset=utf-8');return
   if route=='/':file=assets/'companion-cast-review.html'
   elif route=='/world-atlas.png':file=assets/'goal-art/world-atlas.png'
   elif route=='/companion-cast-scenes.js':file=assets/'companion-cast-scenes.js'
   elif route.startswith('/vendor/three-0.180.0/'):
    file=(vendor/route.removeprefix('/vendor/three-0.180.0/')).resolve()
    if not file.is_relative_to(vendor) or file.suffix not in ['.js','.txt']:self.send_error(404);return
   else:
    match=model_pattern.fullmatch(route)
    if not match:self.send_error(404);return
    kind,theme,persona,stage,extension=match.groups()
    if (kind=='models')!=(extension=='glb'):self.send_error(404);return
    file=(models if kind=='models' else references)/theme/persona/(stage+'.'+extension)
   if not file.is_file():self.send_error(404);return
   self.send_bytes(file.read_bytes(),'model/gltf-binary' if file.suffix=='.glb' else mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
  def send_bytes(self,data,content_type):
   self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
   try:self.wfile.write(data)
   except (ConnectionResetError,BrokenPipeError):pass
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);print('CAST_REVIEW=http://127.0.0.1:'+str(server.server_address[1])+'/',flush=True);server.serve_forever()

if __name__=='__main__':main()
