const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),out=path.join(require('node:os').tmpdir(),'home-intraday-qa');fs.mkdirSync(out,{recursive:true});
const cb={trade_date:'2026-10-22',taiex_close:46041.43,taiex_chg:-846.34,taiex_pct:-1.81,otc_close:381.69,otc_chg:-13.73,otc_pct:-3.47,txf_close:46975,txf_chg:634,txf_pct:1.37,tsmc_close:2420,tsmc_chg:15,tsmc_pct:.62,tsmc_contrib:118.7};
const values={'^TWII':46887.77,'^TWOII':395.42,'TX=F':46341,'2330':2405,'TWD=X':32.498,'TAIWANVIX':30.31};
function bars(code){const base=values[code];return ['2026-10-21','2026-10-22','2026-10-23'].flatMap(date=>Array.from({length:55},(_,i)=>({time:Date.parse(date+'T01:00:00Z')/1000+i*300,close:base*(1+Math.sin(i*.65)*.002-i*.0001)}))).concat([{time:Date.parse('2026-10-22T12:00:00Z')/1000,close:code==='TWD=X'?32.5:999999},{time:'2026-10-22',close:999999}]);}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const theme of ['light','dark']){
let actualFutures=false;
const p=await browser.newPage({viewport:{width:1800,height:1100}});await p.addInitScript(t=>localStorage.setItem('theme',t),theme);
await p.route('**/*',r=>{const u=new URL(r.request().url());
 if(u.pathname==='/api/chart')return r.fulfill({json:{name:u.searchParams.get('code')==='TX=F'&&!actualFutures?'台指期貨走勢（大盤近似）':'actual',data:bars(u.searchParams.get('code'))}});
 if(u.origin==='https://intraday.fixture.test'){const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return f.endsWith('index.html')?r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}):r.fulfill({path:f});return r.fulfill({json:{}});}
 if(u.pathname.includes('chip_brief_daily'))return r.fulfill({json:[cb]});
 if(u.pathname.includes('market_indicators'))return r.fulfill({json:Array.from({length:70},(_,i)=>({date:new Date(Date.UTC(2026,9,22-i)).toISOString().slice(0,10),futai_close:3986.25,futai_prev:4024.75,vix:30.31,usdtwd:32.488+i*.01}))});
 if(u.pathname.includes('gov_broker_daily'))return r.fulfill({json:Array.from({length:60},(_,i)=>({date:new Date(Date.UTC(2026,9,22-i)).toISOString().slice(0,10),net_amt:(i+1)*1e8,buy_amt:5e8,sell_amt:4e8}))});
 return r.fulfill({json:[]});});
await p.goto('https://intraday.fixture.test/');await p.waitForSelector('.home-intraday[data-ready=true]',{state:'attached'});await p.waitForFunction(()=>document.querySelectorAll('.home-intraday.is-unavailable').length===2);
assert.equal(await p.locator('.home-intraday').count(),7);assert.equal(await p.locator('.home-intraday svg').count(),5);
const tx=p.locator('#cbPulse .cb-pi').nth(2);assert.equal(await tx.locator('.v').innerText(),'46,975');assert.equal(await tx.locator('.n').innerText(),'+634 點\n+1.37%');assert.match(await tx.locator('figcaption').innerText(),/分時待更新/);
assert.equal(await p.locator('.home-intraday[data-code="SGX"] svg').count(),0);
assert.equal(await p.locator('.home-intraday[data-code="2330"] figcaption').innerText(),'10/22 13:30');
assert.match(await p.locator('.home-intraday[data-code="2330"]').getAttribute('title'),/55 筆/);
for(const code of ['FX','VIX']){const mini=p.locator('.home-intraday[data-code="'+code+'"]');assert.equal(await mini.getAttribute('data-ready'),'true');assert.match(await mini.locator('svg').getAttribute('aria-label'),/2026-10-22 當日分時/);assert.equal(await mini.locator('.mini-up').count()>0,true);assert.equal(await mini.locator('.mini-down').count()>0,true);assert.doesNotMatch(await mini.locator('figcaption').innerText(),/近.*日|日資料/);}

