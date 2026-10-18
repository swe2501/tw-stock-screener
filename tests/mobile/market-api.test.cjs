const {test}=require('node:test'),assert=require('node:assert/strict');
const {marketOrigin,loadMarket,validateMarket}=require('../../apps/mobile/src/market-api');
function sample(){const latest={date:'2026-10-16',close:101,change:1,change_percent:1,trade_value_twd:123456789,trade_volume_shares:456789};return {available:true,schema_version:1,symbol:'TAIEX',frequency:'daily',session:'day',source:{name:'TWSE',url:'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK'},history:[latest],latest,as_of:latest.date,stale:false,cached:false,notice:'daily',retrieved_at:'2026-10-18T00:00:00Z'};}
test('production requires HTTPS; explicit dev permits only private LAN API port',()=>{
 assert.equal(marketOrigin('http://192.168.1.38:8788',true),'http://192.168.1.38:8788');
 for(const [url,dev] of [['http://192.168.1.38:8788',false],['http://8.8.8.8:8788',true],['http://192.168.1.38:80',true],['file:///secret',true],['https://u:p@example.test',false],['https://example.test/private',false],['https://example.test/?key=x',false]])assert.throws(()=>marketOrigin(url,dev));
});
test('validates daily data, chronology, source and percentage without coercing bad numbers',()=>{
 assert.equal(validateMarket(sample()).latest.close,101);
 for(const mutate of [d=>{d.latest={...d.latest,close:102};},d=>{d.as_of='2026-10-15';},d=>{d.history[0].close='101';},d=>{d.history[0].change_percent=5;},d=>{d.history[0].date='2026-02-30';},d=>{d.source.url='https://attacker.test';},d=>{d.frequency='intraday';},d=>{d.history.push({...d.history[0]});}]){const d=sample();mutate(d);assert.throws(()=>validateMarket(d));}
});
test('fetch omits credentials, forbids redirects, forwards abort and rejects protected HTML/503',async()=>{
 const controller=new AbortController();let request;
 const result=await loadMarket('https://preview.example.test',{signal:controller.signal,fetcher:async(url,options)=>{request={url,options};return {ok:true,headers:{get:()=> 'application/json'},json:async()=>sample()};}});
 assert.equal(result.as_of,'2026-10-16');assert.equal(request.url,'https://preview.example.test/api/prices?action=market_summary');assert.equal(request.options.credentials,'omit');assert.equal(request.options.redirect,'error');assert.equal(request.options.signal,controller.signal);
 for(const response of [{ok:false},{ok:true,headers:{get:()=> 'text/html'}}])await assert.rejects(()=>loadMarket('https://preview.example.test',{fetcher:async()=>response}));
});
