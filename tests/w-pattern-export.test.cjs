const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  let download=null;
  const context={window:{},Blob,URL:{createObjectURL(b){download=b;return 'blob:test';},revokeObjectURL(){}},document:{createElement(){return {click(){}};}},setTimeout(){}};
  vm.runInNewContext(fs.readFileSync('apps/web/assets/w-pattern-export.js','utf8'),context);
  const candles=Array.from({length:8},(_,i)=>({time:`2026-10-${String(i+1).padStart(2,'0')}`,open:10,high:12,low:9,close:11,volume:100}));
  const ts={width:()=>100,getVisibleLogicalRange:()=>({from:0,to:7}),timeToCoordinate:t=>(+t.slice(-2)-1)*20};
  const chart={timeScale:()=>ts,options:()=>({width:120,height:80,rightPriceScale:{mode:0}}),takeScreenshot:()=>({width:240,height:160,toDataURL:()=> 'data:image/png;base64,test'})};
  const series={priceToCoordinate:p=>80-p};
  return {api:context.window.WPatternExport,chart,series,candles,download:()=>download};
}
test('exports only visible bars with retina-independent x',async()=>{
  const s=setup(); const result=s.api.capture(s); assert.equal(result.bars,5);
  const packet=JSON.parse(await s.download().text()); assert.equal(packet.bars[4].x,80/120); assert.equal(packet.chart.width,240); assert.equal(packet.bars[0].bar_index,0);
});
test('rejects hourly timestamps instead of guessing timezone',()=>{const s=setup();s.candles[0].time=123;assert.throws(()=>s.api.capture(s),/日期字串/);assert.equal(s.download(),null);});
test('rejects invalid OHLC and does not download',()=>{const s=setup();s.candles[0].low=15;assert.throws(()=>s.api.capture(s),/價格無效/);assert.equal(s.download(),null);});
test('rejects loading or missing chart handles',()=>{const s=setup();assert.throws(()=>s.api.capture({...s,chart:null}),/圖表實例/);assert.equal(s.download(),null);});
