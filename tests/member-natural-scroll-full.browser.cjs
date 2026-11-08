/* Full index + all real modules, isolated HTTP origin and fake REST; no user account data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.addInitScript(()=>{localStorage.setItem('fqi.arrival.skip.v2','1');localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'full-page-fixture',email:'fixture@example.test'}));});
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


 for(const tab of ['weekly','profile','notifications','weekly']){
  await member.evaluate(e=>e.scrollTop=900);const target=member.locator('[data-tab='+tab+']');await target.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>({scroll:document.querySelector('.member-page').scrollTop,rail:document.querySelector('.mc-nav').getBoundingClientRect().top}));
  await target.click();await page.waitForTimeout(450);
  const actual=await page.evaluate(()=>{const page=document.querySelector('.member-page'),flow=document.querySelector('.mc-content-flow'),first=document.querySelector('.mc-main').firstElementChild,rail=document.querySelector('.mc-nav'),bar=document.querySelector('.mc-brandbar'),natural=flow.getBoundingClientRect().top-(parseFloat(flow.style.top)||0);return{scroll:page.scrollTop,rail:rail.getBoundingClientRect().top,top:first.getBoundingClientRect().top,want:Math.max(natural,bar.getBoundingClientRect().bottom+12),padding:getComputedStyle(flow).paddingTop,rootOverflow:getComputedStyle(document.documentElement).overflowY,railOverflow:getComputedStyle(rail).overflowY};});
  assert(Math.abs(actual.scroll-before.scroll)<2,tab+' keeps page position');assert(Math.abs(actual.rail-before.rail)<2,tab+' keeps rail position');assert(Math.abs(actual.top-actual.want)<3,tab+' starts without gap '+JSON.stringify(actual));assert.ok(parseFloat(actual.padding)>=0);assert.equal(actual.rootOverflow,'hidden');assert.equal(actual.railOverflow,'visible');
 }
 await member.evaluate(e=>e.scrollTop-=400);await page.waitForTimeout(100);
 const topAfterUp=await page.evaluate(()=>({top:document.querySelector('.mc-content-flow').getBoundingClientRect().top,bar:document.querySelector('.mc-brandbar').getBoundingClientRect().bottom+12}));
 assert(topAfterUp.top<=topAfterUp.bar+2,'scrolling back up must not expose blank space '+JSON.stringify(topAfterUp));
 console.log('PASS full website weekly/profile/notifications repeated switches: no top gap, outer scroll preserved, no background scrollbar, no rail scrollbar.');
 await page.screenshot({path:path.join(output,'member-natural-full.png')});
 assert.deepEqual(errors,[]);await page.close();
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
