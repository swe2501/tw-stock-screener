/* Actual merged auth/post/watch functions share one synthetic account and refresh state. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function build(revision){
 const read=file=>revision?execFileSync('git',['show',revision+':'+file],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,file),'utf8');
 const html=read('apps/web/index.html'),member=read('apps/web/assets/member-research.js');
 const slice=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<start)throw Error('Auth interleaving source boundary changed');return s.slice(start,end);};
 const auth=slice(html,'    async function _tryRefreshToken()','    // ── 閒置自動登出'),post=slice(html,'    function post(action,extra){','    function dt('),watch=slice(member,'  function uid()','  const star=');
 return {factory:`function createInteropClient(fetcher){
 const values=new Map([['sb_token','old-token'],['sb_refresh','refresh-0'],['sb_user',JSON.stringify({id:'same-owner'})]]);
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},window={__API:''},API='/api',fetch=fetcher;
 let _authToken='old-token',_authRefresh='refresh-0',_authUser={id:'same-owner'},_refreshing=null,logouts=0;const _authEndpoint='/api/auth';
 const tk=()=>localStorage.getItem('sb_token')||'',_applyAuthState=()=>{logouts++;},showToast=()=>{},dispatchEvent=()=>{};class CustomEvent{}
 ${auth}\n${post}\n${watch}
 return{post,watch,authFetch:_authFetch,refresh:_tryRefreshToken,session:()=>({token:_authToken,owner:_authUser?.id,logouts}),setSession:(token,refresh,owner)=>{_authToken=token;_authRefresh=refresh;_authUser=owner?{id:owner}:null;for(const [key,value] of [['sb_token',token],['sb_refresh',refresh],['sb_user',owner?JSON.stringify({id:owner}):null]]){if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);}}};
 }`};
}
const cases=['simultaneous-401','late-watch-401','late-admin-401','late-admin-retry-401','late-peer-admin-401','late-member-api-401','pending-refresh','pending-refresh-fails','switch-before-401','switch-during-refresh','logout-during-refresh'];
async function scenario(name,createInteropClient){
 const check=(ok,message)=>{if(!ok)throw Error(name+': '+message);},deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};},oldGate=deferred(),refreshGate=deferred(),refreshStarted=deferred(),calls=[];let refreshes=0;
 const client=createInteropClient(async(url,opts)=>{const action=opts.body?JSON.parse(opts.body).action:null,token=opts.headers.Authorization;calls.push({url,action,token});
  if(action==='refresh'){refreshes++;const owner=client.session().owner;refreshStarted.resolve();if(['pending-refresh','pending-refresh-fails','switch-during-refresh','logout-during-refresh'].includes(name))await refreshGate.promise;
   const status=name==='pending-refresh-fails'?503:200;return new Response(JSON.stringify(status===200?{access_token:'new-token-'+refreshes,refresh_token:'refresh-'+refreshes,user:{id:owner}}:{error:'unavailable'}),{status});}
  if(token==='Bearer old-token'){
   const held=(name==='late-watch-401'&&url==='/api/watchlist')||(['late-admin-401','late-admin-retry-401','switch-before-401'].includes(name)&&action==='admin_office_tasks_list')||(name==='late-peer-admin-401'&&action==='admin_office_tasks_get')||(name==='late-member-api-401'&&url==='/api/broker_watch');
   if(held)await oldGate.promise;return new Response(JSON.stringify({error:'unauthorized'}),{status:401});}
  if(name==='late-admin-retry-401'&&action==='admin_office_tasks_list')return new Response(JSON.stringify({error:'unauthorized'}),{status:401});
  return new Response(JSON.stringify(url==='/api/watchlist'?[]:{ok:true}),{status:200});
 });
 let result,other;
 if(name==='late-watch-401'){const pending=client.watch();other=await client.post('admin_office_tasks_list');oldGate.resolve();result=await pending;}
 else if(['late-admin-401','late-admin-retry-401'].includes(name)){const pending=client.post('admin_office_tasks_list');other=await client.watch();oldGate.resolve();result=await pending;}
 else if(name==='late-peer-admin-401'){const pending=client.post('admin_office_tasks_get');other=await client.post('admin_office_tasks_list');oldGate.resolve();result=await pending;}
 else if(name==='late-member-api-401'){const pending=client.authFetch('/api/broker_watch');other=await client.watch();oldGate.resolve();result=await pending;}
 else if(name==='pending-refresh'||name==='pending-refresh-fails'){const pending=client.refresh();await refreshStarted.promise;const request=client.post('admin_office_tasks_list');refreshGate.resolve();[,result]=await Promise.all([pending,request]);}
 else if(name==='switch-before-401'){const pending=client.post('admin_office_tasks_list');client.setSession('other-token','other-refresh','other-owner');oldGate.resolve();result=await pending;}
 else if(name==='switch-during-refresh'||name==='logout-during-refresh'){const pending=client.post('admin_office_tasks_list');await refreshStarted.promise;client.setSession(...(name==='switch-during-refresh'?['other-token','other-refresh','other-owner']:[null,null,null]));refreshGate.resolve();result=await pending;}
 else [result,other]=await Promise.all([client.post('admin_office_tasks_list'),client.watch()]);
 const admins=calls.filter(c=>c.action==='admin_office_tasks_list'),expectedRefreshes=name==='switch-before-401'?0:1;
 check(refreshes===expectedRefreshes,'expected '+expectedRefreshes+' shared refresh, got '+refreshes);
 for(const action of ['admin_office_tasks_list','admin_office_tasks_get'])check(calls.filter(c=>c.action===action).length<=2,'at most one retry per admin request');
 check(calls.filter(c=>c.url==='/api/watchlist').length<=2&&calls.filter(c=>c.url==='/api/broker_watch').length<=2,'at most one member retry');
 if(['switch-before-401','switch-during-refresh','logout-during-refresh','pending-refresh-fails','late-admin-retry-401'].includes(name))check(result.httpStatus===401,'return terminal 401');else check(result.ok===true||Array.isArray(result),'operation succeeded');
 if(['switch-before-401','switch-during-refresh','logout-during-refresh','pending-refresh-fails'].includes(name))check(admins.length===1,'no retry after failed refresh/account change/logout');
 if(name==='switch-before-401'||name==='switch-during-refresh')check(client.session().owner==='other-owner'&&client.session().token==='other-token','new account must remain untouched');
 if(name==='logout-during-refresh')check(client.session().token===null&&client.session().owner==null,'logout remains logged out');
 return{pass:true,name,refreshes,adminRequests:admins.length,watchRequests:calls.filter(c=>c.url==='/api/watchlist').length,calls};
}
module.exports={...build(),build,cases,scenario};
