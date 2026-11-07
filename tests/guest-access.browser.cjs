const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),web=path.resolve('apps/web');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const [theme,width] of [['light',1440],['dark',1440],['light',390],['dark',390]]){
  const p=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});let screenCalls=0;
  await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('fqi.arrival.skip.v1','1');localStorage.setItem('fqi.arrival.skip.v2','1');},theme);
  await p.route('**/*',r=>{const u=new URL(r.request().url());
   if(u.pathname.includes('/api/screen'))screenCalls++;
   if(u.origin==='https://guest.fixture.test'){
    const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill(f.endsWith('index.html')?{contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}:{path:f});
   }
   return r.fulfill({json:u.pathname.endsWith('/settings')?{external:{email:true}}:[]});
  });
  await p.goto('https://guest.fixture.test');await p.waitForFunction(()=>window.AcademyGuestAccess&&window._setDrawTool&&window.openMemberCenter);
  await p.evaluate(()=>{window.prompts=0;window.openAuthModal=()=>{prompts++;};window.showToast=()=>{};});
  await p.evaluate(()=>_showView('screen'));assert.equal(await p.evaluate(()=>location.hash),'#screen');
  await p.waitForTimeout(200);const initialCalls=screenCalls;await p.evaluate(()=>doScreen());assert.equal(screenCalls,initialCalls,'guest filtering never starts a request');
  const before=await p.evaluate(()=>({url:location.href,len:history.length}));
  await p.evaluate(()=>_showView('themes'));assert.deepEqual(await p.evaluate(()=>({url:location.href,len:history.length})),before,'denied route keeps its source/history');
  await p.evaluate(()=>openMemberCenter('learning'));assert.equal(await p.locator('.member-page:not([hidden])').count(),0);
  await p.evaluate(()=>{_setDrawTool('seg');AcademyChartTools.toggleInterval();});
  assert.equal(await p.evaluate(()=>AcademyChartBridge.get().tool),null);assert.equal(await p.evaluate(()=>AcademyChartTools.isSelecting()),false);
  // Use the real tool buttons with spy handlers to isolate capture from chart data loading.
  await p.evaluate(()=>{document.getElementById('chartModal').classList.add('open');window.toolClicks=0;document.getElementById('ddLineBtn').onclick=()=>toolClicks++;window.periodClicks=0;document.getElementById('weeklyBtn').onclick=()=>periodClicks++;});
  await p.locator('#ddLineBtn').evaluate(e=>e.click());assert.equal(await p.evaluate(()=>toolClicks),0);
  await p.locator('#weeklyBtn').evaluate(e=>e.click());assert.equal(await p.evaluate(()=>periodClicks),1,'guest can change period');
  assert.equal(await p.locator('#guestChartNotice').evaluate(e=>getComputedStyle(e).display),'flex');
  await p.evaluate(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'member'}));AcademyGuestAccess.sync();});
  await p.locator('#ddLineBtn').evaluate(e=>e.click());assert.equal(await p.evaluate(()=>toolClicks),1,'signed-in controls keep their normal handlers');
  for(const tier of ['free','observation','research','advanced','vip']){
   const allowed=await p.evaluate(tier=>{window._isOwner=false;window._isAdmin=false;window._memberTier=tier;return ['breadth','fhedge'].map(v=>AcademyGuestAccess.canReadResearch(v));},tier);
   assert.deepEqual(allowed,[tier!=='free',tier!=='free'],'minimum tier for both research pages: '+tier);
  }
  await p.evaluate(()=>window._memberTier='free');
  const sourceURL=await p.url();await p.evaluate(()=>_showView('breadth'));assert.equal(await p.url(),sourceURL,'free member stays on source page');

  assert.equal(await p.locator('#guestChartNotice').evaluate(e=>getComputedStyle(e).display),'none');
  await p.evaluate(()=>{localStorage.removeItem('sb_token');AcademyGuestAccess.sync();});
  await p.locator('#ddLineBtn').evaluate(e=>e.click());assert.equal(await p.evaluate(()=>toolClicks),1,'logout revokes tool use immediately');
  assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('is-guest')),true);
  await p.goto('https://guest.fixture.test/?direct=1#themes');await p.waitForFunction(()=>window.AcademyGuestAccess&&document.getElementById('authModal')?.classList.contains('open'));
  assert.equal(await p.locator('#themesView').isVisible(),false,'direct guest link cannot reveal a protected view');
  assert.equal(await p.locator('#homeView').isVisible(),true,'direct guest link keeps the homepage preview behind login');
  await p.close();
 }
 console.log('PASS guest preview: screener entry, no execution, protected routes/history and lessons, chart tools blocked, periods allowed, member/logout transitions, light/dark desktop/mobile.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
