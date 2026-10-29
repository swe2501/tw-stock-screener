/* Price-axis and manual research tools. Prices/volume always use loaded bars. */
(()=>{'use strict';
const ratios=[0,.191,.382,.5,.618,.809,1,1.191,1.382,1.5,1.618,1.809,2,2.382,2.618,3,3.382,3.618,4,4.236];
const amplitudeRatios=[...ratios,6.854];
const finite=v=>typeof v==='number'&&Number.isFinite(v),fmt=(n,d=2)=>finite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
const bridge=()=>window.AcademyChartBridge?.get(),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Drawing gestures stay on the overlay; wheel zoom changes only the chart viewport.
// Use chart coordinates directly so no synthetic pointer event can finish/cancel a tool.
addEventListener('wheel',e=>{
 if(!e.target.closest?.('#chartOverlay,#chartRangeCapture')||!document.getElementById('chartModal')?.classList.contains('open'))return;
 const b=bridge(),host=document.getElementById('chartContainer'),ts=b?.chart?.timeScale(),range=ts?.getVisibleLogicalRange();
 if(!host||!range||!e.deltaY)return;
 e.preventDefault();e.stopPropagation();
 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1),span=range.to-range.from;
 const plot=window.AcademyChartBridge.plot(),x=Math.max(0,Math.min(ts.width(),e.clientX-plot.pageLeft)),anchor=ts.coordinateToLogical(x);
 if(!finite(anchor)||span<=0)return;
 const next=Math.max(8,Math.min(Math.max(3000,b.candles.length*4),span*Math.exp(Math.max(-.35,Math.min(.35,delta*.0015))))),fraction=(anchor-range.from)/span;
 ts.setVisibleLogicalRange({from:anchor-next*fraction,to:anchor+next*(1-fraction)});
 requestAnimationFrame(()=>{window.AcademyChartBridge?.redraw();drawRange();queueReportPosition();});
},{capture:true,passive:false});
let logarithmic=false;try{logarithmic=localStorage.getItem('kv_price_log')==='1';}catch{}
function levels(shape){const p=shape.pts||[];if(shape.type==='amplitude'&&p.length===3)return amplitudeRatios.map(r=>({ratio:r,price:p[2].price+(p[1].price-p[0].price)*r}));if(shape.type==='fibret'&&p.length===2)return ratios.map(r=>({ratio:r,price:p[1].price+(p[0].price-p[1].price)*r}));if(shape.type==='fibext'&&p.length===3)return ratios.map(r=>({ratio:r,price:p[2].price+(p[1].price-p[0].price)*r}));return [];}
function measureAmplitude(shape){const p=shape.pts||[];if(p.length!==3)return null;const ab=p[1].price-p[0].price,bc=p[2].price-p[1].price;return {firstChange:p[0].price?ab/Math.abs(p[0].price)*100:null,secondChange:p[1].price?bc/Math.abs(p[1].price)*100:null,ratio:ab?Math.abs(bc/ab):null};}
let rulerSeries=null,rulerKey='',fullRuler=false,rulerControls=null;
function setRulerView(full){fullRuler=full;syncRulerScale();const b=bridge();if(b?.series){b.series.applyOptions({});b.chart.priceScale('right').applyOptions({autoScale:true});window.AcademyChartBridge.redraw();}}
function syncRulerScale(){const b=bridge();if(!b?.series||!b.chart)return;const shapes=()=>((bridge()?.drawings)||[]).filter(s=>s.type==='amplitude'&&s.pts?.length===3);
 if(!rulerControls&&document.getElementById('chartWrapper')){rulerControls=document.createElement('div');rulerControls.id='chartRulerViewControls';rulerControls.setAttribute('role','group');rulerControls.setAttribute('aria-label','黃金尺檢視');rulerControls.innerHTML='<span>黃金尺檢視</span><button type="button" data-ruler-view="candles">K 棒自然比例</button><button type="button" data-ruler-view="full">顯示完整尺</button>';document.getElementById('chartWrapper').before(rulerControls);rulerControls.addEventListener('click',e=>{const button=e.target.closest('[data-ruler-view]');if(button)setRulerView(button.dataset.rulerView==='full');});}

 if(rulerSeries!==b.series){rulerSeries=b.series;rulerKey='';fullRuler=false;b.series.applyOptions({autoscaleInfoProvider:original=>{const base=original();if(!base?.priceRange||!fullRuler)return base;const current=bridge();if(current?.series!==b.series)return base;const log=b.chart.priceScale('right').options().mode===1;let min=base.priceRange.minValue,max=base.priceRange.maxValue;
  for(const shape of shapes()){for(const l of levels(shape)){if(!finite(l.price)||(log&&l.price<=0))continue;min=Math.min(min,l.price);max=Math.max(max,l.price);}}
  return {...base,priceRange:{...base.priceRange,minValue:min,maxValue:max}};}});}
 const all=shapes();if(!all.length&&fullRuler){fullRuler=false;b.series.applyOptions({});b.chart.priceScale('right').applyOptions({autoScale:true});}
 if(rulerControls){rulerControls.hidden=!all.length;rulerControls.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.rulerView==='full')===fullRuler)));}
 const key=JSON.stringify(all);if(key!==rulerKey){rulerKey=key;if(fullRuler)b.chart.priceScale('right').applyOptions({autoScale:true});}
}
function distance(px,py,a,b,c,d){const dx=c-a,dy=d-b,l=dx*dx+dy*dy,t=Math.max(0,Math.min(1,l?((px-a)*dx+(py-b)*dy)/l:0));return Math.hypot(px-a-t*dx,py-b-t*dy);}
let labelBoxes=[];
function beginDraw(){labelBoxes=[];}
function drawShape(ctx,s,X,Y){if(!['wave','amplitude','fibret','fibext'].includes(s.type))return false;const pts=s.pts.map(p=>({x:X(p),y:Y(p.price)}));if(pts.some(p=>!finite(p.x)||!finite(p.y)))return true;
 const root=getComputedStyle(document.documentElement),accent=bridge()?.drawingColor||root.getPropertyValue('--text').trim()||'#566b80';
 ctx.save();ctx.strokeStyle=accent;ctx.fillStyle=accent;ctx.lineWidth=['wave','amplitude'].includes(s.type)?1.3:.8;ctx.globalAlpha=.85;ctx.setLineDash(['wave','amplitude'].includes(s.type)?[]:[3,4]);
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
 if(!['wave','amplitude'].includes(s.type)){const left=Math.max(0,Math.min(...pts.map(p=>p.x))),right=Math.min(ctx.canvas.width,Math.max(...pts.map(p=>p.x))+130);
 const lines=levels(s).map(l=>({...l,y:Y(l.price)})).filter(l=>finite(l.y)&&l.y>=20&&l.y<=ctx.canvas.height-8).sort((a,b)=>a.y-b.y);
 ctx.font='11px "Segoe UI",sans-serif';ctx.textBaseline='middle';lines.forEach(l=>{const key=[0,.191,.382,.5,.618,.809,1,1.191,1.382,1.5,1.618,1.809,2,2.382,2.618,3,3.382,3.618,4,4.236].includes(l.ratio);ctx.globalAlpha=key?.6:.24;ctx.lineWidth=key?1:.75;ctx.setLineDash(key?[4,4]:[2,5]);ctx.beginPath();ctx.moveTo(left,l.y);ctx.lineTo(Math.max(left+20,right),l.y);ctx.stroke();if(!key)return;
 const text=fmt(l.ratio*100,1)+'% · '+fmt(l.price),w=ctx.measureText(text).width,x=Math.max(4,Math.min(right-w-4,ctx.canvas.width-w-4)),box={x:x-3,y:l.y-8,w:w+6,h:16};
 if(labelBoxes.some(b=>box.x<b.x+b.w+5&&box.x+box.w>b.x-5&&box.y<b.y+b.h+3&&box.y+box.h>b.y-3))return;
 labelBoxes.push(box);ctx.globalAlpha=.94;ctx.fillStyle=root.getPropertyValue('--surface').trim()||'#fff';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle=accent;ctx.fillText(text,x,l.y);});
 }
 if(s.type==='amplitude'&&pts.length===3){
  const plotWidth=bridge()?.chart?.timeScale().width()||ctx.canvas.width,last=pts[2],rail=last.x+8;
  if(last.x<0||last.x>plotWidth){ctx.restore();return true;}
  ctx.beginPath();ctx.rect(0,0,plotWidth,ctx.canvas.height);ctx.clip();
  const ticks=levels(s).map(l=>({...l,y:Y(l.price)})).filter(l=>finite(l.y));
  const visible=ticks.filter(l=>l.y>=12&&l.y<ctx.canvas.height-36);
  ctx.setLineDash([4,3]);ctx.lineWidth=1;ctx.globalAlpha=.85;
  if(ticks.length){ctx.beginPath();ctx.moveTo(rail,Math.max(0,Math.min(...ticks.map(l=>l.y))));ctx.lineTo(rail,Math.min(ctx.canvas.height-32,Math.max(...ticks.map(l=>l.y))));ctx.stroke();}
  ctx.font='11px "Segoe UI",sans-serif';ctx.textBaseline='middle';
  visible.sort((a,b)=>b.ratio-a.ratio).forEach(l=>{
   ctx.fillStyle=accent;ctx.strokeStyle=accent;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(rail-5,l.y);ctx.lineTo(rail+5,l.y);ctx.stroke();
   const text=l.ratio.toFixed(3)+' ('+fmt(l.price)+')',width=ctx.measureText(text).width,x=rail+9,box={x:x-3,y:l.y-8,w:width+6,h:16};
   if(labelBoxes.some(b=>box.x<b.x+b.w+3&&box.x+box.w>b.x-3&&box.y<b.y+b.h+2&&box.y+box.h>b.y-2))return;
   labelBoxes.push(box);ctx.fillStyle=root.getPropertyValue('--surface').trim()||'#fff';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle=accent;ctx.fillText(text,x,l.y);
  });
 }
 ctx.globalAlpha=.85;ctx.setLineDash([]);pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,s.type==='amplitude'?3:2,0,Math.PI*2);ctx.fill();if(s.type!=='wave'){ctx.font='10px "Segoe UI",sans-serif';ctx.fillText(String.fromCharCode(65+i),p.x+5,p.y-6);}});ctx.restore();return true;
}
function shapeDistance(s,px,py,X,Y){if(!['wave','amplitude','fibret','fibext'].includes(s.type))return null;const pts=s.pts.map(p=>({x:X(p),y:Y(p.price)}));if(pts.some(p=>!finite(p.x)||!finite(p.y)))return 1e9;let d=1e9;for(let i=1;i<pts.length;i++)d=Math.min(d,distance(px,py,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y));if(s.type==='amplitude'){const width=bridge()?.chart?.timeScale().width()||1e9,x=pts[2].x+8,ys=levels(s).map(l=>Y(l.price)).filter(finite);if(ys.length)d=Math.min(d,distance(px,py,x,Math.min(...ys),x,Math.max(...ys)));}if(!['wave','amplitude'].includes(s.type)){const left=Math.max(0,Math.min(...pts.map(p=>p.x))),right=Math.max(...pts.map(p=>p.x))+130;for(const l of levels(s)){const y=Y(l.price);if(finite(y))d=Math.min(d,distance(px,py,left,y,right,y));}}return d;}
function summarize(bars){const data=bars.filter(b=>['open','high','low','close'].every(k=>finite(b[k])));if(!data.length)return null;const first=data[0],last=data.at(-1),base=first.close,high=Math.max(...data.map(b=>b.high)),low=Math.min(...data.map(b=>b.low));let up=0,down=0,flat=0,volume=0,volumeCount=0,amount=0,amountCount=0;data.forEach(b=>{if(b.close>b.open)up++;else if(b.close<b.open)down++;else flat++;if(finite(b.volume)&&b.volume>=0){volume+=b.volume;volumeCount++;}if(finite(b.amount)&&b.amount>=0){amount+=b.amount;amountCount++;}});return{first:first.time,last:last.time,bars:data.length,high,low,change:base!==0?(last.close/base-1)*100:null,amplitude:base!==0?(high-low)/Math.abs(base)*100:null,average:data.reduce((a,b)=>a+b.close,0)/data.length,volume:volumeCount===data.length?volume:null,amount:amountCount===data.length?amount:null,up,down,flat};}
let selecting=false,start=null,downX=0,downY=0,selection=null,shade=null,capture=null,report=null,readyChart=null,reportAnchor=null,reportFrame=0,reportDocked=false;
function setup(){if(shade)return;const panel=document.getElementById('mainChartPanel');if(!panel)return;shade=document.createElement('div');shade.id='chartRangeShade';shade.hidden=true;panel.append(shade);capture=document.createElement('div');capture.id='chartRangeCapture';capture.hidden=true;capture.setAttribute('aria-label','拖曳選取統計區間');panel.append(capture);
 report=document.createElement('section');report.id='chartIntervalReport';report.hidden=true;report.setAttribute('aria-label','區間統計結果');report.innerHTML='<div class="range-report-heading"><b>區間統計</b><button type="button" data-range-close aria-label="關閉區間統計">×</button></div><div data-range-content></div>';document.querySelector('#chartModal>.modal-box').append(report);report.querySelector('button').onclick=dismissReport;
 const logical=x=>{const b=bridge(),r=window.AcademyChartBridge.plot();const li=b?.chart.timeScale().coordinateToLogical(x-r.pageLeft);return finite(li)?Math.max(0,Math.min(b.candles.length-1,Math.round(li))):null;};

 function startRange(e){if(e.button!==0)return;start=logical(e.clientX);if(start==null)return;e.preventDefault();dismissReport();downX=e.clientX;downY=e.clientY;capture.setPointerCapture(e.pointerId);selection={from:start,to:start};}
 capture.addEventListener('pointerdown',startRange);
 // Starting another range through the readout should never be blocked by the previous result.
 report.addEventListener('pointerdown',e=>{if(selecting&&!e.target.closest('button,summary,a,input,select'))startRange(e);});
 capture.addEventListener('pointermove',e=>{if(start==null)return;const n=logical(e.clientX);if(n!=null){selection={from:Math.min(start,n),to:Math.max(start,n)};drawRange();}});
 capture.addEventListener('pointerup',e=>{if(start==null)return;const n=logical(e.clientX);if(n!=null){selection={from:Math.min(start,n),to:Math.max(start,n)};reportAnchor={index:n,price:bridge()?.series?.coordinateToPrice(e.clientY-window.AcademyChartBridge.plot().pageTop)};}start=null;if(Math.hypot(e.clientX-downX,e.clientY-downY)<4){dismissReport();return;}drawRange();showReport();});capture.addEventListener('pointercancel',()=>{start=null;dismissReport();});
 document.addEventListener('pointerdown',e=>{if(report&&!report.hidden&&!report.contains(e.target)&&!e.target.closest('#intervalStatsBtn,#chartRangeCapture'))dismissReport();},true);
 document.addEventListener('contextmenu',e=>{if(selecting&&panel.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();resetSelection();}},true);
 new ResizeObserver(()=>{drawRange();queueReportPosition();}).observe(panel);new ResizeObserver(queueReportPosition).observe(report);report.addEventListener('toggle',queueReportPosition,true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(selecting||!report.hidden)){e.preventDefault();e.stopImmediatePropagation();resetSelection();}},true);
}
function drawRange(){if(!shade)return;const b=bridge();if(!selection||!b?.chart||!b.series){shade.hidden=true;return;}const ts=b.chart.timeScale(),a=ts.logicalToCoordinate(selection.from),z=ts.logicalToCoordinate(selection.to);if(!finite(a)||!finite(z)){shade.hidden=true;return;}const plot=window.AcademyChartBridge.plot(),width=plot.width,left=Math.max(0,Math.min(a,z));shade.hidden=false;shade.style.left=(plot.left+left)+'px';shade.style.top=plot.top+'px';shade.style.height=plot.height+'px';shade.style.bottom='auto';shade.style.width=Math.max(2,Math.min(width,Math.max(a,z))-left)+'px';}
function date(t){if(typeof t==='number')return new Date(t*1000).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});return typeof t==='object'?t.year+'-'+String(t.month).padStart(2,'0')+'-'+String(t.day).padStart(2,'0'):String(t);}
function queueReportPosition(){if(!report||report.hidden||reportFrame)return;reportFrame=requestAnimationFrame(()=>{reportFrame=0;positionReport();});}
function positionReport(){
 if(!report||report.hidden||reportDocked)return;const b=bridge(),host=document.getElementById('chartContainer'),modal=document.querySelector('#chartModal>.modal-box');if(!b?.series||!host||!modal)return;
 const plot=window.AcademyChartBridge.plot(),pr={left:plot.pageLeft,top:plot.pageTop},mr=modal.getBoundingClientRect(),ts=b.chart.timeScale(),pw=plot.width,ph=plot.height,gap=9;
 report.style.width=Math.min(290,mr.width-24)+'px';report.style.maxHeight='none';let w=report.offsetWidth,h=report.offsetHeight;
 const endpoint=reportAnchor||{index:selection?.to,price:b.candles[selection?.to]?.close},ax=pr.left+(ts.logicalToCoordinate(endpoint.index)??pw/2),ay=pr.top+(b.series.priceToCoordinate(endpoint.price)??ph/2),clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
 function place(x,y,where){const parent=report.offsetParent,rr=parent.getBoundingClientRect();report.style.right='auto';report.style.bottom='auto';report.style.left=(x-rr.left-parent.clientLeft+parent.scrollLeft)+'px';report.style.top=(y-rr.top-parent.clientTop+parent.scrollTop)+'px';report.dataset.placement=where;}
 const half=Math.max(2,(ts.options().barSpacing||6)*.4),blocks=[];
 for(const bar of b.candles){const x=ts.timeToCoordinate(bar.time),hi=b.series.priceToCoordinate(bar.high),lo=b.series.priceToCoordinate(bar.low);if(!finite(x)||!finite(hi)||!finite(lo)||x<0||x>pw)continue;blocks.push({x:pr.left+x-half-4,y:pr.top+Math.min(hi,lo)-5,w:half*2+8,h:Math.abs(lo-hi)+10});}
 for(const id of ['maLabel','ohlcTooltip']){const e=document.getElementById(id);if(e&&getComputedStyle(e).display!=='none'){const r=e.getBoundingClientRect();if(r.width&&r.height)blocks.push({x:r.left-4,y:r.top-4,w:r.width+8,h:r.height+8});}}
 // Anchor to the blue range's ending edge. Search vertically before moving sideways.
 function besideEdge(x,minimum,side){if(x<mr.left+6||x+w>mr.right-6)return false;const top=pr.top+6,bottom=pr.top+ph-6,blocked=blocks.filter(r=>x<r.x+r.w&&x+w>r.x).map(r=>({top:Math.max(top,r.y),bottom:Math.min(bottom,r.y+r.h)})).filter(r=>r.bottom>r.top).sort((a,b)=>a.top-b.top),free=[];let cursor=top;
  for(const r of blocked){if(r.top>cursor)free.push({top:cursor,bottom:r.top});cursor=Math.max(cursor,r.bottom);}if(cursor<bottom)free.push({top:cursor,bottom});
  const choices=free.filter(r=>r.bottom-r.top>=minimum).map(r=>{const height=Math.min(h,r.bottom-r.top),y=clamp(ay-height/2,r.top,r.bottom-height);return {y,height,distance:Math.max(y-ay,0,ay-y-height)};}).sort((a,b)=>a.distance-b.distance);if(!choices.length)return false;const c=choices[0];report.style.maxHeight='none';place(x,c.y,'plot');report.dataset.anchor='boundary-'+side;return true;
 }
 const backwards=endpoint.index===selection?.from;
 const beside=(minimum)=>backwards?besideEdge(ax-w-gap,minimum,'left'):besideEdge(ax+gap,minimum,'right');
 if(beside(h))return;
 // A narrow nearby panel is preferable to moving the readout to the sidebar.
 const originalWidth=w;
 for(const width of [260,230]){report.style.width=width+'px';w=report.offsetWidth;h=report.scrollHeight;if(beside(h))return;}
 report.style.width=originalWidth+'px';w=report.offsetWidth;h=report.offsetHeight;
 // Keep the selected blue interval unobstructed; never search across it or jump to a distant corner.
 // If the unselected side has no candle-free full-height slot, keep the complete card beside the endpoint without clipping its content.
 const available=backwards?ax-gap-mr.left-6:mr.right-6-ax-gap;
 if(available>=200){report.style.width=Math.min(w,available)+'px';w=report.offsetWidth;h=report.scrollHeight;}
 const outsideX=backwards?ax-w-gap:ax+gap;
 if(outsideX>=mr.left+6&&outsideX+w<=mr.right-6){
  const height=h,top=Math.max(mr.top+8,Math.min(pr.top+6,mr.bottom-h-8)),bottom=mr.bottom-h-8;
  let best=null;
  for(let y=top;y<=bottom;y+=8){let overlap=0;for(const r of blocks){const dx=Math.max(0,Math.min(outsideX+w,r.x+r.w)-Math.max(outsideX,r.x)),dy=Math.max(0,Math.min(y+height,r.y+r.h)-Math.max(y,r.y));overlap+=dx*dy;}const score=overlap+Math.abs(y+height/2-ay)*.1;if(!best||score<best.score)best={y,score};}
  if(best){report.style.maxHeight='none';report.dataset.anchor='boundary-'+(backwards?'left':'right');place(outsideX,best.y,'plot-near');return;}
 }
 report.dataset.anchor='outside';
 // When a complete card cannot fit between candles, keep it outside the price plot.
 const side=document.querySelector('#chartModal .chart-note-panel'),sr=side?.getBoundingClientRect();
 if(sr&&sr.width>=200&&sr.height>=120&&sr.left>=pr.left+pw){report.style.width=Math.min(290,sr.width-16)+'px';report.style.maxHeight='none';w=report.offsetWidth;h=report.offsetHeight;place(clamp(ax+gap,sr.left+8,sr.right-w-8),clamp(ay-h/2,sr.top+8,sr.bottom-h-8),'side');return;}
 const below=mr.bottom-pr.bottom-16;if(below>=100){report.style.width=Math.min(290,pw-12)+'px';report.style.maxHeight='none';w=report.offsetWidth;place(clamp(ax+gap,pr.left+6,pr.left+pw-w-6),pr.bottom+8,'below');return;}
 reportDocked=true;report.style.position='relative';report.style.left='auto';report.style.top='auto';report.style.width='min(290px,100%)';report.style.maxHeight='none';report.style.margin='6px 0 6px auto';document.getElementById('chartWrapper').before(report);report.dataset.placement='docked';
}
function showReport(){const b=bridge();if(!selection||!b)return;const s=summarize(b.candles.slice(selection.from,selection.to+1));if(!s)return;
 const sign=s.change==null?'':s.change>0?'up':s.change<0?'down':'flat',percent=n=>finite(n)?fmt(n)+'%':'—';
 const counts='<span class="range-up" title="收盤高於開盤">'+s.up+'</span> / <span class="range-down" title="收盤低於開盤">'+s.down+'</span> / <span class="range-flat" title="收盤等於開盤">'+s.flat+'</span>';
 const metrics=[['high','最高',fmt(s.high),'up'],['low','最低',fmt(s.low),'down'],['change','漲跌幅',percent(s.change),sign],['amplitude','振幅',percent(s.amplitude),''],['average','平均收盤',fmt(s.average),''],['volume','總量',fmt(s.volume,0),''],['candles','陽線 / 陰線 / 平線',counts,''],['amount','成交額',s.amount==null?'來源未提供':fmt(s.amount,0),'']];
 report.querySelector('[data-range-content]').innerHTML='<p>'+escape(date(s.first))+' → '+escape(date(s.last))+' · <strong class="range-bar-count">'+s.bars+' 根 K 棒</strong></p><dl>'+metrics.map(([id,k,v,tone])=>'<div data-range-metric="'+id+'"><dt>'+escape(k)+'</dt><dd'+(tone?' class="range-'+tone+'"':'')+'>'+(id==='candles'?v:escape(v))+'</dd></div>').join('')+'</dl><details class="range-report-notes"><summary>統計說明</summary><small>漲跌幅與振幅以區間首根收盤為基準。陽線：收盤高於開盤；陰線：低於開盤；平線：開收相同，並非與前一天比較。統計使用目前週期的 K 棒，非日曆天數；總量單位與量能圖一致。</small></details>';report.hidden=false;reportDocked=false;document.querySelector('#chartModal>.modal-box').append(report);report.style.position='absolute';report.style.margin='0';positionReport();
}

