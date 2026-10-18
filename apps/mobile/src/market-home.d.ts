export type Chapter={id:string;title:string;hint:string;selector:string};
export const chapters:readonly Chapter[];
export function websiteOrigin(value:string):string;
export function routeKind(value:string,origin:string):'internal'|'external'|'blocked';
export function bridgeScript(origin:string,dark:boolean,chapterId?:string):string;
