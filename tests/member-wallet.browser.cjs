const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),out='C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/wallet-review';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const p=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[],queries=[];let fail=false,delay=false;
  p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'wallet-owner'}));},theme);
  const row=(i,points=i%2?20:-150)=>({id:String(i).padStart(8,'0')+'-1111-4111-8111-111111111111',description:i===51?'會員驗證獎勵 <script>alert(1)</script>':points>0?'閱讀任務獎勵':'自選單品券 · 3 天',points,source_event_key:points>0?'task:wallet-owner:read-v1':'points-exchange:wallet-owner:request',created_at:'2026-10-20T12:34:56.123456+00:00'});
  await p.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin==='https://wallet.fixture.test'){
   const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()){if(f.endsWith('index.html'))return r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});return r.fulfill({path:f});}return r.fulfill({json:{}});
  }
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'wallet-owner',email:'fixture@example.test',email_confirmed_at:'2026-01-01',phone_confirmed_at:'2026-01-01',phone:'886912345678',user_metadata:{display_name:'研究會員'}}});
  if(u.pathname.endsWith('/member_wallet_summary'))return r.fulfill({json:{task_points:1840,stored_enabled:false,stored_points:null,server_time:'2026-10-21T02:30:00Z'}});
  if(u.pathname.endsWith('/member_point_ledger')){queries.push(u);if(delay)await new Promise(resolve=>setTimeout(resolve,250));if(fail)return r.fulfill({status:503,json:{message:'offline'}});return r.fulfill({json:u.searchParams.has('or')?[row(1)]:Array.from({length:51},(_,i)=>row(51-i))});}
  if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{email:true}}});return r.fulfill({json:[]});});
  await p.goto('https://wallet.fixture.test');await p.waitForFunction(()=>window.openMemberCenter&&window.AcademyWallet);
  await p.evaluate(()=>{window.AcademyPhoneGate={ensure:async()=>true};openMemberCenter('wallet');});
  await p.waitForFunction(()=>document.querySelector('[data-mw-count]')?.textContent.includes('50 筆'));
  assert.equal(await p.locator('[data-mw-balance]').textContent(),'1,840 點');
  assert.match(await p.locator('.mw-entry time').first().textContent(),/20:34:56/);
  assert.equal(await p.locator('.mw-entry script').count(),0);assert.match(await p.locator('.mw-entry-content').first().textContent(),/<script>/);
  assert.equal(queries.at(-1).searchParams.get('user_id'),'eq.wallet-owner');
  await p.locator('.mw-entry summary').first().click();assert.equal(await p.locator('.mw-entry dl').first().isVisible(),true);
  await p.locator('[data-mw-more]').click();await p.waitForFunction(()=>document.querySelector('[data-mw-count]').textContent.includes('51 筆'));
  assert.match(queries.at(-1).searchParams.get('or'),/123456/,'microsecond precision retained in cursor');assert.equal(await p.locator('[data-mw-more]').isVisible(),false);
  const downloadEvent=p.waitForEvent('download');await p.locator('[data-mw-export]').click();const dl=await downloadEvent;assert.match(dl.suggestedFilename(),/已載入51筆/);await dl.saveAs(path.join(out,'ledger-'+theme+'.csv'));assert.match(fs.readFileSync(path.join(out,'ledger-'+theme+'.csv'),'utf8'),/UTC\+8/);
  await p.locator('[name=start]').fill('2026-10-01');await p.locator('[name=end]').fill('2026-10-20');await p.locator('[name=kind]').selectOption('used');await p.locator('.mw-filter button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('[data-mw-count]').textContent.includes('50 筆'));
  assert.equal(queries.at(-1).searchParams.get('points'),'lt.0');assert(queries.at(-1).searchParams.getAll('created_at').includes('gte.2026-10-01T00:00:00+08:00'));assert(queries.at(-1).searchParams.getAll('created_at').includes('lt.2026-10-20T16:00:00.000Z'));
  await p.locator('[data-mw-reset]').click();await p.waitForFunction(()=>document.querySelector('[data-mw-count]').textContent.includes('50 筆'));
  await p.locator('.mw-heading').evaluate(e=>e.scrollIntoView({block:'start'}));await p.screenshot({path:path.join(out,'wallet-'+theme+'-1440.png')});
  for(const width of [375,320]){await p.setViewportSize({width,height:1000});assert(await p.locator('.mw-root').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'wallet has no horizontal overflow');await p.locator('.mw-heading').evaluate(e=>e.scrollIntoView({block:'start'}));await p.screenshot({path:path.join(out,'wallet-'+theme+'-'+width+'.png')});}
  await p.locator('[data-mw-tab=stored]').click();assert.match(await p.locator('[data-mw-balance]').textContent(),/尚未開放/);assert.equal(await p.locator('.mw-filter').count(),0);assert.match(await p.locator('[data-mw-panel]').textContent(),/付款.*退款/);
  await p.locator('.mw-heading').evaluate(e=>e.scrollIntoView({block:'start'}));await p.screenshot({path:path.join(out,'stored-'+theme+'-320.png')});
  delay=true;await p.locator('[data-mw-tab=task]').click();await p.locator('[data-mw-tab=stored]').click();await p.waitForTimeout(350);assert.match(await p.locator('[data-mw-panel]').textContent(),/儲值紀錄/,'late task response cannot overwrite recharge panel');
  delay=false;fail=true;await p.locator('[data-mw-tab=task]').click();await p.waitForFunction(()=>document.querySelector('[data-mw-list]')?.textContent.includes('紀錄讀取未完成'));assert.equal(await p.locator('[data-mw-export]').isEnabled(),false);assert.equal(await p.locator('[data-mw-list]').textContent().then(t=>t.includes('沒有符合')),false);
  fail=false;await p.locator('[data-mw-refresh]').click();await p.waitForFunction(()=>document.querySelectorAll('.mw-entry').length===50);
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS wallet integration: server balance, own ledger, microsecond pagination, date/type filters, read-only details, Taiwan time, safe CSV, late-response isolation, error/retry, recharge disabled, light/dark and 320/375 layouts.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
