/* Three display-only ranking lists. Uses the existing focus request and snapshot order. */
(() => {
 'use strict';
 const config={gainers:{title:'漲幅榜',host:'fcGainers'},losers:{title:'跌幅榜',host:'fcLosers'},volume_surge:{title:'爆量榜',host:'fcSurge'}};
 const number=v=>typeof v==='number'&&Number.isFinite(v),fmt=v=>number(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:3}):'—';
 const percent=v=>number(v)?(v>0?'+':'')+v.toFixed(2)+'%':'—';
 const tone=v=>number(v)?v>0?'fr-up':v<0?'fr-down':'':'';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let snapshot=null,nameLookup=null,currentKind=null,sortKey=null,sortDirection=1,returnFocus=null;
 const dialog=el('dialog','fr-expand');dialog.setAttribute('aria-labelledby','fr-expand-title');
 const heading=el('header','fr-expand-head'),title=el('h2','', '今日排行榜');title.id='fr-expand-title';
 const close=el('button','fr-close','×');close.type='button';close.setAttribute('aria-label','關閉排行榜');close.onclick=()=>dialog.close();
 heading.append(title,close);const note=el('p','fr-expand-note'),reset=el('button','fr-reset','還原榜單順序');reset.type='button';reset.onclick=()=>{sortKey=null;paintTable();};
 const controls=el('div','fr-expand-controls');controls.append(note,reset);const content=el('div','fr-table-wrap');dialog.append(heading,controls,content);document.body.append(dialog);
 dialog.addEventListener('close',()=>{returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});currentKind=null;});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 function leave(action){if(dialog.open){returnFocus=null;dialog.close();}action();}
 // 從完整排行點題材：把題材抽屜暫時搬進完整排行視窗裡打開（疊在上面），完整排行不關閉；
 // 抽屜關掉就搬回原位，使用者可直接再點下一個題材。抽屜裡點個股時，先關完整排行再開 K 線。
 let drawerHome=null;
 function drawer(){return document.getElementById('themeDrawer');}
 function restoreDrawer(){const dr=drawer();if(drawerHome&&dr){drawerHome.parent.insertBefore(dr,drawerHome.next&&drawerHome.next.parentNode===drawerHome.parent?drawerHome.next:null);}drawerHome=null;}
 function openTheme(name){
  const dr=drawer();
  if(dialog.open&&dr){if(!drawerHome)drawerHome={parent:dr.parentNode,next:dr.nextSibling};dialog.append(dr);}
  window._openThemeDrawer?.(name);
 }
 (function watchDrawer(){const dr=drawer();if(!dr){document.addEventListener('DOMContentLoaded',watchDrawer,{once:true});return;}
  new MutationObserver(()=>{if(drawerHome&&!dr.classList.contains('open'))restoreDrawer();}).observe(dr,{attributes:true,attributeFilter:['class']});
  const wrapStock=()=>{const o=window._openStock;if(typeof o!=='function'||o._frWrapped)return;const w=function(){if(drawerHome){window._closeTheme?.();restoreDrawer();if(dialog.open){returnFocus=null;dialog.close();}}return o.apply(this,arguments);};w._frWrapped=true;window._openStock=w;};
  wrapStock();window.addEventListener('load',wrapStock);dialog.addEventListener('click',wrapStock,true);
 })();
 // 抽屜開著時按 Esc：只關抽屜，留在完整排行
 let escGuard=false;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawerHome&&drawer()?.classList.contains('open')){escGuard=true;setTimeout(()=>{escGuard=false;},0);}},true);
 dialog.addEventListener('cancel',e=>{if(escGuard||(drawerHome&&drawer()?.classList.contains('open'))){e.preventDefault();escGuard=false;window._closeTheme?.();}});
 dialog.addEventListener('close',()=>{if(drawerHome){window._closeTheme?.();restoreDrawer();}});
 function stockName(row){return (nameLookup?.(row.code)||row.name||row.code);}
 function stock(row){const b=el('button','fr-stock');b.type='button';b.append(el('span','fr-code',row.code),el('b','fr-name',stockName(row)));b.title=row.code+' '+stockName(row);b.setAttribute('aria-label','查看 '+b.title+' K 線');b.onclick=()=>leave(()=>window._openStock?.(row.code,stockName(row)));return b;}
 function medal(rank){
  const badge=el('span','fr-rank'+(rank<=3?' fr-medal fr-medal-'+rank:''));
  if(rank>3){badge.textContent=rank;badge.setAttribute('aria-label','第 '+rank+' 名');return badge;}
  badge.setAttribute('role','img');badge.setAttribute('aria-label','第 '+rank+' 名'+['','金牌','銀牌','銅牌'][rank]);
  badge.innerHTML='<svg viewBox="0 0 28 34" aria-hidden="true"><path class="fr-ribbon" d="m7 20-3 13 9-5 9 5-3-13Z"/><circle class="fr-medal-face" cx="14" cy="13" r="11"/><path class="fr-medal-glint" d="M6 12a8 8 0 0 1 11-6"/><text x="14" y="17" text-anchor="middle">'+rank+'</text></svg>';
  return badge;
 }
 function themes(row){
  const seen=new Set();return (Array.isArray(row.themes)?row.themes:[]).map(t=>typeof t==='string'?{id:t,name:t}:t).filter(t=>t&&typeof t.name==='string'&&t.name.trim()&&!seen.has(t.name)&&seen.add(t.name));
 }
 function tags(row,limit=3){
  const wrap=el('div','fr-tags'),items=themes(row);
  if(!Array.isArray(row.themes)){wrap.append(el('span','fr-no-theme','題材待更新'));return wrap;}
  if(!items.length){wrap.append(el('span','fr-no-theme','未分類'));return wrap;}
  const button=t=>{const b=el('button','fr-theme',t.name);b.type='button';b.title='查看 '+t.name+' 族群';b.onclick=e=>{e.stopPropagation();openTheme(t.name);};return b;};
  // 先完整列出前 limit 個；其餘收起，「+N 更多／收起」一律固定在最後面
  items.slice(0,limit).forEach(t=>wrap.append(button(t)));
  const rest=items.length-limit;
  if(rest>0){const extra=el('span','fr-extra-tags');extra.hidden=true;items.slice(limit).forEach(t=>extra.append(button(t)));
   const more=el('button','fr-more','+'+rest+' 更多');more.type='button';more.setAttribute('aria-label','展開其餘 '+rest+' 個題材');more.setAttribute('aria-expanded','false');
   more.onclick=e=>{e.stopPropagation();const open=extra.hidden;extra.hidden=!open;more.setAttribute('aria-expanded',String(open));more.textContent=open?'收起':'+'+rest+' 更多';more.setAttribute('aria-label',open?'收起題材':'展開其餘 '+rest+' 個題材');wrap.classList.toggle('is-expanded',open);};
   wrap.append(extra,more);}
  return wrap;
 }
 function dayChange(row){return el('strong','fr-change '+tone(row.chg),percent(row.chg));}
 function cardRow(row,index,kind){
  const article=el('article','fr-row'+(index<3?' fr-podium':'')),main=el('div','fr-row-main'),values=el('div','fr-values');
  if(kind==='volume_surge')values.append(el('strong','fr-ratio',number(row.ratio)?row.ratio.toFixed(2)+'×':'—'));
  values.append(dayChange(row));main.append(medal(index+1),stock(row),values);
  const meta=el('div','fr-row-meta'),price=el('span','fr-meta-price','收盤 '+fmt(row.close)+' · ');
  if(kind==='volume_surge'){price.append(el('span','',fmt(row.volume_lots)+' 張'));price.title='成交量：1 張＝1,000 股；零股保留小數。';}
  else{price.append(el('span','','5日 '),el('span','fr-five '+tone(row.chg_5d),percent(row.chg_5d)));price.title=number(row.chg_5d)?'相對五個交易日前收盤價':'缺少五個交易日前的收盤資料，顯示 —。';}
  meta.append(price,tags(row));article.append(main,meta);return article;
 }
 function list(kind){return (Array.isArray(snapshot?.[kind])?snapshot[kind]:[]).filter(r=>r&&/^\d{4,6}$/.test(r.code));}
 function expand(kind,button){returnFocus=button;currentKind=kind;sortKey=null;sortDirection=1;dialog.dataset.kind=kind;title.textContent=config[kind].title+' · 完整排行';paintTable();dialog.showModal();close.focus();}
 function paintTable(){
  if(!currentKind)return;
  note.textContent='行情日 '+snapshot.date+' · 5日基準 '+(snapshot.five_day_base_date||'資料準備中')+' · 點欄位標題排序';
  reset.disabled=sortKey===null;content.replaceChildren();const table=el('table','fr-table'),head=el('thead'),headRow=el('tr'),body=el('tbody');table.setAttribute('aria-label',config[currentKind].title+' 可排序表格');
  const columns=[['stock','股票'],['chg','漲跌幅'],['chg_5d','5日'],['close','收盤'],['themes','所屬題材']];
  for(const [key,label] of columns){const th=el('th');th.scope='col';th.setAttribute('aria-sort',sortKey===key?sortDirection===1?'ascending':'descending':'none');const b=el('button','fr-sort',label+(sortKey===key?(sortDirection===1?' ↑':' ↓'):' ↕'));b.type='button';b.dataset.sortKey=key;b.onclick=()=>{if(sortKey===key)sortDirection*=-1;else{sortKey=key;sortDirection=['stock','themes'].includes(key)?1:-1;}paintTable();content.querySelector('[data-sort-key="'+key+'"]').focus({preventScroll:true});};th.append(b);headRow.append(th);}
  const rows=list(currentKind).map((row,index)=>({row,index}));
  const value=r=>sortKey==='stock'?r.code:sortKey==='themes'?themes(r).map(t=>t.name).join('、'):number(r[sortKey])?r[sortKey]:null;
  if(sortKey)rows.sort((a,b)=>{const av=value(a.row),bv=value(b.row);if(av===null||bv===null)return av===bv?a.index-b.index:av===null?1:-1;return sortDirection*(typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'zh-TW',{numeric:true}))||a.index-b.index;});
  for(const {row,index} of rows){const tr=el('tr');const first=el('td','fr-table-stock');first.dataset.label='股票';const identity=el('div','fr-table-identity');identity.append(medal(index+1),stock(row));first.append(identity);if(currentKind==='volume_surge')first.append(el('span','fr-table-ratio',fmt(row.ratio)+'× · '+fmt(row.volume_lots)+' 張'));tr.append(first);
   for(const [key,label] of columns.slice(1)){const td=el('td',key==='themes'?'fr-table-themes':'fr-number '+(key==='close'?'':tone(row[key])));td.dataset.label=label;if(key==='themes')td.append(tags(row,4));else td.textContent=key==='close'?fmt(row.close):percent(row[key]);tr.append(td);}body.append(tr);
  }
  if(!rows.length){const tr=el('tr'),td=el('td','','今日無排行資料');td.colSpan=5;tr.append(td);body.append(tr);}
  head.append(headRow);table.append(head,body);content.append(table);
 }
 function render(data,{name}={}){
  snapshot=data;nameLookup=typeof name==='function'?name:null;
  for(const [kind,c] of Object.entries(config)){const host=document.getElementById(c.host);if(!host)continue;host.classList.add('fr-list');host.replaceChildren();const rows=list(kind);if(rows.length)rows.forEach((row,i)=>host.append(cardRow(row,i,kind)));else host.append(el('div','fc-empty','今日無資料'));
   const heading=host.closest('.fc-card')?.querySelector('.fc-h');if(heading&&!heading.querySelector('[data-expand-ranking]')){const button=el('button','fr-expand-button','展開 ↗');button.type='button';button.dataset.expandRanking=kind;button.setAttribute('aria-label','展開'+c.title+'完整表格');button.onclick=()=>expand(kind,button);heading.append(button);}
  }
  if(dialog.open)paintTable();
 }
 window.AcademyFocusRankings={render};
})();
