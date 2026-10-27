const fs=require('fs'),assert=require('assert');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const data=fs.readFileSync('apps/web/assets/exhibitions.json','utf8'),catalog=require('./fixtures/exhibition-classification.cjs');
 const dir=require('path').join(require('os').tmpdir(),'exhibition-calendar');fs.mkdirSync(dir,{recursive:true});
 try{for(const width of [1280,390])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Taipei'});
 await page.clock.install({time:new Date('2026-10-24T04:00:00Z')});
 await page.route('**/*',r=>{
 const u=new URL(r.request().url());
 if(u.pathname.endsWith('exhibitions.json'))return r.fulfill({contentType:'application/json',body:data});
 if(u.pathname==='/api/screen'){const stat=u.searchParams.get('stat');const value=stat==='themecatalog'?{themes:Object.entries(catalog.themes).map(([name,codes])=>({name,codes}))}:stat==='industries'?catalog.industries:catalog.names;return r.fulfill({json:value});}
 return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><main style="max-width:900px;margin:auto"><section id="exhibitionCalendar"></section></main></body></html>'});
 });
 await page.goto('http://exhibition.test/');
 await page.addStyleTag({content:[...fs.readFileSync('apps/web/index.html','utf8').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n')});
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await page.addStyleTag({content:':root{--surface:'+(theme==='light'?'#fff':'#131d2b')+';--surface2:'+(theme==='light'?'#f3f6fa':'#1c2a3c')+';--border:'+(theme==='light'?'#d5dfeb':'#344456')+';--text:'+(theme==='light'?'#172840':'#e8edf4')+';--text-muted:'+(theme==='light'?'#63758d':'#a5b4c7')+';--accent:#079de0;}body{margin:16px;background:var(--surface2);font-family:Arial,sans-serif}'});
 await page.addStyleTag({path:'apps/web/assets/exhibition-calendar.css'});
 await page.addScriptTag({path:'apps/web/assets/exhibition-calendar.js'});
 await page.evaluate(()=>{window._openStock=(c,n)=>window.opened={c,n};return AcademyExhibitions.show();});
 assert.equal(await page.locator('[data-ex-reminders] [data-ex-id]').count(),2);
 assert(await page.locator('.ex-reminder-note').isVisible());
 assert.equal(await page.locator('.ex-head').evaluate(e=>e.tagName),'DIV');
 assert.match(await page.locator('.ex-head h2').innerText(),/未來題材行事曆/);assert.equal(await page.locator('[data-ex-reminders] [data-ex-id=itf-2026] [data-ex-icon=travel]').count(),1);assert.equal(await page.locator('[data-ex-reminders] [data-ex-id=healthcare-2026] [data-ex-icon=medical]').count(),1);
 const travel=page.locator('[data-ex-reminders] [data-ex-id=itf-2026]');await travel.hover();assert.equal(await page.locator('.ex-day.is-range').count(),4,'hover highlights the whole exhibition span');assert.match(await page.locator('[data-ex-preview]').innerText(),/2026-11-06/);await travel.focus();assert.equal(await page.locator('.ex-day.is-range').count(),4,'keyboard focus has same linked preview');
 const note=await page.locator('.ex-reminder-note small').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e.closest('.ex-reminder-note')).backgroundColor}));assert.notEqual(note.color,note.background,'reminder text has visible contrast');
 assert.equal(await page.locator('[data-ex-month]').inputValue(),'2026-11');
 assert.equal(await page.locator('.ex-grid [data-ex-id="itf-2026"]').count(),4);
 assert.equal(await page.locator('.ex-grid [data-ex-id="fintech-2026"]').count(),0);
 await page.locator('[data-ex-reminders] [data-ex-id="healthcare-2026"]').click();
 assert(await page.locator('.ex-drawer').evaluate(e=>e.open));
 assert((await page.locator('.ex-evidence').innerText()).includes('公司技術消息'));
 assert((await page.locator('.ex-evidence').innerText()).includes('未據此認定當屆參展'));
 await page.screenshot({path:dir+'/drawer-'+theme+'-'+width+'.png'});
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.ex-drawer').evaluate(e=>e.open),false);
 await page.locator('[data-ex-reminders] [data-ex-id="itf-2026"]').click();
 await page.locator('[data-ex-stock-query]').fill('2618');
 assert.equal(await page.locator('.ex-stock').count(),1);
 await page.locator('[data-ex-stock="2618"]').click();
 assert.equal((await page.evaluate(()=>window.opened)).c,'2618');
 await page.locator('[data-ex-group]').selectOption('t:CoWoS');
 assert.equal(await page.locator('.ex-agenda-row').count(),1);
 await page.locator('[data-ex-month]').fill('2027-08');await page.locator('[data-ex-month]').dispatchEvent('change');
 assert.equal(await page.locator('.ex-grid [data-ex-id="semicon-2027"]').count(),3);
 await page.locator('[data-ex-query]').fill('no-match');assert.equal(await page.locator('.ex-agenda-row').count(),0);assert(await page.locator('[data-ex-month-empty]').isVisible());await page.locator('[data-ex-reset]').click();assert.equal(await page.locator('[data-ex-group]').inputValue(),'');assert.equal(await page.locator('[data-ex-query]').inputValue(),'');
 await page.locator('[data-ex-query]').fill('');await page.locator('[data-ex-group]').selectOption('');
 await page.locator('[data-ex-month]').fill('2026-11');await page.locator('[data-ex-month]').dispatchEvent('change');

 const monthHeight=await page.locator('.ex-calendar').evaluate(e=>e.getBoundingClientRect().height);assert.ok(monthHeight<510,'calendar uses compact rows');assert.equal(await page.locator('.ex-agenda').evaluate(e=>getComputedStyle(e).maxHeight),'none','agenda has no nested scroll trap');
 await page.locator('.ex-calendar-scroll').scrollIntoViewIfNeeded();await page.locator('.ex-calendar-scroll').hover();const scrollBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,400);await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>scrollY)>scrollBefore,'wheel over calendar continues down page');await page.locator('.ex-agenda').hover();const agendaBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,350);await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>scrollY)>agendaBefore,'wheel over agenda continues down page');
 await page.screenshot({path:dir+'/calendar-'+theme+'-'+width+'.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page horizontal overflow');
 await page.close();
 }
 // Local script snapshot still renders dates when JSON and API are unavailable.
 assert.deepEqual(JSON.parse(fs.readFileSync('apps/web/assets/exhibitions-data.js','utf8').match(/Snapshot=(.*);/)[1]),JSON.parse(data));
 const local=await browser.newPage();await local.clock.install({time:new Date('2026-10-24T04:00:00Z')});await local.route('**/*',r=>r.fulfill({json:{status:'ok'}}));await local.goto('http://local-calendar.test/');await local.setContent('<section id="exhibitionCalendar"></section>');await local.addScriptTag({path:'apps/web/assets/exhibitions-data.js'});await local.addScriptTag({path:'apps/web/assets/exhibition-calendar.js'});await local.evaluate(()=>AcademyExhibitions.show());assert(await local.locator('.ex-grid').isVisible());assert.match(await local.locator('#exhibitionCalendar').innerText(),/個股分類暫時無法讀取/);await local.locator('[data-ex-reminders] [data-ex-id]').first().click();assert.match(await local.locator('[data-ex-stocks]').innerText(),/個股分類暫時無法讀取/);await local.close();
 // Failure is visible and retryable.
 const p=await browser.newPage();await p.route('**/*',r=>r.abort());await p.setContent('<section id="exhibitionCalendar"></section>');await p.addScriptTag({path:'apps/web/assets/exhibition-calendar.js'});await p.evaluate(()=>AcademyExhibitions.show());assert.equal(await p.locator('[data-ex-retry]').count(),1);await p.close();
 console.log('PASS desktop/mobile light/dark calendar, 2-month reminders, drawer evidence, filters, K-chart handoff, Escape and network failure');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
