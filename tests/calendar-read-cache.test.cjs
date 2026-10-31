const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps/web/assets/screen-log.js','utf8'),part=source.slice(source.indexOf('const calendarReads='),source.indexOf('\nlet scan='));
(async()=>{
let account='A',calls=0,now=Date.now(),pending=[];const events={};
const context={Map,Date:{now:()=>now,parse:Date.parse},clone:x=>JSON.parse(JSON.stringify(x)),token:()=>account,day:()=>new Date(now).toISOString().slice(0,10),monthNow:()=>new Date(now).toISOString().slice(0,7),cacheReceipts:()=>{},window:{addEventListener:(n,f)=>events[n]=f},rpc:async()=>{calls++;return new Promise(resolve=>pending.push(resolve));}};
vm.createContext(context);vm.runInContext(part+';globalThis.readCalendar=read;globalThis.invalidate=invalidateCalendar;',context);
const response=()=>({today:context.day(),server_time:new Date(now).toISOString(),rows:[{id:'one'}]});
const a=context.readCalendar(),b=context.readCalendar();assert.equal(calls,1);pending.shift()(response());const [x,y]=await Promise.all([a,b]);x.rows.length=0;assert.equal(y.rows.length,1,'callers cannot mutate shared data');
await context.readCalendar();assert.equal(calls,1,'cached repeat');
const fresh=context.readCalendar(undefined,true);assert.equal(calls,2,'save revalidates even with cached month');pending.shift()(response());await fresh;
context.invalidate();const stale=context.readCalendar();context.invalidate();pending.shift()(response());await stale;
const after=context.readCalendar();assert.equal(calls,4,'pre-write pending response not reused');pending.shift()(response());await after;
account='B';const second=context.readCalendar();assert.equal(calls,5,'another account cannot hit cache');pending.shift()(response());await second;
now+=21000;const expired=context.readCalendar();assert.equal(calls,6);pending.shift()(response());await expired;
context.invalidate();const race=context.readCalendar();account='C';pending.shift()(response());await assert.rejects(race,/帳號/);
console.log('PASS calendar request coalescing, defensive copies, write revalidation, generation invalidation, account isolation, TTL and account-switch race');
})().catch(e=>{console.error(e);process.exitCode=1;});
