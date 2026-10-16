/* Unified navigation search: stocks, features and saved public news. */
(() => {'use strict';
const nav=document.querySelector('#mainNav .mn-inner');if(!nav)return;
const icon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const host=document.createElement('div');host.className='site-search';
host.innerHTML=`<div class="ss-inline">${icon}<input type="search" placeholder="股票代號、名稱或站內資訊" aria-label="搜尋股票與站內資訊" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ss-results" autocomplete="off" maxlength="80"><button type="button" class="ss-clear" aria-label="清除搜尋內容" hidden>清除</button></div><section class="ss-panel" hidden aria-label="搜尋建議"><div class="ss-tabs" role="group" aria-label="搜尋範圍">${[['all','全部'],['stock','股票／ETF'],['content','站內資訊']].map(([v,t])=>`<button type="button" data-ss-scope="${v}" aria-pressed="${v==='all'}">${t}</button>`).join('')}</div><div id="ss-results" role="listbox" aria-label="搜尋結果"></div><footer><span data-ss-status role="status">輸入關鍵字開始搜尋</span><span>↑ ↓ 選取 · Enter 開啟</span></footer></section>`;nav.append(host);
const panel=host.querySelector('.ss-panel'),input=host.querySelector('input'),clear=host.querySelector('.ss-clear'),list=host.querySelector('#ss-results'),status=host.querySelector('[data-ss-status]');let suppressFocus=false;document.body.append(panel);
let renderedQuery='',selected=-1,results=[],scope='all',timer=0,version=0,archiveController=null,archiveTimer=0,archiveState='idle',archiveQuery='',archiveItems=[];
const cache=new Map(),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const members=[['favorites','我的自選','收藏 股票 ETF 觀察紀錄'],['trades','交易紀錄','記帳 買賣 損益 月曆 帳戶 理由'],['goals','我的目標','成長 角色 進化'],['strategy','策略回測','策略 參數 歷史 驗證'],['workspace','研究工作區','研究筆記'],['learning','學習中心','教學 操作導讀'],['weekly','我的研究週報','每週 回顧']];
const currentQuery=()=>input.value.trim().toLowerCase();
function contents(q){const rows=[];
 nav.querySelectorAll('a').forEach(a=>{if(a.closest('.site-search'))return;const title=a.textContent.trim(),group=a.closest('.mn-grp')?.querySelector('.mn-item')?.textContent.replace('▾','').trim()||'網站導覽';if((title+' '+group).toLowerCase().includes(q))rows.push({type:'content',title,detail:group,activate:()=>a.click()});});
 members.forEach(([tab,title,keys])=>{if((title+' '+keys).toLowerCase().includes(q))rows.push({type:'content',title,detail:'會員中心 · 研究與學習',activate:()=>window.openMemberCenter?.(tab)});});
 return rows.filter((r,i,a)=>a.findIndex(x=>x.title===r.title)===i).slice(0,7);
}
function loadedNews(q){const rows=[];
 document.querySelectorAll('#newsView a[href],#homeView .hp-news a[href]').forEach(a=>{const title=a.textContent.trim();if(title.length<5||!title.toLowerCase().includes(q))return;try{const url=new URL(a.href,location.href);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;rows.push({type:'news',title,detail:'已載入新聞 · '+url.hostname,url:url.href,activate:()=>a.click()});}catch{}});return rows;
}
function stocks(q){const rows=window._academyStockMatches?window._academyStockMatches(q):Object.entries(window._names||{}).filter(([c,n])=>(c+' '+n).toLowerCase().includes(q)).map(([code,name])=>({code,name})).sort((a,b)=>(a.code===q?-1:b.code===q?1:a.code.localeCompare(b.code)));
 return rows.slice(0,6).map(r=>({type:'stock',title:r.code+' '+r.name,detail:[window._isEtf?.(r.code)?'ETF':window._mktLabel?.(r.code)||'股票',window._indLabel?.(r.code)].filter(Boolean).join(' · '),activate:()=>{if(typeof window.openChart==='function'){window._etxReleaseChart?.();window.openChart(r.code,r.name,window._indLabel?.(r.code)||'');}}}));
}
function archiveRow(row){if(!row||typeof row.title!=='string'||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))return null;let url='';if(row.url){try{const parsed=new URL(row.url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;url=parsed.href;}catch{return null;}}
 return {type:'news',title:row.title.slice(0,250),detail:row.date+' · '+String(row.source||'站內新聞').slice(0,80),snippet:String(row.snippet||'').slice(0,160),url,activate:()=>{if(url)window.open(url,'_blank','noopener,noreferrer');else{if(window._newsOpenSaved)window._newsOpenSaved(row.date,'');else window._showView?.('news');}}};
}
function news(q){return [...(archiveQuery===q?archiveItems:[]),...loadedNews(q)].filter((row,i,rows)=>rows.findIndex(r=>(row.url&&r.url===row.url)||r.title===row.title)===i).slice(0,8);}
function draw(preserve=false){const previous=preserve?results[selected]:null,q=currentQuery();renderedQuery=q;clear.hidden=!input.value;
 results=q?[...(scope==='content'?[]:stocks(q)),...(scope==='stock'?[]:contents(q)),...(scope==='stock'?[]:news(q))]:[];selected=previous?results.findIndex(r=>r.title===previous.title&&r.type===previous.type):-1;input.removeAttribute('aria-activedescendant');list.replaceChildren();
 if(!q){list.innerHTML='<div class="ss-empty ss-starters"><span>開始一段研究</span><div>'+['2330','ETF','交易紀錄','策略回測'].map(text=>'<button type="button" data-ss-query="'+text+'">'+text+'</button>').join('')+'</div></div>';list.querySelectorAll('[data-ss-query]').forEach(b=>b.onclick=()=>{input.value=b.dataset.ssQuery;input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));});status.textContent='搜尋股票、研究工具與新聞';positionPanel();return;}
 if(!results.length)list.innerHTML='<div class="ss-empty">'+(archiveState==='loading'?'正在搜尋已保存新聞…':'沒有相符結果。試試其他代號或關鍵字。')+'</div>';
 let group='';results.forEach((r,i)=>{if(group!==r.type){group=r.type;const h=document.createElement('div');h.className='ss-group';h.setAttribute('role','presentation');h.textContent=({stock:'股票／ETF · 開啟完整 K 圖',content:'站內功能 · 前往內容',news:'新聞與題材 · 依日期顯示'})[r.type];list.append(h);}
 const item=document.createElement('div');item.id='ss-option-'+i;item.setAttribute('role','option');item.setAttribute('aria-selected',String(selected===i));item.dataset.index=i;item.className='ss-result';item.innerHTML=`<span class="ss-result-copy"><b title="${esc(r.title)}">${esc(r.title)}</b><small>${esc(r.detail)}${r.type==='news'&&r.url?' · 原文另開視窗':''}</small>${r.snippet?`<span class="ss-snippet">${esc(r.snippet)}</span>`:''}</span>`;item.addEventListener('pointerdown',e=>e.preventDefault());item.addEventListener('click',()=>activate(i));list.append(item);});
 if(selected>=0)input.setAttribute('aria-activedescendant','ss-option-'+selected);
 positionPanel();status.textContent=results.length+' 項結果'+(scope==='stock'?'':archiveState==='loading'?' · 正在搜尋歷史新聞…':archiveState==='error'?' · 歷史新聞暫時無法讀取':archiveState==='partial'?' · 部分歷史來源暫時無法讀取':q.length<2?' · 輸入兩個字以上搜尋新聞':' · 新聞最多顯示 8 則');
 if(['error','partial'].includes(archiveState)&&scope!=='stock'){const retry=document.createElement('button');retry.type='button';retry.className='ss-retry';retry.textContent='重試歷史新聞搜尋';retry.onclick=()=>{cache.delete(q);searchArchive(true);};list.append(retry);}
}
function cancelArchive(){archiveController?.abort();archiveController=null;clearTimeout(archiveTimer);}
function searchArchive(immediate=false){cancelArchive();const q=currentQuery();archiveQuery=q;archiveItems=[];archiveState='idle';if(scope==='stock'||q.length<2||!/[\p{L}\p{N}]/u.test(q)){draw();return;}
 const cached=cache.get(q);if(cached&&Date.now()-cached.at<120000){archiveItems=cached.rows;archiveState=cached.state;draw(true);return;}
 archiveState='loading';draw();const v=version;
 archiveTimer=setTimeout(async()=>{const controller=new AbortController();archiveController=controller;const timeout=setTimeout(()=>controller.abort(),7000);
 try{const response=await fetch('/api/prices?action=site_search&q='+encodeURIComponent(q),{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});if(!response.ok)throw Error('search_unavailable');const data=await response.json();if(!Array.isArray(data.items)||!data.available)throw Error('search_unavailable');const rows=data.items.map(archiveRow).filter(Boolean);if(controller.signal.aborted||panel.hidden||v!==version||q!==currentQuery()||scope==='stock')return;archiveItems=rows;archiveState=data.partial?'partial':'ready';cache.set(q,{at:Date.now(),rows,state:archiveState});if(cache.size>30)cache.delete(cache.keys().next().value);draw(true);
 }catch{if(panel.hidden||v!==version||q!==currentQuery()||scope==='stock'||archiveController!==controller)return;archiveState='error';draw(true);}finally{clearTimeout(timeout);if(archiveController===controller)archiveController=null;}
 },immediate?0:280);
}
function close(focus=false){panel.hidden=true;input.setAttribute('aria-expanded','false');version++;clearTimeout(timer);cancelArchive();if(focus){suppressFocus=true;input.focus();suppressFocus=false;}}
function positionPanel(){if(panel.hidden)return;const rect=host.querySelector('.ss-inline').getBoundingClientRect(),width=Math.min(420,innerWidth-36),left=Math.max(18,Math.min(rect.right-width,innerWidth-width-18)),top=Math.min(rect.bottom+12,Math.max(18,innerHeight-150));panel.style.left=left+'px';panel.style.top=top+'px';panel.style.width=width+'px';panel.style.setProperty('--ss-room',Math.max(100,innerHeight-top-22)+'px');}
function reveal(){panel.hidden=false;input.setAttribute('aria-expanded','true');positionPanel();}
function open(){if(!panel.hidden)return;version++;reveal();searchArchive();loadNames();}
function loadNames(){if(window._names||!window._loadNames)return;const v=version;window._loadNames(()=>{if(!panel.hidden&&v===version)draw(true);});}
function activate(i){if(renderedQuery!==currentQuery()){clearTimeout(timer);searchArchive();return;}const item=results[i];if(!item)return;close();item.activate();}
function choose(i){selected=i;list.querySelectorAll('[role=option]').forEach((el,n)=>el.setAttribute('aria-selected',String(n===i)));const option=list.querySelector('#ss-option-'+i);if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}}
input.addEventListener('focus',()=>{if(!suppressFocus)open();});input.addEventListener('click',open);clear.addEventListener('pointerdown',e=>e.preventDefault());clear.onclick=()=>{input.value='';clear.hidden=true;archiveItems=[];archiveState='idle';selected=-1;results=[];list.replaceChildren();input.removeAttribute('aria-activedescendant');close(true);};
input.oninput=()=>{reveal();clear.hidden=!input.value;version++;cancelArchive();archiveItems=[];archiveState='idle';clearTimeout(timer);timer=setTimeout(()=>{searchArchive();loadNames();},120);};
input.addEventListener('compositionend',()=>input.oninput());
input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();close(true);}else if(['ArrowDown','ArrowUp'].includes(e.key)&&results.length){e.preventDefault();choose((selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length);}else if(e.key==='Enter'){e.preventDefault();if(renderedQuery!==currentQuery()){clearTimeout(timer);searchArchive();}if(results.length)activate(selected<0?0:selected);}};
panel.querySelectorAll('[data-ss-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.ssScope;version++;panel.querySelectorAll('[data-ss-scope]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));searchArchive();input.focus();});
window.addEventListener('resize',positionPanel);window.addEventListener('scroll',positionPanel,{capture:true,passive:true});
document.addEventListener('pointerdown',e=>{if(!host.contains(e.target)&&!panel.contains(e.target))close();});const onFocusOut=e=>{if(e.relatedTarget&&!host.contains(e.relatedTarget)&&!panel.contains(e.relatedTarget))close();};host.addEventListener('focusout',onFocusOut);panel.addEventListener('focusout',onFocusOut);
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.isComposing&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();input.focus();open();}});
})();
