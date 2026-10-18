export type MarketRow={date:string;close:number;change:number;change_percent:number;trade_value_twd:number;trade_volume_shares:number};
export type MarketData={schema_version:1;available:true;symbol:'TAIEX';frequency:'daily';session:'day';name:string;as_of:string;latest:MarketRow;history:MarketRow[];retrieved_at:string;source:{name:string;url:string};stale:boolean;cached:boolean;notice:string};
export function marketOrigin(value:string,development?:boolean):string;
export function validateMarket(data:unknown):MarketData;
export function loadMarket(base:string,options?:{development?:boolean;signal?:AbortSignal;fetcher?:typeof fetch}):Promise<MarketData>;
