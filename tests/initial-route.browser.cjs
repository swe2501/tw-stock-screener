const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const route of ['','?view=home','#home','#screen','?view=screen','#focus']){
  const p=await browser.newPage();
  await p.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fixture',email:'swe250165@gmail.com'}));});
  let release,reached;const barrier=new Promise(r=>release=r),blocked=new Promise(r=>reached=r);
  await p.route('**/*',async r=>{const u=new URL(r.request().url());
   if(u.pathname==='/pause-init.js'){reached();await barrier;return r.fulfill({body:'',contentType:'text/javascript'});}
   if(u.hostname==='unpkg.com')return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
   if(u.origin==='https://route.fixture.test'){
    if(u.pathname==='/')return r.fulfill({body:fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8').replace('</body>','<script src="/pause-init.js"></script></body>'),contentType:'text/html; charset=utf-8'});
    const f=path.resolve(root,'apps/web','.'+u.pathname);if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});
   }
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fixture',email:'swe250165@gmail.com'}});
   return r.fulfill({json:[]});
  });
  const navigation=p.goto('https://route.fixture.test/'+route);
  await blocked;
  assert.equal(await p.locator('.form-wrap').isVisible(),false,'Screener flashed before initialization: '+route);
  release();await navigation;await p.waitForTimeout(100);
  const screen=route.includes('screen');
  assert.equal(await p.locator('.form-wrap').isVisible(),screen,'Wrong route '+route);
  assert.equal(await p.locator('#homeView').isVisible(),!screen&&!route.includes('focus'),'Wrong home '+route);
  if(route.includes('focus'))assert.equal(await p.locator('#focusView').isVisible(),true);
  await p.evaluate(()=>window._showView('screen'));assert.equal(await p.locator('.form-wrap').isVisible(),true);
  await p.evaluate(()=>window._showView('home'));assert.equal(await p.locator('.form-wrap').isVisible(),false);assert.equal(await p.locator('#homeView').isVisible(),true);
  await p.close();
 }
 console.log('PASS no screener flash before DOMContentLoaded; home, hash/query screen, focus and view switching');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
