const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const window={};vm.runInNewContext(fs.readFileSync('apps/web/assets/chart-ai-patterns.js','utf8'),{window});
const rows=JSON.parse(fs.readFileSync('apps/web/assets/codex-forming-patterns.json')).records;
assert.equal(rows.length,2);
for(const r of rows){const p=r.patterns[0];assert.equal(window.AcademyVisualPatterns.verify(p,r,r.source_bars),p);
assert.throws(()=>window.AcademyVisualPatterns.verify({...p,status:'confirmed'},r,r.source_bars),/右側/);
const bad=JSON.parse(JSON.stringify(r.source_bars));bad.find(b=>b.time===p.points[1].time).low+=1;
assert.throws(()=>window.AcademyVisualPatterns.verify(p,r,bad),/來源不同/);}
console.log('PASS forming lines retain exact OHLC checks and cannot pass confirmed W neckline gate');
