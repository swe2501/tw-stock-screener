const path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<main><div class="mj-hero"></div><article data-task-id="learn"><button data-task-claim="learn-v1"></button><p data-task-state></p><div class="mj-task-bottom"><strong></strong></div></article></main>'}));await page.goto('https://learning-gate.fixture.test');
 await page.addScriptTag({path:path.resolve(__dirname,'../apps/web/assets/member-missions.js')});
 await page.evaluate(()=>{
  localStorage.setItem('sb_token','a');window.capability=0;window.eligible=true;window.claims=0;
  window.AcademyIdentity={taskStatus:async()=>({server_time:new Date().toISOString(),learning_verification:window.capability,rows:[{id:'learn-v1',points:50,eligible:window.eligible}]}),exchangeOptions:async()=>({server_time:new Date().toISOString(),rows:[]}),walletSummary:async()=>({task_points:0}),claimTask:async()=>{window.claims++;return{id:'fixture'};}};
  window.controller=AcademyMemberMissions.mount(document.querySelector('main'),{profile:{id:'a'},go(){},ready:()=>false});
 });
 const button=page.locator('[data-task-claim]');await page.waitForFunction(()=>document.querySelector('[data-task-claim]').textContent==='核驗準備中');assert.equal(await button.isDisabled(),true,'old server member_report=true is not trusted');
 await page.evaluate(async()=>{window.capability=1;window.eligible=false;await controller.load();});assert.equal(await button.isDisabled(),true,'server evidence must actually exist');
 await page.evaluate(async()=>{window.eligible=true;await controller.load();});assert.equal(await button.isDisabled(),false,'verified evidence works without editable/local read flags');await button.click();await page.waitForFunction(()=>window.claims===1);
 console.log('PASS learning gate: legacy server rejected, missing evidence disabled, verified server proof enables claim without local progress.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
