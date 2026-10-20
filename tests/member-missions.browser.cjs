const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),out='C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/member-missions-review';fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(web,'index.html'),'utf8'),css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+fs.readFileSync(path.join(web,'assets/member-center.css'),'utf8')+fs.readFileSync(path.join(web,'assets/research-polish.css'),'utf8');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><main class="member-page"><div class="member-journey"><section class="mj-hero"><h2>會員任務與禮遇</h2></section></div></main></body></html>'}));
  await page.goto('https://missions.fixture.test/');await page.addStyleTag({content:css});await page.addScriptTag({path:path.join(web,'assets/member-missions.js')});
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;localStorage.setItem('sb_token','member-a');window.testPoints=180;window.claims=0;window.exchanges=0;window.requests=[];window.receipt=null;window.failFirst=true;window.claimed=false;
   const time=()=>new Date().toISOString();
   window.AcademyIdentity={
    walletSummary:async()=>({task_points:window.testPoints,stored_enabled:false,stored_points:null,server_time:time()}),
    taskStatus:async()=>({server_time:time(),rows:[{id:'verify-contact-v1',title:'完成信箱或手機驗證',points:20,eligible:true,claimed:window.claimed}]}),
    exchangeOptions:async()=>({server_time:time(),rows:[{id:'choice-3d-v1',title:'自選券 · 3 天',points:180,duration_days:3,tier:'choice'}]}),
    claimTask:async id=>{window.claims++;window.claimed=true;window.testPoints+=20;return{id:'task-entry',points:20};},
    exchangePoints:async(id,request)=>{window.requests.push(request);if(!window.receipt){window.exchanges++;window.testPoints-=180;window.receipt={reward_id:'voucher-issued',points:180};}if(window.failFirst){window.failFirst=false;throw Error('回應中斷，請重試；相同單號不重複扣點。');}return window.receipt;}
   };
   window.mountFixture=()=>AcademyMemberMissions.mount(document.querySelector('.member-journey'),{profile:{id:'member-a'},go:view=>window.destination=view});window.mountFixture();
  },theme);
  await page.locator('[data-task-claim]').waitFor();await page.locator('[data-task-claim]').click();await page.waitForFunction(()=>document.querySelector('[data-task-claim]').textContent==='已領取');assert.equal(await page.evaluate(()=>window.claims),1);assert.equal(await page.evaluate(()=>window.testPoints),200);
  await page.locator('.mj-live-exchanges summary').click();
  for(const width of [1366,375,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('.member-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'missions must fit '+theme+' '+width);await page.screenshot({path:path.join(out,'missions-'+theme+'-'+width+'.png')});}
  await page.locator('[data-points-exchange]').click();await page.waitForFunction(()=>document.querySelector('[data-mission-status]').textContent.includes('回應中斷'));await page.locator('[data-points-exchange]').click();await page.waitForFunction(()=>document.querySelector('[data-mission-status]').textContent.includes('使用券已存入'));
  assert.equal(await page.evaluate(()=>window.exchanges),1);assert.equal(await page.evaluate(()=>window.testPoints),20);const requests=await page.evaluate(()=>window.requests);assert.equal(requests.length,2);assert.equal(requests[0],requests[1],'network retry uses the original idempotency key');assert.equal(await page.locator('[data-points-exchange]').isDisabled(),true);
  await page.getByRole('button',{name:'查看我的使用券 →'}).click();assert.equal(await page.evaluate(()=>window.destination),'gifts');
  // An old member's in-flight response must not paint after switching accounts.
  await page.evaluate(()=>{document.querySelector('.mj-live-missions').remove();window.AcademyIdentity.taskStatus=()=>new Promise(resolve=>window.finishOldTask=resolve);window.mountFixture();localStorage.setItem('sb_token','member-b');window.finishOldTask({server_time:new Date().toISOString(),rows:[{id:'old-member',title:'OLD PRIVATE TASK',points:999,eligible:true}]});});await page.waitForTimeout(50);assert.equal(await page.locator('[data-task-claim]').count(),0);assert.equal((await page.locator('.mj-live-missions').innerText()).includes('OLD PRIVATE TASK'),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS server task claims, disabled insufficient exchange, explicit confirmation, network-retry idempotency, account-switch isolation and light/dark 1366/375/320 layouts.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
