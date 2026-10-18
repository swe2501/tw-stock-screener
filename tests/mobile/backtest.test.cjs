const {test}=require('node:test'),assert=require('node:assert/strict');
const {backtest}=require('../../apps/mobile/src/backtest-model');
function fixture(){return {symbol:'2330',name:'研究測試',kind:'stock',stale:false,partial:false,as_of:'2026-10-05',source:{urls:[]},notice:'fixture',candles:[10,11,12,13,14].map((p,i)=>({date:`2026-10-0${i+1}`,open:p,high:p+1,low:p-1,close:p,volume:1000}))};}
const strategy={name:'固定公式測試',entryMode:'all',exitMode:'any',entry:[{type:'formula',op:'above',code:'close > 0',params:{}}],exit:[],risk:{stop:0,take:0,maxBars:0}};
const input={capital:'1000',fee:'0',tax:'0',slip:'0',allocation:'100',start:'2026-10-02',end:'2026-10-05'};
test('backtest uses prior close, next open, integer shares and snapshots rules for replay',()=>{
 const report=backtest(fixture(),strategy,input);assert.equal(report.result.trades[0].date,'2026-10-02');assert.equal(report.result.trades[0].price,11);assert.equal(report.result.trades[0].shares,90);assert.equal(report.result.curve.at(-1).equity,1270);assert.equal(report.result.closed,0);assert.equal(report.result.winRate,null);assert.equal(report.result.openShares,90);assert.equal(report.result.trades[0].signal.date,'2026-10-01');assert.equal(report.result.parameters.fee,0);assert.notEqual(report.result.strategy,strategy);
});
test('do not simulate incomplete or stale data, missing costs, missing volume, index or inadequate warmup',()=>{
 for(const mutate of [d=>{d.stale=true;},d=>{d.partial=true;},d=>{d.symbol='TAIEX';},d=>{d.candles[0].volume=null;}]){const d=fixture();mutate(d);assert.throws(()=>backtest(d,strategy,input));}
 assert.throws(()=>backtest(fixture(),strategy,{...input,fee:''}),/請填數字/);assert.throws(()=>backtest(fixture(),{...strategy,entry:[{type:'formula',op:'above',code:'close > SMA(close, 20)',params:{}}]},input),/暖機/);
});
test('simultaneous stop and take uses conservative stop, costs alter results and exports retain inputs',()=>{
 const d=fixture();d.candles[1]={...d.candles[1],high:15,low:5};const result=backtest(d,{...strategy,risk:{stop:10,take:10,maxBars:0}}, {...input,fee:'1',tax:'1',slip:'0.5'}).result;assert.equal(result.trades[1].side,'賣出');assert.match(result.trades[1].reason,/停損/);assert.ok(result.fees>0);assert.equal(result.parameters.tax,.01);assert.equal(result.strategy.risk.stop,10);
});
