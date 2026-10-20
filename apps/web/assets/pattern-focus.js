/* Versioned daily confirmations. Never substitute box rows for other pattern families. */
(() => {
 'use strict';
 const types=[['box','箱型'],['flag','旗型'],['falling-wedge','下降楔型'],['rising-wedge','上升楔形'],['w','W 底'],['m','M 頭'],['inverse-head','頭肩底'],['head','頭肩頂'],['triangle-up','三角收斂突破'],['triangle-down','三角收斂跌破'],['ascending-triangle','上升三角'],['descending-triangle','下降三角'],['round','圓形底'],['false-up','假突破'],['false-down','假跌破']];
 const supported=new Set(['box','false-up','false-down']);
 const host=document.getElementById('fcBox'),select=document.getElementById('fcPatternType');if(!host||!select)return;
 let direction='up',run=0;
 select.replaceChildren(...types.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));
 function note(text){document.getElementById('fcPatternNote').textContent=text;}
 function empty(text,retry=false){const p=document.createElement('div');p.className='fc-empty';p.textContent=text;host.replaceChildren(p);if(retry){const b=document.createElement('button');b.type='button';b.className='fc-box-stock';b.textContent='重新讀取';b.onclick=load;p.append(' ',b);}}
 async function load(){
  const request=++run,type=select.value;
  host.setAttribute('aria-busy','true');
  document.querySelectorAll('[data-pattern-direction]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.patternDirection===direction)));
  const reversal=(type==='false-up'&&direction==='up')||(type==='false-down'&&direction==='down');
  if(reversal){note(type==='false-up'?'假突破代表向上越界後反向跌破箱底。':'假跌破代表向下越界後反向突破箱頂。');empty('請切換至'+(type==='false-up'?'「向下跌破」':'「向上突破」')+'查看此型態。');host.setAttribute('aria-busy','false');return;}
  note('正在核對最新交易日與型態資料…');empty('載入中…');
  const base=typeof SIG_SB_URL!=='undefined'?SIG_SB_URL:'',key=typeof SIG_SB_ANON!=='undefined'?SIG_SB_ANON:'';
  const headers={apikey:key,Authorization:'Bearer '+key};
  const json=async path=>{const r=await fetch(base+'/rest/v1/'+path,{headers});if(!r.ok)throw Error('型態資料暫時無法讀取');return r.json();};
  try{
   if(!supported.has(type)){
    const [market,cached]=await Promise.all([json('taiex_daily?select=trade_date&order=trade_date.desc&limit=1'),json('page_cache?kind=eq.chart_patterns&select=payload,updated_at&limit=1')]);
    if(request!==run)return;
    const date=market?.[0]?.trade_date,snapshot=cached?.[0]?.payload;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('無法確認最新交易日');
    if(!snapshot){note('交易日 '+date+' · 等待型態辨識快照');empty('此型態的每日辨識資料尚未提供；不以箱型名單代替。');return;}
    if(snapshot.version!=='chart-patterns-v1'||snapshot.complete!==true||!Array.isArray(snapshot.types)||!snapshot.types.includes(type)||!Array.isArray(snapshot.signals))throw Error('型態快照格式尚未就緒');
    if(snapshot.date!==date){note('最新交易日 '+date+' · 型態資料日 '+(snapshot.date||'尚無資料'));empty('型態資料尚未更新至最新交易日，暫不列為今日訊號。');return;}
    const valid=snapshot.signals.filter(s=>s.type===type&&s.direction===direction&&s.date===date&&/^\d{4,6}$/.test(s.code)&&Number.isFinite(s.boundary)&&s.boundary>0);
    note('交易日 '+date+' · '+valid.length+' 檔 · 規則辨識候選，點個股驗證 K 線與量能。');
    if(!valid.length){empty('當日尚無符合所選型態與方向的確認訊號。');return;}
    render(valid,date,true);return;
   }
   const dates=await Promise.all([json('taiex_daily?select=trade_date&order=trade_date.desc&limit=1'),json('box_patterns?select=data_date&order=data_date.desc&limit=1')]);
   if(request!==run)return;
   const date=dates[0]?.[0]?.trade_date,snapshot=dates[1]?.[0]?.data_date;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('無法確認最新交易日');
   if(snapshot!==date){note('最新交易日 '+date+' · 型態資料日 '+(snapshot||'尚無資料'));empty('型態資料尚未更新至最新交易日，暫不列為今日訊號。');return;}
   const status=type==='false-up'?'FALSE_UP_THEN_DOWN':type==='false-down'?'FALSE_DOWN_THEN_UP':direction==='up'?'CONFIRMED_UP':'CONFIRMED_DOWN';
   const rows=await json('box_patterns?select=code,status,breakout_date,data_date&status=eq.'+status+'&data_date=eq.'+date+'&breakout_date=eq.'+date+'&order=code.asc&limit=5000');
   if(request!==run)return;if(!Array.isArray(rows))throw Error('型態資料格式異常');
   const valid=rows.filter(x=>x.status===status&&x.data_date===date&&x.breakout_date===date&&/^\d{4,6}$/.test(x.code));
   note('交易日 '+date+' · '+valid.length+' 檔 · 僅列當日確認；點個股看 K 線。');
   if(!valid.length){empty('當日尚無符合所選型態與方向的確認訊號。');return;}
   render(valid,date);
  }catch(error){if(request===run){note('尚未取得完整資料，請稍後重試。');empty(error.message,true);}}
  finally{if(request===run)host.setAttribute('aria-busy','false');}
 }
 function render(rows,date,explain=false){
  const list=document.createElement('div');list.className='fc-box-list';
  for(const row of rows){const b=document.createElement('button');b.type='button';b.className='fc-box-stock';const name=window._names?.[row.code]||'',title=document.createElement('b'),sub=document.createElement('span');title.textContent=row.code+' '+name;sub.textContent=(direction==='up'?'向上突破':'向下跌破')+' · '+date;b.append(title,sub);if(explain){const rule=document.createElement('small');rule.textContent='確認線 '+row.boundary.toLocaleString('zh-TW')+(Number.isFinite(row.volume_ratio)?' · 量比 '+row.volume_ratio.toFixed(2)+' 倍':'');b.append(rule);b.title=String(row.evidence||'每日型態規則辨識候選');}b.onclick=()=>window._openStock?.(row.code,name);list.append(b);}
  host.replaceChildren(list);
 }
 document.querySelectorAll('[data-pattern-direction]').forEach(b=>b.addEventListener('click',()=>{direction=b.dataset.patternDirection;load();}));
 select.addEventListener('change',load);window.AcademyPatternFocus={load};
 if(getComputedStyle(document.getElementById('focusView')).display!=='none')load();
})();
