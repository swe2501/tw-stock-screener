const fs=require('fs'),assert=require('assert');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const data=fs.readFileSync('apps/web/assets/exhibitions.json','utf8'),catalog=require('./fixtures/exhibition-classification.cjs');
 const dir='C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/exhibition-calendar';fs.mkdirSync(dir,{recursive:true});
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
 await page.screenshot({path:dir+'/calendar-'+theme+'-'+width+'.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page horizontal overflow');
 await page.close();
 }
 // Failure is visible and retryable.
 const p=await browser.newPage();await p.route('**/*',r=>r.abort());await p.setContent('<section id="exhibitionCalendar"></section>');await p.addScriptTag({path:'apps/web/assets/exhibition-calendar.js'});await p.evaluate(()=>AcademyExhibitions.show());assert.equal(await p.locator('[data-ex-retry]').count(),1);await p.close();
 console.log('PASS desktop/mobile light/dark calendar, 2-month reminders, drawer evidence, filters, K-chart handoff, Escape and network failure');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
