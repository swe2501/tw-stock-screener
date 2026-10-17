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

const formulaRule=(code,params={})=>({...E.rule('formula'),code,params});
test('typed formula supports parameters, variables, nested logic and exact numeric audit',()=>{
 const code='param period = 2\ntrend = SMA(close, period)\nrising = close > trend\nrising AND (volume >= 100 OR close < 0)',s=E.template('formula');s.entry=[formulaRule(code)];s.exit=[];
 const data=bars([10,20,30,5,1,1]),values=E.indicators(data,s.entry[0]);assert.deepEqual(Array.from(values.left),[null,1,1,0,0,0]);
 const audit=E.inspect(data,s,'2026-01-03');assert.equal(audit.entry.matched,true);assert.equal(audit.entry.checks[0].formula.variables[0].value,25);
 assert.equal(audit.entry.checks[0].formula.checks[0].left,30);assert.equal(audit.entry.checks[0].formula.checks[0].right,25);
 const result=E.run(data,s,{...params,start:'2026-01-04'});assert.equal(result.trades[0].date,'2026-01-04');assert.equal(result.trades[0].price,5);assert.equal(result.trades[0].signal.formula,undefined);assert.equal(result.trades[0].signal.entry.checks[0].formula.parameters[0].value,2);
 assert.equal(E.indicators(data,formulaRule(code,{period:3})).left[1],null);
});
test('Chinese aliases and controlled natural-language translation preserve formulas',()=>{
 const code='參數 週期 = 2\n趨勢線 = 均線(收盤價, 週期)\n收盤價 高於 趨勢線 且 成交量 >= 100',p=E.formula.compile(code);
 assert.match(p.normalized,/SMA\(close, 週期\)/);assert.equal(E.indicators(bars([1,2,3]),formulaRule(p.normalized)).left[2],1);
 const natural=E.formula.fromChinese('收盤價高於 2 日均線，而且成交量大於前 2 日均量的 1.5 倍');
 const data=bars([1,2,3,4]);data[3].volume=200;assert.equal(E.indicators(data,formulaRule(natural)).left[3],1);assert.match(natural,/REF\(SMA\(volume, 2\), 1\)/);
 assert.throws(()=>E.formula.fromChinese('我想挑強勢股，爆量就買'),/不會猜測/);
});
test('formula functions match reference values and use only past samples',()=>{
 const data=bars([10,9,8,11,14,12,15]),r=formulaRule('CROSSUP(SMA(close, 2), SMA(close, 3))');
 const manual=E.indicators(data,{type:'maPair',fast:2,slow:3});assert.equal(E.indicators(data,r).left[4],manual.left[4]>manual.right[4]&&manual.left[3]<=manual.right[3]?1:0);
 const f=E.indicators(data,formulaRule('close > REF(HHV(high, 2), 1)'));assert.equal(f.left[2],0);assert.equal(f.left[3],1);
 for(const code of ['EMA(close, 2) > 0','RSI(close, 2) >= 50','LLV(low, 2) <= close','ABS(close - REF(close,1)) >= 0','MIN(close, 20) <= MAX(close, 20)']){
  const base=E.indicators(data,formulaRule(code)).left,changed=data.map((b,i)=>i>4?{...b,open:1e4,high:1e4,low:1e4,close:1e4}:b);assert.deepEqual(Array.from(base).slice(0,5),Array.from(E.indicators(changed,formulaRule(code)).left).slice(0,5));
 }
 assert.equal(E.indicators(data,formulaRule('RSI(close,2) == 100')).left[4],E.indicators(data,{type:'rsi',period:2}).left[4]===100?1:0);
});
test('formula parser rejects code access, future references, type errors and unbounded programs',()=>{
 for(const code of ['fetch(close)','window.location > 0','close[-1] > 0','REF(close, -1) > 0','SMA(close, close) > 0','close AND volume','unknown > 0','x = x + 1\nx > 0','param close = 20\nclose > 0','param n = 2.5\nSMA(close,n) > 0','close > 0\nvolume > 0','close > "1"','close > 0; while(close)'])assert.throws(()=>E.formula.compile(code),/公式/);
 assert.throws(()=>E.formula.compile('('.repeat(40)+'close > 1'+')'.repeat(40)),/巢狀/);
 assert.throws(()=>E.formula.compile('close > 0',{missing:2}),/沒有宣告/);
 assert.throws(()=>E.formula.compile('param n = 2\nclose > n',{n:Infinity}),/數值無效/);
 assert.throws(()=>E.formula.compile('close > 0\n'.repeat(61)),/60 行/);
});
test('zero division and unavailable volume fail; future runtime errors do not leak into past runs',()=>{
 const data=bars([10,11,12,13,14,15,20]),s=E.template('formula');s.entry=[formulaRule('close / (20 - close) > 0')];s.exit=[];
 assert.doesNotThrow(()=>E.run(data,s,{...params,start:'2026-01-02',end:'2026-01-06'}));
 assert.throws(()=>E.indicators(data,s.entry[0]),/2026-01-07.*除數為 0/);
 assert.doesNotThrow(()=>E.inspect(data,s,'2026-01-06'));data[0].volume=null;
 assert.throws(()=>E.indicators(data,formulaRule('volume > SMA(volume,2)')),/成交量/);
 const missing=E.indicators(data,formulaRule('close > SMA(close,5) OR close > 0'));assert.equal(missing.left[2],null);
});
test('natural-language guide explains unknowns and only proposes after explicit confirmation',()=>{
 const g=E.formula.createGuide();assert.equal(g.start().proposal,null);assert.match(g.send('不知道').message,/均線/);assert.match(g.send('均線').message,/幾根/);assert.match(g.send('不知道').message,/示範值/);
 assert.equal(g.send('2').proposal,null);assert.match(g.send('向上穿越').message,/什麼時候賣出/);assert.match(g.send('跌了就賣').message,/不夠明確/);
 g.send('收盤價低於 2 日均線');g.send('5');g.send('10');g.send('20');const reply=g.send('我的中文策略');assert.ok(reply.proposal);E.validate(reply.proposal);assert.match(reply.proposal.entry[0].code,/CROSSUP/);assert.equal(reply.proposal.risk.stop,5);assert.equal(reply.proposal.risk.maxBars,20);
});
test('natural-language direct input still requires exit and risk decisions',()=>{
 const g=E.formula.createGuide();assert.equal(g.send('收盤價高於20日均線').proposal,null);g.send('只用停損停利／持有期限');g.send('0');g.send('0');g.send('0');const p=g.send('明確條件').proposal;assert.ok(p);assert.equal(p.exit.length,0);assert.equal(p.risk.stop,0);
 const data=bars(Array.from({length:35},(_,i)=>i+10)),snap=E.scan(data,p);assert.equal(snap.matched,true);assert.equal(E.inspect(data,p,data.at(-1).time).entry.matched,snap.matched);
});

