const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync(path.join(__dirname,'..','apps/web/index.html'),'utf8');
const nav=html.match(/<nav id="mainNav">[\s\S]*?<\/nav>/)[0];
const sticky=html.match(/  function stickyNavigation\(\)\{[\s\S]*?(?=  function resetViewScroll)/)[0];
const reset=html.match(/  function resetViewScroll\(\)\{[\s\S]*?(?=  function markPrimaryButtons)/)[0];
const mapping=html.match(/    var NAVMAP=[\s\S]*?(?=    window\._showView=function)/)[0];
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1500,height:800}});
 await page.route('https://nav.fixture.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{height:5000px;margin:0;background:linear-gradient(#eef4fa,#a4bbc8)}nav{position:fixed;top:0;background:white;z-index:2;width:100%}.mn-inner{display:flex;gap:20px}.mn-item{display:block;padding:20px;cursor:pointer}.mn-menu{display:none;position:absolute;background:white}.mn-grp:hover .mn-menu{display:block}.mn-menu.mn-hide{display:none}.mn-menu a{display:block;padding:8px}.mn-active{background:#dbeaff}</style>${nav}<input id="filter" value="keep my filters"><script>${mapping}window.renderCount=0;window._showView=v=>{window.currentView=v;window.renderCount++;_setNav(v);history.replaceState({v},'',v==='home'?'/':'/#'+v);};${sticky}${reset}stickyNavigation();resetViewScroll();_showView('focus');</script>`}));
 await page.goto('https://nav.fixture.test');
 const top=async()=>{await page.waitForFunction(()=>scrollY<=1);};
 for(const [view,label] of [['focus','今日焦點'],['todayindex','今日焦點'],['box','選股'],['themes','題材族群'],['breadth','市場觀察'],['etfcons','ETF 分析'],['home','首頁'],['news','每日新聞']]){
  await page.evaluate(v=>window._showView(v),view);await top();
  await page.evaluate(()=>scrollTo({top:2400,behavior:'instant'}));await page.waitForTimeout(80);
  const before=await page.evaluate(()=>({renders:renderCount,url:location.href,history:history.length}));
  await page.locator('#mainNav .mn-item').filter({hasText:label}).click();
  await page.waitForTimeout(100);
  const middle=await page.evaluate(()=>scrollY);assert.ok(middle>0&&middle<2400,label+' must animate upward');
  await top();
  assert.deepEqual(await page.evaluate(()=>({renders:renderCount,url:location.href,history:history.length})),before,'same group must not rerender or navigate');
  assert.equal(await page.evaluate(()=>currentView),view);assert.equal(await page.locator('#filter').inputValue(),'keep my filters');
 }
 // Clicking a different parent must not falsely scroll the current page.
 await page.evaluate(()=>{_showView('focus');});await top();await page.evaluate(()=>scrollTo({top:2000,behavior:'instant'}));
 const etf=page.locator('#mainNav .mn-item').filter({hasText:'ETF 分析'});await etf.click();assert.equal(await page.evaluate(()=>currentView),'focus');assert.equal(await page.evaluate(()=>scrollY),2000);
 await page.locator('.mn-menu a').filter({hasText:'成分股'}).click();await top();assert.equal(await page.evaluate(()=>currentView),'etfcons');
 // Keyboard and reduced motion, then cancellation by another real child link.
 await page.evaluate(()=>scrollTo({top:2000,behavior:'instant'}));await etf.focus();await etf.press('Enter');await top();assert.equal(await page.evaluate(()=>currentView),'etfcons');
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo({top:2000,behavior:'instant'}));await etf.press('Space');await top();assert.equal(await page.evaluate(()=>currentView),'etfcons');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>scrollTo({top:2400,behavior:'instant'}));await etf.click();await page.waitForTimeout(80);
 const today=page.locator('#mainNav .mn-item').filter({hasText:'今日焦點'});await today.hover();await page.locator('.mn-menu a').filter({hasText:'今日索引'}).click();await top();
 assert.equal(await page.evaluate(()=>currentView),'todayindex');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('pro-home-scrolling')),false);
 await page.screenshot({path:path.join(process.env.QA_OUTPUT||require('node:os').tmpdir(),'navigation-return-top.png')});
 console.log('PASS all active navigation groups preserve child views, filters and history; smooth return, other menus, keyboard, reduced motion and cancellation.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
