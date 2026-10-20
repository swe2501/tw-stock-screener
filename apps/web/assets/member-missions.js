/* Server-verified awards and transactional exchanges; no client-issued balance or points. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const valid=data=>Array.isArray(data?.rows)&&Number.isFinite(Date.parse(data.server_time));
 function mount(root,{profile,go}){
  const owner=localStorage.getItem('sb_token'),current=()=>root.isConnected&&owner===localStorage.getItem('sb_token');
  const section=document.createElement('section');section.className='mc-card mj-live-missions';section.innerHTML='<span class="mc-kicker">YOUR MEMBER REWARDS</span><h2>帳號任務與兌換</h2><p class="mj-copy">獎勵以帳號服務確認；兌換先存券，啟用才開始計時。</p><div role="status" data-mission-status aria-live="polite">正在確認可領任務與點數…</div><div data-mission-body></div>';
  root.querySelector('.mj-hero').after(section);const status=section.querySelector('[data-mission-status]'),body=section.querySelector('[data-mission-body]');let busy=false;
  async function load(){
   const results=await Promise.allSettled([AcademyIdentity.taskStatus(),AcademyIdentity.exchangeOptions(),AcademyIdentity.walletSummary()]);if(!current())return;
   if(results.some(r=>r.status!=='fulfilled')){status.textContent='任務與兌換服務尚未開放；下方可先查看任務與點數規劃。';return;}
   const [tasks,options,wallet]=results.map(r=>r.value);
   if(!valid(tasks)||!valid(options)||!Number.isSafeInteger(wallet.task_points)||wallet.task_points<0){status.textContent='尚未取得完整帳號資料，暫不開放領取或扣點。';return;}
   status.textContent='可用任務點數 '+wallet.task_points.toLocaleString()+' 點';
   body.innerHTML='<div class="mj-live-tasks">'+(tasks.rows.length?tasks.rows.map(t=>'<article><div><h3>'+esc(t.title)+'</h3><p>+'+Number(t.points)+' 點 · 每個帳號限領一次</p></div><button type="button" data-task-claim="'+esc(t.id)+'"'+(t.claimed||!t.eligible?' disabled':'')+'>'+(t.claimed?'已領取':t.eligible?'領取點數':'尚未達成')+'</button></article>').join(''):'<p class="mj-copy">目前沒有開放領取的任務。</p>')+'</div><h3>點數兌換使用券</h3><div class="mj-live-exchanges">'+(options.rows.length?options.rows.map(o=>'<details><summary>'+esc(o.title)+'<span>'+Number(o.points).toLocaleString()+' 點</span></summary><p>確認後扣除 '+Number(o.points).toLocaleString()+' 點，使用券將存入本帳號。一個月內啟用，啟用後享完整 '+Number(o.duration_days)+' 天。</p><button type="button" data-points-exchange="'+esc(o.id)+'"'+(wallet.task_points<o.points?' disabled':'')+'>'+(wallet.task_points<o.points?'點數不足':'確認兌換使用券')+'</button></details>').join(''):'<p class="mj-copy">兌換規則尚未開放，不會扣除點數。</p>')+'</div>';
   body.querySelectorAll('[data-task-claim]').forEach(b=>b.onclick=()=>perform(b,async()=>{const result=await AcademyIdentity.claimTask(b.dataset.taskClaim);if(!result?.id)throw Error('尚未收到領取結果，請重試。');return result.duplicate?'這個任務已領取，不重複發點。':'任務獎勵已入帳。';}));
   body.querySelectorAll('[data-points-exchange]').forEach(b=>b.onclick=()=>perform(b,async()=>{
    const key='academy.point-exchange.'+profile.id+'.'+b.dataset.pointsExchange;
    let request=sessionStorage.getItem(key);if(!request){request=crypto.randomUUID();sessionStorage.setItem(key,request);}
    const result=await AcademyIdentity.exchangePoints(b.dataset.pointsExchange,request);
    if(!result?.reward_id)throw Error('尚未確認兌換結果；重試會使用相同單號，不重複扣點。');
    if(current())sessionStorage.removeItem(key);
    return '使用券已存入帳號，尚未開始計時。';
   }));
  }
  async function perform(button,action){
   if(busy||!current())return;busy=true;button.disabled=true;status.textContent='正在確認，請稍候…';
   try{const message=await action();if(!current())return;await load();if(!current())return;status.textContent=message;const link=document.createElement('button');link.type='button';link.className='mj-link';link.textContent='查看我的使用券 →';link.onclick=()=>go('gifts');status.append(' ',link);window.dispatchEvent(new Event('academy-wallet-changed'));}
   catch(error){if(current()){status.textContent=error.message||'無法確認結果，請重試。';button.disabled=false;}}
   finally{busy=false;}
  }
  load();
 }
 window.AcademyMemberMissions={mount};
})();
