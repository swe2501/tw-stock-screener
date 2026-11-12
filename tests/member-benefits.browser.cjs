const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/member-commerce/legacy');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [1440,768,375,320]){
 const page=await browser.newPage({viewport:{width,height:1000}});let missing=false;
 await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('fqi_glass_ui','1');localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('fqi.arrival.skip.v2','1');localStorage.setItem('sb_token','journey-fixture');localStorage.setItem('sb_user',JSON.stringify({id:'journey-fixture',email:'fixture@example.test'}));localStorage.setItem('academy.research.drafts.journey-fixture',JSON.stringify([{id:'note1',title:'筆記'}]));},theme);
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='https://journey.fixture.test'){const f=path.resolve(root,'apps/web','.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(path.join(root,'apps/web')+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()){if(f.endsWith('index.html'))return r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});return r.fulfill({path:f});}return r.fulfill({json:{}});}if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'journey-fixture',email:'fixture@example.test',email_confirmed_at:'2026-01-01',user_metadata:{display_name:'研究旅程測試',member_learning:['dates']}}});if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{email:true}}});
 if(u.pathname.endsWith('/member_task_status')||u.pathname.endsWith('/member_point_exchange_options'))return r.fulfill({json:{rows:[],server_time:new Date().toISOString()}});
 if(u.pathname.endsWith('/member_wallet_summary'))return missing?r.fulfill({status:404,json:{code:'PGRST202'}}):r.fulfill({json:{task_points:0,stored_enabled:false}});
 if(u.pathname.endsWith('/member_usage_vouchers'))return r.fulfill({json:{mode:'voucher',server_time:new Date().toISOString(),rows:[{status:'ready',activation_deadline:new Date(Date.now()+86400000).toISOString()},{status:'ready',activation_deadline:'2000-01-01'}]}});
 if(u.pathname.endsWith('/ensure_member_referral_code'))return r.fulfill({json:{code:'GS123456ABCDEF'}});return r.fulfill({json:[]});});
 await page.goto('https://journey.fixture.test/#member/benefits');const member=page.locator('.member-page'),main=member.locator('.mc-main');await page.locator('.mj-tier-grid').waitFor();assert.equal(await main.locator('.mj-tier').count(),4);assert.match(await main.innerText(),/會員方案，權益一次看清楚/);assert.doesNotMatch(await main.locator('.mb-levels').innerText(),/基本會員|研究會員/);
 const initialHistory=await page.evaluate(()=>history.length);
 for(const tier of ['free','observation','research','vip']){
  await main.locator('[data-mb-tier='+tier+']').click();
  assert.equal(await main.locator('[data-mb-tier='+tier+']').getAttribute('aria-pressed'),'true');
  const status=main.locator('.mb-row').filter({has:page.getByRole('heading',{name:'大盤多空廣度',exact:true})}).locator('[data-mb-status]');
  assert.equal(await status.innerText(),tier==='free'?'僅首頁摘要':'完整頁面');
  assert.equal(await main.getByRole('heading',{name:'不籌吃穿',exact:true}).count(),0,'member benefits omit internal tools');
  assert.doesNotMatch(await main.locator('.mb-comparison').innerText(),/管理員|內部專用/);
 }
 assert.equal(await page.evaluate(()=>history.length),initialHistory,'tier comparison never changes browser history or membership');
 await page.waitForTimeout(200);assert.equal(await main.locator('[data-mb-current]').innerText(),'見習研究生','previewing VIP does not upgrade the account');assert.equal(await main.getByRole('heading',{name:'會員等級與權益',exact:true}).count(),1,'task wallet hydration must not overwrite benefits header');
 assert.equal(await main.locator('.mb-row:visible').count(),4);
 for(const [category,count] of [[1,3],[2,2],[3,3],[0,4]]){await main.locator('[data-mb-category="'+category+'"]').click();assert.equal(await main.locator('.mb-row:visible').count(),count);}
 await main.locator('.mb-notes summary').click();assert.match(await main.innerText(),/每週篩選次數與分級儲存容量尚未啟用/);await main.locator('.mb-notes summary').click();
 assert.equal(await main.locator('[data-mb-points]').innerText(),'0 點');assert.equal(await main.locator('[data-mb-vouchers]').innerText(),'1 張待啟用 · 0 張使用中');
 await main.locator('[data-mb-tier=free]').click();await main.locator('[data-mb-row="2"] button').click();assert.equal(await main.locator('[data-mb-selected]').innerText(),'見習研究生');assert.equal(await page.evaluate(()=>location.hash),'#member/benefits');
 assert.equal(await main.getByText('跨題材整合分析',{exact:true}).count(),0);
 // Reproduce switching from a long member route at a deep scroll position.
 await member.evaluate(e=>e.scrollTop=900);await page.evaluate(()=>window.openMemberCenter('benefits'));
 await main.locator('.mb-notes summary').click();await page.waitForTimeout(100);
 const flow=await page.evaluate(()=>{const m=document.querySelector('.mc-main'),f=document.querySelector('#foresightFooter'),s=document.querySelector('.mc-shell');return {mainBottom:m.getBoundingClientRect().bottom,footerTop:f.getBoundingClientRect().top,shellBottom:s.getBoundingClientRect().bottom};});
 assert.ok(flow.footerTop>=flow.mainBottom-1,'expanded benefits must precede footer '+JSON.stringify(flow));
 assert.ok(flow.shellBottom>=flow.mainBottom-1,'member shell must contain expanded benefits '+JSON.stringify(flow));
 if(width===1440||width===375){for(const route of ['gifts','referrals','tasks','wallet','benefits']){
 await member.evaluate(e=>e.scrollTop=700);await page.evaluate(route=>window.openMemberCenter(route),route);await page.waitForTimeout(160);
 const detail=main.locator('details').first();if(await detail.count())await detail.evaluate(e=>e.open=true);
 const bounds=await page.evaluate(()=>{const main=document.querySelector('.mc-main').getBoundingClientRect(),shell=document.querySelector('.mc-shell').getBoundingClientRect(),footer=document.querySelector('#foresightFooter').getBoundingClientRect();return {main:main.bottom,shell:shell.bottom,footer:footer.top};});
 assert.ok(bounds.shell>=bounds.main-1&&bounds.footer>=bounds.main-1,route+' content stays before footer '+JSON.stringify(bounds));
 await member.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:path.join(out,'member-flow-'+route+'-'+theme+'-'+width+'.png')});
 }}
 await member.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:path.join(out,'benefits-flow-'+theme+'-'+width+'.png')});
 assert.ok(await member.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'benefits overflow '+width);await main.locator('.mb-hero').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'benefits-'+theme+'-'+width+'.png')});
 await page.close();
 }
 console.log('PASS real membership benefits route: four tier comparisons, no privilege/history changes, no internal tools disclosed, honest pending quotas, responsive 320/375/768/1440 light/dark.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
