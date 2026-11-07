const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [375,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});let calls=[],active=true,verified=false,claimed=false,sms=true,missing=false;
 const status=()=>({version:1,active,eligible:active&&!claimed,phone_verified:verified,reward_id:claimed?'reward-1':null,reward_status:claimed?'ready':null,activation_deadline:'2099-12-01T00:00:00Z',server_time:'2026-11-07T00:00:00Z'});
 await page.route('**/*',r=>{const u=new URL(r.request().url());calls.push(u.pathname);
  if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:`<html data-theme="${theme}"><head><meta charset="utf-8"></head><body><div aria-modal="true" style="display:none">隱藏的登入視窗</div><script>var SIG_SB_URL='https://fixture.test';var SIG_SB_ANON='public';localStorage.setItem('sb_token','token1');localStorage.setItem('sb_user',JSON.stringify({id:'member1'}));window.gated=0;window.AcademyPhoneGate={ensure:async()=>{window.gated++;return true}};window.openMemberCenter=v=>window.destination=v;</script><script src="/assets/member-identity.js"></script><script src="/assets/member-phone-welcome.js"></script><link rel="stylesheet" href="/assets/member-phone-welcome.css"></body></html>`});
  if(u.pathname.startsWith('/assets/'))return r.fulfill({path:path.join(root,'apps/web',u.pathname)});
  if(u.pathname.endsWith('member_phone_welcome_status'))return missing?r.fulfill({status:404,json:{code:'PGRST202'}}):r.fulfill({json:status()});
  if(u.pathname.endsWith('claim_member_phone_welcome')){assert.equal(verified,true);claimed=true;return r.fulfill({json:status()});}
  if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{phone:sms}}});
  return r.fulfill({json:{}});
 });
 await page.goto('https://fixture.test/');await page.locator('.mpw-notice').waitFor();
 assert.equal(await page.evaluate(()=>gated),0,'read-only eligibility cannot force phone gate');
 assert.match(await page.locator('.mpw-notice').innerText(),/每個帳號限領一次/);
 assert.ok(await page.locator('.mpw-notice').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
 await page.locator('.mpw-action').click();assert.equal(await page.evaluate(()=>destination),'security');
 await page.evaluate(()=>dispatchEvent(new Event('academy-auth-changed')));await page.waitForTimeout(150);assert.equal(await page.locator('.mpw-notice').count(),0,'dismissed offer is not repeated every refresh');
 verified=true;await page.evaluate(()=>dispatchEvent(new Event('academy-identity-linked')));await page.locator('.mpw-notice').waitFor();assert.match(await page.locator('.mpw-notice strong').innerText(),/已入帳/);
 assert.equal(calls.filter(p=>p.endsWith('claim_member_phone_welcome')).length,1);assert.equal(await page.evaluate(()=>gated),1);
 await page.locator('.mpw-action').click();assert.equal(await page.evaluate(()=>destination),'gifts');
 await page.evaluate(()=>{localStorage.removeItem('sb_token');localStorage.removeItem('sb_user');dispatchEvent(new Event('academy-auth-changed'));});assert.equal(await page.locator('.mpw-notice').count(),0);
 // Disabled/unavailable service must not advertise a reward.
 active=false;claimed=false;verified=false;await page.reload();await page.waitForTimeout(150);assert.equal(await page.locator('.mpw-notice').count(),0);
 active=true;missing=true;await page.reload();await page.waitForTimeout(150);assert.equal(await page.locator('.mpw-notice').count(),0);
 missing=false;sms=false;await page.reload();await page.waitForTimeout(150);assert.equal(await page.locator('.mpw-notice').count(),0);
 await page.close();
 }
 console.log('PASS phone welcome UI: light/dark, mobile/desktop, gate-safe status, bind/gift routes, server-only issuance, once-per-session reminder, logout cleanup, disabled/missing/SMS-off suppression.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
