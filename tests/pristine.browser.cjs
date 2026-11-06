const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),snap=JSON.parse(fs.readFileSync(path.join(root,'lib/pristine_snapshot.json'),'utf8'));
const out=path.join(process.env.TEMP||root,'foresight-pristine-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const [theme,width,height=1000] of [['light',1440],['dark',1440],['light',390],['dark',390],['light',1366,650],['dark',390,650],['light',760,440]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.addInitScript(t=>{localStorage.setItem('theme',t);localStorage.setItem('fqi.arrival.skip.v2','1');},theme);
  await page.route('**/*',route=>{const u=new URL(route.request().url());
   if(u.origin==='https://pristine.fixture.test'){
    if(u.pathname==='/api/prices')return route.fulfill({json:{...snap,history:theme==='dark'&&width===1440?snap.history.map((r,i)=>({...r,value:5000+i})):snap.history,history_status:'official'}});
    const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){if(file.endsWith('index.html'))return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});return route.fulfill({path:file});}
    return route.fulfill({json:{}});
   }if(u.pathname.endsWith('/security_catalog'))return route.fulfill({json:snap.members.map((r,i)=>({code:r.code,industry:i%2?'食品工業':'水泥工業'}))});if(u.pathname.endsWith('/taiex_daily'))return route.fulfill({json:snap.history.map((r,i)=>({trade_date:r.date,close:30000+i*40})).reverse()});return route.fulfill({json:[]});
  });
  await page.goto('https://pristine.fixture.test/');
  await page.waitForSelector('#pristineOverview .pr-stats',{state:'attached'});
  await page.evaluate(()=>{document.getElementById('homeView').style.display='block';document.querySelectorAll('.brand-arrival,#siteGate').forEach(e=>e.remove());document.body.style.overflow='auto';document.documentElement.style.scrollBehavior='auto';});
  const card=page.locator('#hpPristineSec');await card.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>document.getElementById('hpPristineSec').nextElementSibling.id),'hpMaintSec');
  const overflow=await card.evaluate(e=>e.scrollWidth>e.clientWidth+2);assert.equal(overflow,false,theme+' '+width+' card overflow');
  await page.locator('[data-period="20"]').click();assert.equal(await page.locator('[data-period="20"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.pr-chart-caption').innerText(),/區間表現/);
  await card.screenshot({path:path.join(out,theme+'-'+width+'.png')});
  await page.locator('.pr-benchmark-toggle').click();await page.waitForSelector('.pr-benchmark-curve');assert.equal(await page.locator('.pr-benchmark-toggle').getAttribute('aria-checked'),'true');assert.match(await page.locator('.pr-chart-caption').innerText(),/起點 100/);
  await page.locator('[data-period=\"60\"]').click();assert.equal(await page.locator('.pr-benchmark-curve').count(),1);
  await page.locator('.pr-benchmark-toggle').click();assert.equal(await page.locator('.pr-benchmark-curve').count(),0);assert.match(await page.locator('.pr-chart-caption').innerText(),/價格指數/);
  await page.locator('[data-period=\"20\"]').click();
  assert.equal(await page.locator('.pr-gem').count(),0);
  assert.match(await page.locator('.pr-heading small').innerText(),/PRISTINE INDEX/);
  const expected=theme==='dark'&&width===1440?'pr-up':'pr-down';
  assert.equal(await page.locator('.pr-chart').evaluate((e,c)=>e.classList.contains(c),expected),true);
  assert.equal(await page.locator('.pr-stat>strong').first().evaluate((e,c)=>e.classList.contains(c),expected),true);
  const cardHeight=await card.evaluate(e=>e.offsetHeight);
  await page.locator('.pr-open-directory').click();assert.ok(await page.locator('.pr-directory-list button').count()<=12);
  assert.equal(await card.evaluate(e=>e.offsetHeight),cardHeight,'opening directory must not expand home');
  const dialog=page.locator('.pr-directory');const bounds=await dialog.boundingBox();assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2,'dialog centered horizontally');
  assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'directory no horizontal overflow');
  assert.equal(await dialog.evaluate(e=>e.scrollHeight>e.clientHeight+2),false,'directory no vertical scroll');
  assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1,'dialog fits viewport');
  await page.locator('.pr-industry-filter select').selectOption('水泥工業');assert.match(await page.locator('.pr-page-read').innerText(),/197 檔/);
  await page.locator('.pr-industry-filter select').selectOption('');
  await dialog.screenshot({path:path.join(out,'directory-'+theme+'-'+width+'.png')});
  const firstCode=await page.locator('.pr-directory-list button').first().getAttribute('data-code');
  await page.locator('[data-pr-page="1"]').click();assert.notEqual(await page.locator('.pr-directory-list button').first().getAttribute('data-code'),firstCode);
  await page.locator('.pr-directory-search input').fill('1104');assert.equal(await page.locator('.pr-directory-list button').count(),1);
  await page.locator('.pr-directory-search input').fill('no-match');assert.equal(await page.locator('.pr-directory-list button').count(),0);
  await page.locator('.pr-directory-search input').fill('1104');
  await page.evaluate(()=>{window.prClicked=null;window.openChart=(...args)=>window.prClicked=args;});
  await page.locator('.pr-directory-list button').click();assert.equal(await page.locator('.pr-directory').isVisible(),false);assert.equal(await page.evaluate(()=>window.prClicked[0]),'1104');
  await page.locator('.pr-open-directory').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.pr-directory').isVisible(),false);
  await page.locator('.pr-screen').click();assert.equal(await page.locator('#pristine_only').isChecked(),true);
  assert.equal(await page.locator('[data-cat="ev357"] .sc-body').isVisible(),true);
  await page.close();console.log('PASS',theme,width,height);
 }
 const p=await browser.newPage({reducedMotion:'reduce'});await p.setContent('<style>'+fs.readFileSync(path.join(web,'assets/pristine.css'),'utf8')+'</style><section class="pristine-section"></section>');
 assert.equal(await p.locator('section').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');await p.close();
 console.log('screenshots:',out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
