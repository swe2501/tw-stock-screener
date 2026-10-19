/* Completed-session comparisons. No imputed history, prices or money flows. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AcademySectorModel=api;})(globalThis,()=>{
 'use strict';
 const periods=[1,3,5,10,20,60],keys=['elec','fin','trad'],labels={elec:'電子',fin:'金融',trad:'其他傳產'};
 const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;
 const sum=a=>a.reduce((n,v)=>n+v,0);
 const direction=(v,tolerance=.05)=>v===null?'unknown':v>tolerance?'up':v< -tolerance?'down':'flat';
 function normalize(row){
  row=row&&typeof row==='object'?row:{};
  const amounts=Object.fromEntries(keys.map(k=>[k,number(row[k+'_amt'])])),total=number(row.total_amt);
  const completeAmounts=total!==null&&keys.every(k=>amounts[k]!==null);
  const amountsValid=completeAmounts&&total>0&&keys.every(k=>amounts[k]>=0)&&Math.abs(sum(Object.values(amounts))-total)<=Math.max(1,total*.001);
  const invalidAmounts=(total!==null&&total<0)||keys.some(k=>amounts[k]!==null&&amounts[k]<0)||(completeAmounts&&!amountsValid);
  const published=Object.fromEntries(keys.map(k=>[k,number(row[k+'_pct'])]));
  const shares=amountsValid?Object.fromEntries(keys.map(k=>[k,amounts[k]/total*100])):published;
  const sharesValid=!invalidAmounts&&keys.every(k=>shares[k]!==null&&shares[k]>=0&&shares[k]<=100)&&Math.abs(sum(Object.values(shares))-100)<=.3;
  return {date:date(row.date),shares,amounts,total,sharesValid,amountsValid,updatedAt:row.updated_at||null,topTrad:{name:String(row.top_trad_name||''),share:number(row.top_trad_pct)}};
 }
 function create(rows,taiex,otc=[]){
  rows=Array.isArray(rows)?rows:[];taiex=Array.isArray(taiex)?taiex:[];otc=Array.isArray(otc)?otc:[];
  const map=new Map(),duplicates=new Set();
  rows.map(normalize).filter(r=>r.date).forEach(r=>{if(map.has(r.date))duplicates.add(r.date);else map.set(r.date,r);});
  duplicates.forEach(d=>map.set(d,{...map.get(d),sharesValid:false,amountsValid:false}));
  const tx=new Map(),ox=new Map(),sessions=new Set();
  for(const r of taiex){if(!r)continue;const d=date(r.trade_date),v=number(r.close);if(d)sessions.add(d);if(d&&v!==null&&v>0)tx.set(d,v);}
  for(const r of otc){if(!r)continue;const d=date(r.trade_date),v=number(r.close);if(d&&v!==null&&v>0)ox.set(d,v);}
  const sectorDates=[...map.keys()].sort(),marketDates=[...sessions].sort(),latest=sectorDates.at(-1)||null;
  const calendar=marketDates.filter(d=>latest&&d<=latest),anchor=calendar.at(-1)||null;
  function aggregate(dates,n,mode){
   const selected=dates.map(d=>map.get(d)),available=selected.filter(r=>r?.sharesValid).length;
   const ready=dates.length===n&&available===n;
   const amountsReady=ready&&selected.every(r=>r.amountsValid);
   const totals=amountsReady?Object.fromEntries(keys.map(k=>[k,sum(selected.map(r=>r.amounts[k]))])):null;
   const total=amountsReady?sum(selected.map(r=>r.total)):null;
   const shares=ready?Object.fromEntries(keys.map(k=>[k,mode==='weighted'&&amountsReady?totals[k]/total*100:sum(selected.map(r=>r.shares[k]))/n])):null;
   return {ready,available,expected:n,dates,from:dates[0]||null,to:dates.at(-1)||null,shares,amounts:totals,total};
  }
  function priceReturn(prices,dates,n){
   if(dates.length!==n)return null;
   const start=calendar.indexOf(dates[0]),base=start>0?prices.get(calendar[start-1]):null,end=prices.get(dates.at(-1));
   if(!base||!end||dates.some(d=>!prices.has(d)))return null;
   return (end/base-1)*100;
  }
  function compare(n){
   if(!periods.includes(n))throw Error('不支援的比較週期');
   const currentDates=calendar.slice(-n),previousDates=calendar.slice(Math.max(0,calendar.length-2*n),Math.max(0,calendar.length-n));
   const present=[...currentDates,...previousDates].map(d=>map.get(d)).filter(Boolean);
   const mode=present.length&&present.every(r=>r.amountsValid)?'weighted':'daily-average';
   const current=aggregate(currentDates,n,mode),previous=aggregate(previousDates,n,mode);
   const changes=Object.fromEntries(keys.map(k=>{
    const delta=current.ready&&previous.ready?current.shares[k]-previous.shares[k]:null;
    const oldAmount=previous.amounts?.[k]??null,newAmount=current.amounts?.[k]??null;
    const amountDelta=oldAmount!==null&&newAmount!==null?newAmount-oldAmount:null;
    const amountPct=oldAmount!==null&&oldAmount>0&&newAmount!==null?(newAmount/oldAmount-1)*100:null;
    return [k,{delta,amountDelta,amountPct,direction:direction(delta)}];
   }));
   return {n,mode,current,previous,changes,marketReturn:priceReturn(tx,currentDates,n),otcReturn:priceReturn(ox,currentDates,n)};
  }
  function explanation(comparison,key){
   const c=comparison,d=c.changes[key],name=labels[key];
   if(!c.current.ready)return name+'本期資料不足，尚無法計算完整週期。';
   if(!c.previous.ready)return name+'本期占比可查看；前期資料不足，暫不判定增減。';
   if(d.delta===null)return '比較資料不足。';
   if(c.current.amounts===null||c.previous.amounts===null)return name+'占比'+(d.direction==='up'?'提高':d.direction==='down'?'降低':'接近前期')+'；缺少完整成交金額，採每日占比平均，無法解釋金額變化。';
   const amountSign=direction(d.amountDelta,0),totalPct=c.previous.total>0?(c.current.total/c.previous.total-1)*100:null;
   if(d.direction==='up'&&amountSign==='down')return name+'成交金額減少，但上市成交總額減少更多，因此占比相對提高。';
   if(d.direction==='up'&&amountSign==='up')return name+'成交金額增加，增幅高於上市成交總額，因此占比提高。';
   if(d.direction==='down'&&amountSign==='up')return name+'成交金額增加，但上市成交總額增加更多，因此占比降低。';
   if(d.direction==='down'&&amountSign==='down')return name+'成交金額減少，相較上市成交總額的變化，占比同步降低。';
   if(d.direction==='flat')return name+'成交占比接近前期'+(totalPct===null?'。':'；實際成交金額仍須分開比較。');
   return name+'成交金額接近前期，占比受上市成交總額變化影響。';
  }
  function history(key){return calendar.map(d=>{const r=map.get(d);return {date:d,share:r?.sharesValid?r.shares[key]:null,amount:r?.amountsValid?r.amounts[key]:null};});}
  function rank(n,key){
   const c=compare(n);if(!c.current.ready)return {value:null,count:0};
   const end=calendar.length-n,samples=[];
   for(let i=end;i>=n&&samples.length<252;i--){const a=aggregate(calendar.slice(i-n,i),n,c.mode);if(a.ready&&(c.mode!=='weighted'||a.amounts))samples.push(a.shares[key]);}
   if(samples.length<60)return {value:null,count:samples.length};
   const value=(samples.filter(v=>v<c.current.shares[key]-1e-9).length+.5*samples.filter(v=>Math.abs(v-c.current.shares[key])<1e-9).length)/samples.length*100;
   return {value,count:samples.length};
  }
  function persistence(key){const h=history(key).slice(-6);let rises=0,falls=0,pairs=0;for(let i=1;i<h.length;i++){if(h[i].share===null||h[i-1].share===null)continue;pairs++;const d=direction(h[i].share-h[i-1].share);if(d==='up')rises++;if(d==='down')falls++;}return {rises,falls,pairs};}
  return {compare,explanation,history,rank,persistence,calendar,anchor,latestSector:latest,latestMarket:marketDates.at(-1)||null,validCount:calendar.filter(d=>map.get(d)?.sharesValid).length,latestRow:map.get(anchor)||null};
 }
 return {create,periods,keys,labels,number,direction};
});
