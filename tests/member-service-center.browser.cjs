const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),out=path.join(require('node:os').tmpdir(),'member-service-qa');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(web,'index.html'),'utf8'),styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n')+['member-center.css','member-service-center.css'].map(x=>fs.readFileSync(path.join(web,'assets',x),'utf8')).join('\n');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [1366,390]){
  const p=await b.newPage({viewport:{width,height:960}}),errors=[],downloads=[];p.on('pageerror',e=>errors.push(e.message));p.on('download',d=>downloads.push(d));
  await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main class="member-page"><div class="mc-main"></div></main>'}));await p.goto('https://member-services.fixture.test/');await p.addStyleTag({content:styles});
  for(const file of ['member-service-center.js'])await p.addScriptTag({path:path.join(web,'assets',file)});
  await p.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;localStorage.setItem('sb_token','a');localStorage.setItem('sb_user',JSON.stringify({id:'a'}));window.profile={id:'a'};window.calls=[];window.replies=[];window.loseReply=true;window.admin=false;window.denyAdmin=true;
   const now=new Date().toISOString();window.AcademyIdentity={walletSummary:async()=>({task_points:120,stored_points:0,ai_points:0,server_time:now}),serviceRpc:async(n,a={})=>{calls.push({n,a});
    if(n==='member_ledger_page'){const ai=a.p_pool==='ai',id=a.p_before_id?'older':'newer';return {rows:[{id,pool:a.p_pool,points:20,ai_delta:1.25,balance_after:id==='newer'?120:null,description:'測試獲得來源',created_at:now,transaction_key:'transaction-1',reference:'case-1',detail:{model:'example'}}],has_more:!a.p_before_id,until:now};}
    if(n==='member_case_list')return {rows:[{id:'ticket-1',ticket_number:'GS-1',subject:'點數紀錄有疑問',status:replies.length?'in_progress':'received',created_at:now}],has_more:false};
    if(n==='member_case_detail')return {ticket:{id:'ticket-1',ticket_number:'GS-1',subject:'點數紀錄有疑問',status:'received',body:'原始案件內容',created_at:now},messages:replies.map((r,i)=>({id:'message-'+i,author_kind:'member',body:r.p_body,created_at:now,files:[]}))};
    if(n==='member_case_reply'){if(!replies.length)replies.push(a);if(loseReply){loseReply=false;throw Error('網路中斷，結果尚未確認');}return {id:'reply-1',duplicate:true};}
    if(n==='member_service_access')return {scopes:admin?['audit','finance','rules']:[],recent:true,server_time:now};
    if(n==='member_admin_overview'){if(denyAdmin)throw Error('MEMBER_ADMIN_REQUIRED');return {tasks:[{id:'task-1',title:'測試任務',points:30,active:false}],exchanges:[],negative_wallets:0,large_awards_today:0,failed_mail:1,stale_mail:0,stored_without_order:0};}
    if(n==='member_admin_account')return {id:a.p_user,name:'核對中的帳號',created_at:now,task_points:20,stored_points:0};
    if(n==='member_admin_adjust')return {ledger_id:'adjust-1',points:a.p_delta,balance:50,duplicate:false};
    if(n==='member_admin_catalog')return {version_id:'version-2',duplicate:false};
    if(n==='member_admin_audit')return {rows:[],has_more:false};
    if(n==='member_rules_page')return {rows:[{id:'rule-1',version:1,terms:{title:'新規則',points:40,active:false},announcement:'從今天起的新規則',effective_at:now}],has_more:false};
    if(n==='member_data_export_page')return {rows:[],has_more:false};
    throw Error('Unexpected RPC '+n);
   }};
   window.renderService=view=>{document.querySelector('.mc-main').replaceChildren();AcademyMemberService.render(view,{main:document.querySelector('.mc-main'),profile,go:renderService});};renderService('wallet');
  },theme);
  await p.waitForSelector('.msvc-ledger');await p.locator('[data-ledger-more]').click();await p.waitForFunction(()=>document.querySelectorAll('.msvc-ledger').length===2);await p.locator('.msvc-ledger').last().locator('summary').click();assert.match(await p.locator('.msvc-ledger').last().innerText(),/歷史紀錄未保存/);
  await p.getByRole('tab',{name:'儲值紀錄'}).click();await p.waitForFunction(()=>document.querySelector('[data-pool-note]').textContent.includes('付款服務尚未開放'));await p.getByRole('tab',{name:'AI point'}).click();await p.waitForSelector('.msvc-ledger');
  await p.getByRole('button',{name:'匯出此期間全部紀錄'}).click();await p.waitForFunction(()=>document.querySelector('[data-service-status]').textContent.includes('全部 2 筆'));assert.ok(downloads.length);
  await p.evaluate(()=>renderService('cases'));await p.getByRole('button',{name:/點數紀錄有疑問/}).click();await p.waitForSelector('[data-reply]');await p.locator('[data-reply] textarea').fill('我已完成任務，請協助確認這次的點數來源。');await p.locator('[data-reply] button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('.msvc-dialog [data-service-status]').textContent.includes('網路中斷'));assert.equal(await p.locator('[data-reply] textarea').isDisabled(),true);
  await p.locator('.msvc-dialog [data-close]').click();await p.getByRole('button',{name:/點數紀錄有疑問/}).click();await p.waitForSelector('[data-reply]');await p.locator('[data-reply] button[type=submit]').click();await p.waitForFunction(()=>!localStorage.getItem('academy.service.pending.a.case:ticket-1'));
  const requests=await p.evaluate(()=>calls.filter(c=>c.n==='member_case_reply').map(c=>c.a));assert.equal(requests.length,2);assert.equal(requests[0].p_request,requests[1].p_request);assert.equal(await p.evaluate(()=>replies.length),1);await p.locator('.msvc-dialog [data-close]').click();
  await p.evaluate(()=>renderService('admin'));await p.waitForFunction(()=>document.querySelector('[data-service-status]').textContent.includes('沒有這項管理權限'));
  await p.evaluate(()=>{admin=true;denyAdmin=false;renderService('admin');});await p.waitForSelector('[data-adjust]');
  const account='00000001-1111-4111-8111-111111111111';await p.locator('[data-adjust] [name=user]').fill(account);await p.locator('[data-account-check]').click();await p.waitForFunction(()=>document.querySelector('[data-account-result]').textContent.includes('核對中的帳號'));await p.locator('[data-adjust] [name=delta]').fill('30');await p.locator('[data-adjust] [name=reason]').fill('根據案件內容確認後補發');await p.locator('[data-adjust] [name=reference]').fill('GS-1');await p.locator('[data-adjust] [name=confirmed]').check();await p.locator('[data-adjust] button:not([type])').click();await p.waitForFunction(()=>document.querySelector('[data-service-status]').textContent.includes('adjust-1'));
  assert.equal(await p.locator('[data-catalog] [name=title]').inputValue(),'測試任務');await p.locator('[data-catalog] [name=points]').fill('40');await p.locator('[data-catalog] [name=reason]').fill('經核對後發布的規則變更公告');await p.locator('[data-catalog] [name=confirmed]').check();await p.locator('[data-catalog] button').click();await p.waitForFunction(()=>document.querySelector('[data-service-status]').textContent.includes('version-2'));
  await p.screenshot({path:path.join(out,`service-admin-${theme}-${width}.png`),fullPage:true});
  await p.evaluate(()=>renderService('rules'));await p.waitForSelector('.msvc-rule');assert.match(await p.locator('.msvc-rule').innerText(),/從今天起的新規則/);
  await p.evaluate(()=>renderService('privacy'));await p.screenshot({path:path.join(out,`service-privacy-${theme}-${width}.png`),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no page-level horizontal overflow');
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS member service UI: paged task/stored/AI histories, full period export, lost reply response/reopen uses original request, server-admin denial, account confirmation and audit controls, rules, light/dark desktop/mobile.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
