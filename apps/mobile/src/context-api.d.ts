type Part<T>={available:boolean;data:T|null;date:string;source_url:string};
export type ContextData={available:true;schema_version:1;as_of:string;stale:boolean;partial:boolean;cached:boolean;retrieved_at:string;notice:string;parts:{institutions:Part<{foreign:number;trust:number;dealer:number;total:number}>;margin:Part<{finance_balance_twd:number;finance_change_twd:number;short_balance_units:number;short_change_units:number}>;breadth:Part<{up:number;down:number;flat:number;total:number;scope:string}>}};
export function validateContext(data:unknown):ContextData;
export function loadContext(base:string,options?:{development?:boolean;signal?:AbortSignal;fetcher?:typeof fetch}):Promise<ContextData>;
