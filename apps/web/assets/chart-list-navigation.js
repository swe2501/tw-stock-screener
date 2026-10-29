/* One ordered navigation context per list opening; standalone searches clear it. */
(()=>{'use strict';
 const modal=document.getElementById('chartModal'),panel=modal?.querySelector('.chart-content'),plot=document.getElementById('mainChartPanel');
 if(!modal||!panel)return;
 const selector='[onclick],[onclick*="openChart"],[onclick*="openStock"],[onclick*="_openStock"],[data-chart],[data-private-chart],[data-inspect],[data-stock-code],[data-open-chart],[data-c],[data-code]';
 const valid=code=>/^(?:\d{4,6}[A-Z]?|\^[A-Z0-9.]+)$/.test(String(code||''));
 const visible=e=>e.getClientRects().length&&!e.closest('[hidden],.gs-sd,.gs-sd-item,.chart-stock-search');
 function item(e){
  const inline=e.getAttribute('onclick')||'',match=inline.match(/(?:openChart|_?openStock)\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]*)['"])?/);
  const literal=inline.match(/['"](\d{4,6}[A-Z]?)['"]/);
  const code=match?.[1]||literal?.[1]||e.dataset.chart||e.dataset.privateChart||e.dataset.inspect||e.dataset.stockCode||e.dataset.openChart||e.dataset.c||e.dataset.code;
  return valid(code)?{code:String(code),name:match?.[2]||e.dataset.n||e.dataset.name||window._names?.[code]||String(code),industry:'',close:0}:null;
 }
 function items(scope,origin){
  const seen=new Set(),cell=origin?.closest('td,th'),isTable=scope.tagName==='TABLE';
  return [...scope.querySelectorAll(selector)].filter(visible).filter(e=>!isTable||(cell?e.tagName==='TR'||e.closest('td,th')?.cellIndex===cell.cellIndex:e.tagName==='TR')).map(item).filter(r=>r&&!seen.has(r.code)&&seen.add(r.code));
 }
 let clicked=null,explicit=null,queue=[],active=false,stepping=false,fromScreen=false,positions=[],drawerSource=null;
 function capture(e){
  if(modal.contains(e.target))return;
  const node=e.target.closest(selector);clicked=null;if(!node||!visible(node))return;
  const row=item(node);if(!row)return;
  const table=node.closest('[data-chart-list]')||node.closest('table,[role="list"]');
  if(table){clicked={rows:items(table,node),code:row.code};return;}
  for(let scope=node.parentElement,depth=0;scope&&depth<5&&scope!==document.body;scope=scope.parentElement,depth++){
   const rows=items(scope);if(rows.length>1){clicked={rows,code:row.code};return;}
  }
 }
 document.addEventListener('click',capture,true);
 // Some delegated handlers are asynchronous; retain the clicked list, never infer a global page list.
 const header=modal.querySelector('.modal-header');let headerSize=null;
 function unlockHeader(){if(header&&headerSize){header.style.minHeight=headerSize.min;header.style.boxSizing=headerSize.box;headerSize=null;}}
 const nav=document.createElement('div');nav.id='chartListNav';nav.hidden=true;nav.setAttribute('role','group');nav.setAttribute('aria-label','清單逐檔瀏覽');
 const icon=d=>'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="'+(d<0?'m12 5-5 5 5 5':'m8 5 5 5-5 5')+'"/></svg>';
 nav.innerHTML='<div><button type="button" aria-label="上一檔" title="上一檔">'+icon(-1)+'</button><button type="button" aria-label="下一檔" title="下一檔">'+icon(1)+'</button></div><span aria-live="polite" aria-atomic="true"></span>';
 const [prev,next]=nav.querySelectorAll('button'),count=nav.querySelector('span');
 panel.append(nav);prev.className='chart-list-prev';next.className='chart-list-next';
 function index(){return queue.findIndex(r=>r.code===String(window.AcademyChartBridge?.get()?.code));}
 let placeFrame=0;
 function mount(){
  if(!active||!plot||!modal.classList.contains('open'))return;
  const r=plot.getBoundingClientRect(),p=panel.getBoundingClientRect();if(!r.width||!r.height)return;
  let g;try{g=window.AcademyChartBridge?.plot();}catch(_){}if(!g?.width||!g?.height)return;
  Object.assign(nav.style,{left:(g.pageLeft-p.left-panel.clientLeft+panel.scrollLeft)+'px',top:(g.pageTop-p.top-panel.clientTop+panel.scrollTop)+'px',width:g.width+'px',height:g.height+'px'});
 }
 function schedulePlace(){if(!placeFrame)placeFrame=requestAnimationFrame(()=>{placeFrame=0;mount();});}
 panel.addEventListener('pointermove',e=>{const r=nav.getBoundingClientRect(),mid=Math.abs(e.clientY-r.top-r.height/2)<48;nav.classList.toggle('near-prev',mid&&e.clientX>=r.left-4&&e.clientX<r.left+44);nav.classList.toggle('near-next',mid&&e.clientX<=r.right+4&&e.clientX>r.right-44);},{passive:true});panel.addEventListener('pointerleave',()=>nav.classList.remove('near-prev','near-next'));
 new ResizeObserver(schedulePlace).observe(panel);if(plot)new ResizeObserver(schedulePlace).observe(plot);
 let pointerHeld=false,modeAfterStep=null;
 function toolInUse(){return !!(pointerHeld||window.AcademyChartBridge?.get()?.drawing||window.AcademyChartTools?.isDragging());}
 function syncTools(){if(toolInUse()!==lastTools)paint();}
 panel.addEventListener('pointerdown',e=>{if(e.button===0&&e.target.closest('#chartOverlay,#chartRangeCapture')){pointerHeld=true;syncTools();}},true);
 addEventListener('pointerup',()=>{pointerHeld=false;requestAnimationFrame(syncTools);},true);
 addEventListener('pointercancel',()=>{pointerHeld=false;requestAnimationFrame(syncTools);},true);
 panel.addEventListener('click',()=>queueMicrotask(syncTools));
 let lastTools=false;
 function paint(){mount();const i=index(),usingTool=toolInUse();lastTools=usingTool;nav.hidden=!active||i<0||usingTool;prev.disabled=usingTool||stepping||i<=0;next.disabled=usingTool||stepping||i>=queue.length-1;count.textContent=(i+1)+' / '+queue.length;nav.setAttribute('aria-busy',String(stepping));prev.title=i>0?'上一檔 · '+queue[i-1].code+' '+queue[i-1].name:'已是第一檔';next.title=i<queue.length-1?'下一檔 · '+queue[i+1].code+' '+queue[i+1].name:'已是最後一檔';}
 function restore(){for(const p of positions){if(p.el===window)window.scrollTo(p.x,p.y);else{p.el.scrollLeft=p.x;p.el.scrollTop=p.y;}}}
 function open(code,screen,presentation){
  if(stepping){paint();return window._chartPeriodKey?{key:window._chartPeriodKey,adjusted:!!window._chartAdjusted}:null;}
  unlockHeader();
  const source=explicit||(clicked?.code===String(code)?clicked.rows:null)||(modal.classList.contains('etx-embedded')&&drawerSource?.code===String(code)?drawerSource.rows:null);explicit=null;clicked=null;
  queue=screen?(window._scNavList||[]).slice():source?source.slice():[];fromScreen=!!screen;
  active=queue.length>1&&queue.some(r=>r.code===String(code));positions=[];paint();return null;
 }
 function go(delta){
  if(!active||stepping||toolInUse())return;const target=queue[index()+delta];if(!target)return;
  positions=[{el:window,x:scrollX,y:scrollY},...[modal,...modal.querySelectorAll('.modal-box,#chartContent,#chartNotePanel')].map(el=>({el,x:el.scrollLeft,y:el.scrollTop}))];
  if(header){if(!headerSize)headerSize={min:header.style.minHeight,box:header.style.boxSizing};header.style.boxSizing='border-box';header.style.minHeight=Math.ceil(header.getBoundingClientRect().height)+'px';}
  const mode=window.AcademyChartBridge?.get();modeAfterStep={tool:mode?.tool,zoom:mode?.zoom,fib:mode?.fib,trendLine:mode?.trendLine,interval:!!window.AcademyChartTools?.isSelecting()};
  stepping=true;paint();
  try{window.openChart(target.code,target.name,target.industry||'',target.close||0,fromScreen,null,'',null,'',modal.classList.contains('chart-analysis-only')?{analysisOnly:true}:null);requestAnimationFrame(restore);}catch(e){ready();throw e;}
 }
 function ready(){const wasStep=stepping,saved=modeAfterStep;modeAfterStep=null;stepping=false;pointerHeld=false;
  if(wasStep&&saved&&window.AcademyChartBridge?.get()?.series){const b=window.AcademyChartBridge.get();
   if(saved.tool&&b.tool!==saved.tool)window._setDrawTool(saved.tool);
   else if(saved.interval&&!window.AcademyChartTools?.isSelecting())window.AcademyChartTools.toggleInterval();
   else if(saved.fib&&!b.fib)window.toggleFibMode();
   else if(saved.trendLine&&!b.trendLine)window.toggleTrendLine();
   else if(saved.zoom&&(!b.zoom||document.getElementById('chartOverlay').style.display!=='block')){window._cancelChartTool();window.toggleZoomMode();}
  }
  paint();if(wasStep){restore();requestAnimationFrame(restore);}
 }
 // Avoid browser focus scrolling and generic pressed-button translate effects.
 nav.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
 nav.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const b=e.target.closest('button');if(b&&!b.disabled)go(b===prev?-1:1);});
 nav.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();go(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);}});
 new MutationObserver(records=>{if(!records.some(r=>['chartOverlay','chartRangeCapture'].includes(r.target.id)||[...r.addedNodes].some(n=>n.id==='chartRangeCapture')))return;syncTools();}).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']});
 const loading=document.getElementById('chartLoading');if(loading)new MutationObserver(()=>{if(stepping&&(loading.style.display==='none'||!loading.querySelector('.spinner')))requestAnimationFrame(ready);}).observe(loading,{attributes:true,attributeFilter:['style'],childList:true});
 addEventListener('resize',()=>{unlockHeader();if(active)paint();},{passive:true});panel.addEventListener('scroll',schedulePlace,{passive:true});
 new MutationObserver(()=>{if(!modal.classList.contains('open')){unlockHeader();active=false;stepping=false;pointerHeld=false;modeAfterStep=null;queue=[];paint();}}).observe(modal,{attributes:true,attributeFilter:['class']});
 window.AcademyChartListNav={open,go,ready,paint,place:schedulePlace,rememberDrawer(code){drawerSource=clicked?.code===String(code)?{...clicked}:null;},get active(){return active;},get stepping(){return stepping;},setSource(rows){const seen=new Set();explicit=rows.filter(r=>valid(r.code)&&!seen.has(String(r.code))&&seen.add(String(r.code))).map(r=>({...r,code:String(r.code)}));},clear(){unlockHeader();active=false;stepping=false;queue=[];clicked=null;explicit=null;paint();}};
})();
