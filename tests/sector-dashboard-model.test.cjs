const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../apps/web/assets/sector-dashboard-model.js'),{fixture}=require('./sector-fixtures.cjs');
const make=d=>M.create(d.rows,d.taiex,d.otc),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('all six periods use complete non-overlapping equal-length trading windows',()=>{
 const data=fixture(),m=make(data);
 for(const n of M.periods){const c=m.compare(n);assert.equal(c.mode,'weighted');assert.equal(c.current.dates.length,n);assert.equal(c.previous.dates.length,n);assert.ok(c.previous.to<c.current.from);assert.equal(c.current.to,data.rows.at(-1).date);near(Object.values(c.current.shares).reduce((a,b)=>a+b),100);}
 assert.throws(()=>m.compare(7));
});
test('period share is sum of money divided by market total, not daily percentage average',()=>{
 const d=fixture(7);d.rows.forEach((r,i)=>{const total=i===6?1000:100,e=i===6?90:50;r.total_amt=total;r.elec_amt=total*e/100;r.fin_amt=total*.1;r.trad_amt=total-r.elec_amt-r.fin_amt;r.elec_pct=e;r.fin_pct=10;r.trad_pct=90-e;});
 const c=make(d).compare(3);near(c.current.shares.elec,(900+50+50)/1200*100);assert.notEqual(c.current.shares.elec,(90+50+50)/3);near(c.previous.shares.elec,50);
});
test('index return includes first selected session and never bridges missing boundary',()=>{
 const d=fixture(12),m=make(d),c=m.compare(5),a=d.taiex;
 near(c.marketReturn,(a.at(-1).close/a.at(-6).close-1)*100);
 d.taiex.at(-6).close=null;const missing=make(d).compare(5);assert.equal(missing.marketReturn,null);assert.equal(missing.current.ready,true);
});
test('23 sessions never pretend to provide 20+20 or 60+60 comparisons',()=>{
 const d=fixture(80);d.rows=d.rows.slice(-23);const m=make(d);
 assert.equal(m.compare(10).previous.ready,true);
 const a=m.compare(20);assert.equal(a.current.ready,true);assert.equal(a.previous.ready,false);assert.equal(a.previous.available,3);assert.equal(a.changes.elec.delta,null);
 const b=m.compare(60);assert.equal(b.current.ready,false);assert.equal(b.current.shares,null);assert.equal(b.current.available,23);
 assert.equal(m.rank(1,'elec').value,null);
});
test('missing interior days remain gaps instead of shifting the period',()=>{
 const d=fixture(30),missing=d.rows.at(-3).date;d.rows=d.rows.filter(r=>r.date!==missing);
 const m=make(d),c=m.compare(5);assert.equal(c.current.ready,false);assert.equal(c.current.available,4);assert.equal(c.current.dates.length,5);assert.equal(m.history('elec').find(r=>r.date===missing).share,null);
});
test('null, invalid totals, negative amounts and duplicate dates cannot silently become zero',()=>{
 for(const corrupt of [r=>{r.elec_amt=-5;},r=>{r.total_amt*=2;},r=>{r.elec_amt=null;r.elec_pct=null;}]){const d=fixture(5);corrupt(d.rows.at(-1));const c=make(d).compare(1);assert.equal(c.current.ready,false);assert.equal(c.current.shares,null);}
 const d=fixture(5);d.rows.push({...d.rows.at(-1)});assert.equal(make(d).compare(1).current.ready,false);
});
test('percentage-only fallback is explicit and uses the same basis for both periods',()=>{
 const d=fixture(12);delete d.rows.at(-1).total_amt;const c=make(d).compare(5);
 assert.equal(c.mode,'daily-average');assert.equal(c.current.ready,true);assert.equal(c.changes.elec.amountPct,null);near(c.current.shares.elec,d.rows.slice(-5).reduce((a,r)=>a+r.elec_pct,0)/5);
 assert.match(make(d).explanation(c,'elec'),/每日占比平均/);
});
test('zero category share and zero prior amount are legitimate data, never infinite growth',()=>{
 const d=fixture(4);for(const r of d.rows){r.elec_amt=0;r.elec_pct=0;r.fin_amt=r.total_amt*.1;r.fin_pct=10;r.trad_amt=r.total_amt*.9;r.trad_pct=90;}
 const c=make(d).compare(1);assert.equal(c.current.shares.elec,0);assert.equal(c.changes.elec.delta,0);assert.equal(c.changes.elec.amountPct,null);
});
test('relative-share increase with falling money gets a factual shrinkage explanation',()=>{
 const d=fixture(3);const set=(r,total,e)=>Object.assign(r,{total_amt:total,elec_amt:total*e/100,fin_amt:total*.05,trad_amt:total*(.95-e/100),elec_pct:e,fin_pct:5,trad_pct:95-e});
 set(d.rows.at(-2),1000,80);set(d.rows.at(-1),800,85);const m=make(d),c=m.compare(1);
 assert.ok(c.changes.elec.delta>0);assert.ok(c.changes.elec.amountPct<0);assert.match(m.explanation(c,'elec'),/上市成交總額減少更多/);
 d.taiex.at(-1).close=d.taiex.at(-2).close*.98;const falling=make(d),f=falling.compare(1);assert.ok(f.marketReturn<0);assert.equal(falling.explanation(f,'elec'),m.explanation(c,'elec'));assert.doesNotMatch(m.explanation(c,'elec'),/主攻|多頭|淨流入/);
});
test('history rank requires sufficient past same-period samples, excludes current period and preserves ties',()=>{
 const d=fixture(400),m=make(d),r=m.rank(60,'elec');assert.ok(r.count>=60);assert.ok(r.count<=252);assert.ok(r.value>=0&&r.value<=100);
 for(const row of d.rows){row.elec_amt=row.total_amt*.8;row.fin_amt=row.total_amt*.05;row.trad_amt=row.total_amt*.15;}
 near(make(d).rank(5,'elec').value,50);
});
test('own completed data date is kept when index history extends further',()=>{
 const d=fixture(30);d.rows=d.rows.slice(0,25);const m=make(d);assert.equal(m.anchor,d.rows.at(-1).date);assert.equal(m.compare(1).current.to,m.anchor);assert.ok(m.latestMarket>m.anchor);
});
test('malformed numeric/date input cannot become zero or create fictional sessions',()=>{
 for(const v of [null,undefined,'',' ',[],{},false,true])assert.equal(M.number(v),null);
 assert.equal(M.number('0'),0);assert.equal(M.number(0),0);
 const d=fixture(3);d.rows.push(null,{date:'2024-02-30'},{});d.taiex.push(null);assert.equal(make(d).compare(1).current.ready,true);
});
