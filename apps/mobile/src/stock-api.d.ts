export type Stock={date:string;code:string;name:string;market:'TWSE';kind:'stock'|'etf';close:number;change:number;change_percent:number;trade_value_twd:number;trade_volume_shares:number};
export type StockData={schema_version:1;available:true;market:'TWSE';frequency:'daily';as_of:string;items:Stock[];partial:boolean;stale:boolean;cached:boolean;retrieved_at:string;source:{name:string;url:string};notice:string};
export function loadStocks(base:string,options?:{development?:boolean;signal?:AbortSignal;fetcher?:typeof fetch}):Promise<StockData>;
export function filterStocks(rows:Stock[],query?:string,kind?:string):Stock[];
export function validateStocks(value:unknown):StockData;
