// Run with: node tests/test_member_backtest.cjs. No network or browser needed.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scope={window:{},document:{body:{},querySelectorAll:()=>[],getElementById:()=>null},localStorage:{getItem:()=>null},MutationObserver:class{observe(){}},addEventListener(){},requestAnimationFrame(){},CustomEvent:class{},dispatchEvent(){}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../apps/web/assets/member-research.js'),'utf8'),scope);
const run=scope.window.AcademyResearch.backtest;
const rows=values=>values.map((price,i)=>({time:'2026-01-0'+(i+1),open:price,close:price}));
const parameters={capital:1000,fee:0,tax:0,slip:0,fast:2,slow:3,strategy:'hold',start:'2026-01-01',end:'2026-01-06'};
const rising=rows([10,20,30,40,50,60]),hold=run(rising,parameters);
assert.equal(hold.returnPct,500);assert.equal(hold.benchmarkPct,500);assert.equal(hold.closed,0);assert.equal(hold.winRate,null);assert.equal(hold.openShares,100);
const cross=run(rows([10,20,30,5,1,1]),{...parameters,strategy:'cross',start:'2026-01-04'});
assert.equal(cross.trades[0].date,'2026-01-04');assert.equal(cross.trades[0].price,5);assert.equal(cross.trades[1].date,'2026-01-05');assert.equal(cross.returnPct,-80);assert.equal(cross.winRate,0);
const futureChanged=run(rows([10,20,30,5,100,100]),{...parameters,strategy:'cross',start:'2026-01-04'});
assert.equal(futureChanged.trades[0].price,cross.trades[0].price);assert.equal(futureChanged.trades[0].shares,cross.trades[0].shares);
const costs=run(rising,{...parameters,fee:.01});assert.equal(costs.openShares,99);assert.ok(Math.abs(costs.curve.at(-1).equity-5940.1)<1e-8);
assert.throws(()=>run([...rising,rising[0]],parameters),/重複/);
assert.throws(()=>run(rising,{...parameters,strategy:'cross'}),/資料不足/);
assert.throws(()=>run(rising,{...parameters,fast:20,slow:5}),/無效/);
console.log('PASS next-open execution, no future entry leak, costs, realized/unrealized distinction, duplicate and warmup validation');

