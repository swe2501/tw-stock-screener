/* Existing website capabilities only. Comparing a tier never changes authorization. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const legacyTiers=[
  {id:'free',name:'見習研究生',text:'登入後接續學習、篩選與個人研究紀錄。'},
  {id:'observation',name:'市場觀察員',text:'可進入多空廣度與外資溫度計完整頁面。'},
  {id:'research',name:'趨勢研究員',text:'包含已確認的研究頁面，專項授權另行核對。'},
  {id:'vip',name:'先見領航員',text:'查看帳號已開放的研究資訊與指定工具。'}
 ];

 let tiers=legacyTiers;
 function syncProducts(){const c=window.AcademyMemberCatalog?.get();tiers=c?c.products.map(p=>({...p,text:p.description})):legacyTiers;}
 function selectedTier(profile){return tiers.find(t=>t.tier===current(profile)||t.id===current(profile))||tiers[0];}
 // Prices are shown only by the server-backed checkout after payment is enabled.
 const marks=['<path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14"/>','<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M6 12l3-4 3 2 2-4"/>','<path d="M3 3v18h18M7 16l5-7 4 3 5-8M16 4h5v5"/>','<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><circle cx="12" cy="12" r="2"/>'];
 const icon=i=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+marks[i]+'</svg>';
 function cards(){return tiers.map((t,i)=>'<button type="button" class="mj-tier mb-level" data-mb-tier="'+esc(t.id)+'" aria-pressed="false"><span class="mb-tier-symbol">'+(window.AcademyMemberCatalog?.icon(t.icon||['book','compass','chart','spark'][i%4])||icon(i%4))+'</span><strong>'+esc(t.name)+'</strong><span class="mb-price">'+(t.purchasable?'NT$ '+Number(t.price_twd).toLocaleString():(t.tier||t.id)==='free'?'免費身分':'研究方案')+'</span><small>'+(t.purchasable?t.days+' 天 · '+(window.AcademyMemberCatalog.get().env==='sandbox'?'測試付款':'單次付款，不自動續訂'):'查看詳細權益')+'</small><span class="mb-tier-copy">'+esc(t.text)+'</span><span class="mb-tier-select">比較此方案 ↗</span></button>').join('');}
 const explanations=[
 '訪客也能看市場摘要、K 線與基本均線。專項資料仍依帳號授權，不因比較方案而開通。',
 '登入並開啟個股 K 圖，即可畫線、加入圖形註解與計算區間統計；專項行情資料仍依各自權限。',
 '完整頁提供網站現有的大盤多空分布研究；首頁摘要保留。指定工具券只在有效期間與授權範圍內使用。',
 '免費身分可看首頁摘要，完整頁需方案包含此功能或對應的有效工具授權；資料日期以頁面標示為準。',
 '查看網站現有的題材、產業分類與標的關係。內容以各頁資料時間為準，並非個股買賣建議。',
 '比較兩檔 ETF 的共同持股、權重與重疊程度；登入可用，不因比較額外扣任務點數。',
 '查看今日、近 5 日與近 10 日集中變化；依當期資料可用性呈現，未提供的歷史區間不列入會員承諾。',
 '沿用目前篩選操作。每週分級額度尚未啟用，規劃數字不代表目前已取得或已扣除次數。',
 '真名、隱藏式與私房未來規劃共用週額度。正式啟用前須能核對剩餘次數及重置時間；目前沿用既有方式。',
 '閱讀已上架的操作教學與導讀。目前尚未依四級身分拆分專屬課程，升級不代表取得尚未上架的內容。',
 '管理自己的自選、文字筆記與選股紀錄。原有資料保留，短期工具券不增加儲存容量；新的分級容量尚未啟用。',
 '所有會員都能提出問題或建議，不需付費升級。由回饋入口送出並依現有流程追蹤。'];
 function billingIntro(){syncProducts();let interest='';try{interest=sessionStorage.getItem('foresight.membership.interest')||'';}catch{}const tier=tiers.find(t=>t.id===interest);return '<section class="mc-card mb-billing-intro"><span class="mc-kicker">YOUR MEMBERSHIP</span><h2>先選權益，再確認付款</h2><p>'+(tier?'正在了解：<strong>'+tier.name+'</strong>。':'先比較四級會員權益，找到適合的研究方式。')+' 付款尚未開放時不顯示價格，也不提供購買。</p><p>可購買方案的名稱、期間與實付金額，以伺服器載入的繳費單為準。沒有可購買方案時即尚未開放；單次月期付款不等於自動續訂，測試付款不代表正式訂閱。</p><div class="mb-actions"><button type="button" data-mb-back>返回會員權益比較 ↗</button></div></section>';}
 const aliases={general:'free',free:'free',observation:'observation',choice:'observation',research:'research',advanced:'research',vip:'vip'};
 const rows=[
  {name:'首頁與基本 K 圖',group:'市場與圖表',detail:'市場摘要、基本均線與 K 線瀏覽；訪客也能查看。',status:'基本開放',route:'home'},
  {name:'K 圖分析工具',group:'市場與圖表',detail:'登入後可操作畫線、圖形註解與區間統計；專項資料仍依權限。',status:'登入可用'},
  {name:'大盤多空廣度',group:'市場與圖表',detail:'首頁摘要保留；完整頁面依所選方案包含的功能開放。',minimum:true,route:'breadth'},
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
  return legacyTiers.findLast(t=>values.includes(t.id))?.id||'free';
 }
 const featureFor=r=>r.route==='home'?null:r.route==='screen'?'screen':r.route||r.member||(r.name==='K 圖分析工具'?'chart_tools':null);
 const categories=['市場與圖表','題材與 ETF','篩選工具','個人研究'];
 function html(profile){
  syncProducts();const picked=selectedTier(profile);if(!picked)return '<section class="mc-card"><h2>會員方案與權益</h2><p>目前沒有上架中的會員方案；既有權益與使用券不受影響。</p></section>';const selected=picked.id,special=window.AcademyResearchTitle?.();
  return '<section class="mj-hero mb-hero"><div class="mb-watermark" aria-hidden="true"></div><span class="mc-kicker">MEMBERSHIP · YOUR ACCESS</span><h2>會員等級與權益</h2><p>你的研究日常，從這裡接續。</p><div class="mb-identity"><span>目前身分</span><strong data-mb-current>'+esc(special||legacyTiers.find(t=>t.id===current(profile))?.name||'見習研究生')+'</strong><small>實際授權與期限以帳號服務為準</small></div><div class="mb-account-strip"><div><span>任務點數</span><strong data-mb-points>讀取中</strong></div><div><span>使用券</span><strong data-mb-vouchers>讀取中</strong></div><div><span>使用券期限</span><strong data-mb-expiry>核對中</strong></div></div><div class="mb-actions"><button type="button" data-mj-go="tasks">任務與點數 ↗</button><button type="button" data-mj-go="gifts">查看使用券 ↗</button></div></section>'+
   '<section class="mc-card mb-comparison" data-mb-level="'+selected+'"><div class="mb-section-title"><h2>會員方案，權益一次看清楚</h2><p>切換比較身分，不會扣點或改變等級。</p></div><div class="mj-tier-grid mb-levels" role="group" aria-label="比較會員等級">'+cards()+'</div><div class="mb-comparing" aria-live="polite">正在比較：<strong data-mb-selected>'+tiers.find(t=>t.id===selected).name+'</strong></div><section class="mb-selected-detail" aria-live="polite"><h3 data-mb-detail-title></h3><p data-mb-detail-copy></p></section><div class="mb-categories" role="group" aria-label="權益分類">'+categories.map((c,i)=>'<button type="button" data-mb-category="'+i+'" aria-pressed="'+(i===0)+'">'+c+'</button>').join('')+'</div><div class="mb-plan-next"><div><strong>找到適合的研究方式</strong><p>查看方案不會扣款或改變身分；付款金額與期間以確認頁為準。</p></div><button type="button" data-mb-plan>查看方案與開放狀態 ↗</button></div><div class="mb-rows">'+rows.map((r,i)=>'<article class="mb-row" data-mb-row="'+i+'" '+(r.group===categories[0]?'':'hidden')+'><div><span class="mb-status" data-mb-status></span><h3>'+r.name+'</h3><p>'+r.detail+'</p><details class="mb-feature-detail"><summary>詳細解說</summary><p>'+explanations[i]+'</p></details></div><div class="mb-row-access">'+(r.route?'<button type="button" data-member-right-view="'+r.route+'" data-mb-action>前往查看 <span aria-hidden="true">↗</span></button>':r.member?'<button type="button" data-mj-go="'+r.member+'" data-mb-action>前往查看 <span aria-hidden="true">↗</span></button>':'<small>開啟 K 圖後使用</small>')+'</div></article>').join('')+'</div></section>'+
   '<section class="mc-card mb-notes"><details><summary>詳細權益與使用方式</summary><ul><li>點數由完成任務取得；兌換前先確認所需點數、有效天數與開放範圍，不會因瀏覽比較就扣點。</li><li>工具券僅提供核發範圍內的限時使用權，不代表永久升級，也不增加儲存容量。</li><li>有效授權到期且未續訂或兌換接續權益時，回到見習研究生；已有研究資料保留。</li><li>每週篩選次數與分級儲存容量尚未啟用；原有使用方式維持。</li></ul><div class="mb-actions"><button type="button" data-mj-go="privacy">資料與隱私 ↗</button></div></details></section>';
 }
 function paint(root,level){
  const tier=tiers.find(t=>t.id===level)||tiers[0];if(!tier)return;root.querySelector('[data-mb-detail-title]').textContent=tier.name+' · 詳細權益';root.querySelector('[data-mb-detail-copy]').textContent=tier.details||tier.text;const plan=root.querySelector('[data-mb-plan]');plan.textContent=tier.purchasable?'選擇此方案，前往確認 ↗':'查看方案與帳務 ↗';root.querySelector('.mb-comparison').dataset.mbLevel=tier.id;
  root.querySelector('[data-mb-selected]').textContent=tier.name;
  root.querySelectorAll('[data-mb-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mbTier===tier.id)));
  root.querySelectorAll('[data-mb-row]').forEach(el=>{const r=rows[+el.dataset.mbRow],allowed=tier.features?(!featureFor(r)||tier.features.includes(featureFor(r))):!r.internal&&(!r.minimum||tier.id!=='free'),status=el.querySelector('[data-mb-status]');status.textContent=tier.features&&featureFor(r)&&!allowed?'未包含此功能':r.minimum?(allowed?'完整頁面':'僅首頁摘要'):r.status;status.dataset.state=!allowed?'limited':r.internal?'closed':r.minimum&&!allowed?'limited':r.status==='額度準備中'?'pending':'available';const action=el.querySelector('[data-mb-action]');if(action)action.innerHTML=(!allowed?'查看所需權益':'前往查看')+' <span aria-hidden="true">↗</span>';if(action){action.dataset.mbRestricted=String(!allowed);}});
 }
 function mount(root){
  root._mbController?.abort();const controller=new AbortController();root._mbController=controller;
  const snapshot=window.AcademyMemberCatalog?.get();const rev=snapshot?.revision;const change=()=>{if(!root.isConnected){removeEventListener('academy-catalog-changed',change);return;}if(window.AcademyMemberCatalog?.get()?.revision!==rev){root.innerHTML=html({membership:{plan:current()}});mount(root);removeEventListener('academy-catalog-changed',change);}};addEventListener('academy-catalog-changed',change,{signal:controller.signal});
  const comparison=root.querySelector('.mb-comparison');if(!comparison)return;
  paint(root,comparison.dataset.mbLevel);
  root.addEventListener('click',e=>{const b=e.target.closest('[data-mb-tier]');if(b)paint(root,b.dataset.mbTier);const c=e.target.closest('[data-mb-category]');if(c){root.querySelectorAll('[data-mb-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===c)));root.querySelectorAll('[data-mb-row]').forEach(x=>x.hidden=rows[+x.dataset.mbRow].group!==categories[+c.dataset.mbCategory]);}const action=e.target.closest('[data-mb-restricted="true"]');if(action){e.stopImmediatePropagation();e.preventDefault();const target=tiers.find(t=>t.features?.includes(featureFor(rows[+action.closest('[data-mb-row]').dataset.mbRow])));if(target)paint(root,target.id);else window.showToast?.('目前上架方案未包含此功能。');}},{capture:true,signal:controller.signal});
  root.querySelector('[data-mb-plan]').addEventListener('click',()=>{try{const selected=tiers.find(t=>t.id===root.querySelector('.mb-comparison').dataset.mbLevel);sessionStorage.setItem('foresight.membership.interest',selected?.tier||selected?.id||'');sessionStorage.setItem('foresight.membership.plan',selected?.plan_code||'');sessionStorage.setItem('foresight.payment.method','line');}catch{}window.openMemberCenter?.('billing');},{signal:controller.signal});
  const owner=localStorage.getItem('sb_token'),valid=()=>root.isConnected&&owner===localStorage.getItem('sb_token');
  const fill=(selector,text)=>{const el=root.querySelector(selector);if(valid()&&el)el.textContent=text;};
  Promise.resolve().then(()=>window.AcademyIdentity.walletSummary()).then(w=>fill('[data-mb-points]',Number.isSafeInteger(w?.task_points)&&w.task_points>=0?w.task_points.toLocaleString()+' 點':'暫未取得')).catch(()=>fill('[data-mb-points]','暫未取得'));
  Promise.resolve().then(()=>window.AcademyIdentity.usageVouchers()).then(w=>{const now=Date.parse(w?.server_time);if(!Number.isFinite(now)||!Array.isArray(w?.rows))throw Error('invalid');const ready=w.rows.filter(v=>v.status==='ready'&&Date.parse(v.activation_deadline)>now).length,active=w.rows.filter(v=>v.status==='claimed'&&Date.parse(v.starts_at)<=now&&Date.parse(v.expires_at)>now);fill('[data-mb-vouchers]',ready+' 張待啟用 · '+active.length+' 張使用中');const expires=active.map(v=>Date.parse(v.expires_at));fill('[data-mb-expiry]',expires.length?'使用券至 '+new Date(Math.max(...expires)).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}):'無使用中券');}).catch(()=>{fill('[data-mb-vouchers]','暫未取得');fill('[data-mb-expiry]','請至使用券確認');});
 }
 window.AcademyMembershipBenefits={html,mount,billingIntro};
})();
