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
 let mainRatio=defaultMainRatio;try{const saved=Number(localStorage.getItem('kv_main_ratio'));if(saved>=50&&saved<=80&&saved%2===0)mainRatio=saved;}catch{}
 function renderRatios(){const input=ratios.querySelector('input'),sub=(100-mainRatio)/2;input.value=mainRatio;ratios.querySelector('output').value=mainRatio+'%';input.setAttribute('aria-valuetext','K 圖 '+mainRatio+'%，下方資料區 '+(100-mainRatio)+'%');for(const [key,value] of [['main',mainRatio],['vol',sub],['tech',sub],['sub',100-mainRatio]])wrap.style.setProperty('--chart-'+key+'-ratio',value+'fr');schedule();}
 ratios.addEventListener('click',e=>{e.stopPropagation();if(!e.target.closest('input,button'))e.preventDefault();});
 ratios.addEventListener('keydown',e=>e.stopPropagation());
 ratios.addEventListener('input',e=>{if(e.target.tagName!=='INPUT')return;mainRatio=Number(e.target.value);try{localStorage.setItem('kv_main_ratio',String(mainRatio));}catch{}renderRatios();});
 ratios.querySelector('button').addEventListener('click',()=>{mainRatio=defaultMainRatio;try{localStorage.setItem('kv_main_ratio',String(mainRatio));}catch{}renderRatios();});
 const first=content.querySelector('.chart-toolbar');
 const periods=document.createElement('div');periods.className='chart-period-segments';periods.setAttribute('role','group');periods.setAttribute('aria-label','圖表週期');
 const periodButtons=['hourlyBtn','dailyBtn','weeklyBtn','monthlyBtn','yearlyBtn','trendBtn'].map(byId).filter(Boolean);
 if(periodButtons.length){periodButtons[0].before(periods);periodButtons.forEach(button=>{button.setAttribute('aria-pressed',String(button.id==='dailyBtn'));periods.append(button);});}
 if(first){first.before(tools);for(const selector of ['.chart-toolbar','.chart-layer-toolbar','.chart-draw-console']){const row=content.querySelector(selector);if(row)tools.append(row);}}
 const summary=tools.querySelector('summary');summary.querySelector('.chart-fit-title').textContent='圖表工具';
 const quick=document.createElement('div');quick.className='chart-quick-controls';quick.append(periods);const log=byId('chartLogBtn');if(log){log.previousElementSibling?.classList.contains('toolbar-sep')&&log.previousElementSibling.remove();quick.append(log);}
 const actions=document.createElement('div');actions.className='chart-summary-actions';actions.append(ratios,summary.querySelector('.chart-fit-title'));summary.append(quick,actions);
 quick.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();});quick.addEventListener('keydown',e=>e.stopPropagation());
 let toolsPinned=false;try{toolsPinned=localStorage.getItem('kv_tools_pinned')==='1';}catch{}
 const pinLabel=document.createElement('label');pinLabel.className='chart-tools-pin';pinLabel.innerHTML='<input type="checkbox" aria-label="固定工具列">固定';const pinInput=pinLabel.querySelector('input');pinInput.checked=toolsPinned;actions.insertBefore(pinLabel,summary.querySelector('.chart-fit-title'));
 function savePin(){toolsPinned=pinInput.checked;try{localStorage.setItem('kv_tools_pinned',toolsPinned?'1':'0');}catch{}tools.classList.toggle('is-pinned',toolsPinned);if(toolsPinned)tools.open=true;else collapseArmed=true;summary.setAttribute('aria-expanded',String(tools.open));schedule();}
 pinInput.addEventListener('change',savePin);pinLabel.addEventListener('click',e=>{e.stopPropagation();if(e.target!==pinInput){e.preventDefault();pinInput.checked=!pinInput.checked;savePin();}});pinLabel.addEventListener('keydown',e=>e.stopPropagation());
 summary.addEventListener('click',e=>{if(toolsPinned&&!e.target.closest('button,input,label'))e.preventDefault();});
 queueMicrotask(()=>{tools.classList.toggle('is-pinned',toolsPinned);if(toolsPinned){tools.open=true;summary.setAttribute('aria-expanded','true');schedule();}});
 const drawer=document.createElement('div');drawer.className='chart-tools-drawer';for(const child of [...tools.children])if(child!==summary)drawer.append(child);tools.append(drawer);
 tools.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(tools.open)));
 summary.setAttribute('aria-expanded','false');
 const layerPanels=document.createElement('div');layerPanels.className='chart-fit-layer-panels';
 tools.querySelector('.chart-layer-toolbar')?.after(layerPanels);
 for(const id of ['mkPanel','srLinePanel','vpPanel','brokerFilterPanel','aiBuyPanel','sma20GroupPanel']){const panel=byId(id);if(panel)layerPanels.append(panel);}
 const chooser=document.createElement('label');chooser.className='chart-fit-indicator';
 chooser.innerHTML='指標 <select aria-label="下方技術指標"><option value="macd">MACD</option><option value="rsi">RSI</option></select>';
 byId('subTabs')?.append(chooser);const select=chooser.querySelector('select');
 const mainPanel=byId('mainChartPanel'),eventRail=document.createElement('div'),levelRail=document.createElement('div');
 let collapseArmed=false;
 summary.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse'||tools.open)return;tools.open=true;collapseArmed=true;summary.setAttribute('aria-expanded','true');schedule();});
 document.addEventListener('click',e=>{if(e.target.closest('.chart-tools-drawer button,.chart-tools-drawer input,.chart-tools-drawer select,.draw-dd-menu button'))collapseArmed=true;});
 function collapseForChart(e){if(toolsPinned||e.pointerType!=='mouse'||e.buttons||!tools.open||document.querySelector('.draw-dd-menu.open'))return;if(!collapseArmed&&!window.AcademyChartBridge?.get()?.tool&&!window.AcademyChartTools?.isSelecting())return;tools.open=false;collapseArmed=false;summary.setAttribute('aria-expanded','false');schedule();}
 mainPanel.addEventListener('pointerenter',collapseForChart,{passive:true});mainPanel.addEventListener('pointermove',collapseForChart,{passive:true});
 eventRail.className='chart-event-rail';eventRail.setAttribute('aria-label','日期事件');levelRail.className='chart-level-rail';levelRail.setAttribute('aria-label','附近參考價位');mainPanel.append(eventRail,levelRail);
 const srSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');srSvg.classList.add('chart-sr-shortlines');srSvg.setAttribute('aria-hidden','true');mainPanel.append(srSvg);
 let srKey='',srPinned='',srHover='';
 function paintSr(){
  const tags=[...levelRail.querySelectorAll('button')],selected=tags.find(b=>b.dataset.price===(srHover||srPinned)),prices=selected?.dataset.prices.split(',')||[],panelRect=mainPanel.getBoundingClientRect(),plotWidth=Number(srSvg.getAttribute('width'))||0;
  for(const line of srSvg.children){const active=prices.includes(line.dataset.price),tag=tags.find(b=>b.dataset.prices.split(',').includes(line.dataset.price)),end=tag?Math.max(0,tag.getBoundingClientRect().left-panelRect.left-7):plotWidth;
   line.setAttribute('x2',String(end));line.setAttribute('x1',active?'0':String(Math.max(0,end-82)));line.classList.toggle('is-expanded',active);}
  for(const button of tags){const active=button.dataset.price===(srHover||srPinned);button.setAttribute('aria-expanded',String(active));if(!active)continue;const detail=button.querySelector('small'),r=button.getBoundingClientRect(),w=Math.min(240,Math.max(80,plotWidth-16));detail.style.width=w+'px';
   if(r.left-panelRect.left>=w+12){detail.style.right='calc(100% + 8px)';detail.style.top='0px';}else{detail.style.right='0px';const h=detail.offsetHeight;detail.style.top=r.top-panelRect.top>=h+8?(-h-8)+'px':(button.offsetHeight+6)+'px';}
  }
 }

 for(const name of ['pointerover','focusin'])levelRail.addEventListener(name,e=>{const b=e.target.closest('button');if(b){srHover=b.dataset.price;paintSr();}});
 levelRail.addEventListener('pointerleave',()=>{srHover='';paintSr();});levelRail.addEventListener('focusout',()=>{srHover='';paintSr();});
 levelRail.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;srPinned=srPinned===b.dataset.price?'':b.dataset.price;srHover='';paintSr();});
 document.addEventListener('pointerdown',e=>{if(!levelRail.contains(e.target)){srPinned=srHover='';paintSr();}},true);
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
  const visible=[],unique=new Map();
  for(const l of levels){const k=String(l.price),item=unique.get(k)||{price:l.price,sources:[]};if(l.title&&!item.sources.includes(l.title))item.sources.push(l.title);unique.set(k,item);}
  for(const l of unique.values()){const y=series.priceToCoordinate(l.price);if(y==null||y<12||y>byId('chartContainer').clientHeight-50)continue;visible.push({kind:l.price>close?'above':'below',price:l.price,y,sources:l.sources.join('、')});}
  visible.sort((a,b)=>a.y-b.y);
  const clusters=[];for(const l of visible){const last=clusters.at(-1);if(last&&l.y-last.y<27){last.items.push(l);}else clusters.push({y:l.y,items:[l]});}
  const levelKey=JSON.stringify([width,visible]);
  if(srKey!==levelKey){srKey=levelKey;if(!clusters.some(c=>String(c.items[0].price)===srPinned))srPinned='';srHover='';levelRail.replaceChildren();srSvg.replaceChildren();srSvg.setAttribute('width',width);srSvg.setAttribute('height',byId('chartContainer').clientHeight);
   for(const cluster of clusters){const l=cluster.items[0],tag=document.createElement('button');tag.type='button';tag.className='lv-'+l.kind;tag.dataset.price=String(l.price);tag.dataset.prices=cluster.items.map(x=>x.price).join(',');tag.style.top=(l.y-9)+'px';tag.setAttribute('aria-expanded','false');const label=String(Number(l.price.toFixed(2)));tag.title=cluster.items.map(x=>Number(x.price.toFixed(2))+' · '+x.sources).join('\n');tag.setAttribute('aria-label',(l.kind==='above'?'壓力 ':'支撐 ')+tag.title+'；展開完整參考線');tag.append(document.createTextNode(label+(cluster.items.length>1?' · +'+(cluster.items.length-1):'')));const detail=document.createElement('small');detail.textContent=tag.title;tag.append(detail);levelRail.append(tag);}
   for(const l of visible){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.dataset.price=String(l.price);line.setAttribute('x2',width);line.setAttribute('y1',l.y);line.setAttribute('y2',l.y);line.setAttribute('class','lv-'+l.kind);srSvg.append(line);}paintSr();}

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
   const body=modal.querySelector('.modal-body');
   const viewportBottom=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:innerHeight;
   const bottom=Math.min(body.getBoundingClientRect().bottom,viewportBottom);
   // Measure the unscrolled position, so scrolling cannot grow the plots again.
   const top=wrap.getBoundingClientRect().top+content.scrollTop+body.scrollTop;
   const height=Math.max(120,Math.floor(bottom-top-12));
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
 select.addEventListener('change',schedule);tools.addEventListener('toggle',schedule);
 new ResizeObserver(schedule).observe(content);
 new MutationObserver(schedule).observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
 window.visualViewport?.addEventListener('resize',schedule);
 addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);
 window.AcademyChartViewport={refresh:schedule,placeTooltip};renderRatios();
})();
