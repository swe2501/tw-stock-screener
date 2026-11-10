/* Real Chromium integration using only existing Chrome + Node built-ins.
 * Local static assets + synthetic in-memory post(); never contacts UAT or task APIs.
 * No npm install, authenticated browser profile, secrets, env files, or paid APIs. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const web=path.resolve(__dirname,'../apps/web'),out=process.argv[2]||path.join(os.tmpdir(),'office-seat-browser-evidence');fs.mkdirSync(out,{recursive:true});
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px sans-serif;background:#edf1ef}header{padding:8px}iframe{border:0;width:100%;height:1000px}body[data-theme=dark]{background:#172936;color:#eee}</style></head><body><header>7F 坐姿離線假資料 · <b id="scenario">running</b> · 不連接任何服務</header><iframe id="officeFrame"></iframe><script>
const theme=new URLSearchParams(location.search).get('theme');document.body.dataset.theme=theme;
const frame=document.querySelector('iframe');let status='running',execution='agent',executor='',revision=1,scenario='running',testDepartment=9,sourceAt='',fail=false,reads=0;
const record=()=>({executor,id:'synthetic-security-task',title:'離線假資料資安盤點',status,execution,department:testDepartment,worker:execution==='manual'?'synthetic-admin':testDepartment===8?'agent-qa':'agent-sec',assignee:testDepartment===8?'qa':'sec',lease_until:new Date(Date.now()+(status==='expired'?-1000:300000)).toISOString(),revision,history:[],criteria:[],checks:[],created_at:new Date().toISOString()});
const records=()=>scenario.startsWith('qa-')?[record(),{...record(),id:'qa-queued',status:'queued',execution:'ai',executor:'grok',worker:'',assignee:''}]:scenario==='mixed'?['manual','agent','ai','ai','ai'].map((execution,i)=>({...record(),id:'mixed-'+i,execution,executor:i===2||i===3?'grok':''})):scenario==='grok'?['g1','g2'].map(id=>({...record(),id})): [record()];
addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.origin!==location.origin)return;
 if(e.data.type==='foresight-office-ready')frame.contentWindow.postMessage({type:'foresight-office-departments',roles:[]},location.origin);
 if(e.data.type==='foresight-office-workroom-request'){reads++;const t=record();if(status==='expired')t.status='running';frame.contentWindow.postMessage({type:'foresight-office-workroom',department:e.data.department,request:e.data.request,snapshot:fail?{tasks:[],error:'synthetic offline'}:{tasks:status==='expired'?[t]:records(),summaries:status==='expired'?[t]:records(),summaryScope:'all',at:sourceAt||new Date().toISOString()}},location.origin);}
});
frame.src='ai-office.html?embedded=1&theme='+theme;
const wait=async(fn,why)=>{const start=performance.now();while(!fn()){if(performance.now()-start>20000)throw Error('timeout '+why);await new Promise(r=>setTimeout(r,50));}};
const check=(v,why)=>{if(!v)throw Error(why);};
window.seatTest={async set(next){
 await wait(()=>frame.contentWindow.ForesightOffice&&frame.contentDocument.querySelector('.existing-role-count'),'frame');
 const f=frame.contentWindow,d=frame.contentDocument;scenario=next;testDepartment=next.startsWith('qa-')?8:9;status=next==='qa-review'?'review':next==='qa-work'?'running':next;executor=next==='grok'?'grok':'';execution=next==='manual'?'manual':'agent';if(next==='manual')status='running';if(next==='queued')execution='manual';if(['grok','agent-queue','claude-queue','mixed'].includes(next)){status='queued';execution=next==='agent-queue'?'agent':'ai';}revision++;sourceAt=next==='stale'?new Date(Date.now()-150001).toISOString():'';fail=next==='error';
 if(['stale','error'].includes(next))status='running';
 f.postMessage({type:'foresight-office-workroom-invalidated',department:testDepartment},location.origin);
 const label=()=>d.querySelector('.department[data-department="'+testDepartment+'"] .existing-role-count').textContent;
 const expected=next==='mixed'?'排隊中 5':next==='grok'?'排隊中 2':['queued','agent-queue','claude-queue'].includes(next)?'排隊中 1':['review','qa-review'].includes(next)?'待驗收 1':next==='expired'?'回報中斷／待確認 1':['stale','error'].includes(next)?'資料過舊':next==='manual'?'人工執行中 1':'工作中 1';
 await wait(()=>label().includes(expected),'label '+next);f.ForesightOffice.select(testDepartment,true);
 for(let i=0;i<3;i++)d.querySelector('#zoomIn').click();
 const active=()=>f.ForesightOffice.peopleActivity.filter(p=>p.department===testDepartment),workers=()=>active().filter(p=>p.pose==='work');
 await wait(()=>['running','manual','qa-work'].includes(next)?workers().length===1:workers().length===0,'person state '+next);
 if(['review','qa-review'].includes(next))await wait(()=>{const p=active().find(p=>p.pose==='review'),s=p&&f.ForesightOffice.seatsFor(testDepartment)[p.slot];return p&&s&&p.x===s.x&&p.z===s.z&&p.bodyLean<=-.5&&!p.typing;},'rendered review rig '+next);
 // Give the camera time to settle. This does not advance data/leases artificially.
 await new Promise(r=>setTimeout(r,1200));
 const people=active(),room=d.querySelector('.room-label[data-room-department="'+testDepartment+'"] .room-task-badge');check(label()===room.textContent,'right and 3D labels differ');
 check(people.filter(p=>p.pose!=='review').every(p=>p.armInwardAngles.every(a=>a===0)),'rest arm tilt leaked into other poses');
 const seats=f.ForesightOffice.seatsFor(testDepartment);if(testDepartment===9)check(seats.length===1&&seats[0].x===0&&seats[0].z===1.45&&seats[0].rotation===Math.PI,'actual security chair');
 if(['running','manual','qa-work'].includes(next)){const p=workers()[0];check(p.x===seats[p.slot].x&&p.z===seats[p.slot].z&&p.rotation===seats[p.slot].rotation,'not seated in actual chair');check(p.typing===!matchMedia('(prefers-reduced-motion: reduce)').matches,'typing/reduced motion');check(people.filter(p=>p.pose==='walk').length===1,'whole room pretending to work');if(next==='manual')check(p.actor.startsWith('manual:'),'manual identity');}
 if(['queued','grok','agent-queue','claude-queue','mixed'].includes(next)){check(people.every(p=>p.pose==='walk'&&!p.typing),'queued should walk, not sit');check(label().includes('尚未領取／無人執行'),'all queued need nobody-working wording');const types=next==='mixed'?['人工 待領 1','Agent 待領 1','Grok 待領 2','Claude AI 待領 1']:[next==='grok'?'Grok 待領 2':next==='agent-queue'?'Agent 待領 1':next==='claude-queue'?'Claude AI 待領 1':'人工 待領 1'];for(const type of types)check(label().includes(type),'missing queue type '+type);check(room.scrollWidth<=room.clientWidth+2,'queue badge overflow');}
 if(['review','qa-review'].includes(next)){const p=people.find(p=>p.pose==='review');check(p&&p.x===seats[p.slot].x&&p.z===seats[p.slot].z&&!p.typing,'review sit no typing');if(next==='qa-review')check(label().includes('排隊中 1（Grok 待領 1）')&&people.filter(p=>p.pose==='review').length===1&&people.filter(p=>p.pose==='walk').length===1,'QA queued/review 7F reproduction');
  const waiting=q=>q.bodyLean<=-.5&&q.armAngles.every(a=>a>=0)&&q.elbowAngles.every(a=>a<=-1.2)&&q.armInwardAngles[0]===.24&&q.armInwardAngles[1]===-.24&&!q.typing;
  check(waiting(p),'review skeleton must recline with hands lowered');await new Promise(r=>setTimeout(r,350));const later=active().find(p=>p.pose==='review');check(waiting(later)&&JSON.stringify([p.bodyLean,p.armAngles,p.elbowAngles,p.armInwardAngles])===JSON.stringify([later.bodyLean,later.armAngles,later.elbowAngles,later.armInwardAngles]),'review joints must remain stationary');
 }
 if(next==='expired')check(people.some(p=>p.pose==='alert')&&people.every(p=>!p.typing),'expired lease typing');
 if(['stale','error'].includes(next))check(people.every(p=>p.pose!=='work'&&!p.typing),'stale pretending to work');
 check(d.querySelector('#officeDataFreshness').textContent.includes('可能延遲約 1 分鐘'),'3D latency notice');check(d.querySelector('#directoryDataFreshness').textContent.includes('資料最後更新時間'),'directory timestamp');
 const notice=d.querySelector('#officeDataFreshness').getBoundingClientRect();check(notice.height>0,'3D notice hidden');if(f.innerWidth<600)check(notice.top>=d.querySelector('.directory').getBoundingClientRect().bottom,'mobile latency notice obscured by directory');
 check(d.querySelector('#fallback').hidden,'3D fallback');check(d.documentElement.scrollWidth<=f.innerWidth+2,'horizontal overflow');
 if(next==='running'){d.querySelector('#departmentProfile').click();await wait(()=>d.querySelector('.wr-person[data-status="work"]'),'agent card work status');check(d.querySelector('.workroom').textContent.includes('AI_stock 資安工程師'),'agent card binding');d.querySelector('#officeExploreDialog').close();}
 if(next==='manual'){d.querySelector('#departmentProfile').click();await wait(()=>d.querySelector('.workroom')?.textContent.includes('人工執行者（匿名）'),'anonymous human card');check(!d.querySelector('.workroom').textContent.includes('synthetic-admin'),'raw human identity');d.querySelector('#officeExploreDialog').close();}
 document.querySelector('#scenario').textContent=next;
 return {pass:true,width:innerWidth,theme,scenario:next,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,people,label:label(),latency:d.querySelector('#officeDataFreshness').textContent,reads};
},async focusForScreenshot(){
 const d=frame.contentDocument,r=d.querySelector('.room-label[data-room-department="8"]').getBoundingClientRect(),stage=d.querySelector('#stage');
 for(let i=0;i<6;i++){stage.dispatchEvent(new frame.contentWindow.WheelEvent('wheel',{clientX:r.x+r.width/2,clientY:r.top-45,deltaY:-120,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,150));}
 await new Promise(r=>setTimeout(r,1400));
}};
</script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__7f_fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(web+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-seat-chrome-'));
 const chrome=spawn(process.env.CHROME_PATH||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore','ignore','pipe']});
 let log='',ws;const pending=new Map();let seq=0;
 try{
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);chrome.on('error',reject);chrome.on('exit',code=>reject(Error('Chrome exited '+code)));chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const results=[],exceptions=[];const onMessage=ws.onmessage;ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==='Runtime.exceptionThrown')exceptions.push({sessionId:msg.sessionId,detail:msg.params.exceptionDetails});onMessage(e);};
  for(const width of [1440,390])for(const theme of ['light','dark'])for(const reduced of [false,true]){
   const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
   await call('Runtime.enable',{},sessionId);
   await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
   await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]},sessionId);
   await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/__7f_fixture?theme='+theme},sessionId);
   const started=Date.now();while(Date.now()-started<20000){const r=await call('Runtime.evaluate',{expression:'!!window.seatTest',returnByValue:true},sessionId);if(r.result?.value)break;await new Promise(r=>setTimeout(r,100));}
   for(const scenario of (process.env.SEAT_TEST_SCENARIOS||'running,queued,review,expired,stale,error,manual,grok,agent-queue,claude-queue,mixed,qa-review,qa-work').split(',')){
    const r=await call('Runtime.evaluate',{expression:'window.seatTest.set('+JSON.stringify(scenario)+')',returnByValue:true,awaitPromise:true},sessionId);
    assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));const result=r.result?.value;assert.equal(result?.pass,true,JSON.stringify(r));results.push(result);console.log(JSON.stringify(result));
    if(['running','queued','review','grok','mixed','qa-review','qa-work'].includes(scenario)){
     const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
     fs.writeFileSync(path.join(out,'seat-'+scenario+'-'+theme+'-'+width+(reduced?'-reduced':'')+'.png'),Buffer.from(shot.data,'base64'));
    }
    if(width===1440&&theme==='light'&&!reduced&&scenario.startsWith('qa-')){
     const focus=await call('Runtime.evaluate',{expression:'window.seatTest.focusForScreenshot()',awaitPromise:true},sessionId);assert.ok(!focus.exceptionDetails,JSON.stringify(focus.exceptionDetails));
     const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(out,'focused-'+scenario+'.png'),Buffer.from(shot.data,'base64'));
    }
   }
   assert.equal(exceptions.filter(e=>e.sessionId===sessionId).length,0,JSON.stringify(exceptions));await call('Target.closeTarget',{targetId});
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS real Chrome seat integration: '+results.length+' cases across desktop/mobile × light/dark × motion/reduced; synthetic only');
 }finally{ws?.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));server.close();fs.writeFileSync(path.join(out,'chrome-stderr.txt'),log);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
