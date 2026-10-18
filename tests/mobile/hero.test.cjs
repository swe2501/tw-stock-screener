const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'apps/mobile/node_modules/typescript'));
function load(file,fetcher){const ctx={exports:{},fetch:fetcher,require:()=>reading};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/mobile/src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx.exports;}
const reading=load('hero-reading.ts'),api=load('hero-api.ts');
const website=fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8');
test('public research reading matches website across threshold and missing-data combinations',()=>{
 const start=website.indexOf('function researchReading(s){'),end=website.indexOf('const semanticLines',start);
 assert.ok(start>0&&end>start);
 const helpers="const valid=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));const fmt=(n,d=1)=>(Number(n)>0?'+':'')+Number(n).toFixed(d);const sign=n=>!valid(n)||Math.abs(Number(n))<.0001?0:Number(n)>0?1:-1;";
 const context={};vm.runInNewContext(helpers+website.slice(start,end),context);
 for(const chg of [-1,-.3,0,.2,.7])for(const upRatio of [30,45,50,60,70])for(const funds of [null,-2,0,2]){
  const s={chg,upRatio,ret5:chg*4,close:100,ma5:99,ma20:101,breadthDiff:upRatio-50,instStrength:funds,inst3Strength:funds,inst5Strength:funds,leverage:3,volumeRatio:.6};
  assert.equal(JSON.stringify(reading.researchReading(s)),JSON.stringify(context.researchReading(s)));
 }
});
test('nine daily card patterns match the website headline, tone and body',()=>{
 const start=website.indexOf('var head,tone,extra,fired=[]'),end=website.indexOf("if(el('gsTodayHeadline'))",start);
 for(const [chg,upRatio,instStrength] of [[1,70,1],[-1,30,-1],[.5,30,0],[-.5,70,0],[.3,60,0],[-.3,40,0],[0,50,1],[0,50,-1],[0,50,0]]){
  const s={chg,upRatio,instStrength,instYi:10,up:100,down:80},ctx={chg,upRatio,stren:instStrength,instYi:10,up:100,dn:80};vm.runInNewContext(website.slice(start,end),ctx);
  const result=api.todayReading(s);assert.equal(result.first+result.accent,ctx.head.replace(/<\/?em>/g,''));assert.equal('今日定調 ｜ '+result.tone,ctx.tone);assert.equal(result.body,ctx.extra);
 }
 assert.equal(api.todayReading({chg:null,upRatio:50}),null);
});
function fixture(){return {chart:{data:Array.from({length:22},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),close:100+i,volume:1000}))},breadth:{date:'20261022',up:60,down:30,flat:10},institutions:Array.from({length:6},()=>({trade_date:'2026-10-22',total_net:1e8,foreign_net:8e7,trust_net:1e7,dealer_net:1e7})),margin:Array.from({length:6},(_,i)=>({date:'2026-10-22',fin_bal_k:100-i})),turnover:Array.from({length:6},()=>({date:'2026-10-22',total_amt:1e10})),indicators:[{date:'2026-10-22',vix:20}],topics:[{sector:'半導體'},{sector:'半導體'},{sector:'光通訊'}],quote:[{date:'2026-10-22',line1:'重點不是預測',line2:'而是應對'}],holidays:{closed:['2026-01-01']}};}
test('same-day data preserves units and distinct topics; missing or mismatched source is never zero',()=>{
 const f=fixture(),r=api.buildHero(f);assert.equal(r.date,'2026-10-22');assert.equal(r.snapshot.instYi,1);assert.equal(r.snapshot.instStrength,1);assert.equal(r.snapshot.upRatio,60);assert.equal(JSON.stringify(r.topics),JSON.stringify(['半導體','光通訊']));assert.equal(r.quote,'重點不是預測，而是應對。');
 f.breadth.date='20261021';f.institutions[0].trade_date='2026-10-21';f.margin=[];const bad=api.buildHero(f);assert.equal(bad.snapshot.instYi,null);assert.equal(bad.snapshot.upRatio,null);assert.equal(bad.snapshot.leverage,null);assert.equal(bad.reading,null);assert.equal(bad.partial,true);
});
test('settlement uses Taiwan date, shifts holidays and refuses unverified calendar year',()=>{
 const now=Date.parse('2026-10-18T16:30:00Z');assert.equal(JSON.stringify(api.settlement(['2026-01-01'],now)),JSON.stringify({date:'2026-10-21',days:2}));assert.equal(api.settlement(['2026-10-21'],now).date,'2026-10-22');assert.equal(api.settlement(['2025-01-01'],now),null);
});
test('stock names match code and Chinese name without fabricating a result',()=>{
 const items=[{code:'2330',name:'台積電',market:'上市'},{code:'2337',name:'旺宏',market:'上市'}];assert.equal(api.matchStocks(items,'2330')[0].name,'台積電');assert.equal(api.matchStocks(items,'台積')[0].code,'2330');assert.equal(api.matchStocks(items,'不存在').length,0);
});
test('all hero requests are read-only fixed public origins without member authorization',async()=>{
 const seen=[],f=fixture(),keys=['chart','breadth','holidays','institutions','margin','turnover','indicators','topics','quote'];let i=0;
 const client=load('hero-api.ts',async(url,options)=>{seen.push({url,options});const result=f[keys[i++]];return {ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(result)};});
 await client.fetchHero();assert.equal(seen.length,9);for(const {url,options} of seen){assert.ok(url.startsWith('https://tw-stock-screener-neon.vercel.app/api/')||url.startsWith('https://bruqrbvbjxntgoljxsne.supabase.co/rest/v1/'));assert.equal(options.method,undefined);assert.equal(options.headers?.Authorization,undefined);}
});
