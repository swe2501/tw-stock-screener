/* Offline bridge: real index.html post + board + iframe live/model/tower, fake fetch/clock. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),vm=require('node:vm'),{source,harness,departments,task}=require('./office-dept-fixture.cjs');
function system({status=403,payload={error:'任務中心目前僅在 UAT 啟用'}}={}){
 let now=Date.parse('2026-11-11T23:00:00+08:00'),responseStatus=status,responseBody=payload,cursor=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const calls=[],timers=[],nodes=new Map(),node=()=>({dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},textContent:'',value:'',innerHTML:'',setAttribute(){},append(){},close(){},remove(){},querySelector(){return null;}}),root=node();root.isConnected=true;
 root.querySelector=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);};
 const ctx={console,Date:Clock,document:{hidden:false,createElement:node,body:{append(){}}},setInterval:(fn,ms)=>(timers.push({fn,ms,cleared:false}),timers.length),clearInterval:id=>{if(timers[id-1])timers[id-1].cleared=true;},CustomEvent:class{},dispatchEvent(){},tk:()=> 'synthetic-only'};ctx.window=ctx;ctx.__API='';
 ctx.fetch=async(url,opts)=>{const body=JSON.parse(opts.body),s=responseStatus;calls.push({elapsedMs:now-Date.parse('2026-11-11T23:00:00+08:00'),url,method:opts.method,action:body.action,status:s});return {status:s,ok:s>=200&&s<300,json:async()=>s===200?(body.action==='admin_office_tasks_get'?{task:task('fixture','queued',1,8)}:{tasks:[task('fixture','queued',1,8)],total:1,departments,worker:{}}):{...responseBody}};};
 vm.createContext(ctx);const html=process.env.OFFICE_SOURCE_REV?execFileSync('git',['show',process.env.OFFICE_SOURCE_REV+':apps/web/index.html'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:16*1024*1024}):fs.readFileSync(path.resolve(__dirname,'../../apps/web/index.html'),'utf8'),postStart=html.indexOf('    function post(action,extra){'),postEnd=html.indexOf('    function dt(',postStart);if(postStart<0||postEnd<0)throw Error('post wrapper fixture extraction changed');vm.runInContext(html.slice(postStart,postEnd),ctx);
 vm.runInContext(source('apps/web/assets/office-task-board.js'),ctx);const board=ctx.OfficeTaskBoard.mount(root,ctx.post),h=harness({Date:Clock});
 async function pump(){for(let turns=0;turns<20;turns++){const requests=h.sent.slice(cursor).filter(m=>m.type==='foresight-office-workroom-request');cursor=h.sent.length;if(!requests.length)return;for(const req of requests){const snap=await board.snapshot(req.department===19?null:req.department,req.force);h.reply(req,snap.tasks||[],snap);}}throw Error('unexpected request loop');}
 async function start(){h.receive({type:'foresight-office-departments',roles:[]});await pump();}
 async function tick(ms=60000){now+=ms;h.timers.filter(t=>t.ms===60000).forEach(t=>t.fn());await pump();}
 async function triggers(){h.receive({type:'foresight-office-visibility',visible:false});h.receive({type:'foresight-office-visibility',visible:true});await pump();h.ctx.dispatchEvent({type:'focus'});await pump();h.ctx.dispatchEvent({type:'foresight-office-selection'});await pump();h.request(8);await pump();h.receive({type:'foresight-office-workroom-invalidated'});await pump();}
 return {h,board,calls,timers,nodes,start,tick,triggers,pump,setResponse:(s,b)=>{responseStatus=s;responseBody=b;},listCalls:()=>calls.filter(c=>c.action==='admin_office_tasks_list')};
}
module.exports={system};
