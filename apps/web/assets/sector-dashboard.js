/* Homepage sector gauges: factual period comparisons and an accessible detail dialog. */
(() => {
 'use strict';
 const M=window.AcademySectorModel;if(!M)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,d=1)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
 const signed=(v,d=1)=>{if(v===null)return '—';const rounded=Math.abs(v)<.5*10**(-d)?0:v;return (rounded>0?'+':'')+fmt(rounded,d);};
 const label=n=>n===1?'今日':n+'日',range=a=>a.from&&a.to?a.from+' ～ '+a.to+(a.ready?'':'（資料不足）'):'資料不足';
 const amount=v=>v===null?'—':fmt(v/1e8,2)+' 億';
 const periodOptions=n=>M.periods.map(p=>`<option value="${p}" ${p===n?'selected':''}>${label(p)}</option>`).join('');
 let model=null,host=null,n=1,key='elec',chartMode='share',returnFocus=null,retry=null;
 const dialog=document.createElement('dialog');dialog.className='sd-detail';dialog.setAttribute('aria-labelledby','sd-detail-title');document.body.append(dialog);
 const get=()=>model.compare(n);
 function comparisonLine(c){return `${c.n===1?'當日':'近 '+c.n+' 個交易日'}，對比${c.n===1?'前一交易日':'前 '+c.n+' 個交易日'} · ${c.mode==='weighted'?'成交金額加權占比':'每日占比平均（非金額加權）'}`;}
 function availability(c){
  const messages=[];
  if(!c.current.ready)messages.push(`本期需要 ${n} 個交易日，目前有 ${c.current.available} 日有效資料`);
  if(!c.previous.ready)messages.push(`前期需要 ${n} 個交易日，目前有 ${c.previous.available} 日有效資料`);
  if(model.latestSector!==model.anchor)messages.push('成交資料與交易日資料尚未完全對齊');
  if(model.latestMarket&&model.anchor&&model.latestMarket>model.anchor)messages.push('成交占比資料較指數資料晚更新，已依占比資料日對齊');
  return messages.join('；');
 }
 function priceText(c){return '加權同期'+(c.marketReturn===null?'漲跌資料不足':(c.marketReturn>0?'上漲 ':c.marketReturn<0?'下跌 ':'持平 ')+fmt(Math.abs(c.marketReturn),2)+'%')+(c.otcReturn===null?'':' · 櫃買 '+signed(c.otcReturn,2)+'%');}
 function headline(c){
  if(!c.current.ready)return '本期資料不足，尚無法完成週期判讀';
  if(!c.previous.ready)return '本期占比可查看，前期資料尚未齊備';
  const k=M.keys.reduce((a,b)=>Math.abs(c.changes[a].delta)>=Math.abs(c.changes[b].delta)?a:b);
  if(M.direction(c.changes[k].delta)==='flat')return '成交分布接近前期';
  const prefix=c.marketReturn===null?'':c.marketReturn>.005?'加權上漲，':c.marketReturn<-.005?'加權下跌，':'加權近乎持平，';
  return prefix+M.labels[k]+'成交比重'+(c.changes[k].delta>0?'提高':'降低');
 }
 function gauge(k,c){
  const value=c.current.shares?.[k]??null,delta=c.changes[k].delta;
  const dir=M.direction(delta),end=value===null?0:Math.min(100,Math.max(0,value));
  const angle=Math.PI*(1-end/100),x=80+60*Math.cos(angle),y=72-60*Math.sin(angle);
  return `<button type="button" class="sd-sector-card pro-gauge" data-sd-sector="${k}" aria-haspopup="dialog" aria-label="查看${M.labels[k]}${label(n)}成交比重明細">
   <span class="pro-gauge-head"><span class="pro-gauge-title">${M.labels[k]}</span><span class="sd-card-direction">${delta===null?'待比較':dir==='up'?'占比提高':dir==='down'?'占比降低':'接近前期'}</span></span>
   <svg class="pro-gauge-svg" viewBox="0 0 160 82" aria-hidden="true"><path class="pro-gauge-track" d="M20 72 A60 60 0 0 1 140 72"/><path class="pro-gauge-value" pathLength="100" stroke-dasharray="${end} 100" d="M20 72 A60 60 0 0 1 140 72"/>${value===null?'':`<circle class="pro-gauge-halo" cx="${x}" cy="${y}" r="6"/><circle class="pro-gauge-runner" cx="${x}" cy="${y}" r="3.7"/>`}<text class="pro-gauge-num" x="80" y="63" text-anchor="middle">${value===null?'—':fmt(value)+'%'}</text><text class="pro-gauge-caption" x="80" y="76" text-anchor="middle">${c.mode==='weighted'?'TURNOVER SHARE':'DAILY SHARE AVERAGE'}</text></svg>
   <span class="sd-card-compare"><span>前期占比<strong>${fmt(c.previous.shares?.[k]??null)}${c.previous.ready?'%':''}</strong></span><span>占比增減<strong>${signed(delta)}${delta===null?'':' 個百分點'}</strong></span></span>
   <span class="sd-card-money">成交金額較前期 ${c.changes[k].amountPct===null?'資料不足':signed(c.changes[k].amountPct,2)+'%'}</span><span class="sd-card-open">查看變化明細 <span aria-hidden="true">↗</span></span></button>`;
 }
 function render(){
  if(!host||!model)return;const c=get(),warning=availability(c);
  host.innerHTML=`<header class="sd-head"><div><span class="sd-eyebrow">MARKET STRUCTURE</span><h2>盤面結構判讀</h2><p>上市成交比重與變化</p></div><label class="sd-period"><span>比較週期</span><span class="sd-select-wrap"><select data-sd-period aria-label="成交比重比較週期">${periodOptions(n)}</select></span></label></header>
   <div class="sd-context"><span>${esc(comparisonLine(c))}</span><time>${esc(model.anchor||'交易日資料不足')}</time></div>
   <div class="sd-summary"><h3>${esc(headline(c))}</h3><p>${esc(priceText(c))}；價格方向與成交占比分開呈現，不推論資金淨流入。</p></div>
   ${warning?`<div class="sd-notice" role="status">${esc(warning)}。不足的期間不縮短、不補值。${retry?'<button type="button" data-sd-retry>重新讀取</button>':''}</div>`:''}
   <div class="sd-gauges">${M.keys.map(k=>gauge(k,c)).join('')}</div>
   <div class="sd-date-pair"><span><b>本期</b>${esc(range(c.current))}</span><span><b>前期</b>${esc(range(c.previous))}</span></div>`;
  if(dialog.open)renderDialog();
 }
 function stat(title,value,note=''){return `<div class="sd-stat"><span>${title}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;}
 function renderDialog(){
  const c=get(),d=c.changes[key],rank=model.rank(n,key),p=model.persistence(key),a=c.current.shares?.[key]??null,b=c.previous.shares?.[key]??null;
  const marketMoneyPct=c.current.total!==null&&c.previous.total>0?(c.current.total/c.previous.total-1)*100:null;
  const moneyDetail=d.amountPct===null||marketMoneyPct===null?'':`<p>${M.labels[key]}成交金額較前期 ${signed(d.amountPct,2)}%；上市成交總額 ${signed(marketMoneyPct,2)}%。</p>`;
  dialog.innerHTML=`<header class="sd-dialog-head"><div><span class="sd-eyebrow">TURNOVER DETAILS</span><h2 id="sd-detail-title">${M.labels[key]} · 成交比重明細</h2><p>${esc(comparisonLine(c))}</p></div><button type="button" data-sd-close aria-label="關閉成交比重明細">×</button></header>
   <div class="sd-dialog-body"><div class="sd-detail-toolbar"><label class="sd-period"><span>比較週期</span><span class="sd-select-wrap"><select data-sd-period aria-label="明細比較週期">${periodOptions(n)}</select></span></label><span>${esc(priceText(c))}</span></div>
   <section class="sd-detail-summary"><h3>${M.labels[key]}${d.delta===null?'比較資料不足':d.direction==='up'?'成交比重提高':d.direction==='down'?'成交比重降低':'成交比重接近前期'}</h3><p>${esc(model.explanation(c,key))}</p>${moneyDetail}</section>
   <div class="sd-stats">${stat('本期占比',fmt(a)+(a===null?'':'%'))}${stat('前期占比',fmt(b)+(b===null?'':'%'))}${stat('占比增減',signed(d.delta),d.delta===null?'完整前後期資料不足':'個百分點')}${stat('成交金額增減',d.amountPct===null?'—':signed(d.amountPct,2)+'%',c.previous.amounts?.[key]===0?'前期金額為 0，無法計算增幅':'相較前一個同長度週期')}</div>
   <div class="sd-date-pair"><span><b>本期</b>${esc(range(c.current))}</span><span><b>前期</b>${esc(range(c.previous))}</span></div>
   ${availability(c)?`<div class="sd-notice">${esc(availability(c))}。</div>`:''}
   <section class="sd-chart-section"><div class="sd-section-head"><h3>變化過程</h3><div class="sd-chart-switch" role="group" aria-label="歷史圖顯示內容"><button type="button" data-sd-mode="share" aria-pressed="${chartMode==='share'}">占比</button><button type="button" data-sd-mode="amount" aria-pressed="${chartMode==='amount'}">成交金額</button></div></div><div data-sd-chart></div></section>
   <section class="sd-period-section"><h3>各週期相較前期的變化</h3><div class="sd-period-grid">${M.periods.map(period=>{const v=model.compare(period),delta=v.changes[key].delta;return `<div class="sd-period-cell ${n===period?'is-selected':''}"><span>${label(period)}</span><strong>${signed(delta)}</strong><small>${delta===null?(!v.current.ready?'本期不足':'前期不足'):'個百分點'}</small></div>`;}).join('')}</div><p class="sd-fine">不同週期包含重疊交易日，用於觀察差異，不代表六個獨立訊號。</p></section>
   <section class="sd-evidence"><h3>延伸觀察</h3><div class="sd-evidence-grid"><div><span>自身歷史位置</span><p>${rank.value===null?'同週期歷史樣本不足，暫不分級。':`占比位於先前 ${rank.count} 筆同週期樣本第 ${fmt(rank.value,0)} 百分位。`}</p><small>至少 60 筆樣本，最多取 252 筆；不含本期。</small></div><div><span>近期持續性</span><p>最近 ${p.pairs} 次相鄰交易日比較，${p.rises} 次占比提高、${p.falls} 次降低。</p><small>逐日變化，與前後期比較分開計算。</small></div></div><p class="sd-fine">${M.labels[key]}類指數、類內漲跌家數與個股成交排名尚未取得，不以加權指數代替，也不推論少數權值股帶動。</p></section>
   <details class="sd-method"><summary>計算依據與原研究參考</summary><dl><dt>本期／前期成交金額</dt><dd>${amount(c.current.amounts?.[key]??null)} ／ ${amount(c.previous.amounts?.[key]??null)} 元</dd><dt>上市成交總額</dt><dd>${amount(c.current.total)} ／ ${amount(c.previous.total)} 元</dd><dt>占比計算</dt><dd>${c.mode==='weighted'?'同期間類別成交金額合計 ÷ 上市成交總額合計 × 100%。':'缺少完整金額，使用同期間每日成交占比的算術平均；不是成交金額加權占比。'}</dd><dt>週期價格漲跌</dt><dd>從本期開始前一交易日收盤，計算至本期最後交易日收盤；缺少完整邊界或交易日資料就不計算。</dd><dt>原研究門檻</dt><dd>電子 55／65／75／85%、金融 10%、最大單一傳產 15% 保留作參考，不再單憑占比判定主攻、多頭、殺盤或避險。${model.latestRow?.topTrad.name?`最新單日最大傳產類別：${esc(model.latestRow.topTrad.name)} ${fmt(model.latestRow.topTrad.share)}%；不是本期合計。`:''}</dd><dt>資料來源與更新</dt><dd>網站既有 sector_turnover（上市類股成交金額／占比）、taiex_daily、otc_index_daily；各表原始來源與範圍沿用既有管線。占比資料日 ${esc(model.anchor||'—')}；更新時間 ${esc(model.latestRow?.updatedAt?new Date(model.latestRow.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'未提供')}。</dd></dl><p>占比與差值以原始數值計算，顯示時四捨五入。占比變化不超過 0.05 個百分點以「接近前期」呈現，僅配合一位小數顯示，不是交易強弱門檻。缺資料不補 0，成交金額不等於資金淨流入。</p></details></div>`;
  drawChart(c);
 }
 function drawChart(c){
  const target=dialog.querySelector('[data-sd-chart]');
  const history=model.history(key).slice(-Math.max(60,n*2));
  const amountButton=dialog.querySelector('[data-sd-mode=amount]');amountButton.disabled=!history.some(p=>p.amount!==null);
  const values=history.map(p=>chartMode==='share'?p.share:p.amount===null?null:p.amount/1e8),valid=values.filter(v=>v!==null);
  if(!valid.length){target.innerHTML='<p class="sd-empty">這個項目的歷史資料不足，無法繪圖。</p>';return;}
  const min=Math.max(0,Math.min(...valid)-(chartMode==='share'?2:Math.max(...valid)*.08)),max=Math.max(min+1,Math.max(...valid)+(chartMode==='share'?2:Math.max(...valid)*.08));
  const compact=matchMedia('(max-width:650px)').matches,width=compact?500:800,left=compact?72:56,right=width-44;
  const X=i=>left+i/Math.max(1,history.length-1)*(right-left),Y=v=>172-(v-min)/(max-min)*140;
  let line='',pen=false;values.forEach((v,i)=>{if(v===null){pen=false;return;}line+=(pen?' L':' M')+X(i).toFixed(2)+' '+Y(v).toFixed(2);pen=true;});
  const band=(dates,cls)=>{const indexes=history.map((p,i)=>dates.includes(p.date)?i:-1).filter(i=>i>=0);if(!indexes.length)return '';const l=Math.max(left,X(indexes[0])-3),r=Math.min(right,X(indexes.at(-1))+3);return `<rect class="${cls}" x="${l}" y="23" width="${Math.max(6,r-l)}" height="149"/>`;};
  const levels=[min,(min+max)/2,max];
  const average=(period,cls)=>{const value=chartMode==='share'?period.shares?.[key]??null:null;if(value===null)return '';return `<path class="${cls}" d="M${left} ${Y(value)} H${right}"/>`;};
  target.innerHTML=`<div class="sd-chart-legend"><span><i class="sd-band-current"></i>本期</span><span><i class="sd-band-previous"></i>前期</span><small>${chartMode==='share'?'每日成交占比（%）；虛線為各期占比':'每日成交金額（億元）'} · 缺日斷線呈現</small></div><svg class="sd-history" viewBox="0 0 ${width} 205" role="img" aria-label="${M.labels[key]}${chartMode==='share'?'每日成交占比':'每日成交金額'}歷史走勢">${band(c.previous.dates,'sd-band-previous')}${band(c.current.dates,'sd-band-current')}${levels.map(v=>`<path class="sd-chart-grid" d="M${left} ${Y(v)} H${right}"/><text x="${left-8}" y="${Y(v)+4}" text-anchor="end">${fmt(v,1)}</text>`).join('')}${average(c.previous,'sd-average-previous')}${average(c.current,'sd-average-current')}<path class="sd-history-line" d="${line}"/><line data-sd-cursor x1="${right}" x2="${right}" y1="23" y2="172"/><text x="${left}" y="197">${esc(history[0].date)}</text><text x="${right}" y="197" text-anchor="end">${esc(history.at(-1).date)}</text></svg><div class="sd-chart-readout" role="status" data-sd-readout></div><label class="sd-slider-label">查看交易日<input type="range" data-sd-date min="0" max="${history.length-1}" value="${history.length-1}" aria-label="歷史圖交易日"></label>`;
  let activeIndex=-1;
  const read=i=>{if(i===activeIndex)return;activeIndex=i;const p=history[i],value=values[i];target.querySelector('[data-sd-readout]').textContent=p.date+' · '+(value===null?'資料缺漏':fmt(value,2)+(chartMode==='share'?'%':' 億元'));const cursor=target.querySelector('[data-sd-cursor]');cursor.setAttribute('x1',X(i));cursor.setAttribute('x2',X(i));target.querySelector('[data-sd-date]').value=i;};
  read(history.length-1);target.querySelector('[data-sd-date]').oninput=e=>read(Number(e.target.value));
  target.querySelector('svg').onpointermove=e=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*width;read(Math.max(0,Math.min(history.length-1,Math.round((x-left)/(right-left)*(history.length-1)))));};
 }
 function open(k,trigger){key=k;chartMode='share';returnFocus=trigger;renderDialog();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;dialog.querySelector('[data-sd-close]').focus({preventScroll:true});}
 function mount(root,data){
  model=M.create(data.rows,data.taiex,data.otc);retry=data.retry||null;
  const wrapper=root.querySelector('.gs-struct')||root;
  for(const selector of [':scope > header',':scope > .gs-ststat',':scope > .gs-shgrid',':scope > .gs-strisk',':scope > .sd-dashboard'])wrapper.querySelectorAll(selector).forEach(e=>e.remove());
  host=document.createElement('section');host.className='sd-dashboard';wrapper.prepend(host);render();
  const otc=wrapper.querySelector('.gs-otc');if(otc&&!otc.querySelector('[data-sd-otc-note]')){const note=document.createElement('p');note.dataset.sdOtcNote='';note.className='sd-fine';note.textContent='以下保留最新單日櫃買／集中比較，不隨上方週期切換。';otc.prepend(note);}
 }
 document.addEventListener('click',e=>{
  const card=e.target.closest('[data-sd-sector]');if(card&&host?.contains(card))open(card.dataset.sdSector,card);
  if(e.target.closest('[data-sd-close]'))dialog.close();
  const mode=e.target.closest('[data-sd-mode]');if(mode&&!mode.disabled){chartMode=mode.dataset.sdMode;renderDialog();dialog.querySelector(`[data-sd-mode="${chartMode}"]`).focus({preventScroll:true});}
  if(e.target.closest('[data-sd-retry]'))retry?.();
 });
 document.addEventListener('change',e=>{if(!e.target.matches('[data-sd-period]')||!M.periods.includes(Number(e.target.value)))return;n=Number(e.target.value);const fromDialog=dialog.contains(e.target);render();(fromDialog?dialog:host).querySelector('[data-sd-period]').focus({preventScroll:true});});
 dialog.addEventListener('close',()=>{const focus=returnFocus?.isConnected?returnFocus:host?.querySelector(`[data-sd-sector="${key}"]`);focus?.focus({preventScroll:true});});
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 matchMedia('(max-width:650px)').addEventListener('change',()=>{if(dialog.open&&model)drawChart(get());});
 window.AcademySectorDashboard={mount};
})();
