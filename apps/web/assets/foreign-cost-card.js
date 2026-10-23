/* Homepage estimate card. The wave is decorative; the ruler uses published data. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,dp=2)=>Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:dp}):'—';
 const bars='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h19M5 20v-6h3v6M11 20V8h3v12M17 20V3h3v17"/></svg>';
 const calendar='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2"/></svg>';
 const info='<span class="fcp-info" title="依結算日部位資料估算的參考基準，不代表外資實際進場成本。" aria-label="結算估算基準，非外資實際進場成本">ⓘ</span>';
 function ruler(v,price){
  if(!Number.isFinite(v))return '<div class="fcp-ruler fcp-ruler-pending"><span>成本基準待更新，暫無法標示價格位置</span><i></i></div>';
  const ready=Number.isFinite(price),diff=ready?price-v:0,lo=Math.min(-1000,Math.floor(diff/500)*500),hi=Math.max(1000,Math.ceil(diff/500)*500),pos=n=>10+(n-v-lo)/(hi-lo)*80,costPos=pos(v),pointPos=ready?pos(price):null;
  const ticks=[{n:v+lo,label:''},{n:v-500,label:'−500'},{n:v,label:'成本',gold:true},{n:v+500,label:'+500'},{n:v+hi,label:''}];
  const sparse=500/(hi-lo)*80<12;
  return '<div class="fcp-ruler" role="img" aria-label="'+esc('估算成本 '+fmt(v)+' 點；'+(ready?'目前價格 '+fmt(price)+' 點':'目前價格待更新'))+'"><div class="fcp-track" style="--cost:'+costPos+'%"></div>'+ticks.map(t=>'<span class="fcp-tick '+(t.gold?'fcp-gold':'')+(!t.gold&&(t.label?sparse:Math.abs(pos(t.n)-costPos)<12)?' fcp-tick-quiet':'')+'" style="left:'+pos(t.n)+'%" title="'+esc(fmt(t.n)+' 點 '+t.label)+'"><i></i><span>'+fmt(t.n,0)+'</span>'+(t.label?'<small>'+t.label+'</small>':'')+'</span>').join('')+(ready?'<span class="fcp-price-marker '+(diff>0?'positive':diff<0?'negative':'neutral')+'" style="left:'+pointPos+'%" title="'+esc(fmt(price)+' 點')+'"><b>'+fmt(price,0)+'</b><i></i></span>':'<span class="fcp-marker-pending">目前價格待更新</span>')+'</div>';
 }
 function wave(diff){
  const state=diff==null?'pending':diff>500?'up':diff< -500?'down':'flat';
  const labels={pending:'資料待更新',up:'↑ 成本上方',down:'↓ 成本下方',flat:'↔ 成本附近'};
  const paths={up:'M0 65 C80 68 120 42 200 49 S320 43 400 30 S520 33 600 14',down:'M0 22 C80 18 120 43 200 36 S320 45 400 57 S520 56 600 73',flat:'M0 50 C70 38 130 62 200 50 S330 40 400 50 S530 60 600 50',pending:'M0 54 C70 45 130 63 200 54 S330 45 400 54 S530 63 600 54'};
  const path=paths[state],description=labels[state]+'；依價格相對估算成本上下500點分區，波形為方向示意，非歷史價格走勢';
  return '<div class="fcp-wave" data-wave-state="'+state+'" aria-label="'+description+'" title="'+description+'"><span class="fcp-wave-status">'+labels[state]+'</span><svg viewBox="0 0 600 90" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fcpWaveFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="fcp-wave-fill fcp-wave-back" d="'+path+' V90H0Z"/><path class="fcp-wave-fill" d="'+path+' V90H0Z"/><path class="fcp-wave-line" d="'+path+'"/><path class="fcp-wave-sweep" pathLength="100" d="'+path+'"/></svg><i class="fcp-wave-beacon"></i></div>';
 }
 function render(host,{snapshot,current,marketSession,period,quotesLoading}){
  const v=snapshot?.basis?.net?.point,price=current?.price,ready=Number.isFinite(v)&&Number.isFinite(price),diff=ready?price-v:null,tone=diff==null?'neutral':diff>0?'positive':diff<0?'negative':'neutral',session=marketSession==='night'?'夜盤':'日盤',month=period?Number(period.month.slice(5))+'月':'';
  host.innerHTML='<article class="fx-cost fx-premium-cost"><div class="fcp-heading"><h3>外資結算成本估算</h3><span>'+month+' · 估算</span></div><div class="fcp-primary"><strong>'+fmt(v,0)+'</strong><span>結算基準 · 點 '+info+'</span></div>'+wave(diff)+'<section class="fcp-position"><div class="fcp-distance '+tone+'"><span>距估算成本</span><strong>'+(diff==null?'待更新':(diff>0?'+':diff<0?'−':'')+fmt(Math.abs(diff),0))+'<small>'+(diff==null?'':' 點')+'</small></strong><span class="fcp-position-label">'+(!Number.isFinite(v)?'結算資料待更新':diff==null?'目前價格待更新':diff>0?'目前價格高於成本':diff<0?'目前價格低於成本':'目前價格與成本相同')+'</span></div>'+ruler(v,price)+'<footer class="fcp-footer"><div class="fcp-current">'+bars+'<span>'+session+'收盤</span><b>'+fmt(price)+'</b><small>點</small></div><div class="fcp-session" role="group" aria-label="臺指期行情盤別">'+['day','night'].map(key=>'<button type="button" data-fx-session="'+key+'" aria-pressed="'+(marketSession===key)+'">'+(key==='day'?'日盤':'夜盤')+'</button>').join('')+'</div></footer><div class="fcp-date">'+calendar+'<span>'+(current?'行情日期 '+esc(current.date.replace(/-/g,'/'))+' · 期交所盤後資料':quotesLoading?'行情載入中…':session+'價格待更新 · 非即時報價')+'</span></div></section></article>';
 }
 window.AcademyForeignCostCard={render};
})();
