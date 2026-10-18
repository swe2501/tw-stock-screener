/* Full index + all real modules, isolated HTTP origin and fake REST; no user account data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'full-page-fixture',email:'fixture@example.test'}));});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='https://full-page.fixture.test'){
  const file=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});
  if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});
  return r.fulfill({json:{}});
 }
 if(u.hostname.endsWith('.supabase.co')){if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'full-page-fixture',email:'fixture@example.test',user_metadata:{display_name:'隔離測試'},email_confirmed_at:'2026-01-01'}});if(u.pathname.endsWith('/save_member_research_document')){const v=r.request().postDataJSON();return r.fulfill({json:{kind:v.p_kind,revision:v.p_expected_revision+1,payload:v.p_payload}});}return r.fulfill({json:[]});}
 return r.fulfill({contentType:'application/json',body:'{}'});
 });
 await page.goto('https://full-page.fixture.test/#member/overview');await page.locator('.member-page:not([hidden]) .mc-card').first().waitFor({timeout:20000});
 const member=page.locator('.member-page'),theme=member.locator('[data-member-theme]'),logout=member.locator('[data-member-logout]');
 await page.locator('.mc-identity').waitFor();
 assert.equal(await logout.isVisible(),true);await theme.click();
 const first=await page.locator('html').getAttribute('data-theme');assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),first==='light'?'light':'dark');
 await theme.click();await page.waitForTimeout(400);assert.notEqual(await page.locator('html').getAttribute('data-theme'),first);
 assert.equal(await member.locator('.mc-nav .pro-primary').count(),0);
 await member.locator('[data-tab=security]').hover();
 assert.equal(await member.locator('[data-tab=security]').evaluate(e=>getComputedStyle(e,'::after').animationName),'mc-nav-sweep');
 await member.locator('[data-tab=profile]').hover();
 assert.equal(await member.locator('[data-tab=profile]').evaluate(e=>getComputedStyle(e,'::after').animationName),'mc-nav-sweep');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await member.locator('[data-tab=profile]').evaluate(e=>getComputedStyle(e,'::after').animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.mouse.move(1400,500);await page.waitForTimeout(400);
 await page.screenshot({path:path.join(output,'member-controls-desktop.png')});
 await page.setViewportSize({width:390,height:844});await theme.click();await page.waitForTimeout(400);
 assert.equal(await member.evaluate(e=>e.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(output,'member-controls-mobile.png')});
 await member.evaluate(e=>e.scrollTop=1200);await logout.click();await member.waitFor({state:'hidden'});
 await page.waitForFunction(()=>scrollY===0&&location.hash==='');
 assert.equal(await page.locator('#homeView').isVisible(),true);
 for(const key of ['sb_token','sb_refresh','sb_user'])assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
 assert.equal(await page.evaluate(()=>history.state.academyMember),undefined);
 await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>scrollY),0,'old return scroll must not override home');
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS member theme controls, mobile layout, actual logout clears session and returns to home top.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
