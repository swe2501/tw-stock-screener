/* Saved research browser. Selecting a tab never starts inference. */
(()=>{
 'use strict';
 const tabs=[['w_bottom','W型','雙底輪廓'],['box','箱型','區間整理'],['ascending_triangle','上升三角','高點持平・低點墊高'],['symmetrical_triangle','收斂三角','高低點逐步收斂'],['descending_triangle','下降三角','低點持平・高點降低']];
 let active='w_bottom',data=null,request=null,mounted=false,period='all',status='ready',query='',boxLoaded=false;
 const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 function button(text,action,cls){const b=node('button',text,cls);b.type='button';b.onclick=action;return b;}
 function icon(type){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 48 32');svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',({w_bottom:'M3 5 14 27 25 9 35 27 45 5',box:'M4 6H44V27H4ZM5 21 13 10 22 22 31 11 43 19',ascending_triangle:'M4 6H44L4 27M6 24 14 8 23 19 31 7 37 12',symmetrical_triangle:'M4 4 44 16 4 29M6 6 15 25 24 11 32 20 40 15',descending_triangle:'M4 5 44 27H4M6 9 14 25 23 15 31 26 37 23'})[type]);svg.append(p);return svg;}
 function summaryName(tf){return tf==='daily'?'日K':'週K';}
 function hasPattern(r){return r.execution_status==='reviewed'&&Array.isArray(r.patterns)&&r.patterns.some(p=>p.type===active);}
 function state(r){return hasPattern(r)?'confirmed':r.execution_status!=='reviewed'?'pending':r.classification==='uncertain'?'uncertain':'negative';}
 // A historical shape label alone is never a current setup. Review must cover
 // the exact latest source bar and survive all subsequent price action.
 function ready(r){const o=r.opportunity,b=r.source_bars?.at(-1);return hasPattern(r)&&o?.status==='ready'&&Number.isFinite(Date.parse(o.valid_until))&&Date.now()<=Date.parse(o.valid_until)&&o.reviewed_through===r.data_as_of&&b?.time===r.data_as_of&&o.source_sha256===r.ohlc_sha256&&o.latest_bar_in_structure===true&&o.boundary_approach_verified===true&&o.breakout_occurred===false&&o.invalidated===false&&['up','down','both'].includes(o.direction);}
 function matching(){return (data?.records||[]).filter(r=>(period==='all'||r.timeframe===period)&&(!query||(r.code+' '+r.name).toLowerCase().includes(query.toLowerCase()))&&(status==='ready'?ready(r):status==='confirmed'?hasPattern(r):active==='w_bottom'&&state(r)===status));}
 function mini(pattern){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 74');svg.setAttribute('role','img');svg.setAttribute('aria-label','已判讀區段的W轉折輪廓示意');svg.classList.add('aps-mini');
  const values=pattern.points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),y=v=>60-(v-lo)/(hi-lo||1)*45;
  const neck=document.createElementNS(svg.namespaceURI,'path');neck.setAttribute('d','M10 '+y(pattern.neckline.value)+' H230');neck.setAttribute('class','aps-neck');svg.append(neck);
  const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',values.map((v,i)=>(i?'L':'M')+(10+i*55)+' '+y(v)).join(' '));svg.append(line);return svg;}
 function open(r){window._openSavedPatternChart?.(r.code,r.name,r.timeframe);}
 function card(code,records){const first=records[0],article=node('article',null,'aps-card'),head=node('div',null,'aps-card-head'),title=node('div');title.append(node('b',code,'aps-code'),node('span',first.name,'aps-name'));head.append(title);
  const good=records.filter(hasPattern),badge=node('span',good.length?(status==='ready'?'準備突破／跌破':'歷史W案例'):status==='uncertain'?'待複核':'未見W','aps-badge'+(good.length?'':' muted'));head.append(badge);article.append(head);
  const p=good.flatMap(r=>r.patterns).find(p=>p.type===active);if(p)article.append(mini(p));
  for(const r of records){const row=node('div',null,'aps-record'),top=node('div',null,'aps-record-top'),patterns=r.patterns?.filter(p=>p.type===active)||[];
   top.append(node('span',summaryName(r.timeframe),'aps-period'),node('span',patterns.length?patterns.length+' 組W'+(status==='ready'?' · 邊界觀察':' · 歷史形態'):state(r)==='uncertain'?'待複核':'未見W','aps-record-state'));
   const b=button('查看'+summaryName(r.timeframe),()=>open(r),'aps-view');b.setAttribute('aria-label',r.code+' '+summaryName(r.timeframe)+' 查看K圖');top.append(b);row.append(top);
   if(patterns.length){const a=patterns[0].points;row.append(node('p',a[0].time+' — '+a[a.length-1].time,'aps-dates'));}
   else row.append(node('p',r.reason||'此視窗沒有已確認的型態。','aps-reason'));
   article.append(row);
  }
  return article;
 }
 function render(){const panel=$('aiPatternResults');if(!panel)return;panel.replaceChildren();
  if(!data){panel.append(node('p','讀取已保存的判讀結果…','aps-empty'));return;}
  const type=tabs.find(t=>t[0]===active);
  if(active!=='w_bottom'&&!data.records.some(hasPattern)){const empty=node('div',null,'aps-empty');empty.append(icon(active),node('h3','尚未加入'+type[1]+'的已確認判讀'),node('p','這個分頁已備妥，加入判讀資料後會顯示個股與對應K線。'));panel.append(empty);$('aiPatternResultCount').textContent='尚未判讀';return;}
  const rows=matching(),grouped=new Map();for(const r of rows){if(!grouped.has(r.code))grouped.set(r.code,[]);grouped.get(r.code).push(r);}
  $('aiPatternResultCount').textContent=status==='ready'&&!data.records.some(r=>r.opportunity)?'最新候選尚待複核':grouped.size+' 檔 · '+rows.length+' 個週期';
  if(!rows.length){panel.append(node('div','目前沒有通過最新K棒機會複核的候選。最新候選尚待複核，並非已掃完且沒有機會。可切換「歷史W案例」查看舊區段。','aps-empty'));return;}
  const grid=node('div',null,'aps-grid');for(const [code,records] of grouped)grid.append(card(code,records));panel.append(grid);
 }
 async function load(){if(data)return;if(!request)request=fetch('assets/codex-visual-patterns.json?v=both-ends-20261026').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(d.version!=='codex-visual-v1'||!Array.isArray(d.records))throw Error();data=d;const confirmed=d.records.filter(r=>r.execution_status==='reviewed'&&r.patterns?.some(p=>p.type==='w_bottom'));const n=new Set(confirmed.map(r=>r.code)).size;
   $('aiPatternScope').textContent='已判讀 '+(d.coverage?.selected_stocks||new Set(d.records.map(r=>r.code)).size)+' 檔 · 歷史W '+n+' 檔 · 待完成最新機會複核 · 行情截至 '+(confirmed[0]?.data_as_of||'—');
   const w=$('aiPatternTabs').querySelector('[data-type="w_bottom"] .aps-tab-count');if(w)w.textContent=d.records.some(r=>r.opportunity)?new Set(d.records.filter(ready).map(r=>r.code)).size:'待複核';
  }).catch(()=>{request=null;throw Error('判讀結果暫時無法取得');});return request;}
 function select(type){active=type;status='ready';if($('aiPatternState'))$('aiPatternState').value=status;
  const isBox=type==='box';$('aiPatternLegacyBox').hidden=!isBox;$('aiPatternSavedPanel').hidden=isBox;
  for(const b of $('aiPatternTabs').querySelectorAll('[role=tab]')){const on=b.dataset.type===type;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  if(isBox){if(!boxLoaded){boxLoaded=true;window._boxLegacyShow();}return;}
  $('aiPatternFilters').hidden=type!=='w_bottom';render();
  load().then(()=>{if(active!=='box')render();}).catch(e=>{if(active!=='box'){$('aiPatternResults').replaceChildren(node('div',e.message,'aps-empty'));}});
 }
 function mount(){if(mounted)return;mounted=true;const host=$('aiPatternTabs');
  tabs.forEach(([type,label,desc],i)=>{const b=button('',()=>select(type),'aps-tab');b.dataset.type=type;b.setAttribute('role','tab');b.setAttribute('id','aps-tab-'+type);b.setAttribute('aria-controls',type==='box'?'aiPatternLegacyBox':'aiPatternSavedPanel');b.title=desc;b.append(icon(type),node('span',label));if(!i)b.append(node('span','…','aps-tab-count'));b.onkeydown=e=>{let j=i;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;else return;e.preventDefault();select(tabs[j][0]);host.querySelectorAll('button')[j].focus();};host.append(b);});
  $('aiPatternSearch').oninput=e=>{query=e.target.value.trim();render();};$('aiPatternPeriod').onchange=e=>{period=e.target.value;render();};$('aiPatternState').onchange=e=>{status=e.target.value;render();};
 }
 window._boxShow=function(){mount();select(active);};
})();
