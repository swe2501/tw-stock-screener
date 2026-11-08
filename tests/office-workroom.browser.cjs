const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');const {pathToFileURL}=require('url');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const out=path.join(os.tmpdir(),'foresight-office-workroom');fs.mkdirSync(out,{recursive:true});try{
for(const [theme,width] of [['light',1440],['dark',1440],['light',390],['dark',390]]){
 const p=await browser.newPage({viewport:{width,height:960}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const fixture=path.join(out,'fixture.html');fs.writeFileSync(fixture,'<!doctype html><html data-theme="'+theme+'"><base href="'+pathToFileURL(path.resolve('apps/web')).href+'/"><main id="office"></main>');await p.goto(pathToFileURL(fixture).href);
 await p.addStyleTag({path:'apps/web/assets/office-task-board.css'});await p.addStyleTag({path:'apps/web/assets/ai-office/office-workroom.css'});await p.addScriptTag({path:'apps/web/assets/office-task-board.js'});await p.addScriptTag({path:'apps/web/assets/admin-office.js'});
 await p.evaluate(()=>{window.calls={};const now=new Date().toISOString();const tasks=[{id:'fixture-running',title:'資料核對 <安全>',department:7,execution:'manual',status:'running',created_at:'2026-10-30T00:00:00Z',updated_at:now,revision:1,current_step:'核對來源與資料日期',attempts:1,criteria:[],checks:[],history:[{status:'running',at:'2026-10-30T00:02:00Z'}]},{id:'fixture-approved',title:'每日研究摘要',department:7,execution:'ai',status:'approved',created_at:'2026-10-30T00:00:00Z',updated_at:now,revision:1,current_step:'驗收通過',due_date:'2026-10-30',result:'資料日期：2026-10-30\n已完成來源核對。 <script>unsafe</script>',attempts:2,cost_usd:.12,reserved_usd:0,budget_usd:.3,criteria:[],checks:[],history:[{status:'running',at:'2026-10-30T00:01:00Z'},{status:'approved',at:'2026-10-30T01:00:00Z'}]},{id:'fixture-failed',title:'等待來源恢復',department:7,status:'failed',execution:'manual',revision:1,blocker:'來源暫時離線',attempts:2,criteria:[],checks:[],history:[],depends_on:['fixture-approved']}];
 AdminOffice.show(document.querySelector('#office'),async(action,args)=>{calls[action]=(calls[action]||0)+1;if(action==='admin_office')return {agents:{chip:{status:'work',since:now,heartbeat:now,current:'核對分點來源',bubble:['來源已確認'],steps:[{step:'取得來源',start:'2026-10-30T00:00:00Z',end:'2026-10-30T00:01:00Z',secs:60,ok:true}]}}};if(action==='admin_office_tasks_list')return {tasks,departments:[{id:7,name:'資料與金融研究部',enabled:true}],worker:{}};if(action==='admin_office_tasks_get')return {task:tasks.find(t=>t.id===args.id)};throw Error('Unexpected '+action);});});
 const f=p.frameLocator('#aoTowerFrame');if(width===390)await f.locator('#directoryToggle').click();await f.locator('.department[data-department="7"]').click();await f.locator('#departmentProfile').click();await f.locator('.wr-task').first().waitFor();
 const child=p.frames().find(f=>f.url().includes('ai-office.html'));assert.equal(await f.locator('.wr-section').count(),5);assert.equal(await f.locator('.wr-overview dd').first().innerText(),'2項');assert.match(await f.locator('.workroom').innerText(),/US\$ 0.120/);assert.match(await f.locator('.workroom').innerText(),/100%/);assert.equal(await f.locator('.workroom script').count(),0);assert.equal(await p.locator('#aoTasksTab').isVisible(),true);
 assert.equal(await f.locator('.wr-operations').count(),1);assert.match(await f.locator('.wr-operations').innerText(),/每日工作與 KPI/);
 const overflow=await child.evaluate(()=>{const d=document.querySelector('#officeExploreDialog');return d.scrollWidth>d.clientWidth+2;});assert.equal(overflow,false);
 await p.waitForTimeout(1200);const pose=await child.evaluate(()=>ForesightOffice.peopleActivity.filter(x=>x.department===7));assert.ok(pose.length);assert.ok(pose.every(x=>x.status==='work'),'running tasks should mark room people as work');await p.waitForTimeout(2200);const later=await child.evaluate(()=>ForesightOffice.peopleActivity.filter(x=>x.department===7));assert.ok(later.every(x=>x.status==='work'));assert.ok(later.every((x,i)=>Math.hypot(x.x-pose[i].x,x.z-pose[i].z)<0.15),'work people stay seated at desk, no patrol walk');
 const requests=await p.evaluate(()=>({...calls}));await f.locator('#officeExploreDialog .explore-header button').click();await f.locator('#departmentProfile').click();await p.waitForTimeout(100);assert.equal((await p.evaluate(()=>calls.admin_office_tasks_get)),requests.admin_office_tasks_get);
 await f.locator('#officeExploreDialog').screenshot({path:path.join(out,'workroom-'+theme+'-'+width+'.png')});await f.locator('.wr-operations').scrollIntoViewIfNeeded();await f.locator('#officeExploreDialog').screenshot({path:path.join(out,'operations-'+theme+'-'+width+'.png')});
 await f.locator('[data-workroom-task="fixture-running"]').first().click();await p.locator('.ot-dialog[open]').waitFor();assert.match(await p.locator('.ot-dialog[open]').innerText(),/資料核對 <安全>/);
 await p.locator('.ot-dialog[open]').evaluate(d=>d.close());
 await child.evaluate(()=>window.__preservedOffice=true);
 const selected=await child.evaluate(()=>ForesightOffice.selectedDepartment);
 await p.locator('#aoTasksPanel .ao-return-previous').click();await p.locator('#aoTowerPanel').waitFor({state:'visible'});
 assert.equal(await child.evaluate(()=>window.__preservedOffice),true);
 assert.equal(await child.evaluate(()=>ForesightOffice.selectedDepartment),selected);
 await f.locator('#officeExploreDialog').waitFor({state:'hidden'});
 assert.equal(await f.locator('#directoryToggle').getAttribute('aria-expanded'),'true');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 await p.evaluate(()=>AdminOffice.hide());assert.deepEqual(errors,[]);await p.close();
}

{
 const p=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const fixture=path.join(out,'fixture-overview.html');fs.writeFileSync(fixture,'<!doctype html><html data-theme="light"><base href="'+pathToFileURL(path.resolve('apps/web')).href+'/"><main id="office"></main>');await p.goto(pathToFileURL(fixture).href);
 await p.addScriptTag({path:'apps/web/assets/office-task-board.js'});await p.addScriptTag({path:'apps/web/assets/admin-office.js'});
 await p.evaluate(()=>{const now=new Date().toISOString();const tasks=[
  {id:'q9a',title:'資安盤點',department:9,execution:'manual',status:'queued',created_at:now,updated_at:now,revision:1,criteria:[],checks:[],history:[]},
  {id:'q9b',title:'資安風險確認',department:9,execution:'manual',status:'queued',created_at:now,updated_at:now,revision:1,criteria:[],checks:[],history:[]},
  {id:'run7',title:'研究執行中',department:7,execution:'manual',status:'running',created_at:now,updated_at:now,revision:1,current_step:'進行中',criteria:[],checks:[],history:[]}
 ];
 AdminOffice.show(document.querySelector('#office'),async(action)=>{
  if(action==='admin_office')return {agents:{}};
  if(action==='admin_office_tasks_list')return {tasks,departments:[{id:7,name:'資料與金融研究部',enabled:true},{id:9,name:'資安與系統維運部',enabled:true}],worker:{}};
  throw Error('Unexpected '+action);
 });
 });
 const child=await (async()=>{for(let i=0;i<50;i++){const fr=p.frames().find(fr=>fr.url().includes('ai-office.html'));if(fr)return fr;await p.waitForTimeout(200);}throw Error('no ai-office frame');})();
 await child.waitForFunction(()=>((window).ForesightOffice?.peopleActivity||[]).some(x=>x.department===9&&x.status==='wait'),null,{timeout:20000});
 const pose9=await child.evaluate(()=>ForesightOffice.peopleActivity.filter(x=>x.department===9));
 assert.ok(pose9.length);assert.ok(pose9.every(x=>x.status==='wait'),'queued must map to wait not work');
 await child.evaluate(()=>{if(window.ForesightOffice?.focusFloor)window.ForesightOffice.focusFloor(7);});
 await p.waitForTimeout(800);
 const badge=await child.evaluate(()=>{const el=document.querySelector('.room-label[data-room-department="9"] .room-task-badge');return el?el.textContent.trim():'';});
 assert.match(badge,/待執行/);
 const pose7=await child.evaluate(()=>ForesightOffice.peopleActivity.filter(x=>x.department===7));
 if(pose7.length)assert.ok(pose7.every(x=>x.status==='work'));
 assert.deepEqual(errors,[]);
 await p.close();
}

console.log('PASS six workroom sections, real metrics, safe outputs, dark/light mobile layout, seated work people, cached reads and task details. '+out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
