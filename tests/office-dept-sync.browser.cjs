/* Real Chromium integration using only existing Chrome + Node built-ins.
 * Local static assets + synthetic in-memory post(); never contacts UAT or task APIs.
 * No npm install, authenticated browser profile, secrets, env files, or paid APIs. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const web=path.resolve(__dirname,'../apps/web'),out=process.argv[2]||path.join(os.tmpdir(),'office-7f-browser-evidence');fs.mkdirSync(out,{recursive:true});
const fixture=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px}main{min-width:0}#result{white-space:pre-wrap;overflow-wrap:anywhere}</style><base href="/"> <link rel="stylesheet" href="assets/office-task-board.css"></head><body><main id="office"></main><pre id="result">pending</pre>
<script src="assets/office-task-board.js"></script><script src="assets/admin-office.js"></script><script>
(async()=>{const result=document.querySelector('#result');try{
 const theme=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.theme=theme;
 const names={8:'品質與測試部',9:'資安與系統維運部',14:'法遵與風險管理部',27:'智慧財產與授權部'};
 const make=(id,status,revision=1,department=8)=>({id,title:id,status,revision,department,execution:'agent',created_at:'2026-11-06T01:00:00+08:00',history:[],criteria:[],checks:[]});
 const manual=make('manual8','queued'),trial=make('trial8','review',4),cancelled=make('cancelled8','cancelled',3);
 let records=[manual,trial,cancelled],total=3,reads=0;
 const catalogue=Array.from({length:32},(_,id)=>({id,name:names[id]||'Department '+id,enabled:id!==16}));
 const post=async(action,args)=>{if(action==='admin_office')return {agents:{}};if(action==='admin_office_tasks_list')return {tasks:records,total,departments:catalogue};if(action==='admin_office_tasks_get'){reads++;return {task:records.find(t=>t.id===args.id)};}throw Error('Unexpected API '+action);};
 const check=(ok,why)=>{if(!ok)throw Error(why);};
 const wait=async(fn,why)=>{const start=performance.now();while(!fn()){if(performance.now()-start>15000)throw Error('timeout '+why);await new Promise(r=>setTimeout(r,50));}};
 AdminOffice.show(document.querySelector('#office'),post);
 const frame=document.querySelector('#aoTowerFrame');await wait(()=>frame.contentWindow.ForesightOffice&&frame.contentDocument.querySelector('.existing-role-count'),'iframe data');
 const f=frame.contentWindow,d=frame.contentDocument,dir=id=>d.querySelector('.department[data-department="'+id+'"] .existing-role-count')?.textContent,room=id=>d.querySelector('.room-label[data-room-department="'+id+'"] .room-task-badge')?.textContent;
 await wait(()=>dir(8)==='排隊中 1（Agent 待領 1） · 待驗收 1 · 尚未領取／無人執行 1','QA status');check(dir(8)===room(8),'QA right/room differ');check(dir(14).includes('舊排程 1 組')&&dir(14)===room(14),'risk wording');
 f.ForesightOffice.focusFloor(7);
 for(const id of [9,14,27,8]){
  d.querySelector('.room-label[data-room-department="'+id+'"] .room-task-badge').click();
  await wait(()=>document.querySelector('[data-ot-department]').value===String(id),'board filter '+id);
  check(f.ForesightOffice.selectedDepartment===id,'bottom selection '+id);check(d.querySelector('#detailTitle').textContent===names[id],'bottom name '+id);
  document.querySelector('#aoTowerTab').click();
 }
 const input=document.querySelector('[data-ot-query]');input.value='does-not-exist';input.dispatchEvent(new Event('input'));
 d.querySelector('.room-label[data-room-department="8"] .room-task-badge').click();await wait(()=>document.querySelectorAll('.ot-card').length===3,'cleared search cards');check(input.value==='','search residue');check(document.querySelector('[data-ot-summary]').textContent.includes('已取消'),'cancelled summary');
 document.querySelector('#aoTowerTab').click();
 f.ForesightOffice.select(8,true);d.querySelector('#departmentProfile').click();await wait(()=>d.querySelector('.workroom .wr-task'),'workroom');
 check(d.querySelector('.workroom').textContent.includes('待執行 1 ／待驗收 1'),'workroom status wording');check(!d.querySelector('.workroom .wr-section').textContent.includes('cancelled8'),'cancelled in active flow');d.querySelector('#officeExploreDialog').close();
 const refresh=()=>dispatchEvent(new CustomEvent('foresight-office-task-updated',{detail:{department:14}}));
 const before=dir(8);refresh();check(dir(8)===room(8)&&[before,'資料過舊'].includes(dir(8)),'invalidation sync');await new Promise(r=>setTimeout(r,100));await wait(()=>dir(8)===before,'invalidation refreshed');
 // Even an apparent valid sender cannot inject an unrequested result.
 f.postMessage({type:'foresight-office-workroom',request:999999,department:8,snapshot:{tasks:[make('cancelled8','queued',1)]}},location.origin);
 await new Promise(r=>setTimeout(r,100));check(dir(8)===before&&room(8)===before,'stale response resurrected task');
 records=Array.from({length:24},(_,i)=>make('security-'+i,'queued',1,9)).concat([manual,trial,cancelled]);total=records.length;refresh();
 await wait(()=>dir(9)==='排隊中 24（Agent 待領 24） · 尚未領取／無人執行 24','24 detail cap scenario');check(dir(8)==='排隊中 1（Agent 待領 1） · 待驗收 1 · 尚未領取／無人執行 1'&&dir(8)===room(8),'QA omitted after 24 details');
 // Check readable labels and page width with actual layout at this viewport/theme.
 check(d.documentElement.scrollWidth<=f.innerWidth+2,'iframe horizontal overflow');
 check(document.documentElement.scrollWidth<=innerWidth+2,'parent horizontal overflow');
 for(const id of [9,14,27,8]){const badge=d.querySelector('.room-label[data-room-department="'+id+'"] .room-task-badge');check(badge.scrollWidth<=badge.clientWidth+2,'badge overflow '+id);}
 records=[cancelled];total=1;refresh();await wait(()=>dir(8)==='已結束 1','terminal-only');check(room(8)===dir(8),'terminal labels differ');
 records=Array.from({length:200},(_,i)=>make('limit-'+i,'queued',1,9));total=201;refresh();await wait(()=>dir(8)?.includes('未完整'),'200 cap notice');check(!dir(8).includes('無任務')&&dir(8)===room(8),'false zero on incomplete list');
 records=[manual,trial,cancelled];total=3;refresh();await wait(()=>dir(8)==='排隊中 1（Agent 待領 1） · 待驗收 1 · 尚未領取／無人執行 1','restore QA fixture');
 if(d.querySelector('.directory').classList.contains('collapsed'))d.querySelector('#directoryToggle').click();check(d.documentElement.scrollWidth<=f.innerWidth+2,'expanded directory overflow');
 result.textContent=JSON.stringify({pass:true,theme,width:innerWidth,detailReads:reads,checks:['room/bottom/filter IDs 9,14,27,8','queued/review/schedule wording','search reset','synchronous invalidation','unrequested response rejection','24-detail-independent counts','cancelled exclusion','201 total incomplete notice','actual layout widths']});
 }catch(e){result.textContent=JSON.stringify({pass:false,error:e.stack});}})();
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
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(out,'7f-'+theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
   assert.equal(result.pass,true,result.error);assert.equal(exceptions.filter(e=>e.sessionId===sessionId).length,0,JSON.stringify(exceptions));await call('Target.closeTarget',{targetId});
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS real Chrome 7F integration: desktop/mobile light/dark; synthetic data only');
 }finally{ws?.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));server.close();fs.writeFileSync(path.join(out,'chrome-stderr.txt'),log);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
