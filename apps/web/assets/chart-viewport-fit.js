/* Resize the existing charts, never their data, drawings or visible time range. */
(() => {
 'use strict';
 const modal=document.getElementById('chartModal'),content=modal?.querySelector('.chart-content'),wrap=document.getElementById('chartWrapper');
 if(!content||!wrap)return;
 const byId=id=>document.getElementById(id),sizes=new WeakMap();let frame=0;
 const tools=document.createElement('details');tools.className='chart-fit-tools';
 tools.innerHTML='<summary><span class="chart-fit-title">週期、圖層與畫線工具</span></summary>';
 const ratios=document.createElement('span');ratios.className='chart-fit-ratios';
 ratios.innerHTML='<label>K 圖比例<input type="range" min="50" max="80" step="2" value="70" aria-label="K 圖高度比例"><output>70%</output></label><button type="button" aria-label="還原圖表比例">還原</button>';
 tools.querySelector('summary').append(ratios);
 let mainRatio=70;
 function renderRatios(){const input=ratios.querySelector('input'),sub=(100-mainRatio)/2;input.value=mainRatio;ratios.querySelector('output').value=mainRatio+'%';input.setAttribute('aria-valuetext','K 圖 '+mainRatio+'%，成交量與技術指標各 '+sub+'%');for(const [key,value] of [['main',mainRatio],['vol',sub],['tech',sub]])wrap.style.setProperty('--chart-'+key+'-ratio',value+'fr');schedule();}
 ratios.addEventListener('click',e=>{e.stopPropagation();if(!e.target.closest('input,button'))e.preventDefault();});
 ratios.addEventListener('keydown',e=>e.stopPropagation());
 ratios.addEventListener('input',e=>{if(e.target.tagName!=='INPUT')return;mainRatio=Number(e.target.value);renderRatios();});
 ratios.querySelector('button').addEventListener('click',()=>{mainRatio=70;renderRatios();});
 const first=content.querySelector('.chart-toolbar');
 const periods=document.createElement('div');periods.className='chart-period-segments';periods.setAttribute('role','group');periods.setAttribute('aria-label','圖表週期');
 const periodButtons=['hourlyBtn','dailyBtn','adjDailyBtn','weeklyBtn','monthlyBtn','yearlyBtn','trendBtn'].map(byId).filter(Boolean);
 if(periodButtons.length){periodButtons[0].before(periods);periodButtons.forEach(button=>{button.setAttribute('aria-pressed',String(button.id==='dailyBtn'));periods.append(button);});}
 if(first){first.before(tools);for(const selector of ['.chart-toolbar','.chart-layer-toolbar','.chart-draw-console']){const row=content.querySelector(selector);if(row)tools.append(row);}}
 const chooser=document.createElement('label');chooser.className='chart-fit-indicator';
 chooser.innerHTML='指標 <select aria-label="下方技術指標"><option value="macd">MACD</option><option value="rsi">RSI</option></select>';
 byId('subTabs')?.append(chooser);const select=chooser.querySelector('select');
 function hidden(el,on){if(el?.hasAttribute('data-fit-hidden')!==on)el?.toggleAttribute('data-fit-hidden',on);}
 function fitChart(instance,id){const el=byId(id);if(!instance||!el||!el.clientWidth||!el.clientHeight||!el.getClientRects().length)return false;const size=el.clientWidth+':'+el.clientHeight;if(sizes.get(instance)===size)return false;try{instance.applyOptions({width:el.clientWidth,height:el.clientHeight});sizes.set(instance,size);return true;}catch{return false;}}
 function fit(){
  frame=0;
  const showing=modal.classList.contains('open')&&!modal.classList.contains('etx-embedded')&&wrap.style.display!=='none';
  const tech=!byId('subTabChip')?.classList.contains('on');
  // Leave the existing multi-panel chip view and embedded ETF charts intact.
  const active=showing&&tech&&window._chartMode!=='trend';
  modal.classList.toggle('chart-fit',active);chooser.hidden=!tech;ratios.hidden=!active;
  hidden(byId('macdPanel'),active&&select.value!=='macd');hidden(byId('rsiPanel'),active&&select.value!=='rsi');
  if(active){
   const offset=wrap.getBoundingClientRect().top-content.getBoundingClientRect().top+content.scrollTop;
   // Very short screens keep a readable minimum and scroll inside the chart pane.
   const available=matchMedia('(max-width:1100px)').matches?modal.querySelector('.modal-body').clientHeight:content.clientHeight;
   const height=Math.max(tools.open?500:360,Math.floor(available-offset-12));
   if(wrap.style.getPropertyValue('--chart-fit-height')!==height+'px')wrap.style.setProperty('--chart-fit-height',height+'px');
  }
  const resized=[fitChart(typeof chartInstance==='undefined'?null:chartInstance,'chartContainer'),
   fitChart(typeof volInstance==='undefined'?null:volInstance,'volContainer'),
   fitChart(typeof macdInstance==='undefined'?null:macdInstance,'macdContainer'),
   fitChart(typeof rsiInstance==='undefined'?null:rsiInstance,'rsiContainer')].some(Boolean);
  if(resized)try{if(typeof resizeFibCanvas==='function')resizeFibCanvas();if(typeof redrawCanvas==='function')redrawCanvas();}catch{}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
 select.addEventListener('change',schedule);tools.addEventListener('toggle',()=>{if(!tools.open){mainRatio=70;renderRatios();}schedule();});
 new ResizeObserver(schedule).observe(content);
 new MutationObserver(schedule).observe(modal,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
 addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);
 window.AcademyChartViewport={refresh:schedule};renderRatios();
})();
