/* 會員端：論壇現場簽到（?checkin=）、論壇場次視窗（?forum=1）、補發代碼兌換、站內廣告版位。
   全部經 /api/auth（lib/forum_ads.py）。簽到憑證 40 分鐘內有效，讓現場註冊／驗證的人也來得及。 */
(()=>{'use strict';
 const API=(window.__API||'')+'/api/auth',PASS_KEY='fs_forum_pass',CODE_RE=/^(TPE|TXG|KHH)\d{4}[A-Z]?-[A-Z0-9]{5}-[A-Z0-9]{4}$/;
 const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>{try{return localStorage.getItem('sb_token')||'';}catch{return '';}};
 const store={get(){try{const p=JSON.parse(localStorage.getItem(PASS_KEY)||'null');return p&&p.exp>Date.now()?p:null;}catch{return null;}},set(v){try{v?localStorage.setItem(PASS_KEY,JSON.stringify(v)):localStorage.removeItem(PASS_KEY);}catch{}}};
 async function call(action,extra){const t=token(),r=await fetch(API,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},t?{Authorization:'Bearer '+t}:{}),body:JSON.stringify(Object.assign({action},extra||{}))});let j={};try{j=await r.json();}catch{}if(!r.ok){const e=Error(j.error||'連線失敗，請稍後再試');e.code=j.code;throw e;}return j;}

 /* ── 簽到視窗 ── */
 let ov=null,watch=null;
 function sheet(html){if(!ov){ov=document.createElement('div');ov.className='fm-overlay';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','論壇簽到');document.body.append(ov);}ov.hidden=false;ov.innerHTML=`<div class="fm-card"><span class="fm-k">FORESIGHT・論壇簽到</span>${html}</div>`;return ov.querySelector('.fm-card');}
 function hide(){if(ov)ov.hidden=true;}
 function done(){clearInterval(watch);watch=null;if(ov){ov.remove();ov=null;}}
 function waitLogin(){clearInterval(watch);const before=token();watch=setInterval(()=>{const now=token();const authOpen=document.getElementById('authModal')?.classList.contains('open');if(now&&now!==before){clearInterval(watch);watch=null;setTimeout(render,400);}else if(!authOpen&&!now){clearInterval(watch);watch=null;render();}},800);}
 function render(){
  const p=store.get();if(!p){done();return;}
  const head=`<h2>${esc(p.label)}</h2>${p.venue?`<p class="fm-venue">${esc(p.venue)}</p>`:''}`;
  if(!token()){
   const c=sheet(head+`<p>請先登入會員，登入後回到這裡按「確認簽到」。<br><small>還沒有帳號？可以現場註冊，${Math.max(1,Math.round((p.exp-Date.now())/60000))} 分鐘內完成都有效。</small></p><div class="fm-acts"><button type="button" class="fm-primary" data-login>登入</button><button type="button" data-reg>註冊新帳號</button></div><button type="button" class="fm-text" data-later>稍後再說</button>`);
   const open=tab=>{hide();try{openAuthModal(tab);}catch{}waitLogin();};
   c.querySelector('[data-login]').onclick=()=>open('login');c.querySelector('[data-reg]').onclick=()=>open('register');c.querySelector('[data-later]').onclick=hide;return;
  }
  const c=sheet(head+`<p>確認是本人到場後按下簽到，<b>1,000 活動點數</b>會直接存入你的會員帳號。</p><div class="fm-acts"><button type="button" class="fm-primary" data-go>確認簽到</button></div><p class="fm-msg" role="status" data-msg></p><button type="button" class="fm-text" data-later>稍後再說</button>`);
  c.querySelector('[data-later]').onclick=hide;
  c.querySelector('[data-go]').onclick=async e=>{const b=e.currentTarget,m=c.querySelector('[data-msg]');b.disabled=true;m.textContent='簽到中…';
   try{const r=await call('forum_checkin',{pass:p.pass});store.set(null);success(r);}
   catch(err){m.textContent=err.message;b.disabled=false;
    if(err.code==='FORUM_ALREADY'||err.code==='FORUM_PASS_EXPIRED'||err.code==='FORUM_CLOSED'){store.set(null);b.remove();}
    if(err.code==='LOGIN_REQUIRED'){store.set(Object.assign({},p));render();}}};
 }
 function success(r){const c=sheet(`<div class="fm-ok" aria-hidden="true">✓</div><h2>${r.test?'測試簽到完成':'簽到完成'}</h2><p>${esc(r.message||'')}</p><p class="fm-venue">${esc(r.event||'')}</p><div class="fm-acts"><button type="button" class="fm-primary" data-close>好</button></div>`);c.querySelector('[data-close]').onclick=done;}
 async function openPass(raw){
  const [e,t]=raw.split('.');
  sheet('<h2>確認場次中…</h2>');
  try{const r=await call('forum_pass',{e,t});store.set({pass:r.pass,label:r.event,venue:r.venue,exp:Date.now()+(r.minutes||40)*60000-30000});render();}
  catch(err){const c=sheet(`<h2>無法簽到</h2><p>${esc(err.message)}</p><div class="fm-acts"><button type="button" class="fm-primary" data-close>知道了</button></div>`);c.querySelector('[data-close]').onclick=done;}
 }
 async function fromUrl(){
  const q=new URLSearchParams(location.search),raw=q.get('checkin'),forum=q.get('forum');
  if(raw||forum){let n=0;const skip=setInterval(()=>{try{if(window.FqiArrival?.active())window.FqiArrival.close();}catch{}if(++n>20)clearInterval(skip);},300);q.delete('checkin');q.delete('forum');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);}
  if(raw)await openPass(raw);
  else if(store.get())render();
  if(forum)openForum();
 }

 /* ── 論壇場次視窗 ── */
 async function openForum(){
  const c=sheet('<h2>線下論壇場次</h2><p>載入中…</p>');c.closest('.fm-overlay').setAttribute('aria-label','線下論壇場次');
  try{const r=await call('forum_events');const evs=r.events||[];
   const list=evs.length?evs.map(e=>`<li><div><b>${esc(e.city_name)}場</b>　${esc(e.date.slice(5).replace('-','/'))}（${'日一二三四五六'[new Date(e.date+'T12:00:00+08:00').getDay()]}）${esc(e.start)}–${esc(e.end)}${e.title?`<div class="fm-sub">${esc(e.title)}</div>`:''}${e.venue?`<div class="fm-sub">${esc(e.venue)}</div>`:''}</div>${e.signup_url?`<a class="fm-primary" href="${esc(e.signup_url)}" target="_blank" rel="noopener">報名</a>`:''}</li>`).join(''):'<li><span class="fm-sub">近期場次公布後會顯示在這裡。</span></li>';
   const c2=sheet(`<h2>線下論壇場次</h2><ul class="fm-events">${list}</ul><p class="fm-sub">${r.attended?'你已參加過論壇並領取到場點數。':'限會員參加，每人限參加一次；到場掃描簽到 QR，可獲得 1,000 活動點數（每人限領一次）。'}</p><div class="fm-acts"><button type="button" data-close>關閉</button></div>`);c2.querySelector('[data-close]').onclick=done;}
  catch(err){const c3=sheet(`<h2>線下論壇場次</h2><p>${esc(err.message)}</p><div class="fm-acts"><button type="button" data-close>關閉</button></div>`);c3.querySelector('[data-close]').onclick=done;}
 }
 window.ForumMember={openForum,openPass};

 /* ── 會員中心「活動兌換」：論壇補發代碼走這裡 ── */
 function patchRedeem(){const id=window.AcademyIdentity;if(!id||id.__forum)return !!id;const orig=id.redeemCode;
  id.redeemCode=async code=>{const c=String(code).trim().toUpperCase();if(!CODE_RE.test(c))return orig(code);
   try{const r=await call('forum_redeem',{code:c});return {item_id:'forum-points',kind:'points',title:(r.event?r.event+'・':'')+'1,000 活動點數已存入',duplicate:false};}
   catch(err){throw Error(err.message);}};
  id.__forum=true;return true;}
 if(!patchRedeem()){let n=0;const t=setInterval(()=>{if(patchRedeem()||++n>60)clearInterval(t);},500);}

 /* ── 站內廣告 ── */
 const DISMISS='fs_ad_dismiss';
 const dismissed=()=>{try{return JSON.parse(localStorage.getItem(DISMISS)||'{}');}catch{return {};}};
 function dismiss(id){const d=dismissed();d[id]=new Date().toISOString().slice(0,10);try{localStorage.setItem(DISMISS,JSON.stringify(d));}catch{}}
 let lastTok=null,adsCache=[];
 function adHtml(a,closable){return `<span class="site-ad-k">論壇</span><b>${esc(a.title)}</b>${a.text?`<span class="site-ad-t">${esc(a.text)}</span>`:''}<span class="site-ad-cta">${esc(a.cta||'了解更多')} →</span>${closable?'<button type="button" class="site-ad-x" aria-label="關閉這則公告">×</button>':''}`;}
 function mount(a){
  const anchors={top_bar:()=>document.getElementById('mainNav'),home_card:()=>document.getElementById('homeView'),results_top:()=>document.getElementById('resultsArea'),member_center:()=>document.querySelector('.mc-shell .mc-top'),corner:()=>document.body};
  const at=anchors[a.slot]&&anchors[a.slot]();if(!at)return;
  const closable=a.slot==='top_bar'||a.slot==='corner';
  const d=dismissed()[a.id];if(closable&&d&&(a.slot==='top_bar'||d===new Date().toISOString().slice(0,10)))return;
  const el=document.createElement('a');el.className='site-ad site-ad--'+a.slot;el.dataset.siteAd=a.id;el.href=a.url||'#';if(/^https:/.test(a.url))el.target='_blank',el.rel='noopener';
  el.innerHTML=adHtml(a,closable);
  el.addEventListener('click',e=>{if(e.target.closest('.site-ad-x')){e.preventDefault();dismiss(a.id);el.remove();return;}
   navigator.sendBeacon?.(API,new Blob([JSON.stringify({action:'ad_click',id:a.id})],{type:'application/json'}));
   if(/^\?forum=1/.test(a.url||'')||!a.url){e.preventDefault();openForum();}});
  if(a.slot==='top_bar')at.after(el);else if(a.slot==='home_card')at.prepend(el);else if(a.slot==='results_top')at.before(el);else if(a.slot==='member_center')at.after(el);else at.append(el);
 }
 function paint(){document.querySelectorAll('[data-site-ad]').forEach(x=>x.remove());adsCache.forEach(mount);}
 async function loadAds(){const t=token();if(t===lastTok)return;lastTok=t;try{const r=await call('site_ads');adsCache=r.ads||[];}catch{adsCache=[];}paint();}
 // 會員中心是動態產生的；出現時補上版位
 new MutationObserver(()=>{const a=adsCache.find(x=>x.slot==='member_center');if(a&&document.querySelector('.mc-shell .mc-top')&&!document.querySelector('[data-site-ad="'+a.id+'"]'))mount(a);}).observe(document.body,{childList:true});
 const start=()=>{fromUrl();loadAds();setInterval(loadAds,5000);};
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();
