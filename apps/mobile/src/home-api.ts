import {apiBase} from '../../../packages/shared/news-api';

export type MarketBrief={date:string;close:number;change:number;percent:number;turnover:number;stale:boolean;source:string};
export function parseMarketBrief(data:any):MarketBrief{
 const row=data?.latest;
 const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
 const validDate=typeof data?.as_of==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(data.as_of)&&!Number.isNaN(Date.parse(data.as_of))&&new Date(data.as_of).toISOString().slice(0,10)===data.as_of;
 if(data?.available!==true||data.symbol!=='TAIEX'||data.frequency!=='daily'||!validDate||row?.date!==data.as_of||!finite(row.close)||row.close<=0||!finite(row.change)||!finite(row.change_percent)||!finite(row.trade_value_twd)||row.trade_value_twd<0||typeof data.source?.name!=='string')throw Error('大盤資料暫時無法取得');
 return {date:data.as_of,close:row.close,change:row.change,percent:row.change_percent,turnover:row.trade_value_twd,stale:data.stale===true,source:data.source.name};
}
export async function fetchMarketBrief(base:string,signal?:AbortSignal):Promise<MarketBrief>{
 const response=await fetch(apiBase(base)+'/api/prices?action=market_summary',{signal});
 if(!response.ok||response.headers.get('content-type')?.includes('text/html'))throw Error('大盤資料暫時無法取得');
 return parseMarketBrief(await response.json());
}
export function signed(value:number,digits=2){return (value>0?'+':'')+value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
