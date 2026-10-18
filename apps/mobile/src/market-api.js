const SOURCE='https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK';
function marketOrigin(value,development=false){
 const u=new URL(value);
 const parts=u.hostname.split('.').map(Number);
 const privateV4=parts.length===4&&parts.every(p=>Number.isInteger(p)&&p>=0&&p<=255)&&
  (parts[0]===10||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31));
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(development&&privateV4&&u.protocol==='http:'&&u.port==='8788')))throw Error('大盤資料服務位址不正確。');
 return u.origin;
}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function validateMarket(data){
 if(!data||data.available!==true||data.schema_version!==1||data.symbol!=='TAIEX'||data.frequency!=='daily'||data.session!=='day'||data.source?.url!==SOURCE||typeof data.source.name!=='string'||!Array.isArray(data.history)||!data.history.length||data.history.length>1000||typeof data.stale!=='boolean'||typeof data.cached!=='boolean'||typeof data.notice!=='string'||!Number.isFinite(Date.parse(data.retrieved_at)))throw Error('大盤資料格式不完整，請稍後再試。');
 let last='';
 for(const row of data.history){
  if(!validDate(row.date)||row.date<=last||!['close','change','change_percent','trade_value_twd','trade_volume_shares'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))||row.close<=0||row.close-row.change<=0||row.trade_value_twd<0||row.trade_volume_shares<0||Math.abs(row.change_percent-row.change/(row.close-row.change)*100)>.001)throw Error('大盤資料驗證失敗，未顯示不完整數值。');
  last=row.date;
 }
 const latest=data.history.at(-1);
 if(data.as_of!==last||!data.latest||Object.keys(latest).some(key=>latest[key]!==data.latest[key]))throw Error('資料日期或最新數值不一致。');
 return data;
}
async function loadMarket(base,{development=false,signal,fetcher=fetch}={}){
 const response=await fetcher(marketOrigin(base,development)+'/api/prices?action=market_summary',{signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('大盤資料暫時無法取得，請檢查網路後重試。');
 return validateMarket(await response.json());
}
module.exports={marketOrigin,validateMarket,loadMarket};
