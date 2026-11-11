/* Real Chromium executes actual inline auth/admin functions with synthetic fetch only.
 * No real sessions, hosted APIs, private profiles, browser package or install needed. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const {factory,cases,scenario}=require('./helpers/admin-auth-fixture.cjs');
const web=path.resolve(__dirname,'../apps/web'),out=process.argv[2]||path.join(os.tmpdir(),'admin-401-browser');fs.mkdirSync(out,{recursive:true});
const fixture=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:24px;font:16px sans-serif}pre{white-space:pre-wrap}</style></head><body><h1>Admin 401 離線驗證</h1><p>實際 inline post／refresh 函式；mock fetch；不連線真實服務。</p><pre id="result">pending</pre><script>
${factory}
(async()=>{const target=document.querySelector('#result');try{const results=[];const run=${scenario.toString()};for(const name of ${JSON.stringify(cases)})results.push(await run(name,createClient));target.textContent=JSON.stringify({pass:true,width:innerWidth,theme:new URLSearchParams(location.search).get('theme'),cases:results});}catch(e){target.textContent=JSON.stringify({pass:false,error:e.stack});}})();
</script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__7f_fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(web+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-7f-chrome-'));
 const chrome=spawn(process.env.CHROME_PATH||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore','ignore','pipe']});
 let log='',ws;const pending=new Map();let seq=0;
 try{
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);chrome.on('error',reject);chrome.on('exit',code=>reject(Error('Chrome exited '+code)));chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const results=[],exceptions=[];const onMessage=ws.onmessage;ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==='Runtime.exceptionThrown')exceptions.push({sessionId:msg.sessionId,detail:msg.params.exceptionDetails});onMessage(e);};
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
   await call('Runtime.enable',{},sessionId);
   await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false},sessionId);await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/__7f_fixture?theme='+theme},sessionId);
   let result;const started=Date.now();
   while(Date.now()-started<45000){const r=await call('Runtime.evaluate',{expression:"document.querySelector('#result')?.textContent",returnByValue:true},sessionId);const text=r.result?.value;if(text&&text!=='pending'){try{result=JSON.parse(text);break;}catch{}}await new Promise(r=>setTimeout(r,200));}
   assert.ok(result,'browser fixture timeout '+width+' '+theme);results.push(result);console.log(JSON.stringify(result));
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(out,'admin-auth-'+theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
   assert.equal(result.pass,true,result.error);assert.equal(exceptions.filter(e=>e.sessionId===sessionId).length,0,JSON.stringify(exceptions));await call('Target.closeTarget',{targetId});
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS real Chrome admin401 transport: 10 scenarios × desktop/mobile × light/dark; isolated mock fetch only');
 }finally{ws?.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));server.close();fs.writeFileSync(path.join(out,'chrome-stderr.txt'),log);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
