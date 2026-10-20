const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),web=path.join(root,'apps/web'),html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+
 fs.readFileSync(path.join(web,'assets/site-readability.css'),'utf8')+fs.readFileSync(path.join(web,'assets/member-share.css'),'utf8');
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:'index-inline-'+i});
assert.ok(html.includes("!!window.AcademyShareUnlock?.hasAccess('fhedge')"));assert.ok(html.includes("!!window.AcademyShareUnlock?.hasAccess('breadth')"));
assert.equal(html.includes('<h3>付費解鎖更多</h3>'),false);
let mode='normal',claims=0,statusCalls=0,trial=false,activated=false,confirmed=2,copyFail=false;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/rest/v1/rpc/member_share_unlock'){
    statusCalls++;const body=route.request().postDataJSON()||{};
    assert.equal(route.request().headers().authorization,'Bearer '+(route.request().headers().authorization.endsWith('member-b')?'member-b':'member-a'));
    assert.equal(Object.hasOwn(body,'user_id'),false);assert.equal(Object.hasOwn(body,'duration_days'),false);
    if(mode==='missing')return route.fulfill({status:404,json:{code:'PGRST202'}});
    if(mode==='error')return route.fulfill({status:503,json:{message:'unavailable'}});
    if(body.p_claim_trial){assert.equal(body.p_confirm_shared,true);claims++;trial=true;}
    const now=Date.now(),days=(trial?3:0)+Math.floor(confirmed/3)*7;
    const data={reward_delivery:'voucher',pending_vouchers:(trial?1:0)+Math.floor(confirmed/3),campaign:'share-v1',feature:'research_tools',code:'GS123456ABCDEF',campaign_active:mode!=='paused',verified:mode!=='unverified',requires_phone:true,confirmed_count:confirmed,rewarded_groups:Math.floor(confirmed/3),trial_claimed:trial,has_access:activated&&days>0,expires_at:activated&&days?new Date(now+(mode==='expire'?120:days*86400000)).toISOString():null,server_time:new Date(now).toISOString()};
    if(mode==='choice')data.feature_access={fhedge:new Date(now+3600000).toISOString()};
    if(mode==='choice-expire')data.feature_access={fhedge:new Date(now+120).toISOString()};
    if(mode==='vip'){data.membership_tier='vip';data.feature_access=Object.fromEntries(['fhedge','breadth','hottopics','selltrack','sig','brank','mingdeng'].map(f=>[f,new Date(now+3600000).toISOString()]));}
    return route.fulfill({json:mode==='malformed'?{...data,has_access:'true'}:data});
   }
   if(url.pathname.startsWith('/assets/'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(web,url.pathname),'utf8')});
   if(url.hostname!=='share.test')throw Error('Unexpected external network: '+url);
   return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><html data-theme="light"><style>${styles}</style><body><button data-share-unlock>分享解鎖，立即使用 →</button><div id="fhedgeView" style="display:none"></div><div id="breadthView" style="display:none"></div><script>const SIG_SB_URL='https://share.test',SIG_SB_ANON='public-key';window._isOwner=false;window.openAuthModal=()=>window.loginOpened=true;window._fhedgeApplyGate=()=>window.gateUpdates=(window.gateUpdates||0)+1;window._breadthApplyGate=()=>{};window.copyFail=false;Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{if(window.copyFail)throw Error('denied');window.copied=value;}}});</script><script src="assets/member-identity.js"></script><script src="assets/member-share.js"></script></body></html>`});
  });
  await page.goto('https://share.test/');
  await page.getByRole('button',{name:'分享解鎖，立即使用 →',exact:true}).click();
  const d=page.locator('dialog.share-unlock');await d.waitFor({state:'visible'});
  assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);assert.match(await d.locator('[data-share-account]').textContent(),/登入後取得/);
  await d.getByRole('button',{name:'登入／註冊',exact:true}).click();assert.equal(await page.evaluate(()=>window.loginOpened),true);
  await page.evaluate(()=>{localStorage.setItem('sb_token','member-a');dispatchEvent(new Event('academy-auth-changed'));});
  await page.getByRole('button',{name:'分享解鎖，立即使用 →',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-share-confirm]').disabled);
  assert.equal(await d.locator('[data-share-progress]').textContent(),'2／3 位');
  assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);
  await d.locator('[data-share-copy]').click();assert.match(await page.evaluate(()=>window.copied),/^https:\/\/share.test\/\?ref=GS123456ABCDEF$/);
  assert.equal(await d.locator('[data-share-progress]').textContent(),'2／3 位');assert.equal(claims,0);
  await d.locator('[data-share-confirm]').check();await d.locator('[data-share-claim]').click();
  await page.waitForFunction(()=>document.querySelector('[data-share-claim]').textContent==='3 天使用券已領取');
  assert.equal(claims,1);assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false,'receiving a voucher must not activate access');
  activated=true;await page.evaluate(()=>AcademyShareUnlock.refresh());assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),true);
  assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('admin')),false);
  assert.equal(await page.evaluate(()=>window._isOwner),false);
  mode='choice';await page.evaluate(()=>AcademyShareUnlock.refresh());assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('fhedge')),true);assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false,'one-tool coupon must not open another tool');
  mode='choice-expire';await page.evaluate(()=>AcademyShareUnlock.refresh());await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('fhedge')),false);
  mode='normal';await page.evaluate(()=>AcademyShareUnlock.refresh());
  mode='vip';await page.evaluate(()=>AcademyShareUnlock.refresh());assert.equal(await page.evaluate(()=>AcademyShareUnlock.membershipTier()),'vip');for(const feature of ['sig','brank','mingdeng'])assert.equal(await page.evaluate(f=>AcademyShareUnlock.hasAccess(f),feature),false,'admin-only '+feature+' is never granted by a coupon');assert.equal(await page.evaluate(()=>window._isOwner),false);assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('hottopics')),true);mode='normal';await page.evaluate(()=>AcademyShareUnlock.refresh());
  confirmed=3;await d.locator('[data-share-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-share-total]').textContent.includes('7 天'));
  assert.equal(await d.locator('[data-share-progress]').textContent(),'0／3 位');
  // Clipboard fallback gives a selectable link without claiming or changing progress.
  await page.evaluate(()=>window.copyFail=true);await d.locator('[data-share-copy]').click();assert.equal(await d.locator('[data-share-link]').isVisible(),true);
  const output=process.env.QA_OUTPUT;if(output)fs.mkdirSync(output,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [1200,390,320]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert.ok(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog must not overflow '+theme+' '+width);
   assert.ok(await d.locator('.share-rewards').evaluate(e=>[...e.children].every(c=>c.getBoundingClientRect().right<=e.getBoundingClientRect().right+1)));
   if(output)await d.screenshot({path:path.join(output,'share-'+theme+'-'+width+'.png')});
  }
  await page.keyboard.press('Escape');assert.equal(await d.isVisible(),false);
  // Failed responses fail closed and do not clear the existing login token.
  mode='error';await page.evaluate(()=>AcademyShareUnlock.refresh());assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false);assert.equal(await page.evaluate(()=>localStorage.getItem('sb_token')),'member-a');
  mode='malformed';await page.evaluate(()=>AcademyShareUnlock.refresh());assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false);
  mode='missing';await page.getByRole('button',{name:'分享解鎖，立即使用 →',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-share-status]').textContent.includes('尚未啟用'));assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);
  mode='paused';await page.evaluate(()=>AcademyShareUnlock.refresh());assert.match(await d.locator('[data-share-account]').textContent(),/準備中/);assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);
  mode='unverified';trial=false;await page.evaluate(()=>AcademyShareUnlock.refresh());assert.match(await d.locator('[data-share-account]').textContent(),/手機驗證/);assert.equal(await d.locator('[data-share-claim]').isDisabled(),true);
  mode='expire';await page.evaluate(()=>AcademyShareUnlock.refresh());await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false);
  mode='normal';trial=false;confirmed=0;await page.evaluate(()=>{localStorage.setItem('sb_token','member-b');dispatchEvent(new Event('academy-auth-changed'));});
  await page.waitForFunction(()=>!document.querySelector('[data-share-confirm]').disabled);
  assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false);
  await page.evaluate(()=>{localStorage.removeItem('sb_token');dispatchEvent(new Event('academy-auth-changed'));});assert.equal(await page.evaluate(()=>AcademyShareUnlock.hasAccess('breadth')),false);
  assert.deepEqual(errors,[]);assert.ok(statusCalls>8);
  console.log('PASS share dialog: authenticated RPC, anonymous/disabled states, consent, one trial claim, referral progress, clipboard fallback, scoped access, expiry, errors preserve login, account changes, desktop/mobile light/dark, inline syntax.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
