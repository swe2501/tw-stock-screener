const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope={window:{},crypto:require('node:crypto').webcrypto};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/member-strategy-engine.js'),'utf8'),scope);const E=scope.window.AcademyStrategyEngine;
const bars=values=>values.map((close,i)=>({time:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:close,high:close,low:close,close,volume:100}));
const params={capital:1000,fee:0,tax:0,slip:0,allocation:1,sizing:'ratio',amount:100,start:'2026-01-01',end:'2026-01-06'};
test('SMA, seeded EMA, Wilder RSI and neutral KD use documented calculations',()=>{
 assert.deepEqual(Array.from(E.sma([1,2,3,4,5],3)),[null,null,2,3,4]);assert.deepEqual(Array.from(E.ema([1,2,3,4,5],3)),[null,null,2,3,4]);
 assert.equal(E.indicators(bars([1,2,3,4,5]),{type:'rsi',period:2,value:30}).left[2],100);
 assert.equal(E.indicators(bars([1,1,1,1]),{type:'rsi',period:2,value:30}).left[2],50);
 assert.equal(E.indicators(bars([1,1,1,1]),{type:'kd',period:3,smoothK:3,smoothD:3}).left[3],50);
});
test('breakout and volume compare against prior sessions excluding the signal bar',()=>{
 const a=bars([10,11,12,99,12]);a[3].volume=1000;
 assert.equal(E.indicators(a,{type:'breakout',period:3,op:'above'}).right[3],12);
 assert.equal(E.indicators(a,{type:'volume',period:3,value:2}).right[3],200);
});
test('indicator histories are unaffected by future candles',()=>{
 const data=bars(Array.from({length:80},(_,i)=>100+i+Math.sin(i)*10));
 for(const type of ['ma','maPair','breakout','volume','rsi','macd','kd']){const r=E.rule(type),original=E.indicators(data,r),changed=data.map((b,i)=>i>50?{...b,open:5000,high:6000,low:4000,close:5500,volume:999999}:b),other=E.indicators(changed,r);assert.deepEqual(Array.from(original.left).slice(0,51),Array.from(other.left).slice(0,51),type);assert.deepEqual(Array.from(original.right).slice(0,51),Array.from(other.right).slice(0,51),type);}
});
test('all/any and per-rule parameters change decisions',()=>{
 const a=bars([10,11,12,13,14,15,16,17,18,19]),s=E.template('rsi');s.entry=[{...E.rule('rsi','above'),period:2,value:50},{...E.rule('volume','above'),period:2,value:2}];s.exit=[];
 const p={...params,start:'2026-01-05',end:'2026-01-10'};s.entryMode='all';assert.equal(E.run(a,s,p).trades.length,0);s.entryMode='any';assert.equal(E.run(a,s,p).trades[0].date,'2026-01-05');s.entry[0].value=100;assert.equal(E.run(a,s,p).trades.length,0);
});
test('signals execute at next open, after fees, and ignore future prices',()=>{
 const s=E.template();s.entry=[{...E.rule('ma','above'),period:2}];s.exit=[{...E.rule('ma','below'),period:2}];const a=bars([10,20,30,5,1,1]),p={...params,start:'2026-01-04'};
 const r=E.run(a,s,p);assert.equal(r.trades[0].date,'2026-01-04');assert.equal(r.trades[0].price,5);assert.equal(r.trades[1].date,'2026-01-05');assert.equal(r.returnPct,-80);
 a[4]={...a[4],open:100,high:100,low:100,close:100};assert.equal(E.run(a,s,p).trades[0].shares,r.trades[0].shares);
 const hold=E.run(bars([10,20,30,40,50,60]),E.template('hold'),{...params,fee:.01});assert.equal(hold.openShares,99);assert.ok(Math.abs(hold.curve.at(-1).equity-5940.1)<1e-8);assert.equal(hold.closed,0);assert.equal(hold.winRate,null);
});
test('gap stop and ambiguous same-bar stop/profit use conservative explicit prices',()=>{
 const s=E.template('hold');s.risk={stop:5,take:5,maxBars:0};const a=bars([100,100,100]);a[0]={...a[0],high:110,low:90};const r=E.run(a,s,{...params,end:'2026-01-03'});assert.equal(r.trades[1].price,95);
 s.risk={stop:10,take:0,maxBars:0};const g=bars([100,80,80]);assert.equal(E.run(g,s,{...params,end:'2026-01-03'}).trades[1].price,80);
});
test('allocation and fixed amount size whole shares; snapshots do not mutate',()=>{
 const a=bars([10,10,10,10,10,10]),s=E.template('hold');assert.equal(E.run(a,s,{...params,allocation:.5}).trades[0].shares,50);assert.equal(E.run(a,s,{...params,sizing:'amount',amount:100}).trades[0].shares,10);const r=E.run(a,s,params);s.name='changed';assert.notEqual(r.strategy.name,s.name);
});
test('invalid data, parameters, rules and warmup are rejected',()=>{
 const a=bars([10,10,10,10,10,10]);assert.throws(()=>E.prepare([{time:'2026-01-01',close:10}]),/開高低收/);assert.throws(()=>E.prepare([...a,a[0]]),/重複/);assert.throws(()=>E.run(a,E.template('rsi'),params),/暖機/);const s=E.template();s.entry[0].fast=s.entry[0].slow;assert.throws(()=>E.validate(s),/必須小於/);s.entry[0].fast=NaN;assert.throws(()=>E.validate(s),/無效/);s.entry[0]={type:'unknown',op:'above'};assert.throws(()=>E.validate(s),/不支援/);
});
test('screening and backtesting use the same buy rules and all/any logic',()=>{
 const rows=bars([10,9,8,10,12,11,13,10,14,15]);
 for(const type of ['trend','breakout','rsi','macd','kd']){
  const s=E.template(type);for(const r of [...s.entry,...s.exit]){if(r.period)r.period=2;if(r.fast)r.fast=2;if(r.slow)r.slow=3;if(r.signal)r.signal=2;}
  for(const mode of ['all','any']){s.entryMode=mode;const snap=E.scan(rows.slice(0,-1),s),p={...params,start:rows.at(-1).time,end:rows.at(-1).time};
   const extended=[...rows,{...rows.at(-1),time:'2026-01-11'},{...rows.at(-1),time:'2026-01-12'}];
   const run=E.run(extended,s,{...p,end:'2026-01-12'});assert.equal(run.trades.some(t=>t.date===rows.at(-1).time&&t.side==='買進'),snap.matched);
  }
 }
});
test('screening rejects hold-only and distinguishes missing warmup from a failed condition',()=>{
 assert.throws(()=>E.scan(bars([1,2,3]),E.template('hold')),/選股/);
 const s=E.template();assert.equal(E.scan(bars([1,2]),s).ready,false);assert.equal(E.scan(bars(Array.from({length:40},(_,i)=>50-i)),s).matched,false);
});

