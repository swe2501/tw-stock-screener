/* Official exhibition dates + explicitly labelled classification links. No investment scoring. */
(() => {
'use strict';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function shiftMonths(iso, delta) {
 const [y,m,d] = iso.split('-').map(Number), target = new Date(Date.UTC(y,m-1+delta,1));
 const last = new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);
}
function phase(event, today) {
 if(event.status !== 'confirmed' || !event.start || !event.end)return 'pending';
 if(today>event.end)return 'ended';
 if(today>=event.start)return 'live';
 return today>=shiftMonths(event.start,-2)?'reminder':'future';
}
function members(event, catalog) {
 const found = new Map();
 function add(code, reason) {
  if(!catalog.industries[code])return;
  if(!found.has(code))found.set(code,{code,name:catalog.names[code]||code,reasons:[],evidence:[]});
  const row=found.get(code);if(!row.reasons.includes(reason))row.reasons.push(reason);
 }
 for(const name of event.themes||[])for(const code of catalog.themes[name]||[])add(code,'題材：'+name);
 for(const [code,industry] of Object.entries(catalog.industries))if((event.industries||[]).includes(industry))add(code,'產業：'+industry);
 for(const item of event.companies||[]){add(item.code,item.kind==='exhibitor'?'官方確認當屆參展':'有來源的公司技術消息');if(found.has(item.code))found.get(item.code).evidence.push(item);}
 return [...found.values()].sort((a,b)=>b.evidence.length-a.evidence.length||a.code.localeCompare(b.code));
}
const api={shiftMonths,phase,members};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
let data=null,catalog=null,loading=null,root=null,drawer=null,opener=null;
let month='',query='',group='',drawerEvent=null;
function link(url,label){try{const u=new URL(url);return u.protocol==='https:'?'<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';}catch{return '';}}
const label = event => ({pending:'延期／日期待定',ended:'已結束',live:'展覽進行中',reminder:'展前兩個月提醒',future:'未來展覽'}[phase(event,day())]);
function matches(event){
 const term=query.trim().toLowerCase();
 return (!group||(group.startsWith('t:')?(event.themes||[]).includes(group.slice(2)):(event.industries||[]).includes(group.slice(2))))&&(!term||[event.name,event.venue,event.focus,...event.themes,...event.industries].join(' ').toLowerCase().includes(term));
}
function available(){const today=day(),end=shiftMonths(today,12);return data.events.filter(e=>matches(e)&&(phase(e,today)==='pending'||(e.end>=today&&e.start<=end)));}
function button(event,extra=''){return '<button type="button" class="ex-event '+extra+'" data-ex-id="'+esc(event.id)+'"><b>'+esc(event.name)+'</b><span>'+esc(event.start?event.start.slice(5)+' — '+event.end.slice(5):'新展期待公告')+'</span></button>';}
function render(){
 const today=day(),events=available(),dated=events.filter(e=>e.start),reminders=events.filter(e=>['reminder','live'].includes(phase(e,today)));
 root.querySelector('[data-ex-month]').value=month;
 root.querySelector('[data-ex-prev]').disabled=month<=today.slice(0,7);
 root.querySelector('[data-ex-next]').disabled=month>=shiftMonths(today,12).slice(0,7);
 root.querySelector('[data-ex-reminders]').innerHTML='<h3>展前觀察提醒 <span>'+reminders.length+' 場</span></h3>'+(reminders.length?reminders.map(e=>button(e,'is-reminder')).join(''):'<p class="ex-muted">目前篩選下，沒有已進入展前兩個月的展覽。</p>');
 const first=new Date(month+'-01T00:00:00Z'),offset=first.getUTCDay(),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 let html='<div class="ex-blank" aria-hidden="true"></div>'.repeat(offset);
 for(let n=1;n<=count;n++){
  const date=month+'-'+String(n).padStart(2,'0'),items=dated.filter(e=>e.start<=date&&e.end>=date);
  html+='<div class="ex-day'+(date===today?' is-today':'')+'"><time datetime="'+date+'">'+n+'</time>'+items.map(e=>'<button type="button" data-ex-id="'+esc(e.id)+'" title="'+esc(e.name)+'" aria-label="'+date+' '+esc(e.name)+'">'+esc(e.name)+'</button>').join('')+'</div>';
 }
 root.querySelector('[data-ex-grid]').innerHTML=html;
 root.querySelector('[data-ex-agenda]').innerHTML='<h3>未來 12 個月 <span>'+dated.length+' 場已公布展期</span></h3>'+(dated.length?dated.map(e=>'<article class="ex-agenda-row"><div><time>'+esc(e.start)+' — '+esc(e.end)+'</time><span class="ex-status '+phase(e,today)+'">'+label(e)+'</span></div>'+button(e)+'<p>'+esc([...e.themes,...e.industries].join(' · '))+'</p></article>').join(''):'<p class="ex-muted">此分類目前沒有已核實的未來展期；不以往年日期推算。</p>');
 const pending=events.filter(e=>!e.start);
 root.querySelector('[data-ex-pending]').innerHTML=pending.length?'<h3>延期／日期待定</h3>'+pending.map(e=>button(e)).join(''):'';
 const age=Math.floor((Date.parse(today)-Date.parse(data.verifiedAt))/86400000);
 root.querySelector('[data-ex-verified]').textContent='展期核對 '+data.verifiedAt+' · 分類核對 '+catalog.verifiedAt+(age>30?' · 資料超過 30 天，請核對主辦單位最新公告。':'');
}
function closeDrawer(){if(drawer?.open)drawer.close();}
function stockHTML(row){return '<article class="ex-stock"><button type="button" data-ex-stock="'+esc(row.code)+'"><b>'+esc(row.code)+'</b> '+esc(row.name)+' <span>查看 K 線 →</span></button><p>'+row.reasons.map(esc).join(' · ')+'</p>'+row.evidence.map(item=>'<div class="ex-evidence"><b>'+esc(item.kind==='exhibitor'?'確認當屆參展':'公司技術消息')+'</b><p>'+esc(item.title)+'</p><small>'+esc(item.date)+' · '+link(item.sourceUrl,'查看原始公告')+'</small></div>').join('')+'</article>';}
function renderStocks(){
 const event=drawerEvent,term=drawer.querySelector('[data-ex-stock-query]').value.trim().toLowerCase(),rows=members(event,catalog).filter(r=>[r.code,r.name,...r.reasons].join(' ').toLowerCase().includes(term));
 const evidence=rows.filter(r=>r.evidence.length),related=rows.filter(r=>!r.evidence.length);
 drawer.querySelector('[data-ex-stocks]').innerHTML=(evidence.length?'<h3>參展確認與公司消息 <span>'+evidence.length+' 檔</span></h3>'+evidence.map(stockHTML).join(''):'<p class="ex-muted">目前沒有已核實的當屆個股參展或新品消息。</p>')+'<h3>同族群相關個股 <span>'+related.length+' 檔</span></h3><p class="ex-muted">依本站題材／官方產業分類連結，尚未確認參展；分類關聯不代表展覽受惠或股價表現。</p>'+(related.map(stockHTML).join('')||'<p class="ex-muted">沒有符合條件的相關個股。</p>');
}
function openDrawer(id,button){
 const event=data.events.find(e=>e.id===id);if(!event)return;
 opener=button;drawerEvent=event;
 drawer.innerHTML='<header><div><small>產業展覽 · '+label(event)+'</small><h2 id="exDrawerTitle">'+esc(event.name)+'</h2></div><button type="button" data-ex-close aria-label="關閉展覽詳情">×</button></header><div class="ex-drawer-body"><p class="ex-dates">'+esc(event.start?event.start+' — '+event.end:'展期延期，新日期待公告')+'</p><p class="ex-muted">'+esc(event.venue)+'</p><div class="ex-focus"><h3>技術與話題觀察</h3><p>'+esc(event.focus)+'</p></div><p>'+link(event.sourceUrl,'主辦單位展覽公告')+'</p><p class="ex-muted">'+(event.start?'提醒起日 '+shiftMonths(event.start,-2)+' · ':'')+'核對日期 '+esc(event.verifiedAt)+'</p><h3>相關題材／產業</h3><div class="ex-tags">'+[...event.themes,...event.industries].map(t=>'<span>'+esc(t)+'</span>').join('')+'</div><label class="ex-stock-search">搜尋相關個股<input type="search" data-ex-stock-query placeholder="股票代號、名稱或分類"></label><div data-ex-stocks></div></div>';
 renderStocks();if(!drawer.open)drawer.showModal();
}
function mount(){
 root.innerHTML='<header class="ex-head"><div><small>UPCOMING EXHIBITIONS</small><h2>未來展覽行事曆</h2><p>提前兩個月，追蹤產業展覽與技術消息。</p></div><span class="ex-pill">展前 2 個月提醒</span></header><p class="ex-muted">提醒於本站本頁顯示。展期依主辦單位公告；點選展覽查看相關個股與資訊來源。</p><div class="ex-controls"><label>題材／產業<select data-ex-group aria-label="篩選展覽題材或產業"><option value="">全部題材與產業</option><optgroup label="題材">'+Object.keys(catalog.themes).sort().map(t=>'<option value="t:'+esc(t)+'">'+esc(t)+'</option>').join('')+'</optgroup><optgroup label="官方產業">'+[...new Set(Object.values(catalog.industries))].sort().map(t=>'<option value="i:'+esc(t)+'">'+esc(t)+'</option>').join('')+'</optgroup></select></label><label>搜尋展覽<input type="search" data-ex-query placeholder="展覽名稱、技術或地點"></label></div><section class="ex-reminders" data-ex-reminders aria-live="polite"></section><div class="ex-month-nav"><button type="button" data-ex-prev aria-label="上一個月">‹</button><label>展覽月份<input type="month" data-ex-month min="'+day().slice(0,7)+'" max="'+shiftMonths(day(),12).slice(0,7)+'"></label><button type="button" data-ex-next aria-label="下一個月">›</button><button type="button" data-ex-current>本月</button></div><div class="ex-calendar-scroll"><div class="ex-calendar"><div class="ex-week">'+['日','一','二','三','四','五','六'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="ex-grid" data-ex-grid></div></div></div><section class="ex-agenda" data-ex-agenda></section><section class="ex-pending" data-ex-pending></section><footer><p data-ex-verified></p><p>尚未公布或尚未核實的展期不列入日期格。公司新技術與參展狀態分開標示，資訊持續以官方公告為準。</p></footer>';
 drawer=document.createElement('dialog');drawer.className='ex-drawer';drawer.setAttribute('aria-labelledby','exDrawerTitle');document.body.append(drawer);
 drawer.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
 drawer.addEventListener('click',e=>{if(e.target===drawer||e.target.closest('[data-ex-close]'))closeDrawer();const b=e.target.closest('[data-ex-stock]');if(b){const row=members(drawerEvent,catalog).find(r=>r.code===b.dataset.exStock);if(!row)return;closeDrawer();if(typeof window._openStock==='function')window._openStock(row.code,row.name);else window.openChart?.(row.code,row.name);}});
 drawer.addEventListener('input',e=>{if(e.target.matches('[data-ex-stock-query]'))renderStocks();});
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.exId)openDrawer(b.dataset.exId,b);else if(b.hasAttribute('data-ex-current')){month=day().slice(0,7);render();}else if(b.hasAttribute('data-ex-prev')||b.hasAttribute('data-ex-next')){month=shiftMonths(month+'-01',b.hasAttribute('data-ex-prev')?-1:1).slice(0,7);render();}});
 root.querySelector('[data-ex-month]').addEventListener('change',e=>{const value=e.target.value;if(/^\d{4}-\d{2}$/.test(value)&&value>=day().slice(0,7)&&value<=shiftMonths(day(),12).slice(0,7)){month=value;render();}});
 root.querySelector('[data-ex-group]').addEventListener('change',e=>{group=e.target.value;render();});
 root.querySelector('[data-ex-query]').addEventListener('input',e=>{query=e.target.value;render();});
 render();
}
async function classification(){
 const base=window.__API||'';
 const read=async url=>{const r=await fetch(url);if(!r.ok)throw Error('分類讀取失敗');const d=await r.json();if(!d||d.error)throw Error('分類讀取失敗');return d;};
 const [groups,industries,names]=await Promise.all([
  read(base+'/api/screen?stat=themecatalog'),read(base+'/api/screen?stat=industries'),
  typeof window._loadNames==='function'?new Promise(resolve=>window._loadNames(()=>resolve(window._names||{}))):read(base+'/api/screen?stat=names')
 ]);
 if(!Array.isArray(groups.themes)||!groups.themes.length||!Object.keys(industries).length)throw Error('分類尚未就緒');
 return {verifiedAt:'即時讀取 '+day(),themes:Object.fromEntries(groups.themes.map(t=>[t.name,t.codes||[]])),industries,names};
}
async function show(){
 root=document.getElementById('exhibitionCalendar');if(!root)return;
 if(data){render();return;}if(loading)return loading;
 root.innerHTML='<p class="ex-muted" role="status">正在讀取展覽行事曆…</p>';
 loading=Promise.all([fetch('assets/exhibitions.json?v=1').then(r=>{if(!r.ok)throw Error('讀取失敗');return r.json();}),classification()]).then(([events,classification])=>{
  if(!Array.isArray(events.events)||!classification.themes||!classification.industries)throw Error('資料格式錯誤');
  data=events;catalog=classification;
  month=(events.events.filter(e=>e.status==='confirmed'&&e.end>=day()).sort((a,b)=>a.start.localeCompare(b.start))[0]?.start||day()).slice(0,7);mount();
 }).catch(()=>{data=null;root.innerHTML='<p role="alert">展覽資料暫時無法讀取。</p><button type="button" data-ex-retry>重新載入</button>';root.querySelector('[data-ex-retry]').onclick=show;}).finally(()=>{loading=null;});return loading;
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&root&&root.getClientRects().length&&data)render();});
window.AcademyExhibitions={show};
})();
