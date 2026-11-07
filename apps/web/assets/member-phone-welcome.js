/* Phone welcome reward: eligibility and issuance are confirmed by the account service. */
(() => {
 'use strict';
 let generation=0, timer, notice, inFlight=false;
 const identity=()=>window.AcademyIdentity;
 const owner=()=>localStorage.getItem('sb_token')||'';
 const user=()=>{try{return JSON.parse(localStorage.getItem('sb_user')||'null')?.id||'';}catch{return '';}};
 const close=()=>{notice?.remove();notice=null;};
 function dismissed(id){try{return sessionStorage.getItem('academy.phone-welcome.dismissed:'+id)==='1';}catch{return false;}}
 function show(s,id,ticket,attempt=0){
  if(ticket!==generation||user()!==id||dismissed(id))return;
  // Let an existing authentication/dialog flow finish; never take keyboard focus.
  const modalOpen=[...document.querySelectorAll('dialog[open],[aria-modal="true"]')].some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  if(modalOpen){if(attempt<30)timer=setTimeout(()=>show(s,id,ticket,attempt+1),1000);return;}
  const ready=!!s.reward_id&&s.reward_status==='ready';
  if(ready&&!(Date.parse(s.activation_deadline)>Date.parse(s.server_time)))return;
  close();notice=document.createElement('aside');notice.className='mpw-notice';notice.setAttribute('aria-label','會員迎新禮遇');
  notice.innerHTML='<button type="button" class="mpw-close" aria-label="稍後提醒">×</button><span class="mpw-eyebrow">MEMBER WELCOME</span><strong></strong><p></p><button type="button" class="mpw-action"></button>';
  notice.querySelector('strong').textContent=ready?'你的 5 天功能體驗券已入帳':'綁定手機，領取 5 天功能體驗';
  notice.querySelector('p').textContent=ready?'市場觀察員體驗券已放入「禮遇與優惠券」，由你選擇啟用時間。':'完成簡訊驗證，即可獲得市場觀察員體驗券。每個帳號限領一次，每支電話限綁定一個帳號。';
  const action=notice.querySelector('.mpw-action');action.textContent=ready?'查看我的使用券 ↗':'前往綁定手機 ↗';
  const dismiss=()=>{try{sessionStorage.setItem('academy.phone-welcome.dismissed:'+id,'1');}catch{}close();};
  notice.querySelector('.mpw-close').onclick=dismiss;
  action.onclick=()=>{if(user()!==id)return close();dismiss();if(typeof window.openMemberCenter==='function')window.openMemberCenter(ready?'gifts':'security');else location.hash=ready?'#member/gifts':'#member/security';};
  document.body.append(notice);
 }
 async function refresh(){
  const ticket=++generation;clearTimeout(timer);close();const token=owner(),id=user();
  if(!token||!id||!identity()?.phoneWelcomeStatus||inFlight){if(inFlight)timer=setTimeout(refresh,500);return;}
  inFlight=true;
  try{
   let s=await identity().phoneWelcomeStatus();
   if(ticket!==generation||owner()!==token||user()!==id||s?.version!==1)return;
   if(s.eligible===true&&s.phone_verified===true){
    // No local entitlement or points are minted; the server enforces both uniqueness rules.
    s=await identity().claimPhoneWelcome();
    if(ticket!==generation||owner()!==token||user()!==id)return;
    window.dispatchEvent(new Event('academy-rewards-changed'));
   }
   if(s.reward_id&&s.reward_status==='ready'){show(s,id,ticket);return;}
   if(s.active!==true||s.eligible!==true||s.phone_verified!==false||dismissed(id))return;
   const settings=await identity().settings();
   if(ticket!==generation||owner()!==token||user()!==id||!settings?.external?.phone)return;
   show(s,id,ticket);
  }catch{/* Missing migration, offline, or disabled campaign: do not advertise an unavailable gift. */}
  finally{inFlight=false;}
 }
 addEventListener('academy-auth-changed',refresh);
 addEventListener('academy-identity-linked',()=>{try{sessionStorage.removeItem('academy.phone-welcome.dismissed:'+user());}catch{}refresh();});
 addEventListener('storage',e=>{if(['sb_token','sb_user'].includes(e.key))refresh();});
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();
