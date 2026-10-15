/* Personal screening uses the exact same daily-bar rules as member backtesting. */
(() => {
 'use strict';
 const E=window.AcademyStrategyEngine;if(!E)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cat=document.querySelector('.sc-cat');if(!cat)return;
 const panel=document.createElement('section');panel.className='sc-panel ms-private-panel';panel.dataset.cat='private';panel.innerHTML='<details><summary><span>✦ 私房篩選器</span><small>我的選股邏輯</small></summary><div class="ms-private-content"><p>用自己的買進條件找股票，再用同一份策略回測。這一格獨立執行，不會混入上方其他篩選條件。</p><ol><li>建立策略：選擇均線、價量、RSI、MACD 或 KD，設定每個參數。</li><li>全市場篩選：以資料庫最新日線檢查買進條件。</li><li>驗證策略：選取結果，在會員中心加上賣出與風控後回測。</li></ol><label>我的策略<select data-private-strategy></select></label><p data-private-rules class="ms-private-rules"></p><div class="ms-private-actions"><button type="button" data-private-edit>建立／編輯策略</button><button type="button" data-private-run>篩選全市場股票</button><button type="button" data-private-cancel hidden>停止</button></div><p data-private-status role="status"></p><div data-private-results></div></div></details>';
 cat.append(panel);new MutationObserver(()=>{if(cat.lastElementChild!==panel)cat.append(panel);}).observe(cat,{childList:true});
 const select=panel.querySelector('select'),status=panel.querySelector('[data-private-status]'),results=panel.querySelector('[data-private-results]');let controller=null,job=0,renderedSignature='',activeSignature='';
 const memberId=()=>{try{return localStorage.getItem('sb_token')?JSON.parse(localStorage.getItem('sb_user')||'{}').id:null;}catch{return null;}};
 function strategies(){const id=memberId();if(!id)return [];try{return JSON.parse(localStorage.getItem('academy.research.v1.'+id)||'{}').strategies||[];}catch{return [];}}
 function refresh(){const old=select.value,all=strategies();select.innerHTML='<option value="">選擇已儲存策略</option>'+all.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');if(all.some(s=>s.id===old))select.value=old;else if(all.length)select.value=all[0].id;describe();if((results.hasChildNodes()&&renderedSignature!==JSON.stringify(chosen())+'|'+memberId())||(panel.querySelector('[data-private-run]').disabled&&activeSignature!==JSON.stringify(chosen())+'|'+memberId())){job++;controller?.abort();results.replaceChildren();status.textContent='策略已變更，請重新篩選';panel.querySelector('[data-private-run]').disabled=false;panel.querySelector('[data-private-cancel]').hidden=true;}}
 function chosen(){return strategies().find(s=>s.id===select.value);}
 function describe(){const s=chosen();panel.querySelector('[data-private-rules]').textContent=s?'買進條件（'+(s.entryMode==='all'?'全部符合':'任一符合')+'）：'+s.entry.map(E.describeRule).join(s.entryMode==='all'?'，而且 ':'，或 '):'尚無策略？按「建立／編輯策略」，可先挑範例，再修改成自己的條件。';}
 function edit(id){if(!memberId()){window.openAuthModal?.('login');return;}if(id)sessionStorage.setItem('academy.strategy.editId',id);window.openMemberCenter?.('strategy');}
 select.onchange=()=>{job++;controller?.abort();results.replaceChildren();status.textContent='';panel.querySelector('[data-private-run]').disabled=false;panel.querySelector('[data-private-cancel]').hidden=true;describe();};
 panel.querySelector('[data-private-edit]').onclick=()=>edit(select.value);
 panel.querySelector('details').addEventListener('toggle',e=>{if(e.target===panel.firstElementChild&&e.target.open)refresh();});
 addEventListener('academy-strategies-changed',refresh);addEventListener('storage',()=>{job++;controller?.abort();results.replaceChildren();status.textContent='';panel.querySelector('[data-private-run]').disabled=false;panel.querySelector('[data-private-cancel]').hidden=true;refresh();});addEventListener('academy-auth-changed',()=>{job++;controller?.abort();results.replaceChildren();status.textContent='';panel.querySelector('[data-private-run]').disabled=false;panel.querySelector('[data-private-cancel]').hidden=true;refresh();});
 panel.querySelector('[data-private-cancel]').onclick=()=>{controller?.abort();};
 results.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.privateChart)window.openChart?.(b.dataset.privateChart,window._names?.[b.dataset.privateChart]||b.dataset.privateChart);if(b.dataset.privateTest){sessionStorage.setItem('academy.backtest.seed',b.dataset.privateTest);edit(select.value);}};
 panel.querySelector('[data-private-run]').onclick=async()=>{
  if(!memberId()){window.openAuthModal?.('login');return;}const selected=chosen();if(!selected){status.textContent='請先建立並儲存策略，再選擇它。';return;}
  const strategy=JSON.parse(JSON.stringify(selected));try{E.validate(strategy);if(strategy.entry.some(r=>r.type==='always'))throw Error('買進持有不能當選股條件，請編輯策略，改用價格、均線或指標條件。');}catch(e){status.textContent=e.message;return;}
  controller?.abort();controller=new AbortController();const signal=controller.signal,run=++job,owner=memberId(),button=panel.querySelector('[data-private-run]'),cancel=panel.querySelector('[data-private-cancel]');activeSignature=JSON.stringify(strategy)+'|'+owner;button.disabled=true;cancel.hidden=false;results.replaceChildren();
  let done=0,matched=0,failed=0,short=0,stale=0,miss=0;const found=[];
  try{
   if(typeof SIG_SB_URL==='undefined'||typeof SIG_SB_ANON==='undefined')throw Error('行情服務尚未設定');
   const read=async query=>{const r=await fetch(SIG_SB_URL+'/rest/v1/price_window?'+query,{headers:{apikey:SIG_SB_ANON,Authorization:'Bearer '+SIG_SB_ANON},signal});if(!r.ok)throw Error('行情資料讀取失敗（'+r.status+'）');const rows=await r.json();if(!Array.isArray(rows))throw Error('行情資料格式異常');return rows;};
   status.textContent='確認最新日線資料…';const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
   const anchor=await read('select=trade_date&code=eq.2330&trade_date=lte.'+today+'&order=trade_date.desc&limit=400');if(!anchor.length)throw Error('缺少日線歷史資料');const date=anchor[0].trade_date,since=anchor.at(-1).trade_date;
   if(window._loadNames)await new Promise(resolve=>window._loadNames(resolve));signal.throwIfAborted();
   const codes=Object.keys(window._names||{}).filter(c=>/^\d{4}$/.test(c)&&+c>=1000&&!window._isEtf?.(c)&&window._mkt?.[c]!=='emerging').sort();if(!codes.length)throw Error('股票清單尚未載入');
   const report=()=>{if(run===job&&memberId()===owner)status.textContent=`資料日 ${date} · 已檢查 ${done}/${codes.length} 檔 · 符合 ${matched} · 不符合 ${miss} · 資料不足 ${short} · 非同日 ${stale} · 讀取失敗 ${failed}`;};
   let cursor=0;
   async function worker(){while(cursor<codes.length){signal.throwIfAborted();if(run!==job||memberId()!==owner)return;const batch=codes.slice(cursor,cursor+=20),byCode=new Map(batch.map(c=>[c,[]]));let unavailable=false;
    try{for(let offset=0;;offset+=1000){const q=new URLSearchParams({select:'code,trade_date,open,high,low,close,volume',code:'in.('+batch.join(',')+')',and:'(trade_date.gte.'+since+',trade_date.lte.'+date+')',order:'code.asc,trade_date.asc',limit:'1000',offset:String(offset)});const page=await read(q);for(const r of page)byCode.get(r.code)?.push({...r,time:r.trade_date});if(page.length<1000)break;}}
    catch(e){if(signal.aborted)throw e;unavailable=true;}
    for(const code of batch){if(unavailable){failed++;continue;}const rows=byCode.get(code);if(!rows.length){short++;continue;}if(rows.at(-1).time!==date){stale++;continue;}try{const r=E.scan(rows,strategy);if(!r.ready){short++;continue;}if(r.matched){matched++;found.push({code,close:rows.at(-1).close,checks:r.checks});}else miss++;}catch{short++;}}
    done+=batch.length;report();
   }}
   await Promise.all([worker(),worker(),worker()]);if(run!==job||memberId()!==owner)return;
   found.sort((a,b)=>a.code.localeCompare(b.code));renderedSignature=JSON.stringify(strategy)+'|'+owner;results.innerHTML=`<p class="ms-private-note">「${esc(strategy.name)}」 · ${date} 日線 · 以台積電最近日線日為共同資料日，只檢查買進條件。無資料與非同日股票不列為不符合；策略與分類目前保存在此瀏覽器，尚未跨裝置同步。</p>`+(found.length?'<div class="ms-private-table"><table><thead><tr><th>股票</th><th>收盤</th><th>符合條件</th><th>下一步</th></tr></thead><tbody>'+found.map(r=>`<tr><td>${esc(r.code)} ${esc(window._names[r.code])}</td><td>${Number(r.close).toLocaleString()}</td><td>${r.checks.filter(c=>c.matched).map(c=>esc(c.rule)).join('<br>')}</td><td><button type="button" data-private-chart="${r.code}">K 圖</button><button type="button" data-private-test="${r.code}">用此策略回測</button></td></tr>`).join('')+'</tbody></table></div>':'<p>本次可判斷的股票沒有符合條件者。</p>');
  }catch(e){if(run===job)status.textContent=signal.aborted?'已停止，本次未產生完整結果。':e.message;}finally{if(run===job){button.disabled=false;cancel.hidden=true;}}
 };
 refresh();
})();
