const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),out='C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/member-perks-2a-review';fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(web,'index.html'),'utf8'),css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+fs.readFileSync(path.join(web,'assets/member-center.css'),'utf8')+fs.readFileSync(path.join(web,'assets/research-polish.css'),'utf8');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><main class="member-page" id="main"></main></body></html>'}));
 await page.goto('https://perks.fixture.test/');await page.addStyleTag({content:css});
 for(const name of ['member-missions.js','member-journey.js'])await page.addScriptTag({path:path.join(web,'assets',name)});
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;localStorage.setItem('sb_token','member-a');window.points=120;window.calls=0;window.claims=0;window.exchanges=0;window.requests=[];window.receipt=null;window.failFirst=true;window.perksClosed=true;window.claimed=false;window.capped=false;window.rejectTask='';
  const now=()=>new Date().toISOString();window.now=now;
  window.profile={id:'member-a',display_name:'研究會員',member_preferences:{}};
  window.AcademyIdentity={walletSummary:async()=>({task_points:window.points,stored_points:window.storedPoints}),taskStatus:async()=>{window.calls++;return {server_time:now(),caps:{daily_research:{used:window.capped?30:window.claimed?5:0,limit:30},weekly_research:{used:0,limit:150}},rows:window.perksClosed?[]:[{id:'name-v1',title:'設定研究暱稱',points:25,period:'once',eligible:true,claimed:false},{id:'daily-screen-v1',title:'記錄今日選股',points:5,period:'daily',cap_group:'daily_research',eligible:true,claimed:window.claimed},{id:'birthday-v1',title:'生日當月禮',points:100,period:'yearly',eligible:true,claimed:false,voucher_days:3},{id:'feedback-v1',title:'回饋',points:40,eligible:true,review_only:true},{id:'verify-contact-v1',title:'完成驗證',points:20,eligible:true,claimed:false},{id:'invite-first-v1',title:'首位有效邀請',points:60,eligible:true,claimed:false}]};},exchangeOptions:async()=>({server_time:now(),rows:window.perksClosed?[]:[{id:'choice-7d-v1',title:'自選單品券',points:150,duration_days:7,tier:'choice'}]}),claimTask:async id=>{window.claims++;if(window.rejectTask)throw Object.assign(Error(window.rejectTask),{code:window.rejectTask});if(id==='daily-screen-v1')window.claimed=true;window.points+=id==='daily-screen-v1'?5:100;return{id:'award',reward_id:id==='birthday-v1'?'birthday-voucher':null};},exchangePoints:async(id,key)=>{window.requests.push(key);if(!window.receipt){const fromTask=Math.min(window.points,150);window.points-=fromTask;window.storedPoints=(window.storedPoints||0)-(150-fromTask);window.exchanges++;window.receipt={reward_id:'new-voucher'};}if(window.failFirst){window.failFirst=false;throw Error('網路中斷，請重試');}return window.receipt;}};
  window.renderFixture=(view='tasks')=>AcademyMemberJourney.render(view,{main:document.getElementById('main'),profile:window.profile,go:view=>window.destination=view});window.renderFixture();
 },theme);
 await page.waitForFunction(()=>document.querySelector('[data-reward-balance]').textContent.includes('120'));
 assert.equal(await page.locator('.mj-live-tasks,.mj-live-exchanges').count(),0,'no duplicate catalogs');
 assert.equal(await page.getByRole('button',{name:'尚未開放兌換',exact:true}).count(),8);
 assert.equal(await page.locator('[data-task-id=name] [data-task-claim]').isDisabled(),true,'closed tasks cannot claim');
 await page.evaluate(()=>{window.perksClosed=false;document.querySelector('[data-rewards-refresh]').click();});
 await page.waitForFunction(()=>document.querySelector('[data-task-id=name] [data-task-claim]').textContent==='領取 +25 點');
 assert.equal(await page.locator('[data-task-id=name] .mj-task-bottom strong').innerText(),'+25 點','points come from server');
 assert.match(await page.locator('[data-reward-caps]').innerText(),/今日 0\/30.*本週 0\/150/);
 const ticket=page.locator('[data-exchange-id=choice-7d-v1]');assert.match(await ticket.locator('button').innerText(),/還差 30 點/);assert.equal(await ticket.locator('button').isDisabled(),true);
 // All entry points use the same available total, including legacy task-only responses.
 for(const [task,stored,allowed,shortfall] of [[120,30,true,0],[0,150,true,0],[50,99,false,1]]){
  await page.evaluate(({task,stored})=>{window.points=task;window.storedPoints=stored;document.querySelector('[data-rewards-refresh]').click();},{task,stored});
  await page.waitForFunction(total=>document.querySelector('[data-reward-balance]').textContent==='可用點數 '+total+' 點',task+stored);
  assert.equal(await ticket.locator('button').isDisabled(),!allowed,'combined balance eligibility');
  if(allowed){await ticket.locator('button').click();assert.equal(await page.locator('.mj-exchange-dialog:modal').count(),1,'sufficient combined/stored balance opens confirmation');await page.locator('[data-cancel]').click();}
  else assert.match(await ticket.locator('button').innerText(),new RegExp('還差 '+shortfall+' 點'));
  assert.equal(await page.evaluate(()=>window.exchanges),0,'confirmation/cancellation never debits');
 }
 await page.evaluate(()=>{window.points=120;window.storedPoints=undefined;document.querySelector('[data-rewards-refresh]').click();});
 await page.waitForFunction(()=>document.querySelector('[data-reward-balance]').textContent==='可用點數 120 點');
 await page.locator('[data-mj-filter=daily]').click();const daily=page.locator('[data-task-id=daily-screen] [data-task-claim]');
 assert.equal(await daily.isDisabled(),true,'server eligible true must still require local activity');
 await page.evaluate(()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());localStorage.setItem('academy.research.v1.member-a',JSON.stringify({screen_logs:[{date:parts,saved_at:new Date().toISOString(),strategy:'strategy1',stocks:[{code:'2330'}]}]}));document.querySelector('[data-rewards-refresh]').click();});
 await page.waitForFunction(()=>document.querySelector('[data-task-id=daily-screen] [data-task-claim]').disabled===false);
 await daily.click();await page.waitForFunction(()=>document.querySelector('[data-task-id=daily-screen] [data-task-claim]').textContent==='本期已領');assert.equal(await page.evaluate(()=>window.points),125);assert.equal(await page.evaluate(()=>window.claims),1);
 await page.evaluate(()=>{window.claimed=false;window.capped=true;document.querySelector('[data-rewards-refresh]').click();});await page.waitForFunction(()=>document.querySelector('[data-reward-caps]').textContent.includes('30/30'));assert.equal(await daily.isDisabled(),true);assert.match(await page.locator('[data-task-id=daily-screen] [data-task-state]').innerText(),/上限/);
 await page.evaluate(()=>{window.capped=false;window.rejectTask='MEMBER_TASK_LIMIT_REACHED';document.querySelector('[data-rewards-refresh]').click();});await page.waitForFunction(()=>!document.querySelector('[data-task-id=daily-screen] [data-task-claim]').disabled);await daily.click();await page.waitForFunction(()=>document.querySelector('[data-mission-status]').textContent.includes('上限'));assert.equal(await page.evaluate(()=>window.points),125);
 await page.locator('[data-mj-filter=share]').click();assert.equal(await page.locator('[data-task-id=feedback] [data-task-claim]').innerText(),'由管理端審核');assert.equal(await page.locator('[data-task-id=invite1] [data-task-claim]').isDisabled(),false,'invite alias maps to server task');assert.equal(await page.locator('[data-task-id=invite3] [data-task-claim]').count(),0);
 await page.locator('[data-mj-filter=bonus]').click();await page.evaluate(()=>window.rejectTask='');await page.locator('[data-task-id=birthday] [data-task-claim]').click();await page.waitForFunction(()=>document.querySelector('[data-mission-status]').textContent.includes('附贈使用券'));assert.equal(await page.evaluate(()=>window.points),225);assert.equal(await page.locator('[data-task-id=ad-video] [data-task-claim]').isDisabled(),true);
 for(const width of [1366,375,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('.member-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no overflow '+theme+width);await page.screenshot({path:path.join(out,'tasks-'+theme+'-'+width+'.png')});}
 // Exercise an actual mixed-pool exchange: task points are consumed before stored points.
 await page.evaluate(()=>{window.points=100;window.storedPoints=125;document.querySelector('[data-rewards-refresh]').click();});
 await page.waitForFunction(()=>document.querySelector('[data-mission-status]').textContent==='帳號狀態已更新。');
 await ticket.locator('button').click();assert.equal(await page.evaluate(()=>window.exchanges),0,'opening confirmation must not spend points');assert.match(await page.locator('.mj-exchange-dialog').innerText(),/150 點/);assert.match(await page.locator('.mj-exchange-dialog').innerText(),/一個日曆月/);assert.match(await page.locator('.mj-exchange-dialog').innerText(),/完整 7 天/);
 const bounds=await page.locator('.mj-exchange-dialog').boundingBox();assert.ok(bounds.x>=14&&bounds.y>20,'confirmation centered with viewport breathing room');assert.ok(bounds.x+bounds.width<=320);await page.screenshot({path:path.join(out,'confirm-'+theme+'.png')});await page.locator('[data-cancel]').click();assert.equal(await page.evaluate(()=>window.exchanges),0);await ticket.locator('button').click();await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('[data-exchange-message]').textContent.includes('網路中斷'));assert.equal(await page.evaluate(()=>window.exchanges),1);
 // Render again as if navigating/reloading; persisted request must remain retryable despite reduced balance.
 await page.evaluate(()=>window.renderFixture());await page.waitForFunction(()=>document.querySelector('[data-reward-balance]').textContent.includes('75'));
 assert.match(await ticket.locator('button').innerText(),/上次兌換結果/);assert.equal(await ticket.locator('button').isDisabled(),false);
 await ticket.locator('button').click();await page.locator('[data-confirm]').click();await page.waitForFunction(()=>window.destination==='gifts');assert.equal(await page.evaluate(()=>window.exchanges),1);assert.deepEqual(await page.evaluate(()=>[window.points,window.storedPoints]),[0,75],'mixed exchange debits task first and preserves the remainder');const requests=await page.evaluate(()=>window.requests);assert.equal(requests[0],requests[1]);
 // In-flight old-account data must never repaint after account switch.
 await page.evaluate(()=>{window.AcademyIdentity.taskStatus=()=>new Promise(resolve=>window.finishOld=resolve);window.renderFixture();localStorage.setItem('sb_token','member-b');window.finishOld({server_time:window.now(),rows:[{id:'private',points:900,eligible:true}]});});await page.waitForTimeout(50);assert.equal((await page.locator('[data-reward-balance]').innerText()).includes('75'),false);
 // Signed-out view has no claims/exchanges and makes no account RPC calls.
 await page.evaluate(()=>{localStorage.removeItem('sb_token');window.calls=0;window.renderFixture();});await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>window.calls),0);assert.equal(await page.locator('[data-task-claim]:enabled,[data-points-exchange]:enabled').count(),0);
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS perks 2A: closed-state, server prices, local report gate, period claims/caps/errors, birthday voucher, aliases, review-only, combined/stored-only balances, explicit confirmation, mixed-pool debit fixture, persisted retry idempotency, gifts route, account isolation, signed-out and light/dark mobile layouts.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
