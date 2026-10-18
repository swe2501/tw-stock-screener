const {test}=require('node:test'),assert=require('node:assert/strict');
const {aggregateCandles,movingAverage,validateCandles}=require('../../apps/mobile/src/chart-model');
function data(){return {available:true,schema_version:1,symbol:'TAIEX',frequency:'daily',as_of:'2026-10-05',source:{urls:['https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=20261001&response=json']},candles:[{date:'2026-10-01',open:100,high:110,low:95,close:108},{date:'2026-10-02',open:108,high:120,low:105,close:115},{date:'2026-10-05',open:115,high:116,low:99,close:100}]};}
test('weekly/monthly OHLC preserve first open, extrema and last close without fake sessions',()=>{
 const d=data();validateCandles(d);const week=aggregateCandles(d.candles,'week');
 assert.equal(week.length,2);assert.deepEqual(week[0],{time:'2026-09-28',open:100,high:120,low:95,close:115,firstDate:'2026-10-01',lastDate:'2026-10-02',sessions:2});
 assert.equal(week[1].sessions,1);const month=aggregateCandles(d.candles,'month');assert.equal(month.length,1);assert.equal(month[0].close,100);assert.equal(month[0].sessions,3);
 const ma=movingAverage(aggregateCandles(d.candles),2);assert.equal(ma.length,2);assert.equal(ma[0].value,111.5);assert.equal(movingAverage(week,5).length,0);
});
test('reject invalid OHLC, reversed dates, date mismatch and nonofficial source',()=>{
 for(const change of [d=>{d.candles[0].low=109;},d=>{d.candles[0].high=99;},d=>{d.candles[0].close=NaN;},d=>{d.candles.reverse();},d=>{d.as_of='2026-10-01';},d=>{d.source.urls=['https://evil.test'];}]){const d=data();change(d);assert.throws(()=>validateCandles(d));}
});
test('chart document bundles the renderer and prevents external connections',()=>{
 const {chartDocument}=require('../../apps/mobile/src/chart-document');const html=chartDocument(aggregateCandles(data().candles),true,[5,20]);
 assert.ok(html.includes("connect-src 'none'"));assert.ok(html.includes('LightweightCharts'));assert.equal(/<script[^>]+src=/.test(html),false);assert.ok(html.includes('TradingView')||html.includes('tradingview'));
});
test('stock candles bind instrument and official source and require actual volume',()=>{
 const d=data();d.symbol='2330';d.source.urls=['https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261001&stockNo=2330&response=json'];d.candles.forEach(b=>b.volume=12345);assert.equal(validateCandles(d,'2330').symbol,'2330');assert.throws(()=>validateCandles(d,'2317'));d.candles[0].volume=null;assert.throws(()=>validateCandles(d,'2330'));d.candles[0].volume=10;d.source.urls[0]=d.source.urls[0].replace('2330','2317');assert.throws(()=>validateCandles(d,'2330'));
});