const fx=p.locator('.home-fx-card'),period=fx.locator('select');
assert.deepEqual(await period.locator('option').allTextContents(),['今日','5日','10日','20日','60日']);
assert.equal(await fx.locator('.home-fx-impact').count(),0,'homepage explanation removed');
for(const n of [1,5,10,20,60]){await period.selectOption(String(n));assert.equal(await fx.locator('.home-fx-status').innerText(),'升值 · '+(n*.01/(32.488+n*.01)*100).toFixed(2)+'%');}
assert.match(await p.locator('.home-intraday[data-code="FX"] svg').getAttribute('aria-label'),/2026-10-22 當日分時/,'period selector never changes mini chart into daily history');
assert.ok(await fx.locator('.home-fx-status').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=15,'FX direction is readable');
// Restore the actual fixture history and re-render to leave screenshots representative.
await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.home-intraday[data-ready=true]').length===5);
assert.deepEqual(await p.locator('#cbGov .gs-pd').allTextContents(),['今日','5日','10日','20日','60日']);
await p.locator('#cbGov [data-p="10"]').click();assert.equal(await p.locator('#cbGov .big').innerText(),'+55.00 億');
const calendar=p.locator('.home-settle-calendar');await calendar.locator('summary').click();assert.equal(await calendar.evaluate(e=>e.open),true);
await calendar.locator('.calendar-day.is-month').click();assert.match(await calendar.locator('.calendar-selection').innerText(),/月合約結算/);
assert.equal(await calendar.locator('.calendar-selection').evaluate(e=>getComputedStyle(e).fontSize),'10px','calendar note overrides global paragraph styles');
await p.emulateMedia({reducedMotion:'reduce'});await calendar.locator('summary').hover();assert.equal(await calendar.locator('summary').evaluate(e=>getComputedStyle(e).animationName),'none');await p.emulateMedia({reducedMotion:'reduce'});
await calendar.locator('summary').click();
for(const width of [2000,1600,1200,1000,390]){
 await p.setViewportSize({width,height:1100});
 const issues=await p.locator('.home-market-card').evaluateAll(es=>es.flatMap(e=>{const q=e.querySelector('.home-quote'),f=e.querySelector('figure'),a=q.getBoundingClientRect(),b=f.getBoundingClientRect();return [e.scrollWidth>e.clientWidth+1?'overflow':null,a.right>b.left+1&&a.left<b.right-1&&a.bottom>b.top+1&&a.top<b.bottom-1?'overlap':null].filter(Boolean);}));assert.deepEqual(issues,[],theme+' '+width);
 const proportions=await p.locator('.home-intraday[data-ready=true]').evaluateAll(es=>es.map(e=>{const q=e.previousElementSibling,r=q.getBoundingClientRect(),f=e.getBoundingClientRect(),svg=e.querySelector('svg').getBoundingClientRect(),n=q.querySelector('.v,.big'),range=document.createRange();range.selectNodeContents(n);return {side:Math.abs(r.top-f.top)<130&&r.right<=f.left+1,equal:Math.abs(r.width-f.width)<1,chartHeight:svg.height,chartWidth:svg.width,figureWidth:f.width,numberRight:range.getBoundingClientRect().right,figureLeft:f.left};}));
 for(const a of proportions){assert.ok(a.chartHeight>=110,'chart uses meaningful height');assert.ok(Math.abs(a.chartWidth-a.figureWidth)<1,'chart fills its half');if(a.side){assert.equal(a.equal,true,'equal width for quote and chart');assert.ok(a.numberRight<a.figureLeft,'actual quote text never spills into chart');}}
 const pulseAlignment=await p.locator('#cbPulse .home-intraday').evaluateAll(es=>es.map(e=>{const q=e.previousElementSibling,n=q.querySelector('.v').getBoundingClientRect(),r=e.getBoundingClientRect(),card=e.closest('.cb-pi').getBoundingClientRect();return {top:r.top-card.top,valueTop:n.top-card.top,height:r.height,border:getComputedStyle(e).borderTopWidth};}));
 for(const a of pulseAlignment){assert.ok(Math.abs(a.top-pulseAlignment[0].top)<1,'all five separators align');assert.ok(Math.abs(a.valueTop-pulseAlignment[0].valueTop)<1,'all quote values align');assert.equal(a.border,'1px');assert.ok(Math.abs(a.height-pulseAlignment[0].height)<1,'all five plot areas have equal height');}
 if(width===1600){const overview=await p.locator('#cbOverview .home-intraday[data-ready=true]').evaluateAll(es=>es.map(e=>e.previousElementSibling.getBoundingClientRect().right<=e.getBoundingClientRect().left+1));assert.equal(overview.every(Boolean),true,'overview retains left/right halves');}

 if([1600,390].includes(width)){await p.evaluate(()=>scrollTo(0,0));const box=await p.locator('#cbOverview').boundingBox();await p.screenshot({path:path.join(out,`overview-${theme}-${width}.png`),clip:box,fullPage:true});}
 if(width===1600){await p.evaluate(()=>scrollTo(0,0));const box=await p.locator('#cbPulse').boundingBox();await p.screenshot({path:path.join(out,`pulse-${theme}.png`),clip:box,fullPage:true});}
 await calendar.locator('summary').click();
 assert.equal(await calendar.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'expanded calendar fits '+width);
 assert.equal(await p.locator('#cbSettle').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'expanded card fits '+width);
 if(width===390){await p.evaluate(()=>scrollTo(0,0));const box=await p.locator('#cbSettle').boundingBox();await p.screenshot({path:path.join(out,`calendar-${theme}.png`),clip:box,fullPage:true});}
 await calendar.locator('summary').click();

}
// An older snapshot must never borrow a different trading day.
await p.evaluate(()=>{const e=document.querySelector('.home-intraday[data-code="TX=F"]');const n=e.cloneNode();n.dataset.code='2330';n.dataset.date='2026-10-20';e.replaceWith(n);});
await p.waitForFunction(()=>document.querySelector('.home-intraday[data-date="2026-10-20"]').classList.contains('is-unavailable'));
assert.equal(await p.locator('.home-intraday[data-date="2026-10-20"] svg').count(),0,'never use a different day');
actualFutures=true;await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.home-intraday[data-ready=true]').length===6);assert.match(await p.locator('.home-intraday[data-code="TX=F"]').getAttribute('title'),/55 筆/,'real futures accepted, night data excluded');
await p.close();}console.log('PASS five miniatures, actual-date/session filtering, proxy rejection, integer TX, responsive light/dark 390–2000. '+out);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
