export type Candle={date:string;open:number;high:number;low:number;close:number;volume?:number};
export type ChartBar={time:string;open:number;high:number;low:number;close:number;firstDate:string;lastDate:string;sessions:number};
export type CandleData={schema_version:1;available:true;symbol:string;name?:string;kind?:'stock'|'etf';frequency:'daily';as_of:string;candles:Candle[];partial:boolean;stale:boolean;cached:boolean;retrieved_at:string;source:{name:string;urls:string[]};notice:string};
export function validateCandles(value:unknown,symbol?:string):CandleData;
export function aggregateCandles(rows:Candle[],period?:'day'|'week'|'month'):ChartBar[];
export function movingAverage(rows:ChartBar[],period:number):{time:string;value:number}[];
