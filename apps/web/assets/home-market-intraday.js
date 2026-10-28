/* Snapshot-aligned intraday miniatures; never substitute daily or proxy data. */
(() => {
  'use strict';
  const mounted = new WeakSet(), requests = new Map();
  // 首頁分時小圖自建資料（page_cache 公開可讀；與站內其他 page_cache 讀取同一組公開金鑰）
  const MINI_SB = 'https://bruqrbvbjxntgoljxsne.supabase.co', MINI_AK = 'sb_publishable_KgYlaR-mqtx4uVre6kPD2A_qO6tdT1y';
  let serial = 0, fxState = null;
  window._openFxImpact = function () {
    if(document.getElementById('homeFxImpactDialog') || !fxState) return;
    const d=document.createElement('dialog');d.id='homeFxImpactDialog';d.className='home-fx-impact-dialog';
    d.innerHTML='<button type="button" class="home-fx-impact-close" aria-label="關閉匯率影響說明">✕</button><h3>匯率與台股</h3><div class="home-fx-impact-toolbar"><label>觀察期間 <select aria-label="影響說明觀察期間">'+fxState.select.innerHTML+'</select></label><strong class="home-fx-modal-status"></strong></div><div class="home-fx-impact-content"></div>';
    d.setAttribute('aria-labelledby','homeFxImpactTitle');d.querySelector('h3').id='homeFxImpactTitle';
    document.body.append(d);d.showModal();d.querySelector('select').value=fxState.select.value;
    const update=()=>{d.querySelector('.home-fx-modal-status').textContent=fxState.status.textContent;d.querySelector('.home-fx-modal-status').className='home-fx-modal-status '+fxState.status.className;d.querySelector('.home-fx-impact-content').innerHTML=fxState.impact.innerHTML;};
    d.querySelector('select').onchange=e=>{fxState.select.value=e.target.value;fxState.select.dispatchEvent(new Event('change'));update();};update();
    d.querySelector('.home-fx-impact-close').onclick=()=>d.close();
    d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
    d.addEventListener('close',()=>d.remove(),{once:true});
  };
  const maKey='home_chart_ma_v1';
  window._homeMaPrefs={read(){try{const value=JSON.parse(localStorage.getItem(maKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch(_){return {};}},write(value){try{localStorage.setItem(maKey,JSON.stringify(value));}catch(_){}}};
  window._bindHomeMaControls=function(bar,series){
    const prefs=window._homeMaPrefs.read(),buttons=[...bar.querySelectorAll('[data-ma-period],[data-period]')];
    const all=document.createElement('button');all.type='button';all.className='home-ma-all';bar.append(all);
    const sync=()=>{const on=buttons.some(b=>!b.disabled&&b.getAttribute('aria-pressed')==='true');all.textContent=on?'關閉全部均線':'顯示全部均線';all.disabled=!buttons.some(b=>!b.disabled);};
    const set=(button,on)=>{const n=button.dataset.maPeriod||button.dataset.period;button.setAttribute('aria-pressed',String(on));series[n]?.applyOptions({visible:on});prefs[n]=on;};
    for(const button of buttons){const n=button.dataset.maPeriod||button.dataset.period;if(!button.disabled)set(button,prefs[n]!==false);button.onclick=()=>{set(button,button.getAttribute('aria-pressed')!=='true');window._homeMaPrefs.write(prefs);sync();};}
    all.onclick=()=>{const on=!buttons.some(b=>!b.disabled&&b.getAttribute('aria-pressed')==='true');buttons.filter(b=>!b.disabled).forEach(b=>set(b,on));window._homeMaPrefs.write(prefs);sync();};sync();
  };
  window._addHomeMovingAverages = function(dialog, chart, rows, precision) {
    const colors=['#e8b654','#6fb6e6','#e889ab','#b696e0','#70bba0','#929bdf'];
    const bar=document.createElement('div');bar.className='home-chart-ma';bar.setAttribute('aria-label','均線顯示設定');
    dialog.querySelector('.vix-history-status').before(bar);
    const averages={};
    [5,10,20,60,120,240].forEach((n,i)=>{
      const values=[];let sum=0;
      rows.forEach((r,j)=>{sum+=r.value;if(j>=n)sum-=rows[j-n].value;if(j>=n-1)values.push({time:r.time,value:sum/n});});
      const b=document.createElement('button');b.type='button';b.textContent=n+'日均線';b.dataset.maPeriod=n;b.style.setProperty('--ma-color',colors[i]);b.setAttribute('aria-pressed',String(values.length>0));b.disabled=!values.length;bar.append(b);
      if(!values.length){b.title='至少需要 '+n+' 筆收盤資料';return;}
      const series=chart.addLineSeries({color:colors[i],lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:n+'日',crosshairMarkerRadius:2,priceFormat:{type:'price',precision,minMove:Math.pow(10,-precision)}});series.setData(values);
      averages[n]=series;
    });
    window._bindHomeMaControls(bar,averages);
  };
  window._createVixFlags = function(dialog, chart, series, rows, marks) {
    const host=dialog.querySelector('.vix-history-chart'),layer=document.createElement('div');
    layer.className='vix-flag-layer';host.append(layer);
    const tip=document.createElement('div');tip.className='vix-flag-tooltip';tip.id='vix-flag-tip-'+ ++serial;tip.setAttribute('role','tooltip');tip.hidden=true;host.append(tip);
    const byDate=new Map(rows.map(r=>[r.time,r]));let current=series,candleMode=false,visible=true,frame=0,disposed=false,pinned=null;
    const controls=marks.map(mark=>{
      const row=byDate.get(mark.time);if(!row)return null;
      const value=Number(row.value??row.close),button=document.createElement('button');button.type='button';button.className='vix-high-flag';button.dataset.time=mark.time;
      button.setAttribute('aria-label',mark.time+' 一年新高，VIX '+value.toFixed(2));button.setAttribute('aria-describedby',tip.id);
      button.innerHTML='<svg viewBox="0 0 18 25" aria-hidden="true"><path class="vix-flag-cloth" d="M5 4C8 1.8 11 6.2 15 3.7V12C11 14.5 8 10.3 5 12.4Z"/><path class="vix-flag-pole" d="M5 3V22"/><circle cx="5" cy="22" r="1" class="vix-flag-foot"/></svg>';
      layer.append(button);
      const show=()=>{tip.replaceChildren();const title=document.createElement('strong');title.textContent='一年新高';const info=document.createElement('span');info.textContent=mark.time+' · VIX '+value.toFixed(2);tip.append(title,info);tip.hidden=false;const b=button.getBoundingClientRect(),h=host.getBoundingClientRect();tip.style.left=Math.max(6,Math.min(host.clientWidth-tip.offsetWidth-6,b.left-h.left+18))+'px';tip.style.top=Math.max(5,Math.min(host.clientHeight-tip.offsetHeight-5,b.top-h.top-tip.offsetHeight-5))+'px';};
      button.addEventListener('mouseenter',show);button.addEventListener('focus',show);
      button.addEventListener('mouseleave',()=>{if(pinned!==button)tip.hidden=true;});button.addEventListener('blur',()=>{if(pinned!==button)tip.hidden=true;});
      button.addEventListener('click',e=>{e.stopPropagation();pinned=pinned===button?null:button;if(pinned)show();else tip.hidden=true;});
      return {button,row,time:mark.time,value};
    }).filter(Boolean);
    function paint(){frame=0;if(disposed||!host.isConnected)return;let prior=-Infinity;
      for(const item of controls){const x=chart.timeScale().timeToCoordinate(item.time),value=candleMode&&Number.isFinite(item.row.high)?item.row.high:item.value,y=current.priceToCoordinate(value);const show=visible&&x!=null&&y!=null&&x>=8&&x<=host.clientWidth-28&&y>=32&&y<=host.clientHeight-8&&x-prior>=22;item.button.hidden=!show;if(show){item.button.style.left=(x-5)+'px';item.button.style.top=(y-7)+'px';prior=x;}}
      if(pinned&&pinned.hidden){pinned=null;tip.hidden=true;}
    }
    function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(paint);}
    chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);host.addEventListener('pointermove',schedule,{passive:true});host.addEventListener('wheel',schedule,{passive:true});
    const ro=new ResizeObserver(schedule);ro.observe(host);
    dialog.addEventListener('close',()=>{disposed=true;if(frame)cancelAnimationFrame(frame);ro.disconnect();host.removeEventListener('pointermove',schedule);host.removeEventListener('wheel',schedule);try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);}catch(_){}layer.remove();tip.remove();},{once:true});
    schedule();
    return {setVisible(on){visible=on;tip.hidden=true;pinned=null;schedule();},setSeries(next,candles){current=next;candleMode=candles;tip.hidden=true;pinned=null;schedule();}};
  };
  function unavailable(el, text) {
    el.classList.add('is-unavailable');
    el.replaceChildren(Object.assign(document.createElement('figcaption'), {textContent: text}));
  }
  function mountFx(card) {
    if (mounted.has(card)) return;
    mounted.add(card);
    const rows = [...new Map((window._homeMarketFxRows || []).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(Number(r.usdtwd)) && Number(r.usdtwd) > 0).map(r => [r.date,r])).values()].sort((a,b)=>b.date.localeCompare(a.date));
    const select = document.createElement('select');
    select.className = 'home-fx-period'; select.setAttribute('aria-label','台幣升貶值比較期間');
    select.innerHTML = '<option value="1">今日</option>'+[5,10,20,60].map(n=>`<option value="${n}">${n}日</option>`).join('');
    card.querySelector('.k').append(select);
    const status = document.createElement('div');status.className='home-fx-status';status.setAttribute('aria-live','polite');
    const date = document.createElement('small');date.className='home-fx-date';
    card.querySelector('.n').replaceChildren(status);card.querySelector('.home-quote').append(date);
    const impact = document.createElement('div');impact.className='home-fx-impact';
    impact.innerHTML='<div class="home-fx-impact-body"><div class="home-fx-impact-reading" aria-live="polite"></div><div class="home-fx-impact-sources">參考：<a href="https://knowledge.cbc.gov.tw/front/references/inpage/91736075-AF4C-F011-9116-0050569481A8" target="_blank" rel="noopener noreferrer">央行匯率說明</a> · <a href="https://www.cbc.gov.tw/tw/cp-302-21253-DDBF6-1.html" target="_blank" rel="noopener noreferrer">資金與股匯關係</a></div></div>';
    fxState={select,status,impact};
    impact.addEventListener('click',e=>e.stopPropagation());
    impact.addEventListener('keydown',e=>e.stopPropagation());
    function explain(direction,n) {
      const period=n===1?'今日':n+'日';
      const copy=direction==='up'?[
        ['外資匯兌','台幣升值，可增加未避險外資將台股資產換回外幣時的價值；是否匯入，仍要搭配外資買賣超確認。'],
        ['出口企業','美元營收換算成台幣時可能減少，須看海外成本、報價與避險能否抵銷。'],
        ['進口成本','美元計價的原料、設備採購成本可能下降，對進口比重高的企業較有利。']
      ]:direction==='down'?[
        ['外資匯兌','台幣貶值，可能侵蝕未避險外資換回外幣時的報酬；不能只憑貶值認定外資正在賣股。'],
        ['出口企業','美元營收換算成台幣時可能增加，但美元成本與避險部位可能抵銷部分效益。'],
        ['進口成本','美元計價的原料、設備採購成本可能上升，須留意企業能否轉嫁成本。']
      ]:direction==='flat'?[
        ['匯率持平','這段期間的起訖報價相同，匯率方向提供的線索有限，期間內仍可能有波動。'],
        ['台股觀察','回到外資買賣超、企業營收與產業需求，觀察股價是否獲得基本面支持。']
      ]:[['資料待齊','目前缺少所選期間的比較報價，暫不判讀升貶值對台股的影響。']];
      impact.querySelector('.home-fx-impact-reading').innerHTML='<strong class="home-fx-impact-heading">'+period+(direction==='up'?'升值':direction==='down'?'貶值':direction==='flat'?'持平':'')+'觀察</strong>'+copy.map(([title,body])=>'<div class="home-fx-impact-row"><b>'+title+'</b><span>'+body+'</span></div>').join('')+(direction==='missing'?'':'<small class="home-fx-impact-note">匯率是觀察線索，台股漲跌仍取決於資金與企業獲利，個別公司受影響程度不同。</small>');
    }
    function render() {
      const n = Number(select.value), current=rows[0], previous=rows[n];
      status.className='home-fx-status';
      status.removeAttribute('title');
      if(current) card.querySelector('.v').textContent=Number(current.usdtwd).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3});

      if (!current || !previous) {status.textContent='比較資料不足';date.textContent=current?'USD／TWD · '+current.date:'USD／TWD · 資料待更新';explain('missing',n);return;}
      const change=Number(current.usdtwd)-Number(previous.usdtwd), pct=Math.abs(change/Number(previous.usdtwd)*100);
      status.classList.add(change<0?'fx-appreciates':change>0?'fx-depreciates':'fx-flat');
      status.textContent=(change<0?'升值':change>0?'貶值':'持平')+' · '+pct.toFixed(2)+'%';
      date.textContent='USD／TWD · '+current.date;
      status.title=previous.date+' → '+current.date+'，美元兌台幣報價 '+Number(previous.usdtwd).toFixed(3)+' → '+Number(current.usdtwd).toFixed(3)+'；比較前 '+n+' 個有效報價日，報價降低表示台幣升值。';
      explain(change<0?'up':change>0?'down':'flat',n);
    }
    select.addEventListener('change',render);select.addEventListener('click',e=>e.stopPropagation());render();
  }
  function mountCalendar(grid) {
    if (mounted.has(grid)) return;
    mounted.add(grid);
    const y=Number(grid.dataset.year),m=Number(grid.dataset.month),first=new Date(Date.UTC(y,m,1)),days=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    grid.innerHTML='<div class="calendar-grid-title">'+y+' 年 '+(m+1)+' 月</div><div class="calendar-days">'+'日一二三四五六'.split('').map(d=>'<small>'+d+'</small>').join('')+Array.from({length:first.getUTCDay()},()=>'<i></i>').join('')+Array.from({length:days},(_,i)=>{
      const d=new Date(Date.UTC(y,m,i+1)),iso=d.toISOString().slice(0,10),weekday=d.getUTCDay();
      const month=iso===grid.dataset.settle, scheduled=iso===grid.dataset.scheduled;
      // Use the same holiday adjustment as the main settlement summary.
      const weekly=[3,5].some(dow=>Array.from({length:8},(_,j)=>new Date(d.getTime()-j*864e5)).some(t=>t.getUTCDay()===dow&&typeof window._twAdj==='function'&&window._twAdj(t.toISOString().slice(0,10))===iso));
      const label=month?'月合約結算':weekly?'週選結算':scheduled?'原月結算日，遇休市順延':weekday===0||weekday===6?'週末':'一般日期';
      return `<button type="button" class="calendar-day${month?' is-month':weekly?' is-weekly':''}" aria-label="${iso} ${label}" title="${label}" data-label="${iso} · ${label}">${i+1}</button>`;
    }).join('')+'</div><p class="calendar-selection" aria-live="polite">實心：月合約 · 圓點：週選</p>';
    grid.addEventListener('click',e=>{const b=e.target.closest('.calendar-day');if(b){grid.querySelectorAll('[aria-pressed]').forEach(n=>n.removeAttribute('aria-pressed'));b.setAttribute('aria-pressed','true');grid.querySelector('.calendar-selection').textContent=b.dataset.label;}});
  }
  function sessionRows(data, date, futures, fx, vix, fxSess) {
    const byTime = new Map();
    for (const row of Array.isArray(data) ? data : []) {
      if (typeof row.time !== 'number' || !Number.isFinite(row.time) || !Number.isFinite(row.close) || row.close <= 0) continue;
      const local = new Date((row.time + 28800) * 1000);
      if (!Number.isFinite(local.getTime()) || local.toISOString().slice(0, 10) !== date) continue;
      const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
      if (minute < (fxSess?540:fx?0:futures ? 525 : 540) || minute > (fxSess?960:fx?1439:futures||vix ? 825 : 810)) continue;
      byTime.set(row.time, {time: row.time, close: row.close, minute});
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
  async function mount(el) {
    if (mounted.has(el)) return;
    mounted.add(el);
    const {code, date} = el.dataset;
    const apiCode=code==='VIX'?'TAIWANVIX':code==='FX'?'TWD=X':code;
    const prev = el.dataset.prev === '' ? NaN : Number(el.dataset.prev);
    if (code === 'SGX') return unavailable(el, '分時資料未提供');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return unavailable(el, '分時資料待更新');
    try {
      // 2026-10-24 櫃買指數／台指期／台指VIX：後端 /api/chart 沒有分時（404 或只有大盤近似），
      // 改先讀官方來源自建的 page_cache mini_OTC／mini_TXF／mini_VIX（scripts/home_intraday.py、intraday_push.py），
      // 日期相符才用；沒有才走原本的 /api/chart。
      const miniKind={'^TWOII':'mini_OTC','TX=F':'mini_TXF','VIX':'mini_VIX','FX':'mini_FX'}[code];
      let payload=null, fromMini=false;
      if (miniKind) {
        const mk='mini|'+miniKind;
        if (!requests.has(mk)) requests.set(mk, fetch(MINI_SB+'/rest/v1/page_cache?kind=eq.'+miniKind+'&select=payload',{headers:{apikey:MINI_AK,Authorization:'Bearer '+MINI_AK}})
          .then(r=>r.ok?r.json():[]).then(a=>(a&&a[0]&&a[0].payload)||null).catch(()=>null));
        const mini=await requests.get(mk);
        if (mini && mini.date===date && Array.isArray(mini.data) && mini.data.length>=2) { payload={name:mini.source||'',data:mini.data}; fromMini=true; }
      }
      if (!payload) {
        const requestKey=apiCode+'|'+date;
        if (!requests.has(requestKey)) requests.set(requestKey, fetch((window.__API || '') + '/api/chart?code=' + encodeURIComponent(apiCode) + '&range=5d&interval=5m'+(code==='VIX'?'&date='+encodeURIComponent(date):''))
          .then(r => {if (!r.ok) throw Error('unavailable'); return r.json();}));
        payload = await requests.get(requestKey);
      }
      if (!el.isConnected) return;
      if (code === 'TX=F' && /近似|proxy|大盤/i.test(payload.name || '')) return unavailable(el, '分時待更新');
      const rows = sessionRows(payload.data, date, code === 'TX=F', code==='FX', code==='VIX', code==='FX' && fromMini);
      if (rows.length < 2) return unavailable(el, date.slice(5).replace('-', '/') + ' 分時待更新');
      const baseline = Number.isFinite(prev) && prev > 0 ? prev : null;
      const values = rows.map(r => r.close).concat(baseline == null ? [] : [baseline]);
      const lo = Math.min(...values), hi = Math.max(...values), pad = Math.max((hi - lo) * .12, hi * .0003);
      const y = v => 7 + (hi + pad - v) / (hi - lo + 2 * pad) * 94;
      const fxSess = code==='FX' && fromMini;   // mini_FX＝台北匯市盤 09:00–16:00
      // 2026-10-28 mini_FX 只在股市盤中（intraday_push）記到約 13:35，軸固定到 16:00 右側會空一截；改為至少到 13:30、有更晚資料才延伸（上限 16:00）
      const fxEnd = Math.min(960, Math.max(810, rows.at(-1).minute));
      const start = fxSess?540:code==='FX'?0:code === 'TX=F' ? 525 : 540, end = fxSess?fxEnd:code==='FX'?1439:code === 'TX=F'||code==='VIX' ? 825 : 810;
      const points = rows.map(r => [3 + (r.minute - start) / (end - start) * 144, y(r.close)]);
      const line = points.map(p => p.map(n => n.toFixed(2)).join(',')).join(' ');
      const baseY = baseline == null ? 105 : y(baseline);
      const area = `${points[0][0]},${baseY} ${line} ${points.at(-1)[0]},${baseY}`;
      const id = 'home-intraday-' + ++serial;
      // Clip at yesterday's close, so each segment keeps Taiwan's red/green convention.
      const paths = tone => `<g class="mini-${tone}" clip-path="url(#${id}-${tone})"><polygon points="${area}" fill="url(#${id}-fill-${tone})"/><polyline points="${line}"/></g>`;
      const last = rows.at(-1), clock = new Date((last.time + 28800) * 1000).toISOString().slice(11, 16);
      el.innerHTML = `<svg viewBox="0 0 150 110" preserveAspectRatio="none" role="img" aria-label="${date} 當日分時走勢${baseline == null ? '' : '，紅色高於昨收、綠色低於昨收'}"><defs>${['up', 'down'].map(tone => `<linearGradient class="mini-${tone}" id="${id}-fill-${tone}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".13"/><stop offset="1" stop-color="currentColor" stop-opacity=".025"/></linearGradient><clipPath id="${id}-${tone}"><rect x="0" y="${tone === 'up' ? 0 : baseY}" width="150" height="${tone === 'up' ? baseY : 110 - baseY}"/></clipPath>`).join('')}</defs>${baseline == null ? `<polygon class="mini-neutral-area" points="${area}"/><polyline class="mini-neutral" points="${line}"/>` : `<path class="mini-baseline" d="M0 ${baseY}H150"/>${paths('up')}${paths('down')}`}</svg><figcaption>${date.slice(5).replace('-', '/')} ${clock}</figcaption>`;
      if(code==='FX')el.classList.add('home-fx-intraday');
      if(code==='FX')el.setAttribute('aria-label','美元兌台幣當日分時：報價上漲為紅、下跌為綠；升貶值文字以台幣角度判讀');
      el.title = date + ' · ' + rows.length + ' 筆分時資料' + (baseline == null ? '（昨收未提供）' : ' · 昨收 ' + baseline.toLocaleString());
      el.dataset.ready = 'true';
    } catch (_) {
      if (el.isConnected) unavailable(el, '分時暫無資料');
    }
  }
  function scan() {
    document.querySelectorAll('#cbPulse .home-intraday, #cbOverview .home-intraday').forEach(mount);
    document.querySelectorAll('#cbPulse .home-fx-card').forEach(mountFx);
    document.querySelectorAll('#cbPulse .vix-year-date').forEach(label=>{const quote=label.closest('.cb-pi').querySelector('.home-quote');if(label.parentElement!==quote)quote.append(label);});
    document.querySelectorAll('#cbSettle .home-month-grid').forEach(mountCalendar);
  }
  scan();
  for (const id of ['cbPulse', 'cbOverview']) {
    const host = document.getElementById(id);
    if (host) new MutationObserver(scan).observe(host, {childList: true, subtree: true});
  }
})();
