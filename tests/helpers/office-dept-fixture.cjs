/* Offline regressions ported from dept-mismatch-repro/repro.cjs.
 * OFFICE_SOURCE_REV=<base> runs the same desired-behaviour assertions on git objects.
 * No browser, network, real tasks, credentials or service writes. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=p=>process.env.OFFICE_SOURCE_REV?execFileSync('git',['show',process.env.OFFICE_SOURCE_REV+':'+p],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,p),'utf8');
function element(dataset={}){return {dataset,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},textContent:'',value:'',innerHTML:'',setAttribute(){},append(x){this.badge=x;},querySelector(s){if(s==='.existing-role-count')return this.badge?{remove:()=>this.badge=null}:null;if(s==='i')return {outerHTML:'<i></i>'};if(s==='.room-task-badge')return this.button||(this.button={});return null;}};}
const task=(id,status,revision=1,department=8)=>({id,title:id,status,revision,department,execution:'agent',created_at:'2026-11-06T01:00:00+08:00',history:[],criteria:[],checks:[]});
const manual=task('manual8','queued'),trial=task('4b826778','review',4),old=task('a2c5c1be','cancelled',3),oldQueued=task('a2c5c1be','queued',1);
function harness(options={}){
 const dirs=[9,14,27,8].map(id=>element({department:String(id)})),rooms=[9,14,27,8].map(id=>element({roomDepartment:String(id),roomName:String(id)}));
 const timers=[],handlers={},sent=[],parent={postMessage:m=>sent.push(m)};
 const doc={hidden:false,getElementById:()=>null,querySelectorAll:s=>s==='.department'?dirs:s==='.room-label[data-room-department]'?rooms:[],querySelector:s=>s==='#officeExploreDialog'?{open:false}:s==='#exploreContent'?{querySelector:()=>null}:null,createElement:()=>element()};
 const ctx={console,document:doc,parent,location:{origin:'https://offline.invalid',protocol:'https:'},setInterval:(fn,ms)=>(timers.push({fn,ms}),timers.length),clearInterval(){},MutationObserver:class{observe(){}},CustomEvent:class{constructor(type,opt){this.type=type;this.detail=opt.detail;}},Date:options.Date||Date,Map,Set,Number,Object,Array,String};ctx.window=ctx;
 ctx.addEventListener=(name,fn)=>(handlers[name]??=[]).push(fn);ctx.dispatchEvent=e=>(handlers[e.type]||[]).forEach(f=>f(e));ctx.ForesightOffice={seatsFor:()=>[{x:0,y:-.04,z:1.45,rotation:Math.PI,computer:true},{x:1,y:-.04,z:1,rotation:Math.PI,computer:true}],selectedDepartment:14,select(id){this.selectedDepartment=id;}};
 vm.createContext(ctx);vm.runInContext(source('apps/web/assets/ai-office/office-workroom-model.js'),ctx);
 const tower=source('apps/web/assets/ai-office/office-tower.js');
 const activity=tower.slice(tower.indexOf('  const people=[];'),tower.indexOf('  const rooms='));
 vm.runInContext('const select=id=>ForesightOffice.select(id);'+activity,ctx);
 let live=source('apps/web/assets/ai-office/office-live.js').replace(/\}\)\(\);\s*$/,'globalThis.probe={snapshots,inflight,taskStats,decorate,emitActivity,snapshotFor,requestData};})();');vm.runInContext(live,ctx);
 const receive=data=>(handlers.message||[]).forEach(f=>f({source:parent,origin:'https://offline.invalid',data}));
 function request(department){ctx.probe.requestData(department,true);return sent.filter(m=>m.type==='foresight-office-workroom-request').at(-1);}
 function reply(req,tasks,extra={}){receive({type:'foresight-office-workroom',request:req.request,department:req.department,snapshot:{tasks,at:new ctx.Date().toISOString(),...extra}});}
 return {ctx,dirs,rooms,sent,timers,receive,request,reply,badge:id=>dirs.find(x=>+x.dataset.department===id).badge?.textContent||'',room:id=>rooms.find(x=>+x.dataset.roomDepartment===id).innerHTML.match(/<button[^>]*>(.*?)<\/button>/)?.[1]||''};
}
function seed(h){h.reply(h.request(8),[manual,trial,oldQueued]);h.reply(h.request(19),[manual,trial,old]);}
function boardHarness(post,options={}){const nodes=new Map(),boardRoot=element();boardRoot.isConnected=true;boardRoot.querySelector=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);};const ctx={console,document:{createElement:()=>element(),body:{append(){}}},Date:options.Date||Date,setInterval:()=>1,clearInterval(){},CustomEvent:class{},dispatchEvent(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source('apps/web/assets/office-task-board.js'),ctx);return {board:ctx.OfficeTaskBoard.mount(boardRoot,post),nodes};}
const departments=[8,9,14,27].map(id=>({id,name:'Department '+id,enabled:true}));

module.exports={source,harness,boardHarness,seed,task,manual,trial,old,oldQueued,departments};
