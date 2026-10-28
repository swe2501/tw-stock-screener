const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
const snapshot=JSON.parse(fs.readFileSync('apps/web/assets/codex-market-scan.json','utf8'));
const record=snapshot.records.find(r=>r.code==='6133'&&r.timeframe==='weekly');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({json:snapshot}));await page.goto('https://long-w.fixture.test/');
 await page.setContent('<div id="aiBuyPanel"></div><div id="aiPatternPeriodHint" hidden></div>');await page.addScriptTag({path:'apps/web/assets/chart-ai-patterns.js'});
 await page.evaluate(r=>{window.full=r.source_bars;window.live=full.filter(b=>b.time>='2023-10-23');window.active=new Set();window.ctx=()=>({code:'6133',period:'week',adjusted:false,chart:{addLineSeries(){const s={setData(){}};active.add(s);return s},removeSeries(s){active.delete(s)}},series:{data:()=>live},loadHistory(range){window.requested=range;live=full;AcademyVisualPatterns.refresh(ctx)}});AcademyVisualPatterns.setOpen(true,ctx)},record);
 await page.getByRole('button',{name:'載入五年週K，查看完整大W'}).waitFor();
 assert.equal(await page.evaluate(()=>active.size),2,'three-year view can draw the complete nested W only');
 await page.getByRole('button',{name:'載入五年週K，查看完整大W'}).click();
 await page.waitForFunction(()=>active.size===4);assert.equal(await page.evaluate(()=>requested),'5y');
 assert.equal(await page.locator('#aiBuyPanel input:checked').count(),1);assert.match(await page.locator('#aiBuyPanel').innerText(),/2組/);
 assert.equal(await page.getByRole('button',{name:'載入五年週K，查看完整大W'}).count(),0);
 await page.locator('#aiBuyPanel input').uncheck();assert.equal(await page.evaluate(()=>active.size),0);
 console.log('PASS 6133 nested W, five-year history action, both exact contours and necklines, checkbox removal');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
