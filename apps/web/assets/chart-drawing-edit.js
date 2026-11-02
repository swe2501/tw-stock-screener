/* Manual drawings remain in date/price coordinates. Clipboard is tab-local, never remote. */
(()=>{'use strict';
const bridge=()=>window.AcademyChartBridge,host=document.getElementById('chartContainer');if(!host)return;
let drag=null,clipboard=null,selected=null,anchor=null,suppressClick=false;
const menu=document.createElement('div');menu.className='drawing-context';menu.role='menu';menu.hidden=true;document.body.append(menu);
menu.innerHTML=`<div class="drawing-context-title">標記工具</div>
  <div class="drawing-context-tools" role="group" aria-label="常用標記工具">
    <button type="button" data-tool="seg" title="線段">╱<span>線段</span></button>
    <button type="button" data-tool="hline" title="水平線">—<span>水平</span></button>
    <button type="button" data-tool="arrowup" title="向上箭頭">↑<span>箭頭</span></button>
    <button type="button" data-tool="rect" title="矩形">▧<span>矩形</span></button>
    <button type="button" data-tool="circle" title="圓形">○<span>圓形</span></button>
    <button type="button" data-tool="text" title="文字">T<span>文字</span></button>
  </div>
  <div class="drawing-context-separator"></div>
  <button type="button" role="menuitem" aria-label="複製" data-action="copy"><span>複製</span><kbd>Ctrl C</kbd></button>
  <button type="button" role="menuitem" aria-label="貼上" data-action="paste"><span>貼上</span><kbd>Ctrl V</kbd></button>
  <button type="button" role="menuitem" aria-label="刪除" data-action="delete" class="is-danger"><span>刪除</span><kbd>Delete</kbd></button>`;
const clone=x=>JSON.parse(JSON.stringify(x));
function state(){const b=bridge()?.get();return b?.chart&&b.series?b:null;}
function ready(){const b=state();return b&&!b.tool&&!b.zoom&&!b.fib&&!b.trendLine&&!b.drawing&&!window.AcademyChartTools?.isSelecting()?b:null;}
function pos(e){const g=bridge().plot();return{x:e.clientX-g.pageLeft,y:e.clientY-g.pageTop};}
function inside(p){const g=bridge()?.plot();return g&&p.x>=0&&p.x<=g.width&&p.y>=0&&p.y<=g.height;}
function points(item){return item.kind==='shape'?item.value.pts:[{time:item.value.time1,price:item.value.price1},{time:item.value.time2,price:item.value.price2}];}
function hit(p,b){let found=null,best=7;const X=q=>bridge().x(q),Y=v=>b.series.priceToCoordinate(v);for(const value of b.drawings){const d=bridge().distance(value,p.x,p.y,X,Y);if(d<best){best=d;found={kind:'shape',value};}}for(const value of bridge().legacy()){const a=X(value.time1),c=X(value.time2),y=Y(value.price1),z=Y(value.price2);if([a,c,y,z].some(v=>v==null))continue;const dx=c-a,dy=z-y,t=Math.max(0,Math.min(1,((p.x-a)*dx+(p.y-y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p.x-a-t*dx,p.y-y-t*dy);if(d<best){best=d;found={kind:'legacy',value};}}return found;}
function shifted(source,deltaLi,deltaPrice,b){const ts=b.chart.timeScale();return source.map(q=>{let li=q.li;if(q.time!=null){const x=ts.timeToCoordinate(q.time);li=x==null?null:ts.coordinateToLogical(x);}if(!Number.isFinite(li))return null;li+=deltaLi;const x=ts.logicalToCoordinate(li);return{...q,time:x==null?null:ts.coordinateToTime(x),li,price:q.price+deltaPrice};});}
function apply(item,pts){if(pts.some(p=>!p||!Number.isFinite(p.price)))return false;if(item.kind==='shape')item.value.pts=pts;else Object.assign(item.value,{time1:pts[0].time,price1:pts[0].price,time2:pts[1].time,price2:pts[1].price});return true;}
function hide(){menu.hidden=true;}
function copySelected(){if(!selected)return false;clipboard={kind:selected.kind,value:clone(selected.value)};return true;}
function targetAnchor(b){if(anchor?.code===b.code&&Number.isFinite(anchor.li)&&Number.isFinite(anchor.price))return anchor;const g=bridge().plot();return{...bridge().coord(g.width/2,g.height/2),code:b.code};}
function pasteAt(b){if(!clipboard)return false;const at=targetAnchor(b),item={kind:clipboard.kind,value:clone(clipboard.value)},p=points(item),ts=b.chart.timeScale(),first=p[0],x=first.time!=null?ts.timeToCoordinate(first.time):ts.logicalToCoordinate(first.li),li=x==null?null:ts.coordinateToLogical(x);if(!Number.isFinite(li)||!Number.isFinite(at.li)||!apply(item,shifted(p,at.li-li,at.price-first.price,b)))return false;(item.kind==='shape'?b.drawings:bridge().legacy()).push(item.value);selected=null;bridge().save();bridge().redraw();return true;}
function deleteSelected(b){if(!selected)return false;const list=selected.kind==='shape'?b.drawings:bridge().legacy(),i=list.indexOf(selected.value);if(i<0)return false;list.splice(i,1);selected=null;bridge().save();bridge().redraw();return true;}
function activateTool(tool){hide();bridge()?.deactivate?.();if(typeof window._pickDraw==='function')window._pickDraw(tool);}
host.addEventListener('pointerdown',e=>{hide();const b=ready(),p=pos(e);if(e.button!==0||!b||!inside(p))return;const item=hit(p,b);if(!item)return;const origin=bridge().coord(p.x,p.y);if(!Number.isFinite(origin.li)||!Number.isFinite(origin.price))return;drag={item,source:clone(points(item)),origin,code:b.code,id:e.pointerId,moved:false};e.preventDefault();e.stopImmediatePropagation();host.setPointerCapture(e.pointerId);host.classList.add('drawing-moving');},true);
host.addEventListener('pointermove',e=>{const b=ready(),p=pos(e);if(!drag){host.classList.toggle('drawing-can-move',!!(b&&inside(p)&&hit(p,b)));return;}e.preventDefault();e.stopImmediatePropagation();if(!b||b.code!==drag.code)return;const c=bridge().coord(p.x,p.y);if(!Number.isFinite(c.li)||!Number.isFinite(c.price))return;const dx=c.li-drag.origin.li,dy=c.price-drag.origin.price;if(Math.abs(dx)<.25&&Math.abs(dy)<1e-7)return;drag.moved=apply(drag.item,shifted(drag.source,dx,dy,b))||drag.moved;bridge().redraw();},true);
function finish(e,cancel=false){if(!drag)return;e.stopImmediatePropagation();if(cancel)apply(drag.item,drag.source);else if(drag.moved)bridge().save();suppressClick=drag.moved;drag=null;host.classList.remove('drawing-moving');if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);bridge().redraw();}
host.addEventListener('pointerup',e=>finish(e),true);host.addEventListener('pointercancel',e=>finish(e,true),true);host.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
host.addEventListener('contextmenu',e=>{let b=state();if(!b)return;if(b.zoom){e.preventDefault();e.stopImmediatePropagation();bridge().deactivate();hide();return;}const p=pos(e);if(!inside(p))return;e.preventDefault();e.stopImmediatePropagation();if(b.tool||b.fib||b.trendLine||b.drawing){bridge().deactivate();b=state();}selected=hit(p,b);anchor={...bridge().coord(p.x,p.y),code:b.code};menu.querySelector('[data-action=copy]').disabled=!selected;menu.querySelector('[data-action=delete]').disabled=!selected;menu.querySelector('[data-action=paste]').disabled=!clipboard;menu.hidden=false;menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,e.clientX))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,e.clientY))+'px';},true);
menu.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;const tool=button.dataset.tool;if(tool){activateTool(tool);return;}const action=button.dataset.action,b=ready();if(!b)return;if(action==='copy')copySelected();if(action==='paste')pasteAt(b);if(action==='delete')deleteSelected(b);hide();});
document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))hide();},true);document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;const b=ready();if(e.key==='Escape'){hide();return;}if(!b)return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='c'&&selected){e.preventDefault();copySelected();hide();}else if(mod&&e.key.toLowerCase()==='v'&&clipboard){e.preventDefault();pasteAt(b);hide();}else if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();deleteSelected(b);hide();}},true);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
})();
