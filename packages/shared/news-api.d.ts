export type NewsItem = {title:string;source:string;date:string;snippet:string;url:string|null};
export function apiBase(value:string):string;
export function articleUrl(value:string):string|null;
export function searchNews(base:string,query:string,options?:{signal?:AbortSignal;fetcher?:typeof fetch}):Promise<{items:NewsItem[];partial:boolean}>;
