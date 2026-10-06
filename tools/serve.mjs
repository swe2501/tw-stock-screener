import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  const raw=decodeURIComponent((req.url||'/').split('?')[0]);
  const rel=raw==='/'?'index.html':raw.replace(/^\/+/, '');
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return}
  fs.stat(file,(err,stat)=>{
    const target=!err&&stat.isDirectory()?path.join(file,'index.html'):file;
    fs.readFile(target,(readErr,data)=>{
      if(readErr){res.writeHead(404).end('Not found');return}
      res.writeHead(200,{'Content-Type':types[path.extname(target).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    });
  });
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
