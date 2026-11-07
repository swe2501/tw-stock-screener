/* Existing website capabilities only. Comparing a tier never changes authorization. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tiers=[
  {id:'free',name:'見習研究生',text:'登入後接續學習、篩選與個人研究紀錄。'},
  {id:'observation',name:'市場觀察員',text:'可進入多空廣度與外資溫度計完整頁面。'},
  {id:'research',name:'趨勢研究員',text:'包含已確認的研究頁面，專項授權另行核對。'},
  {id:'vip',name:'先見領航員',text:'查看帳號已開放的研究資訊與指定工具。'}
 ];
 const aliases={general:'free',free:'free',observation:'observation',choice:'observation',research:'research',advanced:'research',vip:'vip'};
 const rows=[
  {name:'首頁與基本 K 圖',group:'市場與圖表',detail:'市場摘要、基本均線與 K 線瀏覽；訪客也能查看。',status:'基本開放',route:'home'},
  {name:'K 圖分析工具',group:'市場與圖表',detail:'登入後可操作畫線、圖形註解與區間統計；專項資料仍依權限。',status:'登入可用'},
  {name:'大盤多空廣度',group:'市場與圖表',detail:'完整研究頁面；見習研究生仍可看首頁摘要。',minimum:true,route:'breadth'},
  {name:'外資空單溫度計',group:'市場與圖表',detail:'完整研究頁面；見習研究生仍可看首頁摘要。',minimum:true,route:'fhedge'},
  {name:'題材列表與產業地圖',group:'題材與 ETF',detail:'查看網站已提供的題材、產業與標的資料。',status:'登入可看',route:'themes'},
  {name:'ETF 相似度與持股重疊',group:'題材與 ETF',detail:'選擇兩檔 ETF，比較共同持股與權重，不扣點。',status:'登入可看',route:'etfsim'},
  {name:'主動 ETF 集中變化',group:'題材與 ETF',detail:'查看今日、近 5 日與近 10 日集中變化；以當期資料可用性為準，不扣點。',status:'登入可看',route:'etfx'},
  {name:'篩選器與企業價值',group:'篩選工具',detail:'篩選股票與查看企業價值篩選結果；新增的每週分級額度尚未啟用。',status:'會員功能',route:'screen'},
  {name:'真名系列與私房篩選',group:'篩選工具',detail:'沿用現有篩選功能；每週體驗次數方案準備中，尚不顯示可用次數。',status:'額度準備中',route:'screen'},
  {name:'學習中心',group:'個人研究',detail:'登入後閱讀網站現有教學；尚未按會員等級拆分專屬課程。',status:'登入可看',member:'learning'},
  {name:'自選、筆記與選股紀錄',group:'個人研究',detail:'管理自己的研究內容；新的分級儲存容量尚未啟用，原有紀錄保留。',status:'會員功能',member:'favorites'},
  {name:'問題回饋',group:'個人研究',detail:'所有等級皆可提出問題與建議，不以等級限制回饋。',status:'所有會員',member:'feedback'}
 ];
 function current(profile){
  const values=[profile?.membership?.plan,window._memberTier,window.AcademyShareUnlock?.membershipTier?.()].map(x=>aliases[x]).filter(Boolean);
  return tiers.findLast(t=>values.includes(t.id))?.id||'free';
 }
 const categories=['市場與圖表','題材與 ETF','篩選工具','個人研究'];
 function html(profile){
  const selected=current(profile),special=window.AcademyResearchTitle?.();
  return '<section class="mj-hero mb-hero"><div class="mb-watermark" aria-hidden="true"></div><span class="mc-kicker">MEMBERSHIP · YOUR ACCESS</span><h2>會員等級與權益</h2><p>你的研究日常，從這裡接續。</p><div class="mb-identity"><span>目前身分</span><strong data-mb-current>'+esc(special||tiers.find(t=>t.id===selected).name)+'</strong><small>實際授權與期限以帳號服務為準</small></div><div class="mb-account-strip"><div><span>任務點數</span><strong data-mb-points>讀取中</strong></div><div><span>使用券</span><strong data-mb-vouchers>讀取中</strong></div><div><span>使用券期限</span><strong data-mb-expiry>核對中</strong></div></div><div class="mb-actions"><button type="button" data-mj-go="tasks">任務與點數 ↗</button><button type="button" data-mj-go="gifts">查看使用券 ↗</button></div></section>'+
   '<section class="mc-card mb-comparison" data-mb-level="'+selected+'"><div class="mb-section-title"><h2>四級權益，一次看清楚</h2><p>切換比較身分，不會扣點或改變等級。</p></div><div class="mj-tier-grid mb-levels" role="group" aria-label="比較會員等級">'+tiers.map(t=>'<button type="button" class="mj-tier mb-level" data-mb-tier="'+t.id+'" aria-pressed="'+(t.id===selected)+'">'+t.name+'</button>').join('')+'</div><div class="mb-comparing" aria-live="polite">正在比較：<strong data-mb-selected>'+tiers.find(t=>t.id===selected).name+'</strong></div><div class="mb-categories" role="group" aria-label="權益分類">'+categories.map((c,i)=>'<button type="button" data-mb-category="'+i+'" aria-pressed="'+(i===0)+'">'+c+'</button>').join('')+'</div><div class="mb-rows">'+rows.map((r,i)=>'<article class="mb-row" data-mb-row="'+i+'" '+(r.group===categories[0]?'':'hidden')+'><div><span class="mb-status" data-mb-status></span><h3>'+r.name+'</h3><p>'+r.detail+'</p></div><div class="mb-row-access">'+(r.route?'<button type="button" data-member-right-view="'+r.route+'" data-mb-action>前往查看 <span aria-hidden="true">↗</span></button>':r.member?'<button type="button" data-mj-go="'+r.member+'" data-mb-action>前往查看 <span aria-hidden="true">↗</span></button>':'<small>開啟 K 圖後使用</small>')+'</div></article>').join('')+'</div></section>'+
   '<section class="mc-card mb-notes"><details><summary>詳細權益與使用方式</summary><ul><li>點數由完成任務取得；兌換前先確認所需點數、有效天數與開放範圍，不會因瀏覽比較就扣點。</li><li>工具券僅提供核發範圍內的限時使用權，不代表永久升級，也不增加儲存容量。</li><li>有效授權到期且未續訂或兌換接續權益時，回到見習研究生；已有研究資料保留。</li><li>每週篩選次數與分級儲存容量尚未啟用；原有使用方式維持。</li></ul><div class="mb-actions"><button type="button" data-mj-go="privacy">資料與隱私 ↗</button></div></details></section>';
 }
 function paint(root,level){
  const tier=tiers.find(t=>t.id===level)||tiers[0];root.querySelector('.mb-comparison').dataset.mbLevel=tier.id;
  root.querySelector('[data-mb-selected]').textContent=tier.name;
  root.querySelectorAll('[data-mb-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mbTier===tier.id)));
  root.querySelectorAll('[data-mb-row]').forEach(el=>{const r=rows[+el.dataset.mbRow],allowed=!r.internal&&(!r.minimum||tier.id!=='free'),status=el.querySelector('[data-mb-status]');status.textContent=r.minimum?(allowed?'完整頁面':'僅首頁摘要'):r.status;status.dataset.state=r.internal?'closed':r.minimum&&!allowed?'limited':r.status==='額度準備中'?'pending':'available';const action=el.querySelector('[data-mb-action]');if(action)action.innerHTML=(r.minimum&&!allowed?'查看所需權益':'前往查看')+' <span aria-hidden="true">↗</span>';if(action&&r.minimum){action.dataset.mbRestricted=String(!allowed);}});
 }
 function mount(root){
  const comparison=root.querySelector('.mb-comparison');if(!comparison)return;
  paint(root,comparison.dataset.mbLevel);
  root.addEventListener('click',e=>{const b=e.target.closest('[data-mb-tier]');if(b)paint(root,b.dataset.mbTier);const c=e.target.closest('[data-mb-category]');if(c){root.querySelectorAll('[data-mb-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===c)));root.querySelectorAll('[data-mb-row]').forEach(x=>x.hidden=rows[+x.dataset.mbRow].group!==categories[+c.dataset.mbCategory]);}const action=e.target.closest('[data-mb-restricted="true"]');if(action){e.stopImmediatePropagation();paint(root,'observation');root.querySelector('[data-mb-selected]').textContent='市場觀察員起開放';}},true);
  const owner=localStorage.getItem('sb_token'),valid=()=>root.isConnected&&owner===localStorage.getItem('sb_token');
  const fill=(selector,text)=>{if(valid())root.querySelector(selector).textContent=text;};
  Promise.resolve().then(()=>window.AcademyIdentity.walletSummary()).then(w=>fill('[data-mb-points]',Number.isSafeInteger(w?.task_points)&&w.task_points>=0?w.task_points.toLocaleString()+' 點':'暫未取得')).catch(()=>fill('[data-mb-points]','暫未取得'));
  Promise.resolve().then(()=>window.AcademyIdentity.usageVouchers()).then(w=>{const now=Date.parse(w?.server_time);if(!Number.isFinite(now)||!Array.isArray(w?.rows))throw Error('invalid');const ready=w.rows.filter(v=>v.status==='ready'&&Date.parse(v.activation_deadline)>now).length,active=w.rows.filter(v=>v.status==='claimed'&&Date.parse(v.starts_at)<=now&&Date.parse(v.expires_at)>now);fill('[data-mb-vouchers]',ready+' 張待啟用 · '+active.length+' 張使用中');const expires=active.map(v=>Date.parse(v.expires_at));fill('[data-mb-expiry]',expires.length?'使用券至 '+new Date(Math.max(...expires)).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}):'無使用中券');}).catch(()=>{fill('[data-mb-vouchers]','暫未取得');fill('[data-mb-expiry]','請至使用券確認');});
 }
 window.AcademyMembershipBenefits={html,mount};
})();
