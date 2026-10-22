/* Account-authoritative rewards. Local activity only gates member-report tasks; it never issues points. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const valid=d=>Array.isArray(d?.rows)&&Number.isFinite(Date.parse(d.server_time));
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const serverOnly=new Set(['name-v1','preferences-v1','watch-v1','verify-contact-v1','invite-first-v1','birthday-v1','anniversary-v1']);
 const messages={MEMBER_TASK_LIMIT_REACHED:'今天（本週）從任務獲得的點數已達上限，請下期再來。',MEMBER_TASK_INCOMPLETE:'還沒完成這項任務，完成後再回來領取。',MEMBER_TASK_REVIEW_ONLY:'這項任務由管理端審核發點。',MEMBER_TASK_UNAVAILABLE:'這項任務尚未開放。',MEMBER_EXCHANGE_UNAVAILABLE:'這張使用券尚未開放兌換。',MEMBER_POINTS_INSUFFICIENT:'任務點數不足，請先確認最新餘額。'};
 const errorText=e=>messages[e.code]||Object.entries(messages).find(([k])=>String(e.message).includes(k))?.[1]||e.message||'無法確認結果，請稍後重試。';
 function mount(root,{profile,go,ready=()=>false}){
  root.querySelector('.mj-live-missions')?.remove();
  const owner=localStorage.getItem('sb_token'),current=()=>root.isConnected&&!!owner&&owner===localStorage.getItem('sb_token');
  const section=document.createElement('section');section.className='mc-card mj-live-missions';
  section.innerHTML='<div class="mj-section-head"><div><span class="mc-kicker">YOUR MEMBER REWARDS</span><h2>我的點數</h2></div><button type="button" data-rewards-refresh>更新狀態</button></div><div class="mj-reward-balance" data-reward-balance>確認餘額中…</div><div class="mj-reward-caps" data-reward-caps></div><div role="status" data-mission-status aria-live="polite">正在確認任務與兌換狀態…</div><div data-extra-tasks></div>';
  root.querySelector('.mj-hero').after(section);
  const status=section.querySelector('[data-mission-status]'),balance=section.querySelector('[data-reward-balance]'),caps=section.querySelector('[data-reward-caps]');
  let state=null,busy=false,sequence=0,dialog=null;
  const pendingKey=id=>'academy.point-exchange.'+profile.id+'.'+id;
  function pending(id){try{return sessionStorage.getItem(pendingKey(id));}catch{return null;}}
  function taskState(t,id){
   if(!current())return {text:'尚未完成',note:'請先登入會員帳號。',disabled:true};
   if(!state)return {text:'尚未完成',note:'尚未取得任務狀態，請更新狀態後再試。',disabled:true};
   if(/^(feedback|event)(-v1)?$/.test(id))return {text:'由管理端審核',note:'由管理端依案件審核發點，會員不能自行領取。',disabled:true};
   if(!t)return {text:'尚未完成',note:'尚未開放領點。',disabled:true};
   if(t.review_only)return {text:'由管理端審核',note:'審核通過後，點數由管理端發送。',disabled:true};
   if(t.id==='ad-video-v1')return {text:'尚未完成',note:'獎勵影片尚未接通，不開放領點。',disabled:true};
   if(t.claimed)return {text:'本期已領',note:'獎勵已入帳，下期狀態由伺服器確認。',disabled:true};
   const cap=state.tasks.caps?.[t.cap_group];
   if(cap&&integer(cap.used)&&integer(cap.limit)&&cap.used+t.points>cap.limit)return {text:'尚未完成',note:t.period==='weekly'?'本週點數已達上限。':'今日點數已達上限。',disabled:true};
   const eligible=t.eligible===true&&(serverOnly.has(t.id)||ready(id));
   return {text:eligible?'領取 +'+t.points+' 點':'尚未完成',note:eligible?'確認完成後，由帳號服務核發獎勵。':'完成任務後再回來領取；回報類需在此裝置有紀錄。',disabled:!eligible};
  }
  function paint(){
   root.querySelectorAll('[data-task-id]').forEach(card=>{
    const id=card.dataset.taskId,button=card.querySelector('[data-task-claim]');if(!button)return;
    if(id==='invite3'||id==='share3'){button.remove();card.querySelector('[data-task-state]').textContent='活動使用券請到邀請頁確認開放狀態。';return;}
    const t=state?.tasks.rows.find(t=>t.id===button.dataset.taskClaim),s=taskState(t,id);
    button.textContent=s.text;button.disabled=s.disabled||busy;card.querySelector('[data-task-state]').textContent=s.note;
    if(t)card.querySelector('.mj-task-bottom strong').textContent='+'+t.points+' 點';
   });
   root.querySelectorAll('[data-exchange-id]').forEach(card=>{
    const o=state?.options.rows.find(o=>o.id===card.dataset.exchangeId),button=card.querySelector('.mj-ticket-foot button');
    const retry=!!pending(card.dataset.exchangeId);button.dataset.pointsExchange=card.dataset.exchangeId;
    button.textContent=!current()?'請先登入':!o?'尚未開放兌換':retry?'確認上次兌換結果':state.wallet.task_points<o.points?'點數不足（還差 '+(o.points-state.wallet.task_points).toLocaleString()+' 點）':'兌換';
    button.disabled=busy||!current()||!o||(!retry&&state.wallet.task_points<o.points);
    if(o){const strong=card.querySelector('.mj-ticket-foot strong');strong.textContent=o.points.toLocaleString();card.querySelector('.mj-ticket-foot small').textContent='平均每天 '+Math.round(o.points/o.duration_days)+' 點';card.querySelector('.mj-ticket-days').textContent=o.duration_days+' 天';}
   });
   root.querySelectorAll('[data-exchange-state]').forEach(e=>e.textContent=!current()?'登入後查看':!state?'狀態待確認':state.options.rows.length?'依帳號開放項目兌換':'尚未開放');
   const policy=root.querySelector('[data-rewards-policy]');if(policy)policy.textContent=!state?'點數與開放項目以帳號服務為準；目前無法確認。':state.tasks.rows.length?'已接通帳號服務；僅開放項目可領點，實際點數以伺服器確認。':'帳號服務已接通，目前尚未開放任務領點。';
  }
  function extras(){
   const host=section.querySelector('[data-extra-tasks]');host.replaceChildren();
   if(!root.querySelector('.mj-task-zone'))return;
   (state?.tasks.rows||[]).filter(t=>t.id==='verify-contact-v1').forEach(t=>{
    const article=document.createElement('article');article.className='mj-extra-task';const info=document.createElement('div');const title=document.createElement('h3');title.textContent=t.title;info.append(title);const small=document.createElement('small');small.textContent='每個帳號一次，由帳號服務確認驗證狀態。';info.append(small);const b=document.createElement('button');b.type='button';b.dataset.taskClaim=t.id;const s=taskState(t,t.id);b.textContent=s.text;b.disabled=s.disabled||busy;article.append(info,b);host.append(article);
   });
  }
  async function load(){
   const ticket=++sequence;
   if(!current()){status.textContent='請先登入，才能查看與領取帳號獎勵。';balance.textContent='登入後查看餘額';paint();return false;}
   try{
    const [tasks,options,wallet]=await Promise.all([AcademyIdentity.taskStatus(),AcademyIdentity.exchangeOptions(),AcademyIdentity.walletSummary()]);
    if(!current()||ticket!==sequence)return false;
    if(!valid(tasks)||!valid(options)||!integer(wallet.task_points)||tasks.rows.some(t=>!t.id||!integer(t.points))||options.rows.some(o=>!o.id||!integer(o.points)||!Number.isSafeInteger(o.duration_days)||o.duration_days<=0))throw Error('帳號資料不完整，暫不開放領點或扣點。');
    state={tasks,options,wallet};balance.textContent='可用點數 '+wallet.task_points.toLocaleString()+' 點';
    caps.textContent=tasks.caps?['daily_research','weekly_research'].map((key,i)=>{const c=tasks.caps[key];return c&&integer(c.used)&&integer(c.limit)?(i?'本週 ':'今日 ')+c.used+'/'+c.limit+' 點':'';}).filter(Boolean).join(' · '):'任務上限以帳號服務確認';
    status.textContent='帳號狀態已更新。';extras();paint();return true;
   }catch(e){if(current()&&ticket===sequence){state=null;balance.textContent='餘額暫時無法確認';caps.textContent='';status.textContent=errorText(e);extras();paint();}return false;}
  }
  async function claim(button){
   const id=button.dataset.taskClaim,t=state?.tasks.rows.find(t=>t.id===id),localId=button.closest('[data-task-id]')?.dataset.taskId||id;
   if(busy||!current()||!t||taskState(t,localId).disabled)return;
   busy=true;paint();extras();status.textContent='正在確認任務獎勵…';
   try{const result=await AcademyIdentity.claimTask(id);if(!current())return;if(!result?.id)throw Error('尚未確認領取結果，請更新狀態後重試。');await load();if(current()){status.textContent=result.duplicate?'本期已領，不重複發點。':result.reward_id?'點數已入帳，附贈使用券已存入券夾，尚未開始計時。':'任務獎勵已入帳。';window.dispatchEvent(new Event('academy-wallet-changed'));}}
   catch(e){if(current()){await load();if(current())status.textContent=errorText(e);}}
   finally{busy=false;if(current()){paint();extras();}}
  }
  function confirmExchange(button){
   if(busy||!current())return;const id=button.dataset.pointsExchange,o=state?.options.rows.find(o=>o.id===id);if(!o)return;
   const retry=!!pending(id);if(!retry&&state.wallet.task_points<o.points)return;
   dialog?.remove();dialog=document.createElement('dialog');dialog.className='mj-exchange-dialog';dialog.setAttribute('aria-labelledby','mj-confirm-title');
   dialog.innerHTML='<h2 id="mj-confirm-title">'+(retry?'確認上次兌換結果':'確認兌換使用券')+'</h2><p>'+esc(o.title)+' · '+o.duration_days+' 天</p><p>'+(retry?'將使用原單號確認結果，不重複扣點。':'扣除 <b>'+o.points.toLocaleString()+' 點</b>，取得使用券 '+o.duration_days+' 天。')+'</p><p>使用券存進本帳號券夾；核發後一個日曆月內按「開始使用」，才開始計時，啟用後享完整 '+o.duration_days+' 天。</p><div class="mj-confirm-actions"><button type="button" data-cancel>取消</button><button type="button" data-confirm>確認'+(retry?'結果':'扣點兌換')+'</button></div><div role="status" data-exchange-message aria-live="polite"></div>';
   root.append(dialog);const thisDialog=dialog;
   thisDialog.querySelector('[data-cancel]').onclick=()=>thisDialog.close();
   thisDialog.addEventListener('close',()=>{if(current())button.focus();thisDialog.remove();});
   thisDialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
   thisDialog.querySelector('[data-confirm]').onclick=async()=>{
    if(busy||!current())return;busy=true;paint();thisDialog.querySelectorAll('button').forEach(b=>b.disabled=true);const message=thisDialog.querySelector('[data-exchange-message]');message.textContent='正在確認兌換，請稍候…';
    try{
     let request=pending(id);if(!request){request=crypto.randomUUID();sessionStorage.setItem(pendingKey(id),request);}
     const result=await AcademyIdentity.exchangePoints(id,request);if(!current())return;
     if(!result?.reward_id)throw Error('尚未確認兌換結果；重試會沿用原單號，不重複扣點。');
     sessionStorage.removeItem(pendingKey(id));await load();if(!current())return;
     window.dispatchEvent(new Event('academy-wallet-changed'));thisDialog.close();go('gifts');
    }catch(e){if(current()){message.textContent=errorText(e)+' 再次確認將沿用原單號。';thisDialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    finally{busy=false;if(current())paint();else thisDialog.remove();}
   };
   thisDialog.showModal();thisDialog.querySelector('[data-cancel]').focus();
  }
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.hasAttribute('data-task-claim'))claim(b);else if(b.hasAttribute('data-points-exchange'))confirmExchange(b);else if(b.hasAttribute('data-rewards-refresh')&&!busy)load();});
  paint();load();return {paint,load};
 }
 window.AcademyMemberMissions={mount};
})();
