/* Five published trading-day observations; no inferred or interpolated values. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const val=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const num=(v,ratio=false)=>v==null?'待更新':(v>0?'+':'')+v.toLocaleString('zh-TW',{minimumFractionDigits:ratio?2:0,maximumFractionDigits:ratio?2:0})+(ratio?'%':' 口');
 const tone=v=>v==null||v===0?'neutral':v>0?'positive':'negative';
 function change(now,prev,ratio){
  if(now==null||prev==null)return '較前日：資料不足';
  const d=now-prev;if(!d)return '較前日持平';
  if(ratio)return '較前日 '+(d>0?'+':'−')+Math.abs(d).toFixed(2)+' 個百分點';
  if(now>0&&prev<=0)return '轉為淨多 '+Math.abs(now).toLocaleString('zh-TW')+' 口';
  if(now<0&&prev>=0)return '轉為淨空 '+Math.abs(now).toLocaleString('zh-TW')+' 口';
  if(now===0)return '多空淨額歸零';
  const more=Math.abs(now)>Math.abs(prev);return (now<0?'淨空':'淨多')+(more?'增加 ':'減少 ')+Math.abs(d).toLocaleString('zh-TW')+' 口';
 }
 function render(data,key,label,ratio=false,sharedMax=null){
  const rows=data.slice(0,5).reverse(),n=rows.length,points=rows.map((r,i)=>({date:r.trade_date,v:val(r[key]),x:n===1?150:22+i*256/(n-1)}));
  const max=sharedMax||Math.max(1,...points.map(p=>Math.abs(p.v??0))),zero=37,range=29;
  points.forEach(p=>p.y=p.v==null?zero:zero-p.v/max*range);
  let path='',drawing=false;for(const p of points){if(p.v==null){drawing=false;continue;}path+=(drawing?' L':' M')+p.x.toFixed(2)+' '+p.y.toFixed(2);drawing=true;}
  const plot=ratio?'<path class="fs-trend-line" d="'+path+'"/>'+points.filter(p=>p.v!=null).map(p=>'<circle class="fs-trend-dot '+tone(p.v)+'" cx="'+p.x+'" cy="'+p.y+'" r="3"/>').join(''):points.filter(p=>p.v!=null).map(p=>'<rect class="fs-trend-bar '+tone(p.v)+'" x="'+(p.x-9)+'" y="'+Math.min(zero,p.y)+'" width="18" height="'+Math.max(1,Math.abs(p.y-zero))+'" rx="2"/>').join('');
  const latest=val(data[0]?.[key]),prev=val(data[1]?.[key]),delta=latest==null||prev==null?null:latest-prev;
  return '<section class="fs-trend" data-fs-key="'+key+'" aria-label="'+esc(label)+'近期走勢"><div class="fs-trend-heading"><span>近 5 個交易日</span><span>'+(ratio?'多空比':'未平倉淨額')+'</span></div><div class="fs-trend-plot"><svg viewBox="0 0 300 74" preserveAspectRatio="none" role="img" aria-label="'+esc(label)+'，'+(n===5?'最近五筆':n+'筆')+'交易日資料"><path class="fs-zero" d="M8 37H292"/><text x="1" y="34" class="fs-zero-label">0</text>'+plot+'</svg><div class="fs-trend-targets">'+points.map((p,i)=>'<button type="button" class="fs-trend-target" data-fs-point="'+i+'" data-date="'+esc(p.date)+'" data-value="'+esc(num(p.v,ratio))+'" aria-label="'+esc(p.date+' '+label+' '+num(p.v,ratio))+'" style="left:'+p.x/3+'%"></button>').join('')+'</div></div><div class="fs-trend-readout" aria-live="polite"><span data-fs-date>'+esc(points.at(-1)?.date||'資料日期待更新')+'</span><b data-fs-value>'+esc(num(latest,ratio))+'</b></div><div class="fs-trend-footer"><span class="fs-change '+tone(delta)+'">最新 · '+change(latest,prev,ratio)+'</span>'+(n<5?'<span class="fs-history-note">僅 '+n+' 筆</span>':'')+'</div></section>';
 }
 function paint(box,data){
  const common=Math.max(1,...data.flatMap(r=>[val(r.mtx_ls),val(r.tmf_ls)]).filter(v=>v!=null).map(Math.abs));
  box.querySelectorAll('[data-futures-history]').forEach(host=>{
   const key=host.dataset.futuresHistory,ratio=key!=='foreign_oi',label=key==='foreign_oi'?'外資未平倉淨額':key==='mtx_ls'?'小台散戶多空比':'微台散戶多空比';
   host.innerHTML=render(data,key,label,ratio,ratio?common:null);
   const buttons=[...host.querySelectorAll('[data-fs-point]')],date=host.querySelector('[data-fs-date]'),value=host.querySelector('[data-fs-value]');
   function show(b){buttons.forEach(x=>x.classList.toggle('is-active',x===b));date.textContent=b.dataset.date;value.textContent=b.dataset.value;}
   const reset=()=>{const b=buttons.at(-1);if(b)show(b);};
   buttons.forEach((b,i)=>{b.onpointerenter=()=>show(b);b.onfocus=()=>show(b);b.onclick=()=>show(b);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowLeft'?-1:1)))].focus();}if(e.key==='Escape')reset();};});
   host.onpointerleave=()=>{if(!host.contains(document.activeElement))reset();};host.onfocusout=e=>{if(!host.contains(e.relatedTarget))reset();};reset();
  });
 }
 window.AcademyFuturesSummary={paint};
})();
