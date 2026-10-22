/* Resize the existing charts, never their data, drawings or visible time range. */
(() => {
 'use strict';
 const modal=document.getElementById('chartModal'),content=modal?.querySelector('.chart-content'),wrap=document.getElementById('chartWrapper');
 if(!content||!wrap)return;
 const byId=id=>document.getElementById(id),sizes=new WeakMap();let frame=0;
 const tools=document.createElement('details');tools.className='chart-fit-tools';
 tools.innerHTML='<summary><span class="chart-fit-title">週期、圖層與畫線工具</span></summary>';
 const ratios=document.createElement('span');ratios.className='chart-fit-ratios';
 ratios.innerHTML='<label>K 圖比例<input type="range" min="50" max="80" step="2" value="60" aria-label="K 圖高度比例"><output>60%</output></label><button type="button" aria-label="還原圖表比例">還原</button>';
 tools.querySelector('summary').append(ratios);
 const defaultMainRatio=60;
 let mainRatio=defaultMainRatio;
 function renderRatios(){const input=ratios.querySelector('input'),sub=(100-mainRatio)/2;input.value=mainRatio;ratios.querySelector('output').value=mainRatio+'%';input.setAttribute('aria-valuetext','K 圖 '+mainRatio+'%，下方資料區 '+(100-mainRatio)+'%');for(const [key,value] of [['main',mainRatio],['vol',sub],['tech',sub],['sub',100-mainRatio]])wrap.style.setProperty('--chart-'+key+'-ratio',value+'fr');schedule();}
 ratios.addEventListener('click',e=>{e.stopPropagation();if(!e.target.closest('input,button'))e.preventDefault();});
 ratios.addEventListener('keydown',e=>e.stopPropagation());
 ratios.addEventListener('input',e=>{if(e.target.tagName!=='INPUT')return;mainRatio=Number(e.target.value);renderRatios();});
 ratios.querySelector('button').addEventListener('click',()=>{mainRatio=defaultMainRatio;renderRatios();});
 const first=content.querySelector('.chart-toolbar');
 const periods=document.createElement('div');periods.className='chart-period-segments';periods.setAttribute('role','group');periods.setAttribute('aria-label','圖表週期');
 const periodButtons=['hourlyBtn','dailyBtn','adjDailyBtn','weeklyBtn','monthlyBtn','yearlyBtn','trendBtn'].map(byId).filter(Boolean);
 if(periodButtons.length){periodButtons[0].before(periods);periodButtons.forEach(button=>{button.setAttribute('aria-pressed',String(button.id==='dailyBtn'));periods.append(button);});}
 if(first){first.before(tools);for(const selector of ['.chart-toolbar','.chart-layer-toolbar','.chart-draw-console']){const row=content.querySelector(selector);if(row)tools.append(row);}}
 const layerPanels=document.createElement('div');layerPanels.className='chart-fit-layer-panels';
 tools.querySelector('.chart-layer-toolbar')?.after(layerPanels);
 for(const id of ['mkPanel','srLinePanel','vpPanel','brokerFilterPanel','aiBuyPanel','sma20GroupPanel']){const panel=byId(id);if(panel)layerPanels.append(panel);}
 const chooser=document.createElement('label');chooser.className='chart-fit-indicator';
 chooser.innerHTML='指標 <select aria-label="下方技術指標"><option value="macd">MACD</option><option value="rsi">RSI</option></select>';
 byId('subTabs')?.append(chooser);const select=chooser.querySelector('select');
 const mainPanel=byId('mainChartPanel'),eventRail=document.createElement('div'),levelRail=document.createElement('div');
 eventRail.className='chart-event-rail';eventRail.setAttribute('aria-label','日期事件');levelRail.className='chart-level-rail';levelRail.setAttribute('aria-label','附近參考價位');mainPanel.append(eventRail,levelRail);
 const wired=new WeakSet();let eventKey='',lastTooltip=null;
 function placeTooltip(param,c,candles,chart,series){
  const tip=byId('ohlcTooltip'),plot=byId('chartContainer');if(!tip||!param.point)return;
  const width=Math.max(0,plot.clientWidth-chart.priceScale('right').width()),height=Math.max(0,plot.clientHeight-32),tw=Math.min(tip.offsetWidth,width-12),th=tip.offsetHeight;
  if(width<40||height<th+12)return;
  const high=series.priceToCoordinate(c.high),low=series.priceToCoordinate(c.low),x=chart.timeScale().timeToCoordinate(c.time);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const lefts=[clamp((width-tw)/2,6,width-tw-6),6,Math.max(6,width-tw-6)];
  const tops=[6,Math.max(6,height-th-22),clamp((high+low-th)/2,6,height-th-6)];
  const bars=candles.map(b=>({x:chart.timeScale().timeToCoordinate(b.time),hi:series.priceToCoordinate(b.high),lo:series.priceToCoordinate(b.low)})).filter(b=>b.x!=null&&b.hi!=null&&b.lo!=null&&b.x>=0&&b.x<=width);
  function cost(left,top){const middle=(high+low)/2;let n=(middle<height*.35&&top<height/2)||(middle>height*.65&&top>height/2)?1:0;for(const b of bars)if(b.x>=left-5&&b.x<=left+tw+5&&b.lo>=top-7&&b.hi<=top+th+7)n+=1+(Math.min(top+th,b.lo)-Math.max(top,b.hi))/Math.max(1,th);if(x>=left-8&&x<=left+tw+8&&low>=top-8&&high<=top+th+8)n+=100;if(param.point.x>=left-16&&param.point.x<=left+tw+16&&param.point.y>=top-16&&param.point.y<=top+th+16)n+=100;const legend=byId('maLabel');if(legend){const r=legend.getBoundingClientRect(),p=plot.getBoundingClientRect();if(left<r.right-p.left&&top<r.bottom-p.top)n+=10;}return n;}
  let best=null;for(const top of tops)for(const left of lefts){const score=cost(left,top);if(!best||score<best.score)best={left,top,score};}
  const oldLeft=parseFloat(tip.style.left),oldTop=parseFloat(tip.style.top);if(Number.isFinite(oldLeft)&&Number.isFinite(oldTop)&&oldLeft+tw<width&&oldTop+th<height&&cost(oldLeft,oldTop)<=best.score+.2)best={left:oldLeft,top:oldTop};
  for(const [key,value] of [['transform','none'],['left',best.left+'px'],['top',best.top+'px']])if(tip.style[key]!==value)tip.style[key]=value;lastTooltip={param,c,candles,chart,series};
 }
 function renderChartDetails(chart,series){
  if(!chart||!series)return;
  if(!wired.has(chart)){wired.add(chart);chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);}
  const width=Math.max(0,byId('chartContainer').clientWidth-chart.priceScale('right').width()),groups=new Map();
  for(const e of window._chartTimelineEvents||[]){const x=chart.timeScale().timeToCoordinate(e.time);if(x==null||x<12||x>width-12)continue;const group=groups.get(e.time)||{x,events:[]};group.events.push(e);groups.set(e.time,group);}
  const events=[];for(const group of [...groups.values()].sort((a,b)=>a.x-b.x)){const last=events.at(-1);if(last&&group.x-last.x<44)last.events.push(...group.events);else events.push(group);}const key=JSON.stringify(events.map(g=>g.events));
  if(key!==eventKey){eventKey=key;eventRail.replaceChildren(...events.map(g=>{const b=document.createElement('button');b.type='button';b.textContent=[...new Set(g.events.map(e=>e.label))].join('')+(g.events.length>1?'·'+g.events.length:'');b.title=g.events.map(e=>e.time+' '+(e.label==='法'?'法說會':'除權息')+' · '+e.detail).join('\n');b.setAttribute('aria-label',b.title);b.addEventListener('click',()=>{const expanded=b.getAttribute('aria-expanded')==='true';eventRail.querySelector('.chart-event-detail')?.remove();eventRail.querySelectorAll('button').forEach(x=>x.setAttribute('aria-expanded','false'));if(!expanded){b.setAttribute('aria-expanded','true');const d=document.createElement('div');d.className='chart-event-detail';d.textContent=b.title;d.setAttribute('role','status');eventRail.append(d);}});return b;}));}
  eventRail.querySelectorAll('button').forEach((b,i)=>{const left=events[i].x+'px';if(b.style.left!==left)b.style.left=left;});
  const close=window._chartMainCandles?.at(-1)?.close,levels=(window._chartSupportLevels||[]).filter(l=>Number.isFinite(l.price));
  const below=levels.filter(l=>l.price<=close).sort((a,b)=>b.price-a.price)[0],above=levels.filter(l=>l.price>close).sort((a,b)=>a.price-b.price)[0];
  const levelNodes=[];let previousY=-50;
  for(const [kind,l] of [['above',above],['below',below]]){if(!l)continue;const y=series.priceToCoordinate(l.price);if(y==null||y<12||y>byId('chartContainer').clientHeight-50)continue;const tag=document.createElement('span');tag.className='lv-'+kind;tag.textContent=String(Number(l.price.toFixed(2)));tag.style.top=Math.max(y-9,previousY+22)+'px';previousY=Math.max(y-9,previousY+22);levelNodes.push(tag);}
  const levelKey=levelNodes.map(e=>e.outerHTML).join('');if(levelRail.innerHTML!==levelKey)levelRail.replaceChildren(...levelNodes);
 }
 function hidden(el,on){if(el?.hasAttribute('data-fit-hidden')!==on)el?.toggleAttribute('data-fit-hidden',on);}
 function fitChart(instance,id){const el=byId(id);if(!instance||!el||!el.clientWidth||!el.clientHeight||!el.getClientRects().length)return false;const size=el.clientWidth+':'+el.clientHeight;if(sizes.get(instance)===size)return false;try{instance.applyOptions({width:el.clientWidth,height:el.clientHeight});sizes.set(instance,size);return true;}catch{return false;}}
 function fit(){
  frame=0;
  const showing=modal.classList.contains('open')&&!modal.classList.contains('etx-embedded')&&wrap.style.display!=='none';
  const tech=!byId('subTabChip')?.classList.contains('on');
  // Use one proportion control for technical and chip views; leave embedded ETFs intact.
  const active=showing&&window._chartMode!=='trend';
  modal.classList.toggle('chart-fit',active);modal.classList.toggle('chart-fit-chip',active&&!tech);chooser.hidden=!tech;ratios.hidden=!active;
  hidden(byId('volPanel'),active&&!tech);hidden(byId('macdPanel'),active&&(!tech||select.value!=='macd'));hidden(byId('rsiPanel'),active&&(!tech||select.value!=='rsi'));
  if(active){
   const offset=wrap.getBoundingClientRect().top-content.getBoundingClientRect().top+content.scrollTop;
   const available=matchMedia('(max-width:1100px)').matches?modal.querySelector('.modal-body').clientHeight:content.clientHeight;
   // Technical plots retain a portrait-like geometry instead of flattening to fit one screen.
   // Size from width only: scrolling must not change canvas heights or visible time ranges.
   const plotWidth=Math.max(0,wrap.clientWidth-70);
   const readableHeight=tech?Math.ceil((plotWidth*.88+32)/.60)+30:360;
   const height=Math.max(tools.open?500:360,readableHeight,Math.floor(available-offset-12));
   if(wrap.style.getPropertyValue('--chart-fit-height')!==height+'px')wrap.style.setProperty('--chart-fit-height',height+'px');
  }
  const resized=[fitChart(typeof chartInstance==='undefined'?null:chartInstance,'chartContainer'),
   fitChart(typeof volInstance==='undefined'?null:volInstance,'volContainer'),
   fitChart(typeof macdInstance==='undefined'?null:macdInstance,'macdContainer'),
   fitChart(typeof rsiInstance==='undefined'?null:rsiInstance,'rsiContainer'),
   ...Object.entries(window._chipCharts||{}).map(([key,instance])=>fitChart(instance,({fgn:'cFgn',trust:'cTrust',dealer:'cDealer',big:'cBig',retail:'cRetail'})[key]))].some(Boolean);
  if(resized)try{if(typeof resizeFibCanvas==='function')resizeFibCanvas();if(typeof redrawCanvas==='function')redrawCanvas();}catch{}
  if(active){const chart=typeof chartInstance==='undefined'?null:chartInstance,series=window._mainCandleSeries;renderChartDetails(chart,series);if(lastTooltip&&lastTooltip.chart===chart&&byId('ohlcTooltip').style.display!=='none')placeTooltip(lastTooltip.param,lastTooltip.c,lastTooltip.candles,chart,series);}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
 select.addEventListener('change',schedule);tools.addEventListener('toggle',()=>{if(!tools.open){mainRatio=defaultMainRatio;renderRatios();}schedule();});
 new ResizeObserver(schedule).observe(content);
 new MutationObserver(schedule).observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
 addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);
 window.AcademyChartViewport={refresh:schedule,placeTooltip};renderRatios();
})();
