/* Referral rewards are issued by the authenticated database RPC, never localStorage. */
(() => {
  'use strict';
  const FEATURES=new Set(['fhedge','breadth']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('sb_token')||'';
  let snapshot=null,ownerToken='',received=0,inflight=null,expiryTimer,returnFocus=null,pollTimer,lastAccess=false;
  const dialog=document.createElement('dialog');dialog.className='share-unlock';dialog.setAttribute('aria-labelledby','share-unlock-title');
  dialog.innerHTML=`<header class="share-unlock-head"><div><span class="share-eyebrow">SHARE · UNLOCK · ENJOY</span><h2 id="share-unlock-title">分享解鎖，立即使用</h2><p>把好用的工具，分享給一起研究的朋友。</p></div><button type="button" data-share-close aria-label="關閉分享解鎖">×</button></header>
    <div class="share-unlock-content"><div class="share-account" data-share-account role="status">正在確認分享資格…</div>
    <div class="share-rewards"><section class="share-reward"><span class="share-tag">分享體驗券 · 每人一次</span><h3>分享給 3 位 IG 好友</h3><div class="share-days"><strong>3</strong><span>天使用券</span></div><p>私訊分享給 3 位不同朋友，回來確認後取得使用券，啟用才開始計時。</p><label class="share-confirm"><input type="checkbox" data-share-confirm>我已分享給 3 位不同的 IG 好友</label><button type="button" class="share-primary" data-share-claim disabled>確認分享，領取 3 天券</button><small>採誠信確認；網站不讀取你的 IG 私訊。</small></section>
    <section class="share-reward share-reward-invite"><span class="share-tag">邀請使用券 · 每滿 3 人可再領</span><h3>發動態，邀請朋友加入</h3><div class="share-days"><strong>7</strong><span>天使用券</span></div><p>在動態放上專屬邀請連結，每邀請 3 位新朋友完成註冊驗證，即可獲得一張使用券。</p><div class="share-progress-label"><span>本輪有效邀請</span><b data-share-progress>—／3 位</b></div><progress data-share-meter max="3" value="0" aria-label="本輪有效邀請進度"></progress><small data-share-total>邀請碼由會員帳號核發，跨裝置保留同一組。</small><button type="button" class="share-secondary" data-share-refresh>更新邀請進度</button></section></div>
    <section class="share-link-box" aria-label="你的專屬邀請"><div><span>你的專屬邀請碼</span><strong data-share-code>登入後取得</strong></div><div class="share-link-actions"><button type="button" data-share-copy disabled>複製邀請連結</button><button type="button" data-share-send disabled>分享邀請</button></div><input data-share-link aria-label="專屬邀請連結，可手動複製" readonly hidden></section>
    <div class="share-voucher-actions"><button type="button" class="share-secondary" data-share-vouchers>前往我的使用券 →</button><small>使用券核發後一個月內啟用；啟用後保留完整天數。</small></div><p class="share-action-status" role="status" aria-live="polite" data-share-status></p>
    <details class="share-rules"><summary>分享規則與使用範圍</summary><ul><li>使用範圍：外資空單溫度計、大盤多空廣度；不包含管理功能、私有算法或其他專項授權。</li><li>3 天體驗每個會員限領一次，以本人確認已私訊分享給 3 位不同 IG 好友為依據。</li><li>7 天獎勵以邀請碼與有效新會員紀錄判定，不驗證動態發布，也不要求正面評價。</li><li>新朋友須在活動開始後註冊，並於註冊後 7 天內綁定邀請碼及完成活動要求的帳號驗證。每人只歸屬一位邀請人；自己邀請自己、重複帳號不計入。</li><li>每累積 3 位有效新會員，取得 7 天；同一位朋友只計算一次，未滿 3 位的進度會保留。</li><li>達標先核發待啟用券，核發後一個日曆月內可按「開始使用」；從啟用時起算完整 3／7 天。每張券獨立計時，同時啟用會重疊；未啟用可先保留。期限屆滿後，原有研究紀錄仍保留。</li><li>邀請進度於開啟、更新或重新登入時核對；活動暫停時停止新獎勵核發，已核發的使用期限不變。</li></ul></details></div>`;
  document.body.append(dialog);
  const el=s=>dialog.querySelector(s),message=text=>{el('[data-share-status]').textContent=text;};
  function remaining(){return snapshot?Date.parse(snapshot.expires_at)-Date.parse(snapshot.server_time)-(performance.now()-received):0;}
  function hasAccess(feature){return FEATURES.has(feature)&&ownerToken===token()&&!!token()&&snapshot?.has_access===true&&remaining()>0;}
  function notify(){
    const access=hasAccess('breadth'),changed=access!==lastAccess;lastAccess=access;
    const callbacks=[window._fhedgeApplyGate,window._breadthApplyGate];
    if(access&&changed){if(document.getElementById('fhedgeView')?.style.display!=='none')callbacks.push(window._fhedgeShow);if(document.getElementById('breadthView')?.style.display!=='none')callbacks.push(window._breadthShow);}
    for(const callback of callbacks)try{callback?.();}catch(error){console.warn('研究畫面更新未完成，請重新開啟該工具。',error);}
    window.dispatchEvent(new Event('academy-share-access-changed'));
  }
  function armExpiry(){clearTimeout(expiryTimer);if(snapshot?.has_access&&remaining()>0)expiryTimer=setTimeout(()=>{notify();paint();armExpiry();},Math.min(remaining()+30,2147483647));}
  function inviteLink(){if(!snapshot?.code||ownerToken!==token())return '';if(!['https:','http:'].includes(location.protocol))return '';const url=new URL(location.pathname,location.origin);url.searchParams.set('ref',snapshot.code);return url.href;}
  function paint(){
    const signed=!!token(),ready=!!snapshot&&ownerToken===token(),active=ready&&snapshot.campaign_active,verified=ready&&snapshot.verified;
    const account=el('[data-share-account]');account.replaceChildren();
    const text=document.createElement('span');text.textContent=!signed?'登入後取得專屬邀請碼，分享與獎勵紀錄會保存在帳號。':!ready?'分享獎勵服務尚未就緒，請稍後重試。':!active?'分享活動準備中，目前尚未開放領取。':!verified?(snapshot.requires_phone?'完成手機驗證後，即可參加分享獎勵。':'完成信箱或手機驗證後，即可參加分享獎勵。'):hasAccess('breadth')?'使用中 · 到期 '+new Date(snapshot.expires_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):snapshot.reward_delivery!=='voucher'?'使用券服務升級準備中，暫不開放新券領取。':'待啟用使用券 '+(snapshot.pending_vouchers||0)+' 張 · 前往我的使用券選擇啟用。';account.append(text);
    if(!signed){const b=document.createElement('button');b.type='button';b.textContent='登入／註冊';b.onclick=()=>{dialog.close();window.openAuthModal?.('login');};account.append(b);}
    else if(ready&&active&&!verified){const b=document.createElement('button');b.type='button';b.textContent='前往帳號驗證';b.onclick=()=>{dialog.close();window.openMemberCenter?.('security');};account.append(b);}
    el('[data-share-code]').textContent=ready?snapshot.code:signed?'尚未取得':'登入後取得';
    el('[data-share-confirm]').disabled=!active||!verified||snapshot?.reward_delivery!=='voucher'||snapshot?.trial_claimed||!!inflight;
    const claim=el('[data-share-claim]');claim.disabled=!active||!verified||snapshot?.reward_delivery!=='voucher'||snapshot?.trial_claimed||!el('[data-share-confirm]').checked||!!inflight;claim.textContent=snapshot?.trial_claimed?'3 天使用券已領取':'確認分享，領取 3 天券';
    const count=ready?snapshot.confirmed_count:0,progress=ready?Math.min(3,Math.max(0,count-snapshot.rewarded_groups*3)):0;
    el('[data-share-progress]').textContent=ready?progress+'／3 位':'—／3 位';el('[data-share-meter]').value=progress;
    el('[data-share-total]').textContent=ready?'累積有效邀請 '+count+' 位 · 已獲得 '+snapshot.rewarded_groups*7+' 天使用券（啟用後起算）':'邀請進度由伺服器確認，不會因為按分享就增加。';
    el('[data-share-copy]').disabled=el('[data-share-send]').disabled=!ready||!active||!inviteLink();
    el('[data-share-refresh]').disabled=!signed||!!inflight;
  }
  function validate(s){return s&&s.campaign==='share-v1'&&s.feature==='research_tools'&&/^[A-Z0-9]{6,20}$/.test(s.code)&&Number.isSafeInteger(s.confirmed_count)&&s.confirmed_count>=0&&Number.isSafeInteger(s.rewarded_groups)&&s.rewarded_groups>=0&&['campaign_active','requires_phone','verified','trial_claimed','has_access'].every(k=>typeof s[k]==='boolean')&&Number.isFinite(Date.parse(s.server_time))&&(s.expires_at===null||Number.isFinite(Date.parse(s.expires_at)));}
  async function refresh(claim=false){
    const current=token();if(!current){snapshot=null;ownerToken='';paint();notify();return null;}
    if(inflight){if(inflight.token===current&&!claim)return inflight.promise;await inflight.promise;if(token()!==current)return null;}
    const work={token:current};inflight=work;paint();message(claim?'正在確認並領取體驗…':'正在更新邀請與使用期限…');
    work.promise=(async()=>{
      let timeout;
      try{
        const request=claim?window.AcademyIdentity.claimShareTrial(el('[data-share-confirm]').checked):window.AcademyIdentity.shareUnlockStatus();
        const result=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('連線較久，請重試；重複操作不會重複領取。')),15000);})]);
        if(token()!==current||inflight!==work)return null;
        if(!validate(result))throw Error('分享服務回應異常，未更動你的使用權。');
        snapshot=result;ownerToken=current;received=performance.now();armExpiry();
        message(claim?'使用券已入帳；請到「禮遇與優惠券」選擇開始使用。':result.campaign_active?'邀請進度已更新。':'活動尚未開放，暫不核發新獎勵。');notify();return result;
      }catch(error){if(token()===current&&inflight===work){snapshot=null;ownerToken='';message(error.message||'無法更新，請稍後再試。');notify();}return null;}
      finally{clearTimeout(timeout);if(inflight===work){inflight=null;paint();}}
    })();return work.promise;
  }
  function open(){if(dialog.open){dialog.focus();return;}returnFocus=document.activeElement;el('[data-share-confirm]').checked=false;el('[data-share-link]').hidden=true;message('');paint();dialog.showModal();el('[data-share-close]').focus();refresh();pollTimer=setInterval(()=>{if(!document.hidden)refresh();},30000);}
  dialog.addEventListener('close',()=>{clearInterval(pollTimer);returnFocus?.isConnected&&returnFocus.focus();});
  el('[data-share-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  el('[data-share-confirm]').onchange=paint;
  el('[data-share-claim]').onclick=()=>refresh(true);
  el('[data-share-refresh]').onclick=()=>refresh();
  el('[data-share-vouchers]').onclick=()=>{dialog.close();if(token())window.openMemberCenter?.('gifts');else window.openAuthModal?.('login');};
  async function copy(){const link=inviteLink();if(!link)return;try{await navigator.clipboard.writeText(link);message('邀請連結已複製！可貼到 IG 私訊或動態連結貼紙。分享動作不會直接增加有效邀請人數。');}catch{const input=el('[data-share-link]');input.hidden=false;input.value=link;input.focus();input.select();message('請手動複製下方邀請連結，貼到 IG 私訊或動態。');}}
  el('[data-share-copy]').onclick=copy;
  el('[data-share-send]').onclick=async()=>{const link=inviteLink();if(!link)return;if(!navigator.share)return copy();try{await navigator.share({title:'先見量化智能 · 一起研究市場',text:'這些研究工具分享給你，一起來試試！',url:link});message('請確認分享對象；邀請人數以朋友完成註冊驗證為準。');}catch(e){if(e.name!=='AbortError')await copy();}};
  document.addEventListener('click',e=>{const target=e.target.closest('[data-share-unlock]');if(target){e.preventDefault();open();}});
  function sessionChanged(){snapshot=null;ownerToken='';clearTimeout(expiryTimer);paint();notify();if(token())refresh();}
  addEventListener('academy-auth-changed',sessionChanged);
  addEventListener('storage',e=>{if(e.key==='sb_token')sessionChanged();});
  addEventListener('focus',()=>{if(token()&&performance.now()-received>30000)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){notify();if(token())refresh();}});
  window.AcademyShareUnlock={open,refresh,hasAccess,syncSession:()=>{if(ownerToken!==token())sessionChanged();}};
  paint();if(token())refresh();
})();
