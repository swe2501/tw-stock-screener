/* Official, dated IX0231 overview; shared membership with the server-side filter. */
(function () {
  'use strict';
  async function endpoint() {
    const local=location.protocol==='file:'||['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
    if(!local)return window.__API||'';
    for(const base of ['http://127.0.0.1:49677','http://127.0.0.1:49675','http://127.0.0.1:49676']){
      try{const r=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(1500)}),d=await r.json();if(r.ok&&d.pristine===true)return base;}catch{}
    }
    throw Error('本機璞玉篩選服務尚未啟動，請使用專案的「啟動本機預覽.cmd」開啟後再試。');
  }
  window.ForesightPristine={endpoint};
  const host = document.getElementById('pristineOverview');
  let data = window.ForesightPristineSnapshot, period = 60, loaded = false, benchmarkOn=false, benchmark=[], benchmarkLoading=false;
  if (!host || !data) return;
  const number = (v, digits = 2) => Number(v).toLocaleString('zh-TW', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const changeClass = v => v > 0 ? 'pr-up' : v < 0 ? 'pr-down' : 'pr-flat';
  const signed = v => (v > 0 ? '+' : '') + number(v) + '%';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  host.innerHTML = '<header class="pr-head"><div class="pr-heading"><small>PRISTINE INDEX</small><h2>臺灣璞玉指數</h2></div><button type="button" class="pr-screen">篩選璞玉成分股 <span aria-hidden="true">↗</span></button></header>' +
    '<p class="pr-intro">獲利、配息與成分股表現</p><div class="pr-body"><div class="pr-stats"></div><div class="pr-chart-area"><div class="pr-chart-head"><div><b>指數走勢</b><small class="pr-chart-caption"></small></div><div class="pr-chart-controls"><button type="button" class="pr-benchmark-toggle" role="switch" aria-checked="false">大盤對照<span aria-hidden="true"></span></button><div class="pr-period" role="group" aria-label="璞玉走勢期間"><button type="button" data-period="20">近 20 日</button><button type="button" data-period="60">近 60 日</button><button type="button" data-period="0">全部</button></div></div></div><div class="pr-chart-legend" hidden></div><div class="pr-chart"></div><p class="pr-chart-read" aria-live="off"></p></div></div>' +
    '<footer class="pr-foot"><span class="pr-source"></span><a href="https://taiwanindex.com.tw/indexes/IX0231" target="_blank" rel="noopener">官方資料 ↗</a></footer><div class="pr-members-entry"><button type="button" class="pr-open-directory" aria-haspopup="dialog">瀏覽成分名單 <span class="pr-member-count"></span><span aria-hidden="true">↗</span></button><small>搜尋與查看 K 圖</small></div><p class="pr-note">成分資格依定期審核，並非買賣訊號；入選後的交易熱度仍可能改變。</p>';
  const directory=document.createElement('dialog');
  directory.className='pr-directory';directory.setAttribute('aria-labelledby','prDirectoryTitle');
  directory.innerHTML='<header class="pr-directory-head"><div><small>PRISTINE INDEX</small><h2 id="prDirectoryTitle">璞玉成分名單</h2></div><button type="button" class="pr-directory-close" aria-label="關閉成分名單">×</button></header><p class="pr-members-date"></p><div class="pr-directory-filters"><label class="pr-industry-filter">產業別<select aria-label="產業別"><option value="">全部產業</option></select></label><label class="pr-directory-search">搜尋成分股<input type="search" placeholder="輸入代號或公司名稱" maxlength="50"></label></div><p class="pr-industry-status" role="status"></p><div class="pr-list-head"><span>代號</span><span>公司名稱</span><span>K 圖</span></div><div class="pr-directory-list"></div><footer class="pr-pagination"><button type="button" data-pr-page="-1" aria-label="上一頁">‹</button><span class="pr-page-read" role="status"></span><button type="button" data-pr-page="1" aria-label="下一頁">›</button></footer>';
  document.body.append(directory);
  let memberPage=0,pageSize=12,industryLoading=false,industryLoaded=false;const industries=new Map();
  function render() {
    const all = data.history, last = all[all.length - 1], previous = all[all.length - 2];
    const day = previous ? (last.value / previous.value - 1) * 100 : 0;
    host.querySelector('.pr-stats').innerHTML = '<div class="pr-stat"><span>收盤指數</span><strong class="'+changeClass(day)+'">'+number(last.value)+'</strong><b class="'+changeClass(day)+'">'+signed(day)+' <small>較前一交易日</small></b><small>行情日期 '+esc(last.date)+'</small></div><div class="pr-stat pr-pair"><div><span>成分股</span><strong>'+data.members.length+'<small> 檔</small></strong></div><div><span>涵蓋產業</span><strong>'+data.industries+'<small> 類</small></strong></div></div>';
    host.querySelector('.pr-source').textContent = '名單：'+data.published_at+' 定審 · '+data.effective_from+' 起適用';
    host.querySelector('.pr-member-count').textContent = data.members.length+' 檔';
    directory.querySelector('.pr-members-date').textContent = data.published_at+' 定審 · '+data.members.length+' 檔 · 按代號排列，點選查看 K 圖。';
    chart(); members();
  }
  function chart() {
    const all=data.history, selected=period?all.slice(-(period+1)):all;
    const market=new Map(benchmark.map(r=>[r.date,r.value]));
    const common=selected.filter(r=>market.has(r.date));
    const compare=benchmarkOn&&common.length>=2;
    const rows=compare?common:selected, first=rows[0],last=rows[rows.length-1];
    const gain=(last.value/first.value-1)*100;
    const plotted=rows.map(r=>compare?r.value/first.value*100:r.value);
    const marketValues=compare?rows.map(r=>market.get(r.date)/market.get(first.date)*100):[];
    const values=plotted.concat(marketValues),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1;
    const x=i=>14+i/Math.max(1,rows.length-1)*732,y=v=>155-(v-lo)/span*130;
    const makePath=series=>'M'+series.map((v,i)=>x(i).toFixed(2)+','+y(v).toFixed(2)).join(' L');
    const path=makePath(plotted);
    host.querySelector('.pr-chart').className='pr-chart '+changeClass(gain);
    host.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.period)===period)));
    const toggle=host.querySelector('.pr-benchmark-toggle');toggle.setAttribute('aria-checked',String(benchmarkOn));toggle.setAttribute('aria-busy',String(benchmarkLoading));
    host.querySelector('.pr-chart-caption').innerHTML='<span class="'+changeClass(gain)+'">'+signed(gain)+'</span> <span>區間表現 · '+(compare?'同日起點 100':'價格指數')+'</span>';
    const legend=host.querySelector('.pr-chart-legend');legend.hidden=!compare;
    legend.innerHTML='<span class="'+changeClass(gain)+'">━ 璞玉</span><span class="pr-benchmark-key">┄ 加權指數 '+(compare?signed((marketValues.at(-1)/100-1)*100):'')+'</span>';
    const marketPath=compare?'<path class="pr-benchmark-curve" d="'+makePath(marketValues)+'" fill="none"/>':'';
    host.querySelector('.pr-chart').innerHTML='<svg viewBox="0 0 760 190" preserveAspectRatio="none" role="img" aria-label="璞玉'+(compare?'與加權指數，同日起點 100':'價格指數')+'，'+first.date+' 至 '+last.date+'"><defs><linearGradient id="prArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".15"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'+[25,90,155].map(v=>'<path class="pr-gridline" d="M14 '+v+'H746"/>').join('')+'<path d="'+path+' L746 166 L14 166Z" fill="url(#prArea)"/>'+marketPath+'<path class="pr-curve" d="'+path+'" fill="none"/><circle class="pr-end" cx="746" cy="'+y(plotted.at(-1))+'" r="3"/><path class="pr-cross" d="M14 16V166" visibility="hidden"/><circle class="pr-dot" r="4" visibility="hidden"/></svg><div class="pr-axis"><span>'+first.date+'</span><span>'+last.date+'</span></div>';
    const read=host.querySelector('.pr-chart-read');
    const baseline=benchmarkOn&&!compare?(benchmarkLoading?'正在載入大盤資料…':'所選期間的大盤資料不足，暫顯示璞玉走勢。'):'收盤資料 '+last.date+(compare?' · 共同交易日比較，起點 100':data.history_status==='official'?' · 官方行情':' · 已保存官方資料');
    read.textContent=baseline;
    const svg=host.querySelector('.pr-chart svg');
    svg.addEventListener('pointermove',e=>{
      const box=svg.getBoundingClientRect(),i=Math.max(0,Math.min(rows.length-1,Math.round(((e.clientX-box.left)/box.width*760-14)/732*(rows.length-1)))),r=rows[i];
      const cross=svg.querySelector('.pr-cross'),dot=svg.querySelector('.pr-dot');
      cross.setAttribute('d','M'+x(i)+' 16V166');cross.setAttribute('visibility','visible');
      dot.setAttribute('cx',x(i));dot.setAttribute('cy',y(plotted[i]));dot.setAttribute('visibility','visible');
      read.textContent=r.date+' · 璞玉 '+number(compare?plotted[i]:r.value)+(compare?' · 加權 '+number(marketValues[i])+'（起點 100）':'');
    });
    svg.addEventListener('pointerleave',()=>{svg.querySelector('.pr-cross').setAttribute('visibility','hidden');svg.querySelector('.pr-dot').setAttribute('visibility','hidden');read.textContent=baseline;});
  }
  async function loadBenchmark(){
    benchmarkLoading=true;chart();
    try{
      const base=typeof SIG_SB_URL!=='undefined'?SIG_SB_URL:'',key=typeof SIG_SB_ANON!=='undefined'?SIG_SB_ANON:'';
      if(!base||!key)throw Error();
      const response=await fetch(base+'/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.desc&limit=1000',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();const rows=await response.json();
      if(!Array.isArray(rows))throw Error();
      benchmark=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.trade_date)&&Number.isFinite(Number(r.close))&&Number(r.close)>0).map(r=>({date:r.trade_date,value:Number(r.close)})).sort((a,b)=>a.date.localeCompare(b.date));
    }catch{benchmark=[];}finally{benchmarkLoading=false;chart();}
  }
  function members() {
    const query=directory.querySelector('input').value.trim().toLowerCase();
    const industry=directory.querySelector('select').value;
    const rows=data.members.filter(r=>(r.code+' '+r.name).toLowerCase().includes(query)&&(!industry||industries.get(r.code)===industry));
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));memberPage=Math.min(memberPage,pages-1);
    directory.querySelector('.pr-directory-list').innerHTML=rows.length?rows.slice(memberPage*pageSize,(memberPage+1)*pageSize).map(r=>'<button type="button" data-code="'+r.code+'"><b>'+r.code+'</b><span>'+esc(r.name)+'</span><span aria-hidden="true">↗</span></button>').join(''):'<p class="pr-no-matches">沒有符合的成分股。</p>';
    directory.querySelector('.pr-page-read').textContent='第 '+(memberPage+1)+' / '+pages+' 頁 · '+rows.length+' 檔';
    directory.querySelector('[data-pr-page="-1"]').disabled=memberPage===0;
    directory.querySelector('[data-pr-page="1"]').disabled=memberPage===pages-1;
  }
  function fitDirectory(){
    if(!directory.open)return;
    const row=directory.querySelector('.pr-directory-list button');
    const list=directory.querySelector('.pr-directory-list');
    if(!row)return;
    const anchor=memberPage*pageSize,rowHeight=row.getBoundingClientRect().height;
    const chrome=directory.scrollHeight-list.getBoundingClientRect().height;
    const available=(window.visualViewport?.height||innerHeight)-40;
    const count=Math.max(1,Math.min(12,Math.floor((available-chrome-4)/rowHeight)));
    if(count!==pageSize){pageSize=count;memberPage=Math.floor(anchor/pageSize);members();}
  }
  addEventListener('resize',fitDirectory);window.visualViewport?.addEventListener('resize',fitDirectory);
  async function loadIndustries(){
    if(industryLoaded||industryLoading)return;
    industryLoading=true;const status=directory.querySelector('.pr-industry-status'),select=directory.querySelector('select');
    status.textContent='正在讀取產業分類…';select.disabled=true;fitDirectory();
    try{
      const base=typeof SIG_SB_URL!=='undefined'?SIG_SB_URL:'',key=typeof SIG_SB_ANON!=='undefined'?SIG_SB_ANON:'';
      if(!base||!key)throw Error();
      const groups=[];for(let i=0;i<data.members.length;i+=100)groups.push(data.members.slice(i,i+100).map(r=>r.code));
      const pages=await Promise.all(groups.map(async codes=>{
        const response=await fetch(base+'/rest/v1/security_catalog?select=code,industry&code=in.('+codes.join(',')+')&limit=100',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw Error();const rows=await response.json();if(!Array.isArray(rows))throw Error();return rows;
      }));
      pages.flat().forEach(r=>{if(typeof r.industry==='string'&&r.industry.trim())industries.set(r.code,r.industry.trim());});
      if(!industries.size)throw Error();
      const options=[...new Set(industries.values())].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
      select.innerHTML='<option value="">全部產業</option>'+options.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
      industryLoaded=true;status.textContent=industries.size<data.members.length?'部分成分股尚無產業分類，仍可從全部產業查看。':'';
    }catch{status.textContent='產業分類暫時無法讀取，仍可搜尋完整名單。';}
    finally{industryLoading=false;select.disabled=!industryLoaded;members();fitDirectory();}
  }
  directory.querySelector('select').addEventListener('change',()=>{memberPage=0;members();fitDirectory();});
  directory.addEventListener('click',e=>{
    if(e.target===directory){const r=directory.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)directory.close();}
    if(e.target.closest('.pr-directory-close'))directory.close();
    const next=e.target.closest('[data-pr-page]');if(next&&!next.disabled){memberPage+=Number(next.dataset.prPage);members();}
    const row=e.target.closest('[data-code]');if(row){const m=data.members.find(r=>r.code===row.dataset.code);if(m&&typeof window.openChart==='function'){directory.close();window.openChart(m.code,m.name,'',0,false);}}
  });
  directory.querySelector('input').addEventListener('input',()=>{memberPage=0;members();fitDirectory();});
  host.addEventListener('click',e=>{
    if(e.target.closest('.pr-benchmark-toggle')){benchmarkOn=!benchmarkOn;chart();if(benchmarkOn&&!benchmark.length&&!benchmarkLoading)loadBenchmark();}
    const periodButton=e.target.closest('[data-period]');if(periodButton){period=Number(periodButton.dataset.period);chart();}
    if(e.target.closest('.pr-open-directory')){members();directory.showModal();fitDirectory();loadIndustries();}
    if(e.target.closest('.pr-screen')){
      if(typeof window._showView==='function')window._showView('screen');
      const cb=document.getElementById('pristine_only'), panel=cb?.closest('.sc-panel');
      if(cb){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));}
      if(panel){const body=panel.querySelector('.sc-body');if(body)body.style.display='';panel.classList.add('open');panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}
    }
  });
  render();
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(e=>e.isIntersecting)||loaded)return;
    loaded=true;host.classList.add('pr-visible');observer.disconnect();
    endpoint().then(base=>fetch(base+'/api/prices?action=pristine')).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{
      if(d.code!=='IX0231'||!Array.isArray(d.history)||!d.history.length||!Array.isArray(d.members)||!d.members.length)return;
      if(d.history.some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(r.value)||r.value<=0)||d.members.some(r=>!/^\d{4}$/.test(r.code)))return;
      data=d;render();
    }).catch(()=>{});
  },{rootMargin:'120px'});observer.observe(host);
})();
