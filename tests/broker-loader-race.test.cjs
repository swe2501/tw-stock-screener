const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('apps/web/index.html','utf8'),start=html.indexOf('    let _brokerLoadGeneration = 0;'),end=html.indexOf('    function _renderBrokerFilter',start),pending=[];
const ctx={Set,Map,encodeURIComponent,currentCode:'2395',_brokerEntriesRaw:[],_brokerChecked:null,_authToken:'fixture',SIG_SB_URL:'https://fixture.test',SIG_SB_ANON:'public',_userMarkers:{},_isStock:()=>true,_ensureBrokerMeta:async()=>({a:{name:'A',cat:'x'},b:{name:'B',cat:'x'}}),document:{getElementById:()=>null},window:{_mkShow:{}},_renderBrokerFilter:()=>{},_refreshChartMarkers:()=>{},fetch:async url=>{if(url.includes('&view='))return{ok:true,json:async()=>[]};return new Promise(resolve=>pending.push({url,resolve}));}};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
ctx.window._chartFocusBroker={code:'2395',id:'a'};const old=ctx._loadBrokerEntries('2395');await tick();
ctx.currentCode='2330';ctx.window._chartFocusBroker={code:'2330',id:'b'};const middle=ctx._loadBrokerEntries('2330');await tick();
ctx.currentCode='2395';ctx.window._chartFocusBroker={code:'2395',id:'a'};const newest=ctx._loadBrokerEntries('2395');await tick();
pending[2].resolve({ok:true,json:async()=>[{broker_id:'a',trade_date:'2026-11-02'}]});await newest;
assert.deepEqual([...ctx._brokerChecked],['A']);assert.equal(ctx._brokerEntriesRaw[0].date,'2026-11-02');
pending[0].resolve({ok:true,json:async()=>[{broker_id:'a',trade_date:'2000-01-01'}]});pending[1].resolve({ok:true,json:async()=>[{broker_id:'b',trade_date:'2000-01-02'}]});await Promise.all([old,middle]);
assert.equal(ctx._brokerEntriesRaw.length,1);assert.equal(ctx._brokerEntriesRaw[0].date,'2026-11-02');assert.deepEqual([...ctx._brokerChecked],['A']);assert.equal(ctx.window._chartFocusBroker,null);
console.log('PASS A-B-A stale broker responses cannot replace latest entries or selection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
