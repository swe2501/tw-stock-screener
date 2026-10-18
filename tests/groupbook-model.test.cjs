const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={URL};vm.runInNewContext(fs.readFileSync('apps/web/assets/groupbook-model.js','utf8'),context);const M=context.GroupBookModel;
const catalog=JSON.parse(fs.readFileSync('group-catalog.json','utf8')).groups;
test('all 192 groups and 578 membership records survive partial statistics',()=>{const groups=catalog.map(g=>M.merge(M.create(g),{samples:5,score:60,members:g.members.slice(0,1).map(m=>({code:m.code,samples:5,medianReturn:2,winRate:60}))}));assert.equal(groups.length,192);assert.equal(groups.reduce((n,g)=>n+g.members.length,0),578);for(let i=0;i<groups.length;i++)assert.deepEqual(Array.from(groups[i].members,m=>m.code),catalog[i].members.map(m=>m.code));});
test('TSMC preserves all three relationships and metadata',()=>{const g=M.create(catalog[0]);assert.equal(g.members.length,19);const sizes={};for(const m of g.members){sizes[m.relation]=(sizes[m.relation]||0)+1;assert.ok(m.market);assert.ok(m.officialSite)}assert.deepEqual(Object.values(sizes),[5,9,5]);});
test('statistics join on code and cannot replace catalog identity or text',()=>{const g=M.create(catalog[0]),r=M.merge(g,{name:'wrong',thesis:'wrong',samples:5,score:60,members:[{code:'2330',name:'wrong',relation:'wrong',samples:5,winRate:60,medianReturn:2},{code:'FAKE',samples:5}]});assert.equal(r.name,g.name);assert.equal(r.thesis,g.thesis);assert.equal(r.members[0].name,'台積電');assert.equal(r.members[0].relation,g.members[0].relation);assert.equal(r.coveredMembers,1);assert.equal(r.members.length,19);});
test('changing time window clears stale per-stock statistics',()=>{const g=M.create(catalog[0]),a=M.merge(g,{samples:5,score:60,members:[{code:'2330',samples:5,winRate:100,medianReturn:2}]}),b=M.merge(a,{samples:3,score:50,members:[{code:'3443',samples:3,winRate:60,medianReturn:1}]});assert.equal(b.members.find(m=>m.code==='2330').winRate,null);assert.equal(b.members.find(m=>m.code==='3443').winRate,60);});
test('zero sample groups retain members and have no rank metrics',()=>{const g=M.merge(M.create(catalog[0]),{samples:0,score:20,doubleWinRate:0,members:[],events:[]});assert.equal(g.score,null);assert.equal(g.doubleWinRate,null);assert.equal(g.members.length,19);assert.equal(g.coveredMembers,0);});
test('quarter reasons are isolated by quarter and missing content stays empty',()=>{const g=M.create(catalog[0]);g.quarterlyReasons={'2026Q4':{'2330':{text:'已核對研究內容',source_urls:['https://example.com/source']}}};assert.equal(M.reasons(g,'2026 Q4')[0].text,'已核對研究內容');assert.equal(M.reasons(g,'2026Q3')[0].text,'');});
test('JS and JSON catalogs match',()=>{const c={window:{}};vm.runInNewContext(fs.readFileSync('apps/web/group-catalog.js','utf8'),c);assert.equal(JSON.stringify(c.window.GROUP_BOOK_CATALOG),JSON.stringify(catalog));});
test('all inline scripts parse',()=>{const html=fs.readFileSync('apps/web/index.html','utf8');for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);});

test('official data endpoints open human-readable company-period lookup pages',()=>{
 const revenue=new URL(M.sourceUrl('https://openapi.twse.com.tw/v1/opendata/t187ap05_L',{code:'2330',revenue_month:'2026-09'}));
 assert.equal(revenue.pathname,'/mops/web/t05st10_ifrs');assert.equal(revenue.searchParams.get('co_id'),'2330');assert.equal(revenue.searchParams.get('year'),'115');assert.equal(revenue.searchParams.get('month'),'09');
 const financial=new URL(M.sourceUrl('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci',{code:'5347',year:2026,season:2}));
 assert.equal(financial.pathname,'/mops/web/t164sb04');assert.equal(financial.searchParams.get('season'),'02');
 const pdf='https://investor.tsmc.com/quarterly-report.pdf';assert.equal(M.sourceUrl(pdf),pdf);
 assert.equal(M.sourceUrl('javascript:alert(1)'), '');assert.equal(M.sourceUrl('https://example.test/data.json'),'');
});

test('public research removes internal comparisons while retaining evidence limits and source records',()=>{
 const raw='已揭露營運不等於Word描述的季底資金行為成立；仍須獨立核對持股、資金與價格資料';
 assert.match(M.publicText(raw),/不足以確認季底資金動向/);assert.doesNotMatch(M.publicText(raw),/Word|玩股網/i);
 for(const g of catalog)for(const key of ['thesis','focus'])assert.doesNotMatch(M.publicText(g[key]),/Word|玩股網/i);
 assert.equal(M.publicText('公司公告：報導與事實不符。'),'公司公告：報導與事實不符。');
 const originals=JSON.stringify(catalog);catalog.forEach(g=>M.publicText(g.thesis));assert.equal(JSON.stringify(catalog),originals);
});
