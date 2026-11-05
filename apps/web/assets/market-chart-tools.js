/* Market charts use their own date/price anchors; annotations never alter autoscale. */
(()=>{'use strict';
const instruments=[
 {code:'^TWII',displayCode:'TSE.TW',name:'加權指數',aliases:['TSE.TW','TWII','TAIEX','TSE','0000','加權','大盤','臺灣加權指數'],key:'加權指數'},
 {code:'two',displayCode:'OTC.TW',name:'櫃買指數',aliases:['OTC.TW','^TWO','OTC','櫃買','上櫃指數'],key:'櫃買指數'},
 {code:'wtx&',displayCode:'FITX*1.TF',name:'台指期（日盤）',aliases:['FITX*1.TF','FITX*1','FITX','TX','WTX','.10088','台指期','臺指期','台指期貨'],key:'台指期（日盤）'},
 {code:'vixtwn',displayCode:'VIX.TF',name:'台指VIX',aliases:['VIX.TF','VIX','台灣VIX','臺指VIX','恐慌指數'],key:'台指VIX'},
 {code:'TWD=X',displayCode:'TWD.FX',name:'台幣匯率',aliases:['TWD.FX','USDTWD','USD/TWD','台幣','臺幣匯率','美元台幣'],key:'台幣匯率'},
 {code:'stwn&',name:'富台指期 · SGX FTSE TAIWAN',displayCode:'SGX FTSE TAIWAN',aliases:['SGX FTSE TAIWAN','FTSE TAIWAN','STWN','SGX','富台指','富台指期','富台期'],key:'富台指'}
];
const normalize=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,'');
window.AcademyMarketSearch={match(q){q=normalize(q);if(!q)return[];return instruments.map(it=>({...it,rank:[it.code,it.displayCode,it.name,...it.aliases].some(x=>normalize(x)===q)?0:1})).filter(it=>[it.code,it.displayCode,it.name,...it.aliases].some(x=>normalize(x).includes(q))).sort((a,b)=>a.rank-b.rank);},find(code){return instruments.find(it=>normalize(it.code)===normalize(code));},open(code){const it=this.find(code);if(!it)return false;if(it.key==='加權指數')window._openMarketTrain?.();else window._openKpiChart?.(it.key);return true;}};
const NS='http://www.w3.org/2000/svg',finite=Number.isFinite;
window.AcademyMarketDrawing={attach({dialog,host,chart,getSeries,data,key}){
 if(!host||!data.length)return;
 const dates=data.map(d=>String(d.time||d.trade_date)),storage='fqi.market.drawings.v1.'+key;
 let shapes=[],pending=[],hover=null,tool='',drag=null,selected=null,clipboard=null,frame=0,signature='',disposed=false;
 try{const saved=JSON.parse(localStorage.getItem(storage)||'[]');if(Array.isArray(saved))shapes=saved.filter(s=>['seg','hline','rect','circle','arrow','fib','amplitude'].includes(s.type)&&Array.isArray(s.pts)&&s.pts.length>0&&s.pts.length<=3&&s.pts.every(p=>typeof p.time==='string'&&finite(p.price))).slice(-200);}catch{}
 const bar=document.createElement('div');bar.className='market-draw-tools';bar.setAttribute('role','group');bar.setAttribute('aria-label','圖表標記工具');
 const labels=[['','瀏覽'],['seg','畫線'],['hline','水平線'],['rect','矩形'],['circle','圓形'],['arrow','箭頭'],['fib','黃金分割'],['amplitude','黃金幅度尺'],['erase','橡皮擦']];
 for(const [value,label] of labels){const b=document.createElement('button');b.type='button';b.dataset.draw=value;b.textContent=label;b.setAttribute('aria-pressed',String(!value));bar.append(b);}
 const undo=document.createElement('button');undo.type='button';undo.textContent='復原';undo.dataset.undo='';bar.append(undo);
 const hint=document.createElement('span');hint.className='market-draw-hint';hint.textContent='標記會保留在此瀏覽器';bar.append(hint);host.before(bar);
 host.classList.add('market-draw-host');const svg=document.createElementNS(NS,'svg');svg.classList.add('market-draw-layer');svg.setAttribute('aria-hidden','true');host.append(svg);
 const menu=document.createElement('div');menu.className='market-draw-menu';menu.hidden=true;menu.innerHTML='<button type="button" data-copy>複製</button><button type="button" data-paste>貼上</button><button type="button" data-delete>刪除</button>';host.append(menu);
 function save(){try{localStorage.setItem(storage,JSON.stringify(shapes));}catch{hint.textContent='目前無法儲存標記，關閉後不會保留';}}
 function series(){return getSeries();}
 function point(e){const r=host.getBoundingClientRect(),x=e.clientX-r.left-chart.priceScale('left').width(),y=e.clientY-r.top,ts=chart.timeScale();if(x<0||y<0||x>ts.width()||y>Math.max(0,host.clientHeight-chart.timeScale().height()))return null;const li=ts.coordinateToLogical(x),price=series().coordinateToPrice(y);if(li==null||!finite(price))return null;const i=Math.round(li);if(i<0||i>=dates.length)return null;return {time:dates[i],price};}
 function xy(p){const x=chart.timeScale().timeToCoordinate(p.time),y=series().priceToCoordinate(p.price);return x==null||y==null?null:{x,y};}
 function node(tag,attrs,text){const el=document.createElementNS(NS,tag);for(const k in attrs)el.setAttribute(k,attrs[k]);if(text)el.textContent=text;svg.append(el);return el;}
 function draw(s,index){const pts=s.pts.map(xy);if(pts.some(p=>!p))return;const a=pts[0],b=pts[1]||a,c=pts[2]||b,stroke=index===selected?'var(--market-draw-selected)':'var(--market-draw-ink)',base={stroke,'stroke-width':1.5,fill:'none','stroke-linecap':'round'};
  const line=(x1,y1,x2,y2,extra={})=>node('line',{...base,x1,y1,x2,y2,...extra});
  if(s.type==='hline')line(0,a.y,chart.timeScale().width(),a.y);
  else if(s.type==='rect')node('rect',{...base,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
  else if(s.type==='circle')node('ellipse',{...base,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,rx:Math.abs(a.x-b.x)/2,ry:Math.abs(a.y-b.y)/2});
  else {line(a.x,a.y,b.x,b.y);if(s.type==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x);for(const sign of [-1,1])line(b.x,b.y,b.x-8*Math.cos(angle+sign*.5),b.y-8*Math.sin(angle+sign*.5));}
   if(s.type==='amplitude')line(b.x,b.y,c.x,c.y);
   if(s.type==='fib'||s.type==='amplitude'){
    const ratios=s.type==='fib'?[0,.191,.382,.5,.618,.809,1]:[0,.191,.382,.5,.618,.809,1,1.191,1.382,1.618,2,2.618,3,4.236,6.854];
    const origin=s.type==='fib'?s.pts[0].price:s.pts[s.pts.length-1].price,delta=s.pts.length>1?s.pts[1].price-s.pts[0].price:0,rail=s.type==='fib'?Math.min(a.x,b.x):c.x+8;let lastY=-100;
    ratios.map(r=>({r,price:origin+delta*r})).map(l=>({...l,y:series().priceToCoordinate(l.price)})).filter(l=>l.y!=null&&l.y>10&&l.y<Math.max(0,host.clientHeight-chart.timeScale().height())-10).sort((a,b)=>a.y-b.y).forEach(l=>{
     if(s.type==='fib')line(rail,l.y,Math.max(a.x,b.x)+30,l.y,{'stroke-dasharray':'4 4'});else line(rail-4,l.y,rail+4,l.y);
     if(l.y-lastY<18)return;lastY=l.y;node('text',{x:rail+9,y:l.y-3,fill:stroke,'font-size':11,'paint-order':'stroke',stroke:'var(--market-draw-halo)','stroke-width':3},l.r.toFixed(3)+' ('+Number(l.price.toFixed(3))+')');
    });if(s.type==='amplitude')line(rail,0,rail,Math.max(0,host.clientHeight-chart.timeScale().height()),{'stroke-dasharray':'3 4'});
   }
  }
  if(index===selected)pts.forEach(p=>node('circle',{cx:p.x,cy:p.y,r:3,fill:stroke}));
 }
 function render(){if(disposed)return;svg.replaceChildren();svg.style.left=chart.priceScale('left').width()+'px';svg.setAttribute('width',chart.timeScale().width());svg.setAttribute('height',Math.max(0,host.clientHeight-chart.timeScale().height()));shapes.forEach(draw);if(pending.length)draw({type:tool,pts:pending.concat(hover?[hover]:[])},-1);}
 function setTool(value){tool=value;pending=[];hover=null;menu.hidden=true;bar.querySelectorAll('[data-draw]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.draw===tool)));host.style.cursor=tool?'crosshair':'';chart.applyOptions({handleScroll:{pressedMouseMove:!tool}});hint.textContent=tool==='amplitude'?'依序點選 A、B、C；右鍵結束':tool?'點選標記位置；可同時使用滾輪縮放':'標記會保留在此瀏覽器';render();}
 const dist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
 function hit(e){const r=host.getBoundingClientRect(),p={x:e.clientX-r.left-chart.priceScale('left').width(),y:e.clientY-r.top};for(let i=shapes.length-1;i>=0;i--){const s=shapes[i],ps=s.pts.map(xy);if(ps.some(p=>!p))continue;const a=ps[0],b=ps[1]||a;if(s.type==='hline'&&Math.abs(p.y-a.y)<7)return i;if(s.type==='rect'){if([[a,{x:b.x,y:a.y}],[{x:b.x,y:a.y},b],[b,{x:a.x,y:b.y}],[{x:a.x,y:b.y},a]].some(v=>dist(p,...v)<7))return i;}else if(s.type==='circle'){const rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2;if(rx&&ry&&Math.abs(Math.hypot((p.x-(a.x+b.x)/2)/rx,(p.y-(a.y+b.y)/2)/ry)-1)*Math.min(rx,ry)<7)return i;}else if(ps.slice(1).some((v,j)=>dist(p,ps[j],v)<7))return i;}return null;}
 bar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-undo')){shapes.pop();selected=null;save();render();}else setTool(b.dataset.draw);});
 function down(e){if(e.button!==0||e.target.closest('.market-draw-menu'))return;menu.hidden=true;const p=point(e);if(!p)return;
  if(tool){e.preventDefault();e.stopImmediatePropagation();if(tool==='erase'){const i=hit(e);if(i!=null){shapes.splice(i,1);selected=null;save();render();}return;}pending.push(p);const count=tool==='hline'?1:tool==='amplitude'?3:2;if(pending.length===count){shapes.push({type:tool,pts:pending});pending=[];hover=null;save();}render();return;}
  selected=hit(e);render();if(selected==null)return;e.preventDefault();e.stopImmediatePropagation();drag={index:selected,start:p,original:JSON.parse(JSON.stringify(shapes[selected]))};host.setPointerCapture(e.pointerId);
 }
 function move(e){const p=point(e);if(!p)return;if(pending.length){hover=p;render();}if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const shift=dates.indexOf(p.time)-dates.indexOf(drag.start.time),delta=p.price-drag.start.price;const points=drag.original.pts.map(q=>({time:dates[dates.indexOf(q.time)+shift],price:q.price+delta}));if(points.every(q=>q.time))shapes[drag.index]={...drag.original,pts:points};render();}
 function up(e){if(!drag)return;drag=null;save();if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);e.stopImmediatePropagation();}
 function context(e){if(!point(e))return;e.preventDefault();e.stopImmediatePropagation();if(tool){setTool('');return;}selected=hit(e);menu.querySelector('[data-copy]').disabled=selected==null;menu.querySelector('[data-delete]').disabled=selected==null;menu.querySelector('[data-paste]').disabled=!clipboard;const r=host.getBoundingClientRect();menu.style.left=Math.max(0,Math.min(e.clientX-r.left,host.clientWidth-110))+'px';menu.style.top=Math.max(0,Math.min(e.clientY-r.top,host.clientHeight-120))+'px';menu.hidden=false;render();}
 menu.addEventListener('click',e=>{if(e.target.hasAttribute('data-copy')&&selected!=null)clipboard=JSON.parse(JSON.stringify(shapes[selected]));if(e.target.hasAttribute('data-delete')&&selected!=null){shapes.splice(selected,1);selected=null;}if(e.target.hasAttribute('data-paste')&&clipboard){const copy=JSON.parse(JSON.stringify(clipboard));copy.pts=copy.pts.map(p=>({...p,price:p.price*1.005}));shapes.push(copy);selected=shapes.length-1;}menu.hidden=true;save();render();});
 function keydown(e){if(e.key==='Escape'&&(tool||pending.length||!menu.hidden)){e.preventDefault();e.stopImmediatePropagation();setTool('');}}
 host.addEventListener('pointerdown',down,true);host.addEventListener('pointermove',move,true);host.addEventListener('pointerup',up,true);host.addEventListener('pointercancel',up,true);host.addEventListener('contextmenu',context,true);dialog.addEventListener('keydown',keydown,true);
 const ro=new ResizeObserver(render);ro.observe(host);
 function tick(){if(disposed)return;const s=series(),ts=chart.timeScale(),range=ts.getVisibleLogicalRange(),probe=data[Math.floor(data.length/2)],price=Number(probe.value??probe.close);const next=JSON.stringify([range,host.clientWidth,s.priceToCoordinate(price),s.priceToCoordinate(price*1.01)]);if(next!==signature){signature=next;render();}frame=requestAnimationFrame(tick);}tick();
 dialog.addEventListener('close',()=>{disposed=true;cancelAnimationFrame(frame);ro.disconnect();host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointermove',move,true);host.removeEventListener('pointerup',up,true);host.removeEventListener('pointercancel',up,true);host.removeEventListener('contextmenu',context,true);dialog.removeEventListener('keydown',keydown,true);},{once:true});
}};
})();
