const {run}=require('./vendor/strategy-engine');
function numeric(value,label,min,max){if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value.trim()))throw Error(label+'請填數字；不計成本也請明確填 0。');const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+'超出允許範圍。');return n;}
function backtest(data,strategy,input){
 if(!data||data.symbol==='TAIEX'||data.stale!==false||data.partial!==false)throw Error('績效回測需要完整且未標記過期的個股／ETF 資料，請重新讀取。');
 const parameters={capital:numeric(input.capital,'初始資金',100,1e9),fee:numeric(input.fee,'單邊手續費 %',0,5)/100,tax:numeric(input.tax,'賣出稅率 %',0,5)/100,slip:numeric(input.slip,'單邊滑價 %',0,5)/100,allocation:numeric(input.allocation,'每次使用可用資金 %',0.01,100)/100,sizing:'ratio',start:input.start,end:input.end};
 const rows=data.candles.map(b=>({...b,time:b.date}));
 if(rows.some(b=>!Number.isInteger(b.volume)||b.volume<0))throw Error('回測缺少有效成交股數。');
 const result=run(rows,strategy,parameters);
 return {format:'academy-mobile-backtest',schema_version:1,created_at:new Date().toISOString(),instrument:{symbol:data.symbol,name:data.name,kind:data.kind},source:data.source,as_of:data.as_of,price_basis:'unadjusted',notice:data.notice,bars:rows,result};
}
module.exports={backtest};
