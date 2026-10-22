const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:375,height:850}});let stored=1000,ai=0,lose=true,hold=null;
  const receipts=new Map(),requests=[];
  await context.route('https://ai.fixture.test/**',async route=>{
   const url=route.request().url();
   if(url.endsWith('/user'))return route.fulfill({json:{id:'member-a'}});
   if(url.endsWith('/member_wallet_summary'))return route.fulfill({json:{stored_points:stored,ai_points:String(ai),ai_enabled:true,stored_enabled:true}});
   if(url.endsWith('/member_ai_convert')){
    const b=route.request().postDataJSON();requests.push(b);let receipt=receipts.get(b.p_request_id);
    if(!receipt){stored-=b.p_points;ai+=b.p_points;receipt={converted:b.p_points,ai_points:String(ai)};receipts.set(b.p_request_id,receipt);}
    if(hold){await hold;hold=null;}
    if(lose){lose=false;return route.abort('failed');}return route.fulfill({json:receipt});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="sheet"></main></body></html>'});
  });
  async function mount(page){
   const html=fs.readFileSync(path.join(web,'index.html'),'utf8');await page.addStyleTag({content:[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')});
   for(const file of ['member-center.css','member-wallet.css'])await page.addStyleTag({path:path.join(web,'assets',file)});
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;window.SIG_SB_URL=location.origin;window.SIG_SB_ANON='fixture';localStorage.setItem('sb_token','member-a');},theme);
   for(const file of ['member-identity.js','member-ai-points.js'])await page.addScriptTag({path:path.join(web,'assets',file)});
   await page.evaluate(()=>AcademyAiPoints.mount(document.getElementById('sheet')));
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://ai.fixture.test/');await mount(page);
  await page.locator('[data-ai-in] input').fill('100');await page.locator('[data-ai-in] button[type=submit]').click();
  await page.locator('[data-ai-retry]').waitFor();assert.equal(stored,900);assert.equal(await page.locator('[data-ai-in] input').isDisabled(),true);
  assert.match(await page.locator('.ai-pending').innerText(),/轉入 100 點/);
  assert.ok(await page.locator('#sheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'mobile panel has no horizontal overflow');
  // Closing the original tab must not lose the unresolved operation.
  await page.close();const reopened=await context.newPage();await reopened.goto('https://ai.fixture.test/');await mount(reopened);
  await reopened.locator('[data-ai-retry]').waitFor();assert.equal(await reopened.locator('[data-ai-out] button').isDisabled(),true);
  await reopened.locator('[data-ai-retry]').click();await reopened.waitForFunction(()=>document.querySelector('.ai-status').textContent.includes('已確認轉入'));
  assert.equal(stored,900);assert.equal(requests.length,2);assert.equal(requests[0].p_request_id,requests[1].p_request_id);
  // Two real tabs share a Web Lock: the second submit cannot create another operation.
  let release;hold=new Promise(resolve=>release=resolve);
  await reopened.locator('[data-ai-in] input').fill('50');await reopened.locator('[data-ai-in] button[type=submit]').click();
  await reopened.waitForFunction(()=>document.querySelector('.ai-status').textContent==='處理中…');
  const second=await context.newPage();await second.goto('https://ai.fixture.test/');await mount(second);await second.locator('[data-ai-retry]').waitFor();await second.locator('[data-ai-retry]').click();
  await second.waitForFunction(()=>document.querySelector('.ai-status').textContent.includes('另一個分頁'));
  assert.equal(requests.length,3);release();await reopened.waitForFunction(()=>document.querySelector('.ai-status').textContent.includes('已轉入'));
  assert.equal(stored,850);assert.equal(ai,150);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS AI retry browser: light/dark mobile panels, pending controls, tab close/reopen recovery, same-ID retry, real cross-tab lock, one debit per transaction.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
