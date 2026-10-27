const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),scan=process.env.VISUAL_SCAN_PATH;
if(!scan||!process.env.CHART_LIBRARY_PATH)throw Error('Set saved scan and chart library paths');
const data=JSON.parse(fs.readFileSync(path.join(web,'assets/codex-visual-patterns.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(scan,'stocks/8081/source.json'),'utf8'));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],paid=[];let boxReads=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user','{"id":"fx","email":"swe250165@gmail.com"}');});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='api.openai.com'||u.searchParams.get('stat')==='aibuy')paid.push(u.toString());
  if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
  if(u.pathname==='/api/chart')return r.fulfill({json:source});
  if(u.pathname==='/api/screen'&&u.searchParams.get('stat')==='visual_patterns')return r.fulfill({json:data});
  if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'swe250165@gmail.com'}});
  if(u.pathname==='/rest/v1/box_patterns'){boxReads++;return r.fulfill({json:[{code:'8081',status:'CONFIRMED_UP',upper_center:260,lower_center:240,upper_outer:270,lower_outer:230,data_date:'2026-10-23',window_start:'2026-08-01',window_end:'2026-10-23'}]});}
  if(u.pathname==='/rest/v1/price_window')return r.fulfill({json:[{code:'8081',close:265,trade_date:'2026-10-23'}]});
  if(u.origin==='https://visual-site.fixture.test'){const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});}
  return r.fulfill({json:[]});
 });
 await page.goto('https://visual-site.fixture.test/');await page.evaluate(()=>_showView('box'));
 await page.waitForFunction(()=>document.getElementById('aiPatternResults').textContent.includes('最新K棒'));
 assert.equal(await page.locator('.aps-card').count(),0,'historical W must not appear as a current opportunity');
 await page.locator('#aiPatternState').selectOption('forming');assert.equal(await page.locator('.aps-card').count(),3);assert.match(await page.locator('#aiPatternResults').innerText(),/中鋼/);assert.match(await page.locator('#aiPatternResults').innerText(),/永固/);assert.match(await page.locator('#aiPatternResults').innerText(),/6620/);
 assert.match(await page.locator('#aiPatternScope').innerText(),/1985.*3970/);
 await page.locator('#aiPatternState').selectOption('breakout');assert.equal(await page.locator('.aps-card').count(),1);assert.match(await page.locator('#aiPatternResults').innerText(),/4188/);
 await page.locator('#aiPatternState').selectOption('confirmed');
 await page.waitForFunction(()=>document.querySelectorAll('.aps-card').length>0);
 const market=JSON.parse(fs.readFileSync(path.join(web,'assets/codex-market-scan.json'),'utf8'));
 const expected=new Set([...data.records,...market.records.filter(r=>r.classification==='historical_w')].filter(r=>r.execution_status==='reviewed'&&r.patterns?.length).map(r=>r.code)).size;
 assert.equal(await page.locator('#aiPatternTabs [role=tab]').count(),5);
 assert.equal(await page.locator('#aiPatternState option[value=uncertain]').count(),0,'old historical uncertainty is not the current admin review queue');
 assert.equal(await page.locator('.aps-card').count(),expected);
 assert.equal(boxReads,0,'W listing does not trigger box loading or inference');
 assert.equal(await page.locator('.aps-code').allTextContents().then(xs=>xs.includes('1316')||xs.includes('1326')),false);
 await page.screenshot({path:path.join(scan,'pattern-screen-desktop.png')});
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.locator('#boxView').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'no result-page overflow at '+width);if(width===375)await page.screenshot({path:path.join(scan,'pattern-screen-mobile.png')});}
 await page.locator('#aiPatternSearch').fill('8081');assert.equal(await page.locator('.aps-card').count(),1);
 await page.locator('#aiPatternPeriod').selectOption('weekly');assert.equal(await page.locator('.aps-record').count(),1);
 await page.locator('.aps-view').click();await page.waitForFunction(()=>document.getElementById('aiBuyPanel').textContent.includes('週K · 判讀截至'));
 await page.waitForFunction(()=>document.querySelector('#aiBuyPanel input[data-pattern-type="w_bottom"]'));
 assert.equal(await page.locator('#aiBuyPanel input[data-pattern-type="w_bottom"]').isChecked(),true);
 await page.evaluate(()=>closeChart());
 await page.locator('#aiPatternSearch').fill('1326');await page.locator('#aiPatternPeriod').selectOption('daily');await page.locator('#aiPatternState').selectOption('negative');assert.match(await page.locator('.aps-card').innerText(),/未達頸線|左側未達頸線|低於頸線/);
 await page.getByRole('tab',{name:'箱型',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#bxList .bx-card'));assert.equal(boxReads,1);assert.equal(await page.locator('#aiPatternLegacyBox').isVisible(),true);
 for(const name of ['上升三角','收斂三角','下降三角']){await page.getByRole('tab',{name,exact:true}).click();assert.match(await page.locator('#aiPatternResults').innerText(),/尚未加入/);assert.equal(await page.locator('.aps-card').count(),0);}
 await page.getByRole('tab',{name:/W型/}).click();await page.locator('#aiPatternSearch').fill('');await page.locator('#aiPatternPeriod').selectOption('all');
 await page.locator('#themeToggle').click();await page.screenshot({path:path.join(scan,'pattern-screen-dark.png'),animations:'disabled'});
 assert.deepEqual(paid,[]);assert.deepEqual(errors,[]);
 console.log('PASS: 5 tabs, all '+expected+' confirmed W stocks, rejected 1316/1326 excluded, period/search/state filters, weekly real chart+AI lines, legacy box retained, honest triangle empty states, 375/768/1440 layouts, zero inference.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