test('public strategy search shows sources and separates discussion-only concepts',()=>{
 const all=E.formula.searchCatalog();assert.equal(all.length,8);assert.equal(all.filter(c=>c.supported).length,6);assert.ok(all.every(c=>c.source.startsWith('https://www.tradingview.com/support/')));
 assert.equal(E.formula.searchCatalog('MACD')[0].id,'macd');assert.equal(E.formula.searchCatalog('布林')[0].supported,false);assert.equal(E.formula.searchCatalog('未知的神奇獲利法').length,0);
 all[0].title='mutated';assert.notEqual(E.formula.searchCatalog()[0].title,'mutated');
});
test('performance goals require research context and never become a guaranteed strategy',()=>{
 const g=E.formula.createGuide();let r=g.send('我想要開發一個有七成的策略');assert.match(r.message,/勝率不能承諾/);assert.equal(r.proposal,null);
 assert.match(g.send('期貨／選擇權').message,/不能|不會/);g.send('股票／ETF 日線');assert.match(g.send('還不確定').message,/研究分類/);g.send('中長波段');assert.match(g.send('我不懂差異').message,/高勝率也可能/);r=g.send('先看趨勢與報酬');assert.equal(r.references.length,3);assert.equal(r.proposal,null);assert.ok(r.choices.includes('MACD 動能'));assert.match(r.message,/沒有依未驗證/);
 r=g.send('MACD 動能');assert.match(r.message,/快線/);g.send('12');assert.match(g.send('5').message,/大於快線/);g.send('26');g.send('9');g.send('向上穿越');g.send('只用停損停利／持有期限');g.send('5');g.send('10');g.send('20');r=g.send('動能研究');E.validate(r.proposal);assert.equal(r.proposal.entry[0].type,'macd');assert.equal(r.proposal.entry[0].fast,12);assert.equal(r.proposal.entry[0].slow,26);assert.equal(r.proposal.entry[0].signal,9);
});
test('discussion-only catalog entries cannot create executable drafts and KD requires both smoothing values',()=>{
 const g=E.formula.createGuide();g.send('研究方向：bb');g.send('股票／ETF 日線');g.send('短波段');let r=g.send('先看回撤與虧損幅度');assert.ok(r.choices.includes('布林通道'));r=g.send('布林通道');assert.equal(r.proposal,null);assert.match(r.message,/不能套用回測/);r=g.send('選可驗算方向');assert.ok(r.references.every(c=>c.supported));
 const kd=E.formula.createGuide();kd.send('KD');kd.send('9');assert.match(kd.send('0').message,/1～30/);kd.send('3');kd.send('3');kd.send('向上穿越');kd.send('只用停損停利／持有期限');kd.send('5');kd.send('0');kd.send('0');const p=kd.send('KD研究').proposal;E.validate(p);assert.equal(p.entry[0].smoothK,3);assert.equal(p.entry[0].smoothD,3);assert.equal(p.entry[0].period,9);
});
