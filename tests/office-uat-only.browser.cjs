/* Offline mock fetch with the actual admin post wrapper + AdminOffice + iframe assets.
 * Real Chromium, existing tools only; virtual polling clock, no real auth/API/session. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const web=path.resolve(__dirname,'../apps/web'),out=process.argv[2]||path.join(os.tmpdir(),'office-uat-only-browser');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(web,'index.html'),'utf8'),postStart=html.indexOf('    function post(action,extra){'),postEnd=html.indexOf('    function dt(',postStart);assert.ok(postStart>=0&&postEnd>postStart);const postSource=html.slice(postStart,postEnd);
const clockScript=`(()=>{const NativeDate=Date,epoch=NativeDate.parse('2026-11-11T23:00:00+08:00');let now=epoch,seq=0;const timers=new Map(),set=window.setInterval.bind(window),clear=window.clearInterval.bind(window);window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};window.setInterval=(fn,ms,...args)=>{if(ms===60000||ms===15000){const id=--seq;timers.set(id,()=>fn(...args));return id;}return set(fn,ms,...args);};window.clearInterval=id=>{if(id<0)timers.delete(id);else clear(id);};window.__officeTick=()=>{now+=60000;[...timers.values()].forEach(fn=>fn());};})();`;
const fixture=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;font:14px sans-serif;background:#edf1ef}#result{display:none}</style><script>${clockScript}</script><script src="assets/office-task-board.js"></script><script src="assets/admin-office.js"></script></head><body><header id="sample">離線合成資料；不連接任何服務</header><main id="office"></main><pre id="result">pending</pre><script>
(async()=>{const result=document.querySelector('#result');try{
 const params=new URLSearchParams(location.search),theme=params.get('theme'),mode=params.get('mode'),scope=mode.startsWith('scope-'),normal=mode==='normal',status=normal?200:mode==='server500'?500:403,calls=[];
 document.documentElement.dataset.theme=theme;const names={8:'品質與測試部',9:'資安與系統維運部',14:'法遵與風險管理部',27:'智慧財產與授權部'};
 const task=(id,status)=>({id,title:'合成 '+id,status,department:8,execution:'agent',worker:'agent-qa',assignee:'qa',revision:1,history:[],criteria:[],checks:[],created_at:new Date().toISOString()});
 const records=[task('queued','queued'),task('review','review')],departments=Array.from({length:32},(_,id)=>({id,name:names[id]||'Department '+id,enabled:id!==16}));
 window.__API='';const tk=()=> 'synthetic-only';
 window.fetch=async(url,opts)=>{const body=JSON.parse(opts.body),isTask=body.action.startsWith('admin_office_tasks_');calls.push({url,method:opts.method,action:body.action,at:Date.now(),status:isTask?status:200});let data;
  if(!isTask)data={agents:{}};else if(normal)data=body.action==='admin_office_tasks_get'?{task:records.find(t=>t.id===body.id)}:{tasks:records,total:2,departments,worker:{}};
  else data=mode==='scope-message'?{message:'任務中心目前僅在 UAT 啟用'}:{error:mode==='forbidden'?'forbidden: 僅限管理員':'任務中心目前僅在 UAT 啟用'};
  return new Response(JSON.stringify(data),{status:isTask?status:200,headers:{'Content-Type':'application/json'}});
 };
 ${postSource}
 const check=(ok,why)=>{if(!ok)throw Error(why);},wait=async(fn,why)=>{const start=performance.now();while(!fn()){if(performance.now()-start>25000)throw Error('timeout '+why);await new Promise(r=>setTimeout(r,50));}};
 AdminOffice.show(document.querySelector('#office'),post);const frame=document.querySelector('#aoTowerFrame');await wait(()=>frame.contentWindow.ForesightOffice&&frame.contentDocument.querySelector('.existing-role-count'),'iframe');
 const f=frame.contentWindow,d=frame.contentDocument,dir=()=>d.querySelector('.department[data-department="8"] .existing-role-count').textContent,room=()=>d.querySelector('.room-label[data-room-department="8"] .room-task-badge').textContent,reads=()=>calls.filter(c=>c.action==='admin_office_tasks_list').length;
 await wait(()=>reads()>=1&&(scope?dir()==='僅 UAT 啟用':normal?dir().includes('待驗收 1'):dir()==='資料過舊'),'initial state');const timeline=[{seconds:0,reads:reads(),label:dir()}];
 for(const seconds of [60,120,180]){window.__officeTick();f.__officeTick();await new Promise(r=>setTimeout(r,180));timeline.push({seconds,reads:reads(),label:dir()});}
 check(scope?reads()===1:reads()>=4,'poll counts '+JSON.stringify(timeline));check(dir()===room(),'right and 3D labels differ');
 f.postMessage({type:'foresight-office-visibility',visible:false},location.origin);f.postMessage({type:'foresight-office-visibility',visible:true},location.origin);window.dispatchEvent(new Event('focus'));f.dispatchEvent(new f.Event('focus'));document.dispatchEvent(new Event('visibilitychange'));d.dispatchEvent(new f.Event('visibilitychange'));await new Promise(r=>setTimeout(r,180));
 f.ForesightOffice.select(8,true);window.dispatchEvent(new CustomEvent('foresight-office-task-updated',{detail:{department:8}}));await new Promise(r=>setTimeout(r,180));
 document.querySelector('#aoTasksTab').click();document.querySelector('[data-ot-refresh]').click();await new Promise(r=>setTimeout(r,180));document.querySelector('#aoTowerTab').click();await new Promise(r=>setTimeout(r,180));
 if(scope){check(reads()===1,'scope retry after focus/visibility/selection/invalidation/board show');check(calls.filter(c=>c.action.startsWith('admin_office_tasks_')).length===1,'only one task request, no detail fetch');check(dir()==='僅 UAT 啟用'&&room()===dir(),'explicit scope notice');check(d.querySelector('#officeDataFreshness').textContent.includes('已停止重試'),'stopped retry explanation');check(f.ForesightOffice.peopleActivity.filter(p=>p.department===8).every(p=>!p.actor),'no phantom task actors');}
 else {check(!dir().includes('僅 UAT 啟用'),'non-scope must not latch');if(normal)check(dir().includes('排隊中 1')&&dir().includes('待驗收 1'),'normal UAT counts preserved');}
 check(calls.filter(c=>c.action.startsWith('admin_office_tasks_')).every(c=>c.url==='/api/auth'&&c.method==='POST'),'actual task endpoint and method');
 f.ForesightOffice.focusFloor(7);await wait(()=>Math.abs(f.ForesightOffice.cameraView.zoom-1.05)<.001&&Math.abs(f.ForesightOffice.cameraView.elevation-.85)<.001,'floor camera');await new Promise(r=>setTimeout(r,1200));
 document.querySelector('#sample').textContent='離線 '+mode+' · 任務列表請求 '+reads()+' 次 · 右列／3D '+dir();result.textContent=JSON.stringify({pass:true,mode,width:innerWidth,theme,timeline,taskListReads:reads(),taskRequests:calls.filter(c=>c.action.startsWith('admin_office_tasks_')),otherAdminReads:calls.filter(c=>!c.action.startsWith('admin_office_tasks_')).length,right:dir(),room:room()});
 }catch(e){result.textContent=JSON.stringify({pass:false,error:e.stack});}})();
</script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__7f_fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(web+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(!error&&url.pathname==='/ai-office.html')data=Buffer.from(data.toString().replace('<head>','<head><script>'+clockScript+'</script>'));if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-7f-chrome-'));
 const chrome=spawn(process.env.CHROME_PATH||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore','ignore','pipe']});
 let log='',ws;const pending=new Map();let seq=0;
 try{
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);chrome.on('error',reject);chrome.on('exit',code=>reject(Error('Chrome exited '+code)));chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const results=[],exceptions=[];const onMessage=ws.onmessage;ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==='Runtime.exceptionThrown')exceptions.push({sessionId:msg.sessionId,detail:msg.params.exceptionDetails});onMessage(e);};
  for(const width of [1440,390])for(const theme of ['light','dark'])for(const mode of ['scope-error','scope-message','forbidden','server500','normal']){
   const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
   await call('Runtime.enable',{},sessionId);
   await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false},sessionId);await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/__7f_fixture?theme='+theme+'&mode='+mode},sessionId);
   let result;const started=Date.now();
   while(Date.now()-started<45000){const r=await call('Runtime.evaluate',{expression:"document.querySelector('#result')?.textContent",returnByValue:true},sessionId);const text=r.result?.value;if(text&&text!=='pending'){try{result=JSON.parse(text);break;}catch{}}await new Promise(r=>setTimeout(r,200));}
   assert.ok(result,'browser fixture timeout '+width+' '+theme);results.push(result);console.log(JSON.stringify(result));
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(out,mode+'-'+theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
   assert.equal(result.pass,true,result.error);assert.equal(exceptions.filter(e=>e.sessionId===sessionId).length,0,JSON.stringify(exceptions));await call('Target.closeTarget',{targetId});
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS real Chrome UAT-only integration: 5 modes × desktop/mobile × light/dark; mock fetch + virtual 60s polls only');
 }finally{ws?.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));server.close();fs.writeFileSync(path.join(out,'chrome-stderr.txt'),log);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
