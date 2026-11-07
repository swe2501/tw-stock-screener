/* Guest interaction policy. UI only: protected services still verify the session. */
(() => {
 'use strict';
 function signed(){
  try{
   const token=localStorage.getItem('sb_token'),user=JSON.parse(localStorage.getItem('sb_user')||'null');
   if(!token||!user?.id)return false;
   if(token.split('.').length===3){const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const claims=JSON.parse(atob(part));if(typeof claims.exp==='number'&&claims.exp*1000<=Date.now())return false;}
   return true;
  }catch{return false;}
 }
 let prompted=0;
 function requireMember(message='登入會員後即可使用這項功能。'){
  if(signed())return true;
  if(Date.now()-prompted>500){prompted=Date.now();window.openAuthModal?.('login');window.showToast?.(message);}
  return false;
 }
 function canReadResearch(view){
  if(!['breadth','fhedge'].includes(view))return true;
  if(!signed())return false;
  if(window._isOwner||window._isAdmin)return true;
  const levels={free:0,general:0,observation:1,choice:1,research:2,advanced:3,vip:4};
  return Math.max(levels[window._memberTier]||0,levels[window.AcademyShareUnlock?.membershipTier?.()]||0)>=1;
 }
 function canNavigate(view){
  if(['home','screen'].includes(view))return true;
  if(!requireMember('登入會員後即可查看完整功能。'))return false;
  if(['sig','brank','brokertrack'].includes(view)&&!window._isOwner&&!window._isAdmin){window.showToast?.('不籌吃穿目前僅開放管理員使用。');return false;}
  if(!canReadResearch(view)){window.showToast?.('此完整研究頁面開放市場觀察員以上會員。首頁摘要仍可查看。');return false;}
  return true;
 }
 const controls='.chart-draw-console button,.chart-layer-toolbar button,.chart-feature-panel button,.chart-feature-panel input,.chart-feature-panel a,.chart-tool-btns button:not(.zoom-step-btn):not(#chartViewReset),.market-draw-tools button:not([data-draw=""]),#chartRulerViewControls button,#chartDrawingMenu button,.market-draw-menu button';
 function capture(event){
  if(signed())return;
  const homeAction=event.target.closest?.('#homeView button,#homeView a[href]');
  if(homeAction&&!/open(?:Index)?Chart\s*\(/.test(homeAction.getAttribute('onclick')||'')&&!homeAction.closest('.hx-card')){
   event.preventDefault();event.stopImmediatePropagation();
   if(event.type==='click')requireMember('登入會員後即可使用首頁的研究功能。');return;
  }
  const target=event.target.closest?.(controls);
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.type==='click'||event.type==='contextmenu')requireMember('登入會員後即可使用畫線與圖表分析工具。');
 }
 // Window capture runs before existing document/element tool handlers.
 addEventListener('click',capture,true);addEventListener('pointerdown',capture,true);addEventListener('contextmenu',capture,true);
 function sync(){
  const guest=!signed();document.documentElement.classList.toggle('is-guest',guest);
  if(guest){window._cancelChartTool?.();window.AcademyChartTools?.resetSelection();}
  document.querySelectorAll(controls).forEach(el=>{if(guest)el.setAttribute('data-guest-locked','');else el.removeAttribute('data-guest-locked');});
 }
 function setup(){
  const initial=location.hash.slice(1)||new URLSearchParams(location.search).get('view');
  if(!signed()&&initial&&!['home','screen'].includes(initial)&&!initial.startsWith('member/')){
   window._showView?.('home');requireMember('登入會員後即可查看完整功能。');
  }
  const toolbar=document.querySelector('#chartModal .chart-draw-console');
  if(toolbar&&!document.getElementById('guestChartNotice')){
   const note=document.createElement('p');note.id='guestChartNotice';note.className='guest-access-note';
   note.append('訪客可瀏覽 K 線與基本均線。');const b=document.createElement('button');b.type='button';b.textContent='登入使用分析工具';b.onclick=()=>requireMember();note.append(b);toolbar.after(note);
  }
  sync();
 }
 window.AcademyGuestAccess={signed,requireMember,canNavigate,canReadResearch,sync};
 addEventListener('academy-auth-changed',sync);
 addEventListener('storage',e=>{if(['sb_token','sb_user'].includes(e.key)||e.key===null)sync();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
