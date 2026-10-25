/* Only the current, sorted screener result list owns this navigation context. */
(() => {
 'use strict';
 const modal=document.getElementById('chartModal'),host=document.getElementById('chartNotePanel'),loading=document.getElementById('chartLoading');
 if(!host||!loading)return;
 const gauge=document.getElementById('greedGauge'),row=document.createElement('div');row.className='screen-chart-gauge-row';
 const nav=document.createElement('div');nav.className='screen-chart-nav';nav.hidden=true;nav.setAttribute('role','group');nav.setAttribute('aria-label','篩選結果逐檔瀏覽');
 const arrow=d=>'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="'+(d<0?'M8 12V4M4.5 7.5L8 4l3.5 3.5':'M8 4v8M4.5 8.5L8 12l3.5-3.5')+'"/></svg>';
 nav.innerHTML='<button type="button" aria-label="上一檔篩選結果" title="上一檔">'+arrow(-1)+'</button><span aria-live="polite" aria-atomic="true"></span><button type="button" aria-label="下一檔篩選結果" title="下一檔">'+arrow(1)+'</button>';
 host.prepend(nav);
 const previous=nav.firstElementChild,next=nav.lastElementChild,counter=nav.querySelector('span');
 let results=[],queue=[],index=-1,active=false,stepping=false;
 function busy(){return loading.style.display!=='none'&&!!loading.querySelector('.spinner');}
 function paint(){if(active&&gauge&&row.parentElement!==host){gauge.before(row);row.append(gauge,nav);}else if(!active&&row.parentElement===host){row.before(gauge);host.append(nav);row.remove();}row.dataset.gaugeEmpty=String(gauge?.style.display==='none');nav.hidden=!active||index<0;const waiting=busy();previous.disabled=index<=0||waiting;next.disabled=index>=queue.length-1||waiting;counter.textContent=(index+1)+'／'+queue.length;counter.setAttribute('aria-label','第 '+(index+1)+' 檔，共 '+queue.length+' 檔');nav.setAttribute('aria-busy',String(waiting));}
 function clear(){active=false;stepping=false;queue=[];index=-1;modal.removeAttribute('data-screen-nav');modal.style.removeProperty('--screen-chart-loading-height');paint();}
 function open(code,fromScreen){
  const period=stepping?{key:window._chartPeriodKey||'day',adjusted:!!window._chartAdjusted}:null;stepping=false;
  if(!fromScreen){clear();return null;}
  if(!period)queue=results.slice();index=queue.findIndex(s=>s.code===String(code));active=index>=0;
  if(active)modal.dataset.screenNav='true';else modal.removeAttribute('data-screen-nav');paint();return active?period:null;
 }
 function step(delta){if(!active||busy())return;const target=queue[index+delta];if(!target)return;
  const h=document.getElementById('chartWrapper').getBoundingClientRect().height;if(h>0)modal.style.setProperty('--screen-chart-loading-height',Math.round(h)+'px');
  stepping=true;try{window.openChart(target.code,target.name,target.industry,target.close,true);}finally{stepping=false;paint();}
 }
 nav.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const button=e.target.closest('button');if(button&&!button.disabled)step(button===previous?-1:1);});
 nav.addEventListener('keydown',e=>e.stopPropagation());
 new MutationObserver(paint).observe(loading,{attributes:true,attributeFilter:['style'],childList:true});
 if(gauge)new MutationObserver(paint).observe(gauge,{attributes:true,attributeFilter:['style']});
 window.AcademyScreenChartNav={setResults(rows){results=rows.map(s=>({code:String(s.code),name:s.name||String(s.code),industry:s.industry||'',close:Number(s.close)||0}));},open,clear};
})();
