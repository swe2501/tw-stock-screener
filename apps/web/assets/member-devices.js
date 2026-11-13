/* Browser sessions, not IP addresses. Admission is always decided by the server. */
(() => {
 'use strict';
 const rawFetch=window.fetch.bind(window),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state=null,owner='',pending=null,generation=0;
 const token=()=>localStorage.getItem('sb_token')||'';
 const label=()=>{const ua=navigator.userAgent;return (/Android|iPhone|iPad/i.test(ua)?'行動裝置':'電腦')+' · '+(/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':'Safari／瀏覽器');};
 async function call(operation='claim',target){
  const t=token();if(!t)return null;
  const response=await rawFetch((window.__API||'')+'/api/auth',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({action:'member_devices',operation,target,label:label()})});
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'裝置服務暫時無法使用'),{status:response.status});
  if(t!==token())return null;return result;
 }
 function announce(){dispatchEvent(new CustomEvent('academy-devices-changed',{detail:state}));render();}
 async function refresh(operation='claim',target){
  if(operation==='claim'&&pending)return pending;
  const epoch=generation,t=token();
  const run=(async()=>{try{const value=await call(operation,target);if(epoch===generation&&t===token()){state=value;owner=t;announce();}return value;}catch(error){if(epoch===generation){state={unavailable:true,error:error.message,allowed:false,enabled:state?.enabled===true};owner=t;announce();}throw error;}finally{if(epoch===generation)pending=null;}})();
  if(operation==='claim')pending=run;return run;
 }
 function section(){return document.querySelector('[data-device-manager]');}
 function render(){
  let host=section();if(!host){const security=document.querySelector('.mc-security');if(!security)return;host=document.createElement('section');host.className='mc-card';host.dataset.deviceManager='';security.after(host);}
  const d=state;
  host.innerHTML='<h2>登入裝置</h2>'+(d?.unavailable?'<p role="status">'+esc(d.error)+'</p><button type="button" data-device-retry>重新確認</button>':!d?'<p role="status">正在確認登入裝置…</p>':!d.enabled?'<p>裝置限制尚未啟用，目前不會依方案限制裝置數。</p>':'<p>你的方案可同時使用 <strong>'+d.limit+' 台</strong>。目前有 '+d.devices.length+' 台使用中。</p><p class="mc-muted">同一瀏覽器多個分頁算一台；不同瀏覽器、無痕視窗分別計算。切換網路不影響名額。停止使用後最多 5 分鐘釋放名額。帳號限本人使用。</p><ul class="md-device-list">'+d.devices.map(x=>'<li><div><strong>'+esc(x.label)+(x.current?' · 目前裝置':'')+'</strong><small>最近使用：'+esc(new Date(x.last_seen_at).toLocaleString('zh-TW'))+'</small></div><button type="button" data-device-revoke="'+esc(x.id)+'">'+(x.current?'停止這台使用':'移除此裝置')+'</button></li>').join('')+'</ul><button type="button" data-device-takeover>停止其他裝置，在這台繼續使用</button><p class="mc-muted">其他裝置會立即失去會員資料存取權；不會刪除研究資料。</p>');
  host.onclick=async e=>{const b=e.target.closest('button');if(!b)return;let operation=b.hasAttribute('data-device-takeover')?'takeover':b.hasAttribute('data-device-revoke')?'revoke':'claim';if(operation==='takeover'&&!confirm('確定停止其他裝置的會員存取，並在這台繼續使用？'))return;b.disabled=true;try{await refresh(operation,b.dataset.deviceRevoke);}catch{}finally{b.disabled=false;}};
 }
 function notice(){
  let el=document.querySelector('[data-device-notice]');
  const blocked=token()&&state?.enabled&&!state.allowed;
  if(!blocked){el?.remove();return;}
  if(!el){el=document.createElement('aside');el.dataset.deviceNotice='';el.setAttribute('role','alert');document.body.append(el);}
  el.innerHTML='<strong>目前裝置尚未取得使用名額</strong><p>你的方案可同時使用 '+state.limit+' 台。請管理登入裝置，或選擇在這台繼續使用。</p><a href="#member/security">管理登入裝置</a> <button type="button">在這台繼續使用</button> <a href="#member/billing">查看會員方案</a>';
  el.querySelector('button').onclick=async e=>{if(!confirm('確定停止其他裝置的會員存取，並在這台繼續使用？'))return;e.target.disabled=true;try{await refresh('takeover');}catch{}finally{e.target.disabled=false;}};
 }
 addEventListener('academy-devices-changed',notice);
 // Wait for admission before protected requests; API/Data API also enforce without JS.
 window.fetch=async(input,init={})=>{
  let url;try{url=new URL(typeof input==='string'?input:input.url,location.href);}catch{return rawFetch(input,init);}
  const headers=new Headers(init.headers||(typeof input==='object'?input.headers:undefined)),t=token();
  const bearer=headers.get('Authorization');
  const protectedPath=url.pathname.startsWith('/api/')||url.pathname.startsWith('/rest/v1/')||url.pathname.startsWith('/storage/v1/');
  let bypass=false;
  if(url.pathname==='/api/auth'){try{bypass=['member_devices','refresh','logout','membership_catalog'].includes(JSON.parse(init.body||'{}').action);}catch{}}
  if(t&&bearer==='Bearer '+t&&protectedPath&&!bypass){
   try{if(owner!==t||!state)await refresh();else if(pending)await pending;}catch{}
   if(t!==token())return new Response(JSON.stringify({code:'MEMBER_SESSION_CHANGED',error:'帳號已切換，請重新操作'}),{status:409,headers:{'Content-Type':'application/json'}});
   if(owner===t&&(state?.enabled&&(state.unavailable||!state.allowed))){notice();return new Response(JSON.stringify({error:state.error||'請先管理登入裝置',code:state.unavailable?'MEMBER_DEVICE_UNAVAILABLE':'MEMBER_DEVICE_LIMIT'}),{status:state.unavailable?503:409,headers:{'Content-Type':'application/json'}});}
  }
  const response=await rawFetch(input,init);
  if(response.status===409&&t&&protectedPath){try{const value=await response.clone().json();if(value.code==='MEMBER_DEVICE_LIMIT'||value.message==='MEMBER_DEVICE_LIMIT')refresh('status').catch(()=>{});}catch{}}
  return response;
 };
 function reset(){generation++;pending=null;state=null;owner='';notice();if(token())refresh().catch(()=>{});}
 window.AcademyMemberDevices={refresh,get:()=>state};
 addEventListener('academy-auth-changed',reset);addEventListener('storage',e=>{if(['sb_token','sb_user'].includes(e.key)||e.key===null)reset();});
 addEventListener('hashchange',()=>{render();if(location.hash==='#member/security'&&token())refresh('list').catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token())refresh().catch(()=>{});});
 new MutationObserver(()=>{if(document.querySelector('.mc-security')&&!section())render();}).observe(document.body,{childList:true,subtree:true});
 setInterval(()=>{if(!document.hidden&&token())refresh().catch(()=>{});},60000);
 reset();
})();
