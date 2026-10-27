/* Saved visual reviews only. Opening the panel never requests paid inference. */
(() => {
 'use strict';
 const labels={w_bottom:'W底',m_top:'M頭',head_shoulders:'頭肩頂',inverse_head_shoulders:'頭肩底',triangle:'三角形',box:'箱型'};
 const colors=['#da870b','#8b5cf6','#0b9488','#db2777'];
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 let context=null,owner=null,layers=[],ticket=0,promise=null,opened=false;
 const choices=new Map();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 function clear(){for(const line of layers){try{owner?.removeSeries(line);}catch{}}layers=[];owner=null;}
 function verify(pattern,record,live){
  if(!pattern||!labels[pattern.type]||pattern.precise_points_verified!==true||!Array.isArray(pattern.points)||pattern.points.length<3||pattern.points.length>12)throw Error('輔助線尚未完成定位核對');
  const map=new Map(live.filter(b=>typeof b.time==='string').map(b=>[b.time,b]));
  if(!Array.isArray(record.source_bars)||!record.source_bars.length)throw Error('缺少判讀來源K棒');
  const start=pattern.points[0].time,end=pattern.points[pattern.points.length-1].time;
  const segment=record.source_bars.filter(b=>b.time>=start&&b.time<=end);
  if(!segment.length||segment[0].time!==start||segment[segment.length-1].time!==end)throw Error('缺少型態區段來源K棒');
  // A rolling 3-year window can trim its earliest partial week. Only bars in this
  // pattern's complete interval determine whether its frozen contour still agrees.
  for(const b of segment){const q=map.get(b.time);if(!q||!['open','high','low','close'].every(k=>finite(b[k])&&finite(q[k])&&Math.abs(b[k]-q[k])<=1e-6))throw Error('目前行情與判讀來源不同，暫不畫線');}
  let previous='';
  for(const p of pattern.points){const b=map.get(p.time);if(!/^\d{4}-\d{2}-\d{2}$/.test(p.time)||p.time<=previous||!b||!['high','low','close','open'].includes(p.field)||!finite(p.value)||Math.abs(b[p.field]-p.value)>1e-6)throw Error('轉折日期或價格核對失敗');previous=p.time;}
  if(pattern.type==='w_bottom'){
   const roles=['lead_in','first_low','middle_peak','second_low','recovery'];
   if(pattern.points.length!==5||pattern.points.some((p,i)=>p.role!==roles[i]||(i===4?!['close','high'].includes(p.field):p.field!==['high','low','high','low'][i])))throw Error('W轉折欄位不完整');
   const neck=pattern.points[2].value,right=segment.filter(b=>b.time>pattern.points[3].time);
   if(pattern.points[0].value<neck)throw Error('左側第一個頂點未碰到頸線，不列為已確認W');
   if(pattern.status!=='forming'&&(!right.length||Math.max(...right.map(b=>b.high))<neck))throw Error('右側回升尚未碰到頸線，不列為已確認W');
  }
  if(pattern.neckline){const n=pattern.neckline;if(!finite(n.value)||!map.has(n.start)||!map.has(n.end)||n.start>=n.end)throw Error('頸線座標無效');
   if(pattern.type==='w_bottom'&&(n.value!==pattern.points[2].value||n.start!==pattern.points[2].time||n.end!==pattern.points[4].time))throw Error('頸線與中峰不一致');}
  return pattern;
 }
 function plot(pattern,color,ctx){
  const opts={color,lineWidth:2,lineStyle:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null};
  const line=ctx.chart.addLineSeries(opts);layers.push(line);line.setData(pattern.points.map(p=>({time:p.time,value:p.value})));
  if(pattern.neckline){const n=pattern.neckline,neck=ctx.chart.addLineSeries({...opts,lineWidth:1});layers.push(neck);neck.setData([{time:n.start,value:n.value},{time:n.end,value:n.value}]);}
 }
 function validSnapshot(d){return d?.version==='codex-visual-v1'&&d.scope==='uat'&&Array.isArray(d.records);}
 async function snapshotBase(code){
  try{
   const response=await fetch((window.__API||'')+'/api/screen?stat=visual_patterns&code='+encodeURIComponent(code));
   if(response.ok){const data=await response.json();if(validSnapshot(data)&&data.records.length)return data;}
  }catch{}
  if(!promise)promise=fetch('assets/codex-visual-patterns.json?v=scan100-both-ends-20261026').then(r=>{if(!r.ok)throw Error('尚未取得判讀結果');return r.json();}).then(d=>{if(!validSnapshot(d))throw Error('判讀資料格式不完整');return d;}).catch(e=>{promise=null;throw e;});
  return promise;
 }
 async function snapshot(code){
  const [base,response]=await Promise.all([snapshotBase(code),fetch('assets/codex-forming-patterns.json?v=20261027-1')]);
  if(!response.ok)throw Error('形成中判讀資料暫時無法取得');
  const extra=await response.json();if(!validSnapshot(extra))throw Error('形成中資料格式無效');
  const market=await fetch('assets/codex-market-scan.json?v=20261027-1').then(r=>{if(!r.ok)throw Error('全市場判讀資料暫時無法取得');return r.json();});if(!validSnapshot(market))throw Error('全市場判讀資料格式無效');extra.records.push(...market.records);
  const merged=new Map(base.records.map(r=>[r.code+'|'+r.timeframe,r]));for(const r of extra.records)merged.set(r.code+'|'+r.timeframe,r);return {...base,records:[...merged.values()]};
 }
 function periodOf(ctx){return ctx.period==='day'?'daily':ctx.period==='week'?'weekly':null;}
 function periodLinks(host,records,ctx){
  const other=records.filter(r=>r.execution_status==='reviewed'&&r.patterns?.length&&r.timeframe!==periodOf(ctx)&&['daily','weekly'].includes(r.timeframe));
  for(const r of other){const period=r.timeframe==='daily'?'日K':'週K',types=[...new Set(r.patterns.map(p=>p.type))];
   const names=types.map(t=>t==='w_bottom'?'W':labels[t]||'其他').join('、');
   const row=el('div',null,'ai-pattern-cross-period');row.setAttribute('role','status');
   const text=el('strong',period+'也有 '+names+' 型態');
   const button=el('button','切換'+period+'查看','ai-pattern-period-link');button.type='button';button.onclick=()=>ctx.switchPeriod(r.timeframe);
   row.append(text,button);host.append(row);
  }
  return other.length;
 }
 function notice(records,ctx){
  const host=document.getElementById('aiPatternPeriodHint');if(!host)return;
  host.replaceChildren();
  const periods=records.filter(r=>r.execution_status==='reviewed'&&r.patterns?.length).map(r=>r.timeframe);
  host.hidden=!periodLinks(host,records,ctx);
  const badge=document.querySelector('.chart-layer-tab[data-layer="ai"] .layer-count');if(badge){badge.textContent=periods.length?' '+[...new Set(periods)].map(p=>p==='daily'?'日':'週').join('／'):'';badge.classList.toggle('show',!!periods.length);}
 }
 function render(data,ctx){
  clear();const panel=document.getElementById('aiBuyPanel');if(!panel)return;
  const records=data.records.filter(r=>String(r.code)===String(ctx.code));notice(records,ctx);
  if(!opened)return;panel.replaceChildren();
  panel.append(el('b','AI 型態判定','ai-pattern-heading'));
  periodLinks(panel,records,ctx);
  const tf=periodOf(ctx);
  if(!tf){panel.append(el('p','請切換至日K或週K查看已保存的型態判讀。'));return;}
  const r=records.find(r=>r.timeframe===tf);
  if(!r||r.execution_status!=='reviewed'){panel.append(el('p',r?.execution_status==='data_failed'?'此週期行情取得失敗，尚未完成判讀。':'此股票的'+(tf==='daily'?'日K':'週K')+'尚未完成判讀。'));return;}
  panel.append(el('p',(tf==='daily'?'日K':'週K')+' · 判讀截至 '+r.data_as_of+' · '+r.bar_count+' 根','ai-pattern-meta'));
  if(r.omitted_dates?.length){const details=el('details'),summary=el('summary','本次判讀略過 '+r.omitted_dates.length+' 根矛盾來源K棒');details.append(summary,el('p',r.omitted_dates.join('、')));panel.append(details);}
  if(r.history_complete===false)panel.append(el('p','可取得的歷史短於設定範圍，判讀僅涵蓋圖中實際資料。','ai-pattern-note'));
  if(r.classification==='forming')panel.append(el('strong','形成中：右側尚未觸及頸線，虛線僅表示候選輪廓。','ai-pattern-note'));
  panel.append(el('p',r.reason||'此筆待補判讀說明。'));
  const firstLive=ctx.series?.data?.().find(b=>typeof b.time==='string')?.time;
  if(r.recommended_range==='5y'&&r.patterns?.some(p=>p.points[0].time<firstLive)&&ctx.loadHistory){const b=el('button','載入五年週K，查看完整大W','ai-pattern-period-link');b.type='button';b.onclick=()=>ctx.loadHistory('5y');panel.append(b);}
  if(!Array.isArray(r.patterns)||!r.patterns.length){panel.append(el('p',r.classification==='uncertain'?'待審：目前不顯示輔助線。':'此視窗未辨識到符合標準的W。'));return;}
  if(ctx.adjusted){const b=el('button','切回一般'+(tf==='daily'?'日K':'週K')+'查看輔助線','ai-pattern-period-link');b.type='button';b.onclick=()=>ctx.switchPeriod(tf);panel.append(el('p','這筆判讀使用一般K線，還原模式不共用輔助線。'),b);return;}
  if(!ctx.chart||!ctx.series){panel.append(el('p','圖表仍在載入，稍後再查看。'));return;}
  const good=[],errors=[];
  for(const p of r.patterns||[]){try{good.push(verify(p,r,ctx.series.data()));}catch(e){errors.push(e.message);}}
  const types=[...new Set(good.map(p=>p.type))],key=ctx.code+'|'+tf;
  if(!choices.has(key))choices.set(key,new Set(types));
  const chosen=choices.get(key),boxes=el('div',null,'ai-pattern-options');
  function draw(){clear();owner=ctx.chart;for(const [i,type] of types.entries())if(chosen.has(type))for(const p of good.filter(p=>p.type===type))plot(p,colors[i%colors.length],ctx);}
  for(const type of types){const label=el('label',null,'ai-pattern-option'),input=el('input');input.type='checkbox';input.checked=chosen.has(type);input.dataset.patternType=type;input.onchange=()=>{input.checked?chosen.add(type):chosen.delete(type);draw();};label.append(input,el('span',labels[type]+'（'+good.filter(p=>p.type===type).length+'組）'));boxes.append(label);}
  panel.append(boxes);draw();
  if(errors.length)panel.append(el('p',[...new Set(errors)].join('；'),'ai-pattern-note'));
  if(good.length)panel.append(el('p','虛線為形狀輔助線；是否收盤突破另行核對，不代表買進訊號。','ai-pattern-meta'));
 }
 async function refresh(getContext){
  context=getContext;const ctx=getContext(),id=++ticket;clear();
  const hint=document.getElementById('aiPatternPeriodHint');if(hint){hint.replaceChildren();hint.hidden=true;}
  if(!ctx?.code)return;
  const panel=document.getElementById('aiBuyPanel');if(opened&&panel)panel.replaceChildren(el('p','讀取已保存的型態判讀…'));
  try{const data=await snapshot(ctx.code);if(id!==ticket||getContext().code!==ctx.code)return;render(data,getContext());}
  catch(e){if(id===ticket){clear();if(opened&&panel)panel.replaceChildren(el('p',e.message));}}
 }
 function setOpen(value,getContext){opened=!!value;if(!opened){clear();return;}refresh(getContext||context);}
 function reset(){ticket++;clear();const hint=document.getElementById('aiPatternPeriodHint');if(hint){hint.replaceChildren();hint.hidden=true;}const badge=document.querySelector('.chart-layer-tab[data-layer="ai"] .layer-count');if(badge){badge.textContent='';badge.classList.remove('show');}const panel=document.getElementById('aiBuyPanel');if(opened&&panel)panel.replaceChildren(el('p','等待對應週期圖表載入…'));}
 window.AcademyVisualPatterns={verify,refresh,setOpen,clear:reset,labels};
})();
