function validateCandles(data,symbol='TAIEX'){
 const index=symbol==='TAIEX';if(!index&&!/^[0-9]{4,6}[A-Z]?$/.test(symbol))throw Error('商品代號格式錯誤。');
 const source=index?/^https:\/\/www\.twse\.com\.tw\/rwd\/zh\/TAIEX\/MI_5MINS_HIST\?date=\d{8}&response=json$/:new RegExp('^https://www\\.twse\\.com\\.tw/rwd/zh/afterTrading/STOCK_DAY\\?date=\\d{8}&stockNo='+symbol+'&response=json$');
 if(!data||data.available!==true||data.schema_version!==1||data.symbol!==symbol||data.frequency!=='daily'||!Array.isArray(data.candles)||!data.candles.length||data.candles.length>2000||!Array.isArray(data.source?.urls)||!data.source.urls.length||!data.source.urls.every(url=>source.test(url)))throw Error('K 線資料來源或格式不完整。');
 let previous='';
 for(const row of data.candles){if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date<=previous||!['open','high','low','close'].every(k=>typeof row[k]==='number'&&Number.isFinite(row[k])&&row[k]>0)||row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close)||!index&&(!Number.isFinite(row.volume)||row.volume<0))throw Error('開高低收或交易日資料驗證失敗。');previous=row.date;}
 if(data.as_of!==previous)throw Error('K 線最新日期不一致。');return data;
}
function aggregateCandles(rows,period='day'){
 if(!['day','week','month'].includes(period))throw Error('unsupported period');
 const groups=new Map();
 for(const row of rows){let key=row.date;if(period==='month')key=row.date.slice(0,7)+'-01';if(period==='week'){const d=new Date(row.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=d.toISOString().slice(0,10);}
  const existing=groups.get(key);if(existing){existing.high=Math.max(existing.high,row.high);existing.low=Math.min(existing.low,row.low);existing.close=row.close;existing.lastDate=row.date;existing.sessions++;}else groups.set(key,{time:key,open:row.open,high:row.high,low:row.low,close:row.close,firstDate:row.date,lastDate:row.date,sessions:1});
 }return [...groups.values()];
}
function movingAverage(rows,period){const out=[];let sum=0;for(let i=0;i<rows.length;i++){sum+=rows[i].close;if(i>=period)sum-=rows[i-period].close;if(i>=period-1)out.push({time:rows[i].time,value:sum/period});}return out;}
module.exports={validateCandles,aggregateCandles,movingAverage};
