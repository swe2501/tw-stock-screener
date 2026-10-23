const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const route of ['#screen']){
  const p=await browser.newPage();
  await p.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fixture',email:'swe250165@gmail.com'}));});
  let release,reached;const barrier=new Promise(r=>release=r),blocked=new Promise(r=>reached=r);
  await p.route('**/*',async r=>{const u=new URL(r.request().url());
   if(u.pathname==='/api/screen'&&r.request().method()==='POST'){const d=r.request().postDataJSON();await p.evaluate(d=>window.sentDate=d.date,d);return r.fulfill({json:{date:d.date?d.date.slice(0,4)+'/'+d.date.slice(4,6)+'/'+d.date.slice(6):'2026/10/22',count:0,total:1,results:[]}});}
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
  await p.locator('.sic-card').waitFor();
  await p.locator('[data-sic-date="2026-10-14"]').click();
  assert.equal(await p.locator('#date').inputValue(),'','record popup does not alter scan date');await p.locator('[data-sic-close]').click();
  assert.equal(await p.locator('[data-sic-apply]').count(),0);
  await p.locator('.scal-base > summary').click();await p.locator('#date').fill('2026-10-14');
  await p.evaluate(()=>doScreen());await p.waitForFunction(()=>window.sentDate==='20261014');
  await p.waitForFunction(()=>document.querySelector('#statusArea').textContent.includes('2026/10/14'));
  await p.locator('[data-sic-date="2026-10-15"]').click();await p.locator('[data-sic-close]').click();assert.equal(await p.locator('#date').inputValue(),'2026-10-14','calendar browsing preserves existing scan date');await p.locator('#date').fill('2026-10-15');assert.ok(!(await p.locator('#statusArea').textContent()).includes('行情日期 2026/10/14'),'old results removed');
  await p.locator('#date').fill('');await p.evaluate(()=>doScreen());await p.waitForFunction(()=>window.sentDate==='');
  await p.waitForFunction(()=>document.querySelector('#statusArea').textContent.includes('2026/10/22'));
  await p.close();
 }
 console.log('PASS record popup preserves query; basic conditions date controls screening; stale results cleared; blank uses latest');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
