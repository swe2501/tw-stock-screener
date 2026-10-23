const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),out=path.join(require('node:os').tmpdir(),'home-series-qa');fs.mkdirSync(out,{recursive:true});
const bars=Array.from({length:320},(_,i)=>({time:new Date(Date.UTC(2025,11,8+i)).toISOString().slice(0,10),open:99+i,high:103+i,low:98+i,close:100+i,volume:1000+i}));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const theme of ['light','dark']){
let fullVix=true;const p=await browser.newPage({viewport:{width:1400,height:1000}});await p.addInitScript(t=>localStorage.setItem('theme',t),theme);
await p.route('**/*',r=>{const u=new URL(r.request().url());
if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
if(u.pathname==='/api/chart')return r.fulfill({json:{data:bars}});
if(u.pathname.includes('index_history'))return r.fulfill({json:bars.map(b=>({...b,trade_date:b.time}))});
if(u.pathname.includes('taiex_daily'))return r.fulfill({json:bars.map(b=>({...b,trade_date:b.time}))});
if(u.pathname.includes('chip_brief_daily'))return r.fulfill({json:[{trade_date:'2026-10-22',taiex_close:46041.43,taiex_chg:-846.34,taiex_pct:-1.81,otc_close:381.69,otc_chg:-13.73,otc_pct:-3.47,txf_close:46975,txf_chg:634,txf_pct:1.37,tsmc_close:2420,tsmc_chg:15,tsmc_pct:.62}]});
if(u.pathname.includes('market_indicators'))return r.fulfill({json:Array.from({length:fullVix?300:70},(_,i)=>({date:new Date(Date.UTC(2026,9,22-i)).toISOString().slice(0,10),usdtwd:32.488+i*.01,vix:500-i,futai_close:3986.25,futai_prev:4024.75}))});
if(u.origin==='https://series.fixture.test'){const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return f.endsWith('index.html')?r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}):r.fulfill({path:f});}return r.fulfill({json:[]});});
await p.goto('https://series.fixture.test/');await p.waitForSelector('.home-fx-period');await p.emulateMedia({reducedMotion:'reduce'});
assert.equal(await p.locator('#cbPulse .vix-warning-icon').count(),1,'VIX one-year high warning retained');assert.match(await p.locator('#cbPulse .vix-year-badge').innerText(),/創一年新高/);
await p.evaluate(()=>{const orig=window._createThemedChart;window.testSeries=[];window.testCharts=[];window._createThemedChart=function(...args){const c=orig(...args),add=c.addLineSeries.bind(c);testCharts.push(c);c.addLineSeries=function(o){const s=add(o);testSeries.push({options:o,series:s});return s;};return c;};});
for(const key of ['櫃買指數','台指期（日盤）','台指VIX','台幣匯率','台積電','富台指']){
await p.evaluate(k=>{testSeries=[];_openKpiChart(k);},key);const d=p.locator('#seriesChartDialog');await d.locator('[data-ma-period="240"]').waitFor();assert.equal(await d.locator('[data-ma-period]').count(),6);
const means=await p.evaluate(()=>testSeries.filter(s=>/^\d+日$/.test(s.options.title)).map(s=>({n:Number(s.options.title.slice(0,-1)),rows:s.series.data()})));
assert.equal(means.length,6);for(const m of means){assert.equal(m.rows.length,320-m.n+1);assert.ok(Math.abs(m.rows[0].value-(100+(m.n-1)/2))<1e-9,'actual SMA '+m.n);}
await d.locator('[data-ma-period="5"]').click();assert.equal(await p.evaluate(()=>testSeries.find(s=>s.options.title==='5日').series.options().visible),false);await d.locator('[data-ma-period="5"]').click();
if(key==='台指VIX'){
 const flag=d.locator('.vix-high-flag:not([hidden])').first();await flag.waitFor();assert.equal(await flag.locator('svg .vix-flag-cloth').count(),1,'custom refined flag');
 await p.emulateMedia({reducedMotion:'no-preference'});
 const resting=await flag.boundingBox();await p.mouse.move(resting.x+resting.width/2,resting.y+resting.height/2);
 for(let i=0;i<12;i++){await p.waitForTimeout(35);const hovering=await flag.boundingBox();assert.ok(Math.abs(hovering.y-resting.y)<.5,'hover preserves flag hit area');assert.equal(await flag.evaluate(e=>e.matches(':hover')),true,'pointer stays over flag without oscillating');assert.equal(await d.locator('.vix-flag-tooltip').isVisible(),true,'tooltip stays visible');}
 await p.mouse.down();await p.waitForTimeout(180);assert.ok(Math.abs((await flag.boundingBox()).y-resting.y)<.5,'pressed flag preserves anchor');await p.mouse.up();await flag.click();
 await p.emulateMedia({reducedMotion:'reduce'});
 await flag.hover();assert.match(await d.locator('.vix-flag-tooltip').innerText(),/一年新高/);assert.match(await d.locator('.vix-flag-tooltip').innerText(),/VIX 352.00/);
 await d.locator('[data-sc-marks]').click();await p.waitForFunction(()=>!document.querySelector('#seriesChartDialog .vix-high-flag:not([hidden])'));assert.equal(await d.locator('.vix-flag-tooltip').isVisible(),false);
 await d.locator('[data-sc-marks]').click();await flag.waitFor();
 await flag.click();assert.equal(await d.locator('.vix-flag-tooltip').isVisible(),true,'tap pins explanation');
 await flag.screenshot({path:path.join(out,'vix-flag-'+theme+'.png')});
 await p.evaluate(()=>testCharts.at(-1).timeScale().setVisibleLogicalRange({from:270,to:319}));await p.waitForFunction(()=>!document.querySelector('#seriesChartDialog .vix-high-flag:not([hidden])'));await p.evaluate(()=>testCharts.at(-1).timeScale().fitContent());await flag.waitFor();
}
await d.locator('[data-sc-mode="candles"]').click();assert.equal(await p.evaluate(()=>testSeries.find(s=>s.options.title==='5日').series.options().visible),true,'MA persists in candle mode');
if(key==='台指VIX'){const flag=d.locator('.vix-high-flag:not([hidden])').first();await flag.waitFor();const point=await flag.boundingBox(),box=await d.locator('.vix-history-chart').boundingBox();assert.ok(point.y>=box.y&&point.y+point.height<box.y+box.height,'flag stays inside plot in candle mode');await d.screenshot({path:path.join(out,'vix-flags-chart-'+theme+'.png')});}
if(key==='台幣匯率'){
assert.equal(await p.locator('#cbPulse .home-fx-impact').count(),0);await d.locator('.home-fx-impact-entry').click();const modal=p.locator('#homeFxImpactDialog');await modal.waitFor();
for(const width of [1400,390]){await p.setViewportSize({width,height:1000});const r=await modal.boundingBox();assert.ok(Math.abs(r.x+r.width/2-width/2)<2&&Math.abs(r.y+r.height/2-500)<2,'explanation centered '+width);assert.equal(await modal.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.ok(await modal.locator('.home-fx-impact-row').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=14);}
await modal.locator('select').selectOption('20');assert.equal(await modal.locator('.home-fx-impact-heading').innerText(),'20日升值觀察');await modal.screenshot({path:path.join(out,'fx-impact-'+theme+'.png')});await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert.equal(await modal.count(),0);assert.equal(await d.evaluate(e=>e.open),true,'closing explanation preserves chart');await p.setViewportSize({width:1400,height:1000});}
await d.locator('.vix-close').click();await d.waitFor({state:'detached'});assert.equal(await d.count(),0);
}
await p.evaluate(()=>_openMarketTrain());const train=p.locator('#marketTrainDialog');await train.locator('.train-index-chart canvas').first().waitFor();const corner=await train.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.train-close').getBoundingClientRect();return {right:a.right-b.right,top:b.top-a.top};});assert.ok(corner.right<=20&&corner.top<=20,'close remains at top-right corner');await train.locator('.train-close').click();
fullVix=false;await p.reload();await p.waitForSelector('.home-fx-period');assert.equal(await p.locator('#cbPulse .vix-warning-icon').count(),0,'insufficient history never reports year high');await p.close();}
console.log('PASS all six KPI charts have accurate SMA toggles in line/candle modes; centered nested FX explanation; readable text; train close corner; VIX warnings. '+out);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
