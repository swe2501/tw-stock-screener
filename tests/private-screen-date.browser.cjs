const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();await p.route('https://date.fixture.test/',r=>r.fulfill({contentType:'text/html',body:'<input id="date" type="date"><div class="sc-cat"></div>'}));await p.goto('https://date.fixture.test/');
await p.evaluate(()=>{
 localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fixture'}));localStorage.setItem('academy.research.v1.fixture',JSON.stringify({strategies:[{id:'one',name:'fixture',published:true,entry:[{type:'price'}]}]}));
 window.SIG_SB_URL='https://data.fixture.test';window.SIG_SB_ANON='fixture';window._names={'2330':'fixture'};window.queries=[];
 window.AcademyStrategyEngine={validate(){},describeRule(){return 'fixture';},scan(rows){window.scanned=rows;return {ready:true,matched:true,checks:[]};}};
 window._showPrivateScreen=d=>window.result=d;
 window.fetch=async url=>{const u=new URL(url);queries.push(u.search);let rows;if(u.searchParams.get('select')==='trade_date'){const cap=u.searchParams.get('trade_date');const date=cap==='lte.2026-10-16'?'2026-10-16':cap==='lte.2026-10-18'?'2026-10-16':'2026-10-22';rows=[{trade_date:date},{trade_date:'2026-10-15'}];}else{const range=u.searchParams.get('and'),date=range.includes('2026-10-16')?'2026-10-16':'2026-10-22';rows=[{code:'2330',trade_date:'2026-10-15',open:90,high:95,low:89,close:92,volume:10000},{code:'2330',trade_date:date,open:95,high:101,low:94,close:date==='2026-10-16'?100:200,volume:12000}];}return {ok:true,json:async()=>rows};};
});await p.addScriptTag({path:path.resolve(__dirname,'../apps/web/assets/member-private-screen.js')});
const run=()=>p.evaluate(()=>document.querySelector('[data-private-run]').onclick());
await p.locator('#date').fill('2026-10-16');await run();let r=await p.evaluate(()=>({result,scanned,queries}));assert.equal(r.result.date,'2026-10-16');assert.equal(r.result.results[0].close,100);assert.ok(r.scanned.every(x=>x.trade_date<='2026-10-16'));assert.ok(r.queries.some(q=>q.includes('lte.2026-10-16')));
await p.locator('#date').fill('');await run();r=await p.evaluate(()=>result);assert.equal(r.date,'2026-10-22');assert.equal(r.results[0].close,200);
await p.locator('#date').fill('2026-10-18');await run();assert.match(await p.locator('[data-private-status]').textContent(),/查無日線資料/);
await p.locator('#date').fill('2099-01-01');await run();assert.match(await p.locator('[data-private-status]').textContent(),/有效篩選日期/);
console.log('PASS selected historical date caps all bars and changes results; blank latest; missing date and future rejected');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
