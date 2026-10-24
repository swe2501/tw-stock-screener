/* Import candidate W lines by date/price. Local file only; never calls AI. */
(() => {
 'use strict';
 const names=['lead_in','first_low','neckline_peak','second_low','breakout'];
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function mode(url){const u=new URL(url,'https://chart.invalid');return ['interval','raw','adj'].map(k=>u.searchParams.get(k)||({interval:'1d',raw:'0',adj:'0'}[k])).join('|');}
 function verify(packet,live,context){
  if(packet?.overlay_version!=='0.1.0'||packet.review_required!==true)throw Error('不是支援的候選型態檔案。');
  if(String(packet.code)!==String(context.code))throw Error('股票不同，請先開啟 '+String(packet.code)+' 的K圖。');
  const currentUrl=context.chart_snapshot?.url;
  if(!currentUrl||mode(packet.source_chart_url)!==mode(currentUrl))throw Error('週期或還原模式不同，請切回匯出時的模式。');
  if(!Array.isArray(packet.source_bars)||!packet.source_bars.length||!Array.isArray(packet.patterns)||!packet.patterns.length||packet.patterns.length>100)throw Error('型態或來源資料不完整。');
  const current=new Map(live.map(b=>[b.time,b])),source=new Map(),byIndex=new Map();
  for(const b of packet.source_bars){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||source.has(b.date)||!Number.isInteger(b.bar_index)||byIndex.has(b.bar_index))throw Error('來源日期或索引重複／無效。');
   const c=current.get(b.date);
   if(!c||!['open','high','low','close'].every(k=>finite(b[k])&&finite(c[k])&&Math.abs(c[k]-b[k])<=1e-7))throw Error('行情與來源不一致（'+b.date+'），請重新匯出分析。');
   source.set(b.date,b);byIndex.set(b.bar_index,b);
  }
  const ids=new Set();
  return packet.patterns.map(p=>{
   if(typeof p.pattern_id!=='string'||!p.pattern_id||p.pattern_id.length>60||ids.has(p.pattern_id)||p.type!=='w_bottom'||p.status!=='confirmed')throw Error('型態識別或狀態無效。');ids.add(p.pattern_id);
   const pts=names.map(name=>{const q=p.keypoints?.[name],b=q&&byIndex.get(q.bar_index),k=name.includes('low')?'low':name==='breakout'?'close':'high';if(!b||q.date!==b.date||!finite(q.price)||Math.abs(q.price-b[k])>1e-7)throw Error('轉折點與來源行情不一致。');return {time:b.date,value:b[k],bar_index:b.bar_index};});
   if(pts.some((p,i)=>i&&p.time<=pts[i-1].time))throw Error('轉折點順序錯誤。');
   const segment=(a,b)=>packet.source_bars.filter(r=>r.date>=a&&r.date<=b);
   const [start,l1,neck,l2,br]=pts;
   if(l1.value!==Math.min(...segment(start.time,neck.time).map(b=>b.low))||l2.value!==Math.min(...segment(neck.time,br.time).filter(b=>b.date<br.time).map(b=>b.low)))throw Error('兩底未通過行情核對。');
   if(neck.value!==Math.max(...packet.source_bars.filter(b=>b.date>l1.time&&b.date<l2.time).map(b=>b.high)))throw Error('頸線未通過行情核對。');
   const first=packet.source_bars.filter(b=>b.date>l2.time).sort((a,b)=>a.date.localeCompare(b.date)).find(b=>b.close>neck.value);
   if(!first||first.date!==br.time)throw Error('突破點未通過首次收盤突破核對。');
   return {id:p.pattern_id,points:pts};
  });
 }
 let layers=[],owner=null,request=0;
 const status=()=>document.getElementById('wPatternOverlayStatus');
 function clear(){request++;for(const s of layers){try{owner?.removeSeries(s);}catch{}}layers=[];owner=null;const s=status();if(s)s.textContent='';const b=document.getElementById('wPatternClearBtn');if(b)b.hidden=true;}
 function apply(packet,{chart,series,context}){
  if(!chart||!series)throw Error('請先開啟K圖。');
  const verified=verify(packet,series.data().filter(b=>b.open!=null),context);
  clear();owner=chart;
  try{for(const [i,p] of verified.entries()){
   const color=i%2?'#aa49be':'#d27a0a';
   const options={color,lineWidth:2,lineStyle:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null};
   const line=chart.addLineSeries(options);layers.push(line);line.setData(p.points.map(({time,value})=>({time,value})));
   line.setMarkers(p.points.map((q,j)=>({time:q.time,position:'inBar',color,shape:'circle',size:.6,text:j===0?'候選 '+p.id:''})));
   const neck=chart.addLineSeries({...options,color:'#078776',lineWidth:1});layers.push(neck);neck.setData([{time:p.points[2].time,value:p.points[2].value},{time:p.points[4].time,value:p.points[2].value}]);
  }}catch(e){clear();throw e;}
  if(status())status().textContent='已顯示 '+verified.length+' 個候選 W，待人工確認。橘／紫虛線：型態；綠虛線：頸線。';
  const b=document.getElementById('wPatternClearBtn');if(b)b.hidden=false;
  return verified.length;
 }
 function choose(getContext){
  const ticket=++request,input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.hidden=true;document.body.append(input);
  input.oncancel=()=>input.remove();
  input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024)throw Error('檔案超過5MB。');const data=JSON.parse(await file.text());if(ticket!==request)throw Error('圖表已切換，請重新匯入。');apply(data,getContext());}catch(e){if(status())status().textContent=e.message||'匯入失敗。';}finally{input.remove();}};
  input.click();
 }
 window.WPatternOverlay={verify,apply,choose,clear};
})();
