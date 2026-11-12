/* Server-backed catalog and navigation permissions. Price data is never stored locally. */
(() => {
 'use strict';
 const paths={book:'M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14',compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4 6-2 6-6 2 2-6z',chart:'M3 3v18h18M7 16l5-7 4 3 5-8M16 4h5v5',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zm-5 10 3 3 6-6',diamond:'m12 2 10 10-10 10L2 12zm-5 5h10v10H7z',layers:'m12 2 10 6-10 6L2 8zm-10 12 10 6 10-6M2 18l10 6 10-6',star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[id]||paths.book)+'"/></svg>';
 let configuredBefore=false;const features=new Set(['chart_tools','breadth','fhedge','themes','etfsim','etfx','screen','learning','favorites']);
 let catalog=null,permissions=null,owner='',inflight=null,received=0,expires=Infinity,epoch=0;
 const token=()=>{try{return localStorage.getItem('sb_token')||'';}catch{return '';}};
 async function call(action){const t=token(),response=await fetch((window.__API||'')+'/api/auth',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:JSON.stringify({action})});const result=await response.json();if(!response.ok)throw Error(result.error||'會員方案暫時無法載入');return result;}
 function notify(){dispatchEvent(new Event('academy-catalog-changed'));}
 async function refresh(){
  if(inflight)return inflight;
  const t=token(),id=epoch;
  inflight=(async()=>{try{const [c,a]=await Promise.all([call('membership_catalog'),t?call('membership_access').catch(()=>null):null]);if(id!==epoch||t!==token())return;if(!c||!Array.isArray(c.products)||!Number.isSafeInteger(c.revision))throw Error('invalid catalog');catalog=c;configuredBefore=configuredBefore||c.revision>0;permissions=a;owner=t;received=performance.now();expires=a?.next_change_at?Date.parse(a.next_change_at)-Date.parse(a.server_time)+received:Infinity;notify();}catch{if(id===epoch){catalog=null;permissions=null;owner=t;notify();}}finally{if(id===epoch)inflight=null;}})();
  return inflight;
 }
 function allowed(feature){
  if(!features.has(feature))return undefined;
  if(window._isOwner||window._isAdmin)return true;
  if(!catalog)return configuredBefore?false:undefined;if(catalog.revision===0)return undefined; // Legacy site remains usable before migration/configuration.
  if(owner!==token()||!permissions||performance.now()>=expires||performance.now()-received>45000)return false;
  return permissions.configured?permissions.features.includes(feature):undefined;
 }
 function reset(){epoch++;catalog=null;permissions=null;inflight=null;expires=Infinity;refresh();}
 window.AcademyMemberCatalog={refresh,allowed,icon,esc,get:()=>catalog,icons:Object.keys(paths)};
 addEventListener('academy-auth-changed',reset);
 addEventListener('storage',e=>{if(['sb_token','sb_user'].includes(e.key)||e.key===null)reset();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 setInterval(()=>{if(!document.hidden)refresh();},30000);
 refresh();
})();
