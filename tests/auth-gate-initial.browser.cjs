const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [route,email] of [['','swe250165@gmail.com'],['#focus','swe250165@gmail.com'],['',''],['','unapproved@example.test']]){
  const p=await browser.newPage();
  await p.addInitScript(email=>{if(email){localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fixture',email}));}},email);
  let release,reached;const barrier=new Promise(r=>release=r),blocked=new Promise(r=>reached=r);
  await p.route('**/*',async r=>{const u=new URL(r.request().url());
   if(u.pathname==='/pause-init.js'){reached();await barrier;return r.fulfill({body:'',contentType:'text/javascript'});}
   if(u.hostname==='unpkg.com')return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
   if(u.origin==='https://route.fixture.test'){
    if(u.pathname==='/')return r.fulfill({body:fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8').replace('<div id="authModal"','<script src="/pause-init.js"></script><div id="authModal"'),contentType:'text/html; charset=utf-8'});
    const f=path.resolve(root,'apps/web','.'+u.pathname);if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});
   }
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fixture',email:'swe250165@gmail.com'}});
   return r.fulfill({json:[]});
  });
  const navigation=p.goto('https://route.fixture.test/'+route);navigation.catch(()=>{});
  await blocked;await p.locator("[data-gate-loading]").waitFor({state:"visible"});
  assert.equal(await p.locator('[data-gate-loading]').isVisible(),true);
  assert.equal(await p.locator('[data-gate-login]').isVisible(),false,'login form flashed before auth restoration');
  release();await navigation;await p.waitForTimeout(100);
  const allowed=email==='swe250165@gmail.com';
  assert.equal(await p.locator('#siteGate').isVisible(),!allowed);
  assert.equal(await p.locator('[data-gate-loading]').isVisible(),false);
  if(!allowed)assert.equal(await p.locator('[data-gate-login]').isVisible(),true);
  if(allowed)assert.equal(await p.locator(route==='#focus'?'#focusView':'#homeView').isVisible(),true);
  await p.close();
 }
 console.log('PASS auth loading has no login flash; authorized home/focus restored; anonymous and unapproved still gated');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
