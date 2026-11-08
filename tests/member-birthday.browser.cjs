const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../apps/web'),out='C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/member-journey-review';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [1440,375,320]){
 const page=await browser.newPage({viewport:{width,height:850}});let acknowledgements=0;
 await page.route('https://birthday.fixture.test/**',r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:`<!doctype html><html ${theme==='light'?'data-theme="light"':''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--surface:${theme==='light'?'#fff':'#14212c'};--text:${theme==='light'?'#293647':'#e0e7ed'};--text-muted:${theme==='light'?'#63758b':'#a7b7c7'};--border:${theme==='light'?'#d6e1eb':'#42505c'};--accent:${theme==='light'?'#3c84bf':'#e6c975'}}body{background:${theme==='light'?'#f4f7fa':'#0b131b'};font-family:Arial,'Microsoft JhengHei',sans-serif}*{box-sizing:border-box}</style><link rel="stylesheet" href="/assets/member-birthday.css"></head><body><button id="before">首頁</button><script>localStorage.setItem('sb_token','birthday-test');window.AcademyIdentity={serviceRpc:async(name,p)=>{if(p.p_seen){window.acks=(window.acks||0)+1;return {seen:true};}return {version:6,awarded:true,seen:false,points:300,year:2026,expires_at:'2027-11-07T00:00:00Z'};}};</script><script src="/assets/member-birthday.js"></script></body></html>`});const f=path.resolve(root,'.'+u.pathname);if(f.startsWith(root+path.sep)&&fs.existsSync(f))return r.fulfill({path:f});return r.fulfill({status:404});});
 await page.goto('https://birthday.fixture.test/');await page.locator('.mbday[open]').waitFor();
 assert.equal(await page.locator('.mbday-message').isVisible(),false,'blessing follows animation');
 if(width===320)await page.getByRole('button',{name:'略過動畫',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.mbday-message')?.hidden);
 assert.match(await page.locator('.mbday').innerText(),/生日快樂！/);assert.match(await page.locator('.mbday').innerText(),/300/);
 assert.equal(await page.evaluate(()=>window.acks),1);
 const box=await page.locator('.mbday').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=850,'modal fits viewport');
 assert.equal(await page.locator('.mbday').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'no crowded horizontal overflow');
 assert.equal(await page.locator('.mbday-close').evaluate(e=>getComputedStyle(e).boxShadow),'none','close icon has no frame or shadow');
 await page.locator('.mbday-message').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
 await page.screenshot({path:path.join(out,`birthday-${theme}-${width}.png`)});
 await page.getByRole('button',{name:'收下祝福',exact:true}).click();assert.equal(await page.locator('.mbday').count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('academy-auth-changed')));assert.equal(await page.locator('.mbday').count(),0,'no replay in same session');
 await page.evaluate(()=>{localStorage.removeItem('sb_token');window.dispatchEvent(new Event('academy-auth-changed'));window.AcademyIdentity.serviceRpc=async()=>{window.noGiftChecked=true;return {version:6,awarded:false};};localStorage.setItem('sb_token','no-gift');window.dispatchEvent(new Event('academy-auth-changed'));});
 await page.waitForFunction(()=>window.noGiftChecked);assert.equal(await page.locator('.mbday').count(),0,'no invented birthday award');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{localStorage.removeItem('sb_token');window.dispatchEvent(new Event('academy-auth-changed'));window.AcademyIdentity.serviceRpc=async()=>({version:6,awarded:true,seen:false,points:300,expires_at:'2027-11-07T00:00:00Z'});localStorage.setItem('sb_token','reduce');window.dispatchEvent(new Event('academy-auth-changed'));});
 await page.locator('.mbday-message:visible').waitFor();
 await page.evaluate(()=>{localStorage.removeItem('sb_token');window.dispatchEvent(new Event('academy-auth-changed'));});assert.equal(await page.locator('.mbday').count(),0,'logout clears birthday dialog');
 await page.close();
 }
 console.log('PASS birthday UI: animation then blessing, skip/reduced motion, no unconfirmed gifts, logout cleanup, acknowledgement once, frameless close and light/dark at 1440/375/320.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
