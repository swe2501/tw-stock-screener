/* Real inline admin post + refresh functions; synthetic tokens, no service access. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../apps/web/index.html'),'utf8');
function extract(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);if(a<0||b<a)throw Error('Auth fixture extraction changed');return html.slice(a,b);}
const auth=extract('    async function _tryRefreshToken()', '    // ── 閒置自動登出'),post=extract('    function post(action,extra){','    function dt(');
const factory=`function createClient(fetcher,refresh='synthetic-refresh'){
 const values=new Map([['sb_token','old-token'],['sb_refresh',refresh],['sb_user',JSON.stringify({id:'synthetic-admin'})]]);
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},window={__API:''};
 let _authToken='old-token',_authRefresh=refresh,_authUser={id:'synthetic-admin'},_refreshing=null,logouts=0;const _authEndpoint='/api/auth',fetch=fetcher,tk=()=>localStorage.getItem('sb_token')||'';
 const _applyAuthState=()=>{logouts++;},showToast=()=>{};
 ${auth}
${post}
 return{post,fetch:_authFetch,session:()=>({token:_authToken,refresh:_authRefresh,logouts,stored:localStorage.getItem('sb_token')})};
}`;
const cases=['admin-refresh-success','retry-still-401','refresh-fails-401','refresh-fails-503','no-refresh-token','other-403','uat-only-403','upstream-503','concurrent-refresh','member-api-unchanged'];
async function scenario(name,createClient){
 const check=(condition,message)=>{if(!condition)throw Error(name+': '+message);},calls=[];
 const client=createClient(async(url,opts)=>{const action=opts?.body?JSON.parse(opts.body).action:null,refresh=action==='refresh';calls.push({url,action,authorization:opts?.headers?.Authorization,body:opts?.body});
  if(refresh){const status=name==='refresh-fails-401'?401:name==='refresh-fails-503'?503:200;return new Response(JSON.stringify(status===200?{access_token:'new-token',refresh_token:'new-refresh',user:{id:'synthetic-admin'}}:{error:'unavailable'}),{status});}
  const status=(name==='other-403'||name==='uat-only-403')?403:name==='upstream-503'?503:name==='member-api-unchanged'?200:name==='retry-still-401'?401:opts.headers.Authorization==='Bearer new-token'?200:401;
  return new Response(JSON.stringify(status===200?{ok:true}:{error:name==='uat-only-403'?'任務中心目前僅在 UAT 啟用':status===403?'forbidden: 僅限管理員':'unauthorized'}),{status});
 },name==='no-refresh-token'?null:'synthetic-refresh');
 let result;if(name==='concurrent-refresh')result=await Promise.all([client.post('admin_office_tasks_list'),client.post('admin_office_tasks_list')]);else if(name==='member-api-unchanged')result=await Promise.all(['/api/watchlist','/api/broker_watch'].map(url=>client.fetch(url)));else result=await client.post('admin_office_tasks_list');
 const refreshes=calls.filter(c=>c.action==='refresh').length,requests=calls.length-refreshes;
 if(name==='admin-refresh-success'){check(result.ok===true,'post must use existing auth wrapper');check(requests===2&&refreshes===1,'one refresh + one retry');check(calls[2].authorization==='Bearer new-token','retry uses refreshed token');check(calls[0].body===calls[2].body,'same action/body on retry');}
 if(name==='retry-still-401'){check(result.httpStatus===401,'return final 401 to caller');check(requests===2&&refreshes===1,'no recursion after second 401');}
 if(name==='refresh-fails-401'||name==='refresh-fails-503'){check(result.httpStatus===401&&requests===1&&refreshes===1,'failed refresh stops without retry');check(client.session().logouts===(name==='refresh-fails-401'?1:0),'only confirmed refresh 401 logs out');if(name==='refresh-fails-401')check(client.session().stored===null,'expired session removed');}
 if(name==='no-refresh-token')check(result.httpStatus===401&&calls.length===1,'missing refresh stops immediately');
 if(name==='other-403'||name==='upstream-503')check(result.httpStatus===((name==='other-403'||name==='uat-only-403')?403:503)&&calls.length===1,'non401 never refreshes');
 if(name==='uat-only-403')check(result.httpStatus===403&&result.error.includes('僅在 UAT 啟用')&&calls.length===1,'scope403 never enters refresh');
 if(name==='concurrent-refresh')check(result.every(r=>r.ok)&&requests===4&&refreshes===1,'one shared refresh, each call retries once');
 if(name==='member-api-unchanged')check(result.every(r=>r.status===200)&&requests===2&&refreshes===0&&calls.every(c=>c.authorization==='Bearer old-token'),'member transport unchanged');
 return{pass:true,name,requests,refreshes,logouts:client.session().logouts};
}
module.exports={factory,cases,scenario};
