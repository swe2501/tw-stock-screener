const {marketOrigin}=require('./market-api');
function validateContext(d){
 if(!d||d.available!==true||d.schema_version!==1||d.market!=='TWSE'||d.frequency!=='daily'||!/^\d{4}-\d{2}-\d{2}$/.test(d.as_of)||typeof d.stale!=='boolean')throw Error('市場脈絡資料格式不完整。');
 const compact=d.as_of.replace(/-/g,''),urls={institutions:'https://www.twse.com.tw/fund/BFI82U?response=json&dayDate='+compact+'&type=day',margin:'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date='+compact+'&selectType=MS&response=json',breadth:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'};
 for(const key of Object.keys(urls)){const p=d.parts?.[key];if(!p||typeof p.available!=='boolean'||p.date!==d.as_of||p.source_url!==urls[key])throw Error('市場資料來源或日期不一致。');if(!p.available){if(p.data!==null)throw Error('未就緒資料不可假裝有數值。');continue;}if(!p.data||Object.values(p.data).some(v=>typeof v==='number'&&!Number.isSafeInteger(v)))throw Error('市場資料數值無效。');}
 const i=d.parts.institutions;if(i.available&&(!['foreign','trust','dealer','total'].every(k=>Number.isSafeInteger(i.data[k]))||i.data.foreign+i.data.trust+i.data.dealer!==i.data.total))throw Error('法人合計不一致。');
 const m=d.parts.margin;if(m.available&&(!['finance_balance_twd','finance_change_twd','short_balance_units','short_change_units'].every(k=>Number.isSafeInteger(m.data[k]))||m.data.finance_balance_twd<0||m.data.short_balance_units<0))throw Error('資券數值無效。');
 const b=d.parts.breadth;if(b.available&&(!['up','down','flat','total'].every(k=>Number.isSafeInteger(b.data[k])&&b.data[k]>=0)||b.data.total<1||b.data.up+b.data.down+b.data.flat!==b.data.total))throw Error('市場廣度樣本不一致。');return d;
}
async function loadContext(base,{development=false,signal,fetcher=fetch}={}){const r=await fetcher(marketOrigin(base,development)+'/api/prices?action=market_context',{signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json'}});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('市場脈絡資料暫時無法取得。');return validateContext(await r.json());}
module.exports={validateContext,loadContext};