function cancelInterval(){selecting=false;start=null;if(capture)capture.hidden=true;document.getElementById('intervalStatsBtn')?.setAttribute('aria-pressed','false');const h=document.getElementById('chartToolHint');if(h)h.hidden=true;}
function dismissReport(){selection=null;if(shade)shade.hidden=true;if(report)report.hidden=true;}
function resetSelection(){cancelInterval();dismissReport();}
function toggleInterval(){setup();const b=bridge();if(!b?.series||!b.candles.length){window.showToast?.('請先開啟 K 棒圖再選取區間');return;}if(selecting){resetSelection();return;}window.AcademyChartBridge.deactivate();const tip=document.getElementById('ohlcTooltip');if(tip)tip.style.display='none';selecting=true;capture.hidden=false;document.getElementById('intervalStatsBtn').setAttribute('aria-pressed','true');const h=document.getElementById('chartToolHint');h.hidden=false;h.querySelector('span').textContent='拖曳可連續查詢；左鍵空白收起結果，右鍵空白或 Esc 結束。';h.querySelector('[data-finish-wave]').hidden=true;}
function applyLog(){const b=bridge();if(!b?.chart)return;const button=document.getElementById('chartLogBtn');try{b.chart.priceScale('right').applyOptions({mode:logarithmic?LightweightCharts.PriceScaleMode.Logarithmic:LightweightCharts.PriceScaleMode.Normal,autoScale:true});button?.setAttribute('aria-pressed',String(logarithmic));button?.classList.toggle('active',logarithmic);window.AcademyChartBridge.redraw();}catch{window.showToast?.('目前圖表無法切換價格座標');}}
function toggleLog(){logarithmic=!logarithmic;try{localStorage.setItem('kv_price_log',logarithmic?'1':'0');}catch{}applyLog();}
function ready(){setup();resetSelection();applyLog();syncRulerScale();const b=bridge();if(b?.chart&&readyChart!==b.chart){readyChart=b.chart;b.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(()=>{drawRange();queueReportPosition();}));}}
addEventListener('keydown',e=>{const search=document.getElementById('chartSearchDrop');if(e.key==='Escape'&&search&&!search.hidden&&document.getElementById('chartModal')?.classList.contains('open')){e.preventDefault();e.stopImmediatePropagation();search.hidden=true;document.getElementById('chartStockSearch')?.setAttribute('aria-expanded','false');return;}if(e.key!=='Escape'||!document.getElementById('chartModal')?.classList.contains('open')||document.querySelector('dialog[open]')||e.target.closest('input,textarea,[contenteditable=true]'))return;if(selecting){e.preventDefault();e.stopImmediatePropagation();resetSelection();return;}const tool=bridge()?.tool;if(tool||bridge()?.zoom||document.querySelector('.draw-dd-menu.open')){e.preventDefault();e.stopImmediatePropagation();window._cancelChartTool();}else if(report&&!report.hidden){e.preventDefault();e.stopImmediatePropagation();resetSelection();}},true);
window.AcademyChartTools={toggleLog,toggleInterval,cancelInterval,resetSelection,isSelecting:()=>selecting,isDragging:()=>start!=null,ready,projectionChanged:()=>{drawRange();queueReportPosition();},beginDraw,drawShape,shapeDistance,summarize,levels,measureAmplitude,syncRulerScale};
})();
