const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'apps/mobile/node_modules/typescript'));
const source=ts.transpileModule(fs.readFileSync(path.join(root,'apps/mobile/src/home-api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(fetcher){const context={exports:{},require:()=>require(path.join(root,'packages/shared/news-api.js')),fetch:fetcher};vm.runInNewContext(source,context);return context.exports;}
const fixture=()=>({available:true,symbol:'TAIEX',frequency:'daily',as_of:'2026-10-16',latest:{date:'2026-10-16',close:10000,change:-50,change_percent:-0.5,trade_value_twd:123450000000},source:{name:'TWSE FMTQIK'},stale:false});
test('market preserves official date, units, and signed changes without substituting zero',()=>{
 const {parseMarketBrief,signed}=setup(),r=parseMarketBrief(fixture());
 assert.equal(r.date,'2026-10-16');assert.equal(r.turnover,123450000000);assert.equal(r.change,-50);
 assert.equal(signed(-0.5),'-0.50');assert.equal(signed(0),'0.00');assert.equal(signed(1),'+1.00');
});
test('rejects unavailable, mismatched, malformed or missing market values',()=>{
 const {parseMarketBrief}=setup();
 for(const modify of [r=>r.available=false,r=>r.symbol='OTC',r=>r.frequency='realtime',r=>r.as_of='2026-02-30',r=>r.latest.date='2026-10-15',r=>r.latest.close=NaN,r=>r.latest.change=null,r=>r.latest.change_percent=Infinity,r=>r.latest.trade_value_twd=-1]){
  const r=fixture();modify(r);assert.throws(()=>parseMarketBrief(r));
 }
});
test('market fetch uses only fixed HTTPS public action with cancellation and no member token',async()=>{
 let observed;const controller=new AbortController();
 const api=setup(async(url,options)=>{observed={url,options};return{ok:true,headers:{get:()=> 'application/json'},json:async()=>fixture()};});
 assert.equal((await api.fetchMarketBrief('https://preview.example.test',controller.signal)).close,10000);
 assert.equal(observed.url,'https://preview.example.test/api/prices?action=market_summary');
 assert.equal(observed.options.signal,controller.signal);assert.equal(observed.options.headers,undefined);
 await assert.rejects(api.fetchMarketBrief('http://untrusted.test'));
});
test('HTML protection screens and upstream errors are not presented as market prices',async()=>{
 for(const response of [{ok:false,headers:{get:()=> 'application/json'}},{ok:true,headers:{get:()=> 'text/html'}}]){
  await assert.rejects(setup(async()=>response).fetchMarketBrief('https://preview.example.test'));
 }
});