test('inspection exposes the same current/prior values used for a crossover',()=>{
 const data=bars([10,9,8,11,14,12]),s=E.template();s.entry=[{...E.rule('maPair','crossUp'),fast:2,slow:3}];s.exit=[];
 const audit=E.inspect(data,s,'2026-01-05'),rule=audit.entry.checks[0],series=E.indicators(data,s.entry[0]);
 assert.equal(rule.left,series.left[4]);assert.equal(rule.right,series.right[4]);assert.equal(rule.previousLeft,series.left[3]);assert.equal(rule.previousRight,series.right[3]);
 assert.equal(audit.entry.matched,rule.left>rule.right&&rule.previousLeft<=rule.previousRight);
 assert.throws(()=>E.inspect(data,s,'2026-01-20'),/沒有/);
});

test('executed indicator trades retain previous-day evidence and net closed-trade ROI',()=>{
 const s=E.template();s.entry=[{...E.rule('ma','above'),period:2}];s.exit=[{...E.rule('ma','below'),period:2}];
 const result=E.run(bars([10,20,30,5,1,1]),s,{...params,start:'2026-01-04'});
 assert.equal(result.engineVersion,E.VERSION);assert.equal(result.trades[0].signal.date,'2026-01-03');
 assert.equal(result.trades[0].signal.entry.checks[0].left,30);assert.equal(result.trades[0].signal.entry.checks[0].right,25);
 assert.equal(result.trades[1].entryDate,'2026-01-04');assert.equal(result.trades[1].returnPct,-80);
 assert.equal(result.trades[1].signal.date,'2026-01-04');
});

test('invalid calendar dates, blank volume and unavailable period ends fail explicitly',()=>{
 assert.throws(()=>E.prepare([{time:'2026-02-30',open:1,high:1,low:1,close:1}]),/開高低收/);
 assert.throws(()=>E.prepare([null]),/格式/);
 const data=bars([10,10,10,10,10,10]);assert.throws(()=>E.run(data,E.template('hold'),{...params,end:'2026-01-07'}),/超出/);
 const s=E.template('breakout');for(const r of [...s.entry,...s.exit])if(r.period)r.period=2;data[0].volume='';
 assert.throws(()=>E.run(data,s,{...params,start:'2026-01-04'}),/成交量/);
});
