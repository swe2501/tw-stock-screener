/* Read-only account ledger. Balances and dates come from the existing server. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const time=v=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(v));
 const number=v=>v.toLocaleString('zh-TW');
 const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({task:'<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4V2h6v2M9 12l2 2 4-4M9 18h6"/>',stored:'<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14V8H6a2 2 0 0 1 0-4"/><path d="M20 12h-5v5h5M16 14.5h1"/>'}[name])+'</svg>';
 const source=r=>{const k=r.source_event_key||'';return k.startsWith('task:')?'任務獎勵':k.startsWith('points-exchange:')?'票券兌換':k.startsWith('referral:')?'邀請獎勵':'其他異動';};
 function render({main,go}){
  const token=localStorage.getItem('sb_token');
  main.innerHTML=`<div class="mw-root"><header class="mw-heading"><div><span class="mc-kicker">YOUR POINTS, CLEARLY RECORDED</span><h2>點數帳戶</h2><p>每一份獲得與使用，都有跡可循。</p></div><button type="button" data-mw-refresh>重新整理</button></header><div class="mw-tabs" role="tablist" aria-label="點數帳戶類型">${['task','stored'].map((id,i)=>`<button type="button" role="tab" id="mw-tab-${id}" aria-controls="mw-panel" aria-selected="${!i}" tabindex="${i?-1:0}" data-mw-tab="${id}">${icon(id)}<span>${i?'儲值點數':'任務獲得'}<small>${i?'儲值與消費':'獲得與使用'}</small></span></button>`).join('')}</div><section class="mw-balance" aria-label="帳戶餘額"><div><span data-mw-balance-title>任務點數 · 可用餘額</span><strong data-mw-balance>確認中</strong><small data-mw-sync>正在向帳號服務核對</small></div><div class="mw-balance-note" data-mw-balance-note></div></section><section class="mc-card mw-panel" id="mw-panel" role="tabpanel" aria-labelledby="mw-tab-task"><div data-mw-panel></div></section><section class="mw-rights"><div><span class="mc-kicker">CLEAR & TRACEABLE</span><h3>核對紀錄，安心使用</h3><p>如有點數疑問，請提供紀錄編號、入帳時間與異動內容，透過「我的回饋」聯絡我們。</p></div><button type="button" data-mw-feedback>點數紀錄有疑問 →</button></section></div>`;
  const root=main.querySelector('.mw-root'),panel=root.querySelector('[data-mw-panel]'),balance=root.querySelector('[data-mw-balance]'),sync=root.querySelector('[data-mw-sync]');
  const current=()=>root.isConnected&&!!token&&token===localStorage.getItem('sb_token');
  let tab='task',summary=null,rows=[],more=false,busy=false,version=0,summaryVersion=0,filters={start:'',end:'',kind:'all'},until='';
  root.querySelector('[data-mw-feedback]').onclick=()=>go('feedback');
  function balancePaint(){
   const task=tab==='task',value=task?summary?.task_points:summary?.stored_points;
   root.querySelector('[data-mw-balance-title]').textContent=(task?'任務獲得的點數':'儲值點數')+' · 可用餘額';
   balance.textContent=!summary?'尚未取得':!task&&!summary.stored_enabled?'尚未開放':Number.isSafeInteger(value)?number(value)+' 點':'尚未接通';
   sync.textContent=summary?'核對時間 '+time(summary.server_time)+'（台灣時間）':'無法核對餘額，請重新整理';
   root.querySelector('[data-mw-balance-note]').textContent=task?'和儲值的點數是同一種，兌換價格一樣。\n點數不能換現金、不能轉讓。':'儲值服務尚未開放，目前不收取款項。\n開放後 NT$1＝10 點，和任務點數同一種。';
  }
  function draw(){
   balancePaint();root.querySelector('#mw-panel').setAttribute('aria-labelledby','mw-tab-'+tab);
   if(tab==='stored'){
    panel.innerHTML=`<div class="mw-section-head"><div><h3>儲值紀錄</h3><p>付款、入點、使用與退款，應分別核對。</p></div><span class="mw-badge">尚未開放</span></div><div class="mw-empty">${icon('stored')}<h3>目前尚未提供儲值服務</h3><p>尚無可查詢的儲值交易；未建立付款訂單，也未收取款項。</p></div><details class="mw-disclosure"><summary>未來儲值紀錄需要包含哪些資訊？</summary><p>正式開放前，需接上訂單編號、付款日期時間、實付金額與幣別、點數換算、付款方式、付款狀態、入點時間、使用明細及退款／扣回紀錄。</p><p>點數使用範圍、效期與退款規則，會在開放前明確提供。目前沒有付款服務，這些欄位尚無伺服器資料。</p></details>`;
    return;
   }
   panel.innerHTML=`<div class="mw-section-head"><div><h3>點數明細（任務獲得）</h3><p>獲得來源、兌換用途與伺服器入帳時間。</p></div><button type="button" data-mw-export disabled>下載已載入紀錄</button></div><form class="mw-filter"><label>開始日期<input name="start" type="date" value="${esc(filters.start)}"></label><label>結束日期<input name="end" type="date" value="${esc(filters.end)}"></label><label>異動類型<select name="kind"><option value="all">全部紀錄</option><option value="earned">獲得點數</option><option value="used">使用點數</option></select></label><button class="mc-primary" type="submit">查詢</button><button type="button" data-mw-reset>清除</button></form><p class="mw-status" role="status" aria-live="polite" data-mw-status></p><div data-mw-list></div><div class="mw-list-foot"><small data-mw-count></small><button type="button" data-mw-more hidden>載入更多紀錄</button></div><details class="mw-disclosure"><summary>點數紀錄與查詢說明</summary><p>日期時間使用台灣時間（UTC+8），以伺服器實際入帳時間為準。餘額由帳號服務查詢全部流水，不以目前載入的紀錄加總代替。</p><p>此頁僅供查看，不提供修改或刪除。每筆都有獨立紀錄編號；正數為增加，負數為扣點。未標示到期日的紀錄不代表永久有效，目前流水尚無逐筆效期、沖銷關聯或交易後餘額欄位。</p><p>一次載入 50 筆，可持續查閱更早紀錄；下載僅包含目前篩選後已載入的筆數。重新整理會取得新的核對時間；查詢期間新入帳的紀錄請重新整理查看。</p></details>`;
   panel.querySelector('select').value=filters.kind;
   panel.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.target;filters={start:f.elements.start.value,end:f.elements.end.value,kind:f.elements.kind.value};load(true);};
   panel.querySelector('[data-mw-reset]').onclick=()=>{filters={start:'',end:'',kind:'all'};draw();load(true);};
   panel.querySelector('[data-mw-more]').onclick=()=>load(false);
   panel.querySelector('[data-mw-export]').onclick=exportRows;
   paintRows();
  }
  function paintRows(){
   if(tab!=='task')return;
   const list=panel.querySelector('[data-mw-list]');
   list.innerHTML=rows.length?`<div class="mw-ledger-head" aria-hidden="true"><span>日期與時間</span><span>獲得來源／使用內容</span><span>點數異動</span><span>明細</span></div>`+rows.map(r=>`<article class="mw-entry"><time datetime="${esc(r.created_at)}">${esc(time(r.created_at))}<small>台灣時間</small></time><div class="mw-entry-content"><span class="mw-source">${source(r)}</span><b>${esc(r.description)}</b></div><strong class="mw-delta ${r.points>0?'mw-plus':'mw-minus'}">${r.points>0?'+':''}${number(r.points)}<small>點</small></strong><button type="button" class="mw-more-btn" aria-expanded="false" data-mw-detail>明細</button><dl class="mw-more" hidden><div><dt>入帳時間</dt><dd>${esc(time(r.created_at))}（台灣時間）</dd></div><div><dt>狀態</dt><dd>已入帳</dd></div><div><dt>異動內容</dt><dd>${esc(r.description)}</dd></div><div><dt>紀錄編號</dt><dd><code title="${esc(r.id)}">${esc(String(r.id).slice(0,8))}…</code> <button type="button" class="mw-copy" data-mw-copy="${esc(r.id)}">複製</button></dd></div></dl></article>`).join(''):`<div class="mw-empty"><h3>${summary?'目前沒有符合條件的紀錄':'尚無法讀取紀錄'}</h3><p>${summary?'可調整查詢日期，或前往完成任務。':'請重新整理後再試；目前不能判定是否有點數異動。'}</p>${summary?'<button type="button" data-mw-tasks>查看會員任務 →</button>':''}</div>`;
   list.querySelector('[data-mw-tasks]')?.addEventListener('click',()=>go('tasks'));
   list.onclick=async e=>{const t=e.target.closest('[data-mw-detail]');if(t){const d=t.nextElementSibling,open=t.getAttribute('aria-expanded')!=='true';t.setAttribute('aria-expanded',String(open));t.textContent=open?'收合':'明細';d.hidden=!open;return;}const c=e.target.closest('[data-mw-copy]');if(c){try{await navigator.clipboard.writeText(c.dataset.mwCopy);c.textContent='已複製';setTimeout(()=>{c.textContent='複製';},1500);}catch{c.textContent='無法複製';}}};
   panel.querySelector('[data-mw-count]').textContent='已載入 '+rows.length+' 筆'+(more?' · 尚有更早紀錄':'');
   const b=panel.querySelector('[data-mw-more]');b.hidden=!more;b.disabled=busy;
   panel.querySelector('[data-mw-export]').disabled=!rows.length||busy;
  }
  async function load(reset){
   const n=++version;if(reset){rows=[];more=false;}busy=true;paintRows();
   const status=panel.querySelector('[data-mw-status]');status.textContent='正在讀取伺服器紀錄…';
   const query={...filters,until,before:reset?null:rows.at(-1)};
   try{if(!summary)throw Error('請先重新整理，取得伺服器核對時間');const result=await AcademyIdentity.walletHistory(query);if(!current()||n!==version||tab!=='task')return;rows=reset?result.rows:[...rows,...result.rows.filter(r=>!rows.some(x=>x.id===r.id))];more=result.has_more;status.textContent='紀錄已更新 · 查詢截至 '+time(until);}
   catch(e){if(!current()||n!==version||tab!=='task')return;status.textContent=e.message+'。未載入的紀錄無法核對。';if(reset)panel.querySelector('[data-mw-list]').innerHTML='<div class="mw-empty"><h3>紀錄讀取未完成</h3><p>這不代表沒有交易；請重新查詢。</p></div>';}
   finally{if(current()&&n===version&&tab==='task'){busy=false;if(rows.length||!status.textContent.includes('未載入'))paintRows();else{panel.querySelector('[data-mw-export]').disabled=true;panel.querySelector('[data-mw-more]').hidden=true;}}}
  }
  function exportRows(){
   if(!current()||busy||!rows.length)return;
   const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
   const data=[['紀錄編號','入帳時間（台灣 UTC+8）','來源分類','內容','異動點數','狀態','查詢核對時間'],...rows.map(r=>[r.id,time(r.created_at),source(r),r.description,r.points,'已入帳',time(until)])].map(a=>a.map(cell).join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob(['\uFEFF'+data],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='先見-任務點數-已載入'+rows.length+'筆.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  root.querySelectorAll('[data-mw-tab]').forEach((b,i,buttons)=>{
   b.onclick=()=>{if(!current()||tab===b.dataset.mwTab)return;tab=b.dataset.mwTab;version++;busy=false;buttons.forEach(x=>{x.setAttribute('aria-selected',String(x===b));x.tabIndex=x===b?0:-1;});draw();if(tab==='task')load(true);};
   b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=buttons[e.key==='Home'?0:e.key==='End'?1:1-i];next.focus();next.click();}};
  });
  async function refresh(){
   const n=++summaryVersion;version++;busy=false;summary=null;rows=[];more=false;draw();sync.textContent='正在向帳號服務核對…';
   const b=root.querySelector('[data-mw-refresh]');b.disabled=true;
   try{const s=await AcademyIdentity.walletSummary();if(!current()||n!==summaryVersion)return;if(!Number.isSafeInteger(s.task_points)||s.task_points<0||!Number.isFinite(Date.parse(s.server_time)))throw Error('餘額資料格式異常');summary=s;until=s.server_time;draw();if(tab==='task')await load(true);}
   catch(e){if(current()&&n===summaryVersion){sync.textContent=e.message;draw();panel.querySelector('[data-mw-status]')?.replaceChildren(document.createTextNode(e.message));}}
   finally{if(current())b.disabled=false;}
  }
  root.querySelector('[data-mw-refresh]').onclick=refresh;
  refresh();
 }
 window.AcademyWallet={render};
})();
