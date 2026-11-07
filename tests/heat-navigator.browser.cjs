const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('fqi.arrival.skip.v2','1');},theme);
 await page.route('**/*',r=>{const u=new URL(r.request().url()),f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(u.hostname==='heat.fixture.test'&&f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({json:[]});});
 await page.goto('https://heat.fixture.test/');await page.waitForFunction(()=>window.AcademyHeatNavigator&&window._themesShow);
 await page.evaluate(()=>{
  document.querySelectorAll('.brand-arrival,#siteGate').forEach(e=>e.remove());document.querySelectorAll('#homeView').forEach(e=>e.style.display='none');
  window._rtStart=()=>{};window._loadNames=()=>{};
  const members=[{code:'2330',name:'台積電',price:100,change:1,tradeValue:1e8}];
  window._swrRT=(key,url,paint)=>paint(key==='themes'?{date:'2026-11-05',listed:Array.from({length:70},(_,i)=>({name:'題材'+i,tradeValue:1e9-i*1e6,weightedToday:-2,today:-2,memberCount:1,limitUps:0,limitDowns:0,members})),otc:[]}:{date:'2026-11-05',total:70,sectors:Array.from({length:35},(_,i)=>({sector:'產業'+i,count:2,avg_chg:1,up:2,down:0,stocks:[['2330','台積電',100,1,1]]}))});
  document.getElementById('themesView').style.display='block';_themesShow();
 });
 for(const [view,tile,detail,show] of [['themesView','.tmx-cell','#tmxDetail','_themesShow'],['sectorView','.sm-tile','#smList','_sectorShow']]){
  if(view==='sectorView')await page.evaluate(()=>{document.getElementById('themesView').style.display='none';document.getElementById('sectorView').style.display='block';_sectorShow();});
  const v=page.locator('#'+view);await v.locator('.heat-find input').waitFor();
  await v.locator(tile).last().scrollIntoViewIfNeeded();await v.locator(tile).last().click();await page.locator(detail+' .heat-switch').waitFor();
  await page.waitForTimeout(500); const rect=await page.locator(detail).boundingBox();assert.ok(rect.y>=0&&rect.y<850,'inspector stays visible after a low tile click');
  const scroll=await page.evaluate(()=>scrollY);await page.locator(detail+' select').selectOption({label:(view==='themesView'?'題材':'產業')+'1'});assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<30,'switch does not scroll to top');
  assert.match(await page.locator(detail).innerText(),view==='themesView'?/題材1/:/產業1/);
  await v.locator('.heat-find input').fill('不存在');assert.equal(await v.locator(tile+':visible').count(),0);assert.ok(await v.locator('.heat-find-empty').isVisible());await v.locator('.heat-find input').fill('');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator(detail+' select').isVisible());assert.ok(await page.locator(detail).evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.setViewportSize({width:1440,height:900});
 }
 console.log('PASS sticky inspector, category search/switch, no scroll jump, mobile:',theme);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
