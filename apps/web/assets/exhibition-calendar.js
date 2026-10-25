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
function eventKind(event){
 const key=String(event.id||'').split('-')[0];
 const types={itf:['travel','旅遊'],healthcare:['medical','醫療科技'],ces:['technology','消費科技'],tgs:['gaming','電玩'],timtos:['machine','工具機'],cycle:['bicycle','自行車'],computex:['computer','電腦科技'],bio:['biotech','生技'],automation:['automation','自動化'],semicon:['chip','半導體'],agri:['agriculture','農業科技'],fintech:['finance','金融科技']};
 const type=types[key]||['exhibition','產業展覽'];return {key:type[0],label:type[1]};
}
function eventIcon(event){
 const type=eventKind(event),paths={
 travel:'<rect x="5" y="6" width="14" height="14" rx="2"/><path d="M9 6V3h6v3M8 10v6m8-6v6M8 20v1m8-1v1"/>',
 medical:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
 technology:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M9 10l2 2 4-4"/>',
 gaming:'<path d="M7 8h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3-2-1 0-11 3-11ZM9 8l1-4h4"/><path d="M6 12h5m-2.5-2.5v5m7-2h.1m2-2h.1"/>',
 machine:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 1 3h4l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z"/><circle cx="10" cy="11" r="3"/>',
 bicycle:'<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 5-9 5 9H6l-2-7h4m7-5h3l2 5"/>',
 computer:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10M6 7h5m-5 3h9"/>',
 biotech:'<path d="M9 3h6m-5 0v7l-5 9c-.5 1 0 2 1 2h12c1 0 1.5-1 1-2l-5-9V3M7 15h10m-6 3h.1m3-6h.1"/>',
 automation:'<path d="M4 21h16M7 21v-5l5-4m0 0-5-5 3-3 6 5m0 0 3 2-1 4m-2-6-4 3"/><circle cx="7" cy="7" r="2"/><circle cx="13" cy="11" r="2"/>',
 chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
 agriculture:'<path d="M5 19C3 8 9 3 20 4c1 11-4 16-12 13M5 21 16 9m-4 4v-4m0 4h4"/>',
 finance:'<path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18M3 18h18"/>',
 exhibition:'<path d="M3 21h18M4 21V7h16v14M3 7l9-4 9 4M8 11h3v3H8Zm6 0h3v3h-3Zm-4 7h4v3"/>'};
 return '<span class="ex-theme-icon" data-ex-icon="'+type.key+'" title="'+type.label+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[type.key]+'</svg></span>';
}
const api={shiftMonths,phase,members,eventKind};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
let data=null,catalog=null,loading=null,root=null,drawer=null,opener=null;
let month='',query='',group='',drawerEvent=null,renderedMonth='',previewId;
function link(url,label){try{const u=new URL(url);return u.protocol==='https:'?'<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';}catch{return '';}}
const label = event => ({pending:'延期／日期待定',ended:'已結束',live:'展覽進行中',reminder:'展前兩個月提醒',future:'未來展覽'}[phase(event,day())]);
function matches(event){
 const term=query.trim().toLowerCase();
 return (!group||(group.startsWith('t:')?(event.themes||[]).includes(group.slice(2)):(event.industries||[]).includes(group.slice(2))))&&(!term||[event.name,event.venue,event.focus,...event.themes,...event.industries].join(' ').toLowerCase().includes(term));
}
function available(){const today=day(),end=shiftMonths(today,12);return data.events.filter(e=>matches(e)&&(phase(e,today)==='pending'||(e.end>=today&&e.start<=end)));}
function button(event,extra=''){return '<button type="button" class="ex-event '+extra+'" data-ex-id="'+esc(event.id)+'"><b>'+eventIcon(event)+'<span>'+esc(event.name)+'</span></b><span>'+esc(event.start?event.start.slice(5)+' — '+event.end.slice(5):'新展期待公告')+'</span></button>';}
function render(){
 const today=day(),events=available(),dated=events.filter(e=>e.start),reminders=events.filter(e=>['reminder','live'].includes(phase(e,today)));
 root.querySelector('[data-ex-month]').value=month;
 const title=root.querySelector('[data-ex-month-title]');if(title)title.innerHTML='<small>'+month.slice(0,4)+' 年</small>'+Number(month.slice(5))+' 月';
 root.querySelector('[data-ex-prev]').disabled=month<=today.slice(0,7);
 root.querySelector('[data-ex-next]').disabled=month>=shiftMonths(today,12).slice(0,7);
 root.querySelector('[data-ex-reminders]').innerHTML='<h3>展前觀察提醒 <span>'+reminders.length+' 場</span></h3>'+(reminders.length?reminders.map(e=>button(e,'is-reminder')).join(''):'<p class="ex-muted">目前篩選下，沒有已進入展前兩個月的展覽。</p>');
 const first=new Date(month+'-01T00:00:00Z'),offset=first.getUTCDay(),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 let html='<div class="ex-blank" aria-hidden="true"></div>'.repeat(offset);
 for(let n=1;n<=count;n++){
  const date=month+'-'+String(n).padStart(2,'0'),items=dated.filter(e=>e.start<=date&&e.end>=date);
  html+='<div class="ex-day'+(date===today?' is-today':'')+'"><time datetime="'+date+'">'+n+'</time>'+items.map(e=>'<button type="button" data-ex-id="'+esc(e.id)+'" title="'+esc(e.name)+'" aria-label="'+date+' '+esc(e.name)+'">'+eventIcon(e)+'<span class="ex-event-label">'+esc(e.name)+'</span></button>').join('')+'</div>';
 }
 root.querySelector('[data-ex-grid]').innerHTML=html;
 const grid=root.querySelector('[data-ex-grid]');if(renderedMonth&&renderedMonth!==month&&!matchMedia('(prefers-reduced-motion: reduce)').matches)grid.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});renderedMonth=month;
 previewId=undefined;selectPreview(null);
 const inMonth=dated.filter(e=>e.start<=month+'-31'&&e.end>=month+'-01');
 root.querySelector('[data-ex-month-empty]').innerHTML=inMonth.length?'':esc(month.replace('-',' 年 ')+' 月目前沒有符合條件的已確認展覽。')+((group||query)?' <button type="button" data-ex-reset>還原篩選</button>':'');
 root.querySelector('[data-ex-month-empty]').hidden=!!inMonth.length;
 root.querySelector('[data-ex-agenda]').innerHTML='<h3>未來 12 個月 <span>'+dated.length+' 場已公布展期</span></h3>'+(dated.length?dated.map(e=>'<article class="ex-agenda-row"><div><time>'+esc(e.start)+' — '+esc(e.end)+'</time><span class="ex-status '+phase(e,today)+'">'+label(e)+'</span></div>'+button(e)+'<p>'+esc([...e.themes,...e.industries].join(' · '))+'</p></article>').join(''):'<p class="ex-muted">此分類目前沒有已核實的未來展期；不以往年日期推算。</p>');
 const pending=events.filter(e=>!e.start);
 root.querySelector('[data-ex-pending]').innerHTML=pending.length?'<h3>延期／日期待定</h3>'+pending.map(e=>button(e)).join(''):'';
 const age=Math.floor((Date.parse(today)-Date.parse(data.verifiedAt))/86400000);
 root.querySelector('[data-ex-verified]').textContent='展期核對 '+data.verifiedAt+' · 分類核對 '+catalog.verifiedAt+(age>30?' · 資料超過 30 天，請核對主辦單位最新公告。':'');
}
function selectPreview(id){
 if(previewId===id)return;previewId=id;
 const event=data?.events.find(e=>e.id===id),box=root?.querySelector('[data-ex-preview]');if(!box)return;
 root.querySelectorAll('[data-ex-id]').forEach(b=>b.classList.toggle('is-linked',!!event&&b.dataset.exId===id));
 root.querySelectorAll('.ex-day').forEach(cell=>cell.classList.toggle('is-range',!!event&&[...cell.querySelectorAll('[data-ex-id]')].some(b=>b.dataset.exId===id)));
 box.innerHTML=event?eventIcon(event)+'<div><b>'+esc(event.name)+'</b><span>'+esc(event.start?event.start+' — '+event.end:'展期待公告')+' · '+esc([...event.themes,...event.industries].slice(0,3).join(' · '))+'</span></div><small>點選查看詳情 ↗</small>':'<div><b>展期速覽</b><span>滑過展覽，連動查看整段展期與相關題材；點選可看詳情。</span></div>';
 box.classList.toggle('is-active',!!event);
}
function closeDrawer(){if(drawer?.open)drawer.close();}
function stockHTML(row){return '<article class="ex-stock"><button type="button" data-ex-stock="'+esc(row.code)+'"><b>'+esc(row.code)+'</b> '+esc(row.name)+' <span>查看 K 線 →</span></button><p>'+row.reasons.map(esc).join(' · ')+'</p>'+row.evidence.map(item=>'<div class="ex-evidence"><b>'+esc(item.kind==='exhibitor'?'確認當屆參展':'公司技術消息')+'</b><p>'+esc(item.title)+'</p><small>'+esc(item.date)+' · '+link(item.sourceUrl,'查看原始公告')+'</small></div>').join('')+'</article>';}
function renderStocks(){
 if(catalog.unavailable){drawer.querySelector('[data-ex-stocks]').innerHTML='<p class="ex-muted" role="status">個股分類暫時無法讀取；展期與官方來源仍可查看，請稍後重新載入。</p>';return;}
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
 root.innerHTML='<div class="ex-head"><div><small>THEME CALENDAR</small><h2>未來題材行事曆</h2><p>提前兩個月，追蹤產業展覽與技術消息。</p></div><div class="ex-reminder-note"><i aria-hidden="true"></i><div><b>展前觀察</b><small>開展前兩個月開始提醒</small></div></div></div><p class="ex-muted">提醒於本站本頁顯示。展期依主辦單位公告；點選展覽查看相關個股與資訊來源。</p><div class="ex-controls"><label>題材／產業<select data-ex-group aria-label="篩選展覽題材或產業"><option value="">全部題材與產業</option><optgroup label="題材">'+Object.keys(catalog.themes).sort().map(t=>'<option value="t:'+esc(t)+'">'+esc(t)+'</option>').join('')+'</optgroup><optgroup label="官方產業">'+[...new Set(Object.values(catalog.industries))].sort().map(t=>'<option value="i:'+esc(t)+'">'+esc(t)+'</option>').join('')+'</optgroup></select></label><label>搜尋展覽<input type="search" data-ex-query placeholder="展覽名稱、技術或地點"></label></div><section class="ex-reminders" data-ex-reminders aria-live="polite"></section><div class="ex-month-nav"><div class="ex-month-title" data-ex-month-title></div><button type="button" data-ex-prev aria-label="上一個月"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><label>展覽月份<input type="month" data-ex-month min="'+day().slice(0,7)+'" max="'+shiftMonths(day(),12).slice(0,7)+'"></label><button type="button" data-ex-next aria-label="下一個月"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button><button type="button" data-ex-current>本月</button></div><p class="ex-month-empty" data-ex-month-empty role="status"></p><div class="ex-preview" data-ex-preview></div><div class="ex-calendar-scroll"><div class="ex-calendar"><div class="ex-week">'+['日','一','二','三','四','五','六'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="ex-grid" data-ex-grid></div></div></div><section class="ex-agenda" data-ex-agenda></section><section class="ex-pending" data-ex-pending></section><footer><p data-ex-verified></p><p>尚未公布或尚未核實的展期不列入日期格。公司新技術與參展狀態分開標示，資訊持續以官方公告為準。</p></footer>';
 drawer=document.createElement('dialog');drawer.className='ex-drawer';drawer.setAttribute('aria-labelledby','exDrawerTitle');document.body.append(drawer);
 drawer.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
 drawer.addEventListener('click',e=>{if(e.target===drawer||e.target.closest('[data-ex-close]'))closeDrawer();const b=e.target.closest('[data-ex-stock]');if(b){const row=members(drawerEvent,catalog).find(r=>r.code===b.dataset.exStock);if(!row)return;closeDrawer();if(typeof window._openStock==='function')window._openStock(row.code,row.name);else window.openChart?.(row.code,row.name);}});
 drawer.addEventListener('input',e=>{if(e.target.matches('[data-ex-stock-query]'))renderStocks();});
 root.addEventListener('pointerover',e=>selectPreview(e.target.closest('[data-ex-id]')?.dataset.exId||null));
 root.addEventListener('focusin',e=>selectPreview(e.target.closest('[data-ex-id]')?.dataset.exId||null));
 root.addEventListener('pointerleave',()=>selectPreview(null));
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ex-reset')){group='';query='';root.querySelector('[data-ex-group]').value='';root.querySelector('[data-ex-query]').value='';render();}else if(b.dataset.exId)openDrawer(b.dataset.exId,b);else if(b.hasAttribute('data-ex-current')){month=day().slice(0,7);render();}else if(b.hasAttribute('data-ex-prev')||b.hasAttribute('data-ex-next')){month=shiftMonths(month+'-01',b.hasAttribute('data-ex-prev')?-1:1).slice(0,7);render();}});
 root.querySelector('[data-ex-month]').addEventListener('change',e=>{const value=e.target.value;if(/^\d{4}-\d{2}$/.test(value)&&value>=day().slice(0,7)&&value<=shiftMonths(day(),12).slice(0,7)){month=value;render();}});
 root.querySelector('[data-ex-group]').addEventListener('change',e=>{group=e.target.value;render();});
 root.querySelector('[data-ex-query]').addEventListener('input',e=>{query=e.target.value;render();});
 render();
}
async function classification(){
 const base=window.__API||'';
 const read=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('分類讀取失敗');const d=await r.json();if(!d||d.error)throw Error('分類讀取失敗');return d;};
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
 const snapshot=()=>window.AcademyExhibitionSnapshot?Promise.resolve(window.AcademyExhibitionSnapshot):Promise.reject(Error('展期資源未就緒'));
 const dates=location.protocol==='file:'?snapshot():fetch('assets/exhibitions.json?v=1').then(r=>{if(!r.ok)throw Error('讀取失敗');return r.json();}).then(d=>{if(!Array.isArray(d?.events))throw Error('展期格式錯誤');return d;}).catch(snapshot);
 loading=Promise.all([dates,Promise.race([classification(),new Promise((_,reject)=>setTimeout(()=>reject(Error('分類讀取逾時')),12000))]).catch(()=>({verifiedAt:'暫時無法讀取（僅顯示展期）',themes:{},industries:{},names:{},unavailable:true}))]).then(([events,classification])=>{
  if(!Array.isArray(events.events)||!classification.themes||!classification.industries)throw Error('資料格式錯誤');
  data=events;catalog=classification;
  month=(events.events.filter(e=>e.status==='confirmed'&&e.end>=day()).sort((a,b)=>a.start.localeCompare(b.start))[0]?.start||day()).slice(0,7);mount();
  if(catalog.unavailable){const note=document.createElement('p');note.className='ex-muted';note.setAttribute('role','status');note.textContent='展覽日期已載入，個股分類暫時無法讀取。';const retry=document.createElement('button');retry.type='button';retry.textContent='重試分類';retry.onclick=()=>{data=null;show();};note.append(' ',retry);root.querySelector('.ex-head').after(note);}
 }).catch(()=>{data=null;root.innerHTML='<p role="alert">展覽資料暫時無法讀取。</p><button type="button" data-ex-retry>重新載入</button>';root.querySelector('[data-ex-retry]').onclick=show;}).finally(()=>{loading=null;});return loading;
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&root&&root.getClientRects().length&&data)render();});
window.AcademyExhibitions={show};
})();
