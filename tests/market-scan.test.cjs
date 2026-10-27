const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const data=JSON.parse(fs.readFileSync('apps/web/assets/codex-market-scan.json','utf8')),window={};
vm.runInNewContext(fs.readFileSync('apps/web/assets/chart-ai-patterns.js','utf8'),{window});
assert.equal(data.coverage.selected_stocks,1985);assert.equal(data.coverage.screened_periods,3970);
assert.equal(data.records.length,2974);assert.equal(new Set(data.records.map(r=>r.code+'|'+r.timeframe)).size,2974);
const positive=data.records.filter(r=>r.patterns.length);assert.equal(positive.length,3);
for(const r of positive) for(const pattern of r.patterns){assert.equal(window.AcademyVisualPatterns.verify(pattern,r,r.source_bars),pattern);const changed=r.source_bars.map(b=>({...b}));changed.find(b=>b.time===pattern.points[1].time).low+=.1;assert.throws(()=>window.AcademyVisualPatterns.verify(pattern,r,changed),/來源不同/);}
assert.equal(data.records.filter(r=>r.omitted_dates.length).length,330);
assert.equal(data.records.find(r=>r.code==='1264'&&r.timeframe==='weekly').omitted_dates.length,6);
assert.equal(data.records.filter(r=>r.classification==='uncertain').every(r=>r.patterns.length===0),true);
assert.equal(data.records.find(r=>r.code==='6620'&&r.timeframe==='daily').classification,'forming');
assert.equal(data.records.find(r=>r.code==='4188'&&r.timeframe==='daily').classification,'breakout');
console.log('PASS all-market coverage, unique periods, omission provenance, pending excluded from lines, exact OHLC geometry guards');

assert.equal(data.records.find(r=>r.code==='6133'&&r.timeframe==='weekly').patterns.length,2);
