const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateStocks,filterStocks}=require('../../apps/mobile/src/stock-api');
function stock(code,name,kind='stock'){return {code,name,kind,market:'TWSE',date:'2026-10-16',close:101,change:1,change_percent:1,trade_value_twd:10,trade_volume_shares:1};}
function data(){return {available:true,schema_version:1,market:'TWSE',frequency:'daily',source:{url:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'},items:[stock('2330','台積電'),stock('0050','元大台灣50','etf'),stock('2317','鴻海')]};}
test('stock search filters locally by name/code and category',()=>{
 const d=validateStocks(data());assert.equal(filterStocks(d.items,'台積')[0].code,'2330');assert.equal(filterStocks(d.items,'0050','etf').length,1);assert.equal(filterStocks(d.items,'0050','stock').length,0);assert.equal(filterStocks(d.items,'不存在').length,0);
});
test('stock payload rejects bad percentages, duplicates and wrong source',()=>{
 for(const mutate of [d=>{d.items[0].change_percent=100;},d=>{d.items.push(d.items[0]);},d=>{d.items[0].close='101';},d=>{d.source.url='https://fake.test';}]){const d=data();mutate(d);assert.throws(()=>validateStocks(d));}
});
