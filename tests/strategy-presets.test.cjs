const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope={window:{},crypto:require('node:crypto').webcrypto};
for(const f of ['member-strategy-engine.js','strategy-presets.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../apps/web/assets',f),'utf8'),scope);
const E=scope.window.AcademyStrategyEngine,P=scope.window.AcademyStrategyPresets;
const bar=(open,close,high=Math.max(open,close)+1,low=Math.min(open,close)-1)=>({open,close,high,low,volume:100});
const rows=a=>a.map((x,i)=>({...x,time:'2026-01-'+String(i+1).padStart(2,'0')}));
const match=(key,a,params)=>{const s=P.make(key);if(params)s.entry[0].params=params;return E.inspect(rows(a),s,rows(a).at(-1).time).entry.matched;};
test('seven OHLC presets are real executable formulas, with readable parameters and unchanged engine format',()=>{
 assert.equal(Object.keys(P.patterns).length,7);assert.equal(P.make('unknown'),null);
 for(const key of Object.keys(P.patterns)){const s=P.make(key);assert.equal(s.entry[0].type,'formula');E.validate(s);assert.ok(E.formula.compile(s.entry[0].code).parameters.length);assert.equal(P.identify(s.entry[0]),key);assert.equal(E.VERSION,'2.1.0');}
 assert.equal(P.make('body-bear').direction,'short');assert.equal(P.make('body-bull').direction,'long');assert.equal(P.make('doji','short').direction,'short');
});
test('body thresholds use opening price and whole-bar body ratio; equality passes; red/black are directional',()=>{
 assert.equal(match('body-bull',[bar(100,104,105,99)]),true);assert.equal(match('body-bull',[bar(100,102,103,99)]),false);
 assert.equal(match('body-bull',[bar(100,103,104,99)]),true);assert.equal(match('body-bull',[bar(100,103,110,90)]),false);
 assert.equal(match('body-bear',[bar(104,100,105,99)]),true);assert.equal(match('body-bear',[bar(104,102,105,101)]),false);
 assert.equal(match('body-bull',[bar(100,104,105,99)],{'最低實體漲幅':5}),false);
});
test('wick and doji rules distinguish total range, wick length and body; flat candles are excluded',()=>{
 assert.equal(match('lower-wick',[bar(100,101,102,90)]),true);assert.equal(match('lower-wick',[bar(100,101,110,99)]),false);
 assert.equal(match('upper-wick',[bar(100,99,110,98)]),true);assert.equal(match('upper-wick',[bar(100,99,101,90)]),false);
 assert.equal(match('doji',[bar(100,100.2,103,97)]),true);assert.equal(match('doji',[bar(100,102,103,97)]),false);
 for(const key of ['lower-wick','upper-wick','doji','body-bull','body-bear'])assert.equal(match(key,[bar(100,100,100,100)]),false,key);
});
test('engulfing compares only current/previous bodies, requires opposing colors and enough history',()=>{
 assert.equal(match('bull-engulf',[bar(104,100),bar(99,105)]),true);assert.equal(match('bull-engulf',[bar(104,100),bar(101,105)]),false);
 assert.equal(match('bull-engulf',[bar(100,104),bar(99,105)]),false);assert.equal(match('bull-engulf',[bar(99,105)]),false);
 assert.equal(match('bear-engulf',[bar(100,104),bar(105,99)]),true);assert.equal(match('bear-engulf',[bar(100,104),bar(103,99)]),false);
 assert.equal(match('bull-engulf',[bar(104,100,150,50),bar(99,105,106,98)]),true,'prior wick need not be engulfed');
});
test('no future candles change preset signals; null history stays unavailable',()=>{
 const a=rows([bar(104,100),bar(99,105),bar(105,105),bar(101,108)]),future=a.map((x,i)=>i>1?{...x,open:500,close:600,high:700,low:400}:x);
 for(const key of Object.keys(P.patterns)){const r=P.make(key).entry[0];assert.deepEqual(Array.from(E.indicators(a,r).left).slice(0,2),Array.from(E.indicators(future,r).left).slice(0,2));}
});
test('OHLC preset trades execute the following open, supports short and original snapshots replay',()=>{
 const s=P.make('bull-engulf'),a=rows([...Array.from({length:25},()=>bar(100,100)),bar(104,100),bar(99,105),bar(110,110)]),p={start:'2026-01-26',end:'2026-01-28',capital:100000,fee:0,tax:0,slip:0,borrow:0,allocation:1,sizing:'ratio',amount:0};
 let r=E.run(a,s,p);assert.equal(r.trades[0].date,'2026-01-28');assert.equal(r.trades[0].price,110);assert.equal(r.trades[0].side,'買進');
 const exported=JSON.parse(JSON.stringify(s));assert.deepEqual(JSON.parse(JSON.stringify(E.run(a,exported,p).trades)),JSON.parse(JSON.stringify(r.trades)));
 const short=P.make('bear-engulf');r=E.run(rows([...Array.from({length:25},()=>bar(100,100)),bar(100,104),bar(105,99),bar(95,95)]),short,p);assert.equal(r.trades[0].date,'2026-01-28');assert.equal(r.trades[0].side,'放空');assert.equal(r.trades[0].price,95);
});
test('volume presets compare prior mean excluding signal day and preserve chosen direction',()=>{
 const a=rows([bar(100,100),bar(100,100),{...bar(100,100),volume:200}]);
 for(const key of ['volume-up','volume-down']){const s=P.make(key,'short');s.entry[0].period=2;assert.equal(s.direction,'short');assert.equal(E.inspect(a,s,a.at(-1).time).entry.matched,key==='volume-up');}
});

test('predefined controls reject negative or out-of-range percentages before saving or running',()=>{const s=P.make('body-bull');s.entry[0].params={'最低實體漲幅':-1};assert.throws(()=>P.validate(s));s.entry[0].params={'最低實體占比':101};assert.throws(()=>P.validate(s));s.entry[0].params={'最低實體漲幅':5};assert.equal(P.validate(s),true);});
