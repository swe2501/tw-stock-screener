/* Personal screening uses the exact same daily-bar rules as member backtesting.
   2026-10-21：改為勾選多個「已上架」策略（最多 8 個），可切換全部符合／任一符合。 */
(() => {
 'use strict';
const setLocal=(key,value)=>window.AcademyCloud?window.AcademyCloud.setItem(key,value):localStorage.setItem(key,value);

 const E=window.AcademyStrategyEngine;if(!E)return;
 const MAX=8;
 const D=window.AcademyStrategyDims||{isPublished:s=>s?.published!==false,main:()=>'tech',tags:()=>''};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cat=document.querySelector('.sc-cat');if(!cat)return;
 const panel=document.createElement('section');panel.className='sc-panel ms-private-panel';panel.dataset.cat='private';panel.innerHTML='<details><summary><span>✦ 私房篩選器</span><small>我的選股邏輯</small></summary><div class="ms-private-content"><p>用自己上架的策略找股票。這一格獨立執行，不會混入上方其他篩選條件。</p><ol><li>建立策略：在策略工作台設定條件、停損，回測後按「上架」。</li><li>勾選策略：最多 '+MAX+' 個，可選全部符合或任一符合。</li><li>全市場篩選：以資料庫最新日線檢查買進條件。</li></ol><div class="ms-private-pick"><div class="ms-private-pick-head"><b>已上架策略</b><small data-private-count></small><div class="ms-private-mode" role="group" aria-label="多個策略的關係"><button type="button" data-private-mode="all" aria-pressed="true">全部符合</button><button type="button" data-private-mode="any" aria-pressed="false">任一符合</button></div></div><div class="ms-private-list" data-private-list></div><p class="ms-private-foot" data-private-foot></p></div><p data-private-rules class="ms-private-rules"></p><div class="ms-private-actions"><button type="button" data-private-edit>建立／編輯策略</button><button type="button" data-private-run>篩選全市場股票</button><button type="button" data-private-cancel hidden>停止</button></div><p data-private-status role="status"></p><div data-private-results></div></div></details>';
 cat.append(panel);new MutationObserver(()=>{if(cat.lastElementChild!==panel)cat.append(panel);}).observe(cat,{childList:true});
 const list=panel.querySelector('[data-private-list]'),status=panel.querySelector('[data-private-status]'),results=panel.querySelector('[data-private-results]'),runButton=panel.querySelector('[data-private-run]'),cancelButton=panel.querySelector('[data-private-cancel]');
 let controller=null,job=0,renderedSignature='',activeSignature='',picked=[],mode='all';
 const memberId=()=>{try{return localStorage.getItem('sb_token')?JSON.parse(localStorage.getItem('sb_user')||'{}').id:null;}catch{return null;}};
 function allStrategies(){const id=memberId();if(!id)return [];try{const s=JSON.parse(localStorage.getItem('academy.research.v1.'+id)||'{}').strategies;return Array.isArray(s)?s.filter(x=>x&&x.id&&Array.isArray(x.entry)):[];}catch{return [];}}
 const strategies=()=>allStrategies().filter(D.isPublished);
 function loadPrefs(){try{const p=JSON.parse(localStorage.getItem('academy.private-screen.v1.'+memberId())||'{}');return {fresh:!Array.isArray(p.selected)&&!p.selectedStrategy,selected:Array.isArray(p.selected)?p.selected:(p.selectedStrategy?[p.selectedStrategy]:[]),mode:p.mode==='any'?'any':'all'};}catch{return {fresh:true,selected:[],mode:'all'};}}
 function savePrefs(){if(memberId())setLocal('academy.private-screen.v1.'+memberId(),JSON.stringify({selected:picked,mode}));}
 const chosen=()=>{const all=strategies();return picked.map(id=>all.find(s=>s.id===id)).filter(Boolean);};
 const signature=()=>JSON.stringify([mode,chosen()])+'|'+memberId();
 function reset(message=''){job++;controller?.abort();results.replaceChildren();status.textContent=message;runButton.disabled=false;cancelButton.hidden=true;}
 function paint(){
  const all=strategies(),drafts=allStrategies().length-all.length,ids=new Set(all.map(s=>s.id));picked=picked.filter(id=>ids.has(id)).slice(0,MAX);
  panel.querySelector('[data-private-count]').textContent=all.length?'已勾 '+picked.length+'／最多 '+MAX:'';
  panel.querySelectorAll('[data-private-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.privateMode===mode)));
  panel.querySelector('.ms-private-mode').hidden=all.length<2;
  list.innerHTML=all.length?all.map(s=>{const on=picked.includes(s.id),full=!on&&picked.length>=MAX;return `<label class="ms-private-item ms-dim-${esc(D.main(s))}"><input type="checkbox" data-private-pick="${esc(s.id)}"${on?' checked':''}${full?' disabled':''}><i aria-hidden="true"></i><span><b>${esc(s.name)}</b><span class="ms-lib-tags">${D.tags(s)}</span></span></label>`;}).join(''):'<p class="ms-private-empty">'+(memberId()?'還沒有上架的策略。到策略工作台建立策略、設定停損並按「上架」，就會出現在這裡。':'登入後可使用自己上架的策略篩選全市場。')+'</p>';
  panel.querySelector('[data-private-foot]').innerHTML=drafts>0?'另有 '+drafts+' 個未上架的策略。<button type="button" data-private-studio>前往策略工作台 →</button>':'';
  describe();
 }
 function describe(){const c=chosen();panel.querySelector('[data-private-rules]').textContent=!c.length?(strategies().length?'請勾選要使用的策略。':''):c.length===1?'買進條件（'+(c[0].entryMode==='all'?'全部符合':'任一符合')+'）：'+c[0].entry.map(E.describeRule).join(c[0].entryMode==='all'?'，而且 ':'，或 '):'已勾 '+c.length+' 個策略，'+(mode==='all'?'每檔股票要同時符合全部策略。':'符合任一策略就列出。');runButton.textContent=c.length>1?'用 '+c.length+' 個策略篩選全市場':'篩選全市場股票';}
 function refresh(){const prefs=loadPrefs();picked=prefs.selected;mode=prefs.mode;if(prefs.fresh&&strategies().length===1)picked=[strategies()[0].id];paint();if((results.hasChildNodes()&&renderedSignature!==signature())||(runButton.disabled&&activeSignature!==signature()))reset('策略已變更，請重新篩選');}
 function edit(id){if(!memberId()){window.openAuthModal?.('login');return;}if(id)sessionStorage.setItem('academy.strategy.editId',id);window.openMemberCenter?.('strategy');}
 list.onchange=e=>{const box=e.target.closest('[data-private-pick]');if(!box)return;const id=box.dataset.privatePick;picked=box.checked?[...picked.filter(x=>x!==id),id].slice(0,MAX):picked.filter(x=>x!==id);savePrefs();reset();paint();};
 panel.querySelector('.ms-private-mode').onclick=e=>{const b=e.target.closest('[data-private-mode]');if(!b||b.dataset.privateMode===mode)return;mode=b.dataset.privateMode;savePrefs();reset();paint();};
 panel.querySelector('[data-private-foot]').onclick=e=>{if(e.target.closest('[data-private-studio]'))edit(null);};
 panel.querySelector('[data-private-edit]').onclick=()=>edit(chosen()[0]?.id||null);
 panel.querySelector('details').addEventListener('toggle',e=>{if(e.target===panel.firstElementChild&&e.target.open){const id=memberId();if(id&&window.AcademyCloud)window.AcademyCloud.prepare(id).then(refresh);else refresh();}});
 addEventListener('academy-strategies-changed',refresh);addEventListener('storage',e=>{if(e.key&&!['sb_token','sb_user','academy.research.v1.'+memberId(),'academy.private-screen.v1.'+memberId()].includes(e.key))return;reset();refresh();});addEventListener('academy-auth-changed',()=>{picked=[];reset();refresh();});
 cancelButton.onclick=()=>{controller?.abort();};
 results.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.privateChart)window.openChart?.(b.dataset.privateChart,window._names?.[b.dataset.privateChart]||b.dataset.privateChart);if(b.dataset.privateTest){sessionStorage.setItem('academy.backtest.seed',b.dataset.privateTest);edit(b.dataset.privateStrategy||chosen()[0]?.id);}if(b.hasAttribute('data-private-any')){mode='any';savePrefs();paint();runButton.click();}};
 runButton.onclick=async()=>{
  if(!memberId()){window.openAuthModal?.('login');return;}const selected=chosen();if(!selected.length){status.textContent=strategies().length?'請先勾選至少一個策略。':'請先到策略工作台建立並上架策略。';return;}
  const picks=JSON.parse(JSON.stringify(selected)),runMode=mode;try{for(const s of picks){E.validate(s);if(s.entry.some(r=>r.type==='always'))throw Error('「'+s.name+'」使用買進持有，不能當選股條件，請編輯策略改用價格、均線或指標條件。');}}catch(e){status.textContent=e.message;return;}
  controller?.abort();controller=new AbortController();const signal=controller.signal,run=++job,owner=memberId();activeSignature=signature();runButton.disabled=true;cancelButton.hidden=false;results.replaceChildren();
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
    for(const code of batch){if(unavailable){failed++;continue;}const rows=byCode.get(code);if(!rows.length){short++;continue;}if(rows.at(-1).time!==date){stale++;continue;}
     const outcomes=picks.map(s=>{try{return {s,r:E.scan(rows,s)};}catch{return {s,r:{ready:false,matched:false,checks:[]}};}}),ready=outcomes.filter(o=>o.r.ready),hits=ready.filter(o=>o.r.matched);
     if(runMode==='all'?ready.length<outcomes.length:!ready.length){short++;continue;}
     if(runMode==='all'?hits.length===outcomes.length:hits.length>0){matched++;const last=rows.at(-1),prev=rows.at(-2),r2=v=>Number.isFinite(+v)?Math.round(+v*100)/100:null,pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?Math.round((a-b)/b*10000)/100:null;found.push({code,close:last.close,hits,bar:{code,name:window._names?.[code]||code,industry:'',open:r2(last.open),high:r2(last.high),low:r2(last.low),close:r2(last.close),change_pct:prev?pct(+last.close,+prev.close):null,candle_pct:pct(+last.close,+last.open)??0,volume_lots:Number.isFinite(+last.volume)?Math.round(+last.volume/1000):0}});}else miss++;}
    done+=batch.length;report();
   }}
   await Promise.all([worker(),worker(),worker()]);if(run!==job||memberId()!==owner)return;
   found.sort((a,b)=>b.hits.length-a.hits.length||a.code.localeCompare(b.code));renderedSignature=signature();
   const names=picks.map(s=>'「'+esc(s.name)+'」').join('、'),multi=picks.length>1,showHits=multi&&runMode==='any';
   const head=`<p class="ms-private-note">${names}${multi?' · '+(runMode==='all'?'全部符合':'任一符合'):''} · ${date} 日線 · 以台積電最近日線日為共同資料日，只檢查買進條件。無資料與非同日股票不列為不符合。</p>`;
   const cell=r=>multi?(showHits?`<td><span class="ms-private-hits">${r.hits.map(h=>`<span class="ms-dim ms-dim-${esc(D.main(h.s))} is-main">${esc(h.s.name)}</span>`).join('')}</span></td>`:''):`<td>${r.hits[0].r.checks.filter(c=>c.matched).map(c=>esc(c.rule)).join('<br>')}</td>`;
   const zeroHint=multi&&runMode==='all'?'<div class="ms-private-hint"><span>沒有股票同時符合全部 '+picks.length+' 個策略。</span><button type="button" data-private-any>改成任一符合再篩一次</button></div>':'<p>本次可判斷的股票沒有符合條件者。</p>';
   if(typeof window._showPrivateScreen==='function'){
    window._showPrivateScreen({date,count:found.length,total:codes.length,results:found.map(r=>r.bar)},{strategies:picks.map(s=>'私房：'+s.name),conditions:[multi?(runMode==='all'?'私房策略全部符合':'私房策略任一符合'):'私房策略'],label:'私房策略 '+picks.length+' 個'+(multi?'・'+(runMode==='all'?'全部符合':'任一符合'):'')});
    results.innerHTML=head+(found.length?'<p class="ms-private-moved">結果已顯示在右側「篩選結果」，可按「記錄今日選股」存進選股日曆。</p>':zeroHint);
    if(found.length){const tab=document.querySelector('.scal-mobile-tabs [data-pane="results"]');if(tab&&tab.offsetParent)tab.click();}
   }else results.innerHTML=head+(found.length?'<div class="ms-private-table"><table><thead><tr><th>股票</th><th>收盤</th>'+(multi?(showHits?'<th>符合策略</th>':''):'<th>符合條件</th>')+'<th>下一步</th></tr></thead><tbody>'+found.map(r=>`<tr><td>${esc(r.code)} ${esc(window._names[r.code])}</td><td>${Number(r.close).toLocaleString()}</td>${cell(r)}<td><button type="button" data-private-chart="${esc(r.code)}">K 圖</button><button type="button" data-private-test="${esc(r.code)}" data-private-strategy="${esc(r.hits[0].s.id)}">用此策略回測</button></td></tr>`).join('')+'</tbody></table></div>':zeroHint);
  }catch(e){if(run===job)status.textContent=signal.aborted?'已停止，本次未產生完整結果。':e.message;}finally{if(run===job){runButton.disabled=false;cancelButton.hidden=true;}}
 };
 refresh();
})();
