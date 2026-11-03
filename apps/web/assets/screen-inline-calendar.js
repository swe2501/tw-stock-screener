/* Read-only calendar inside the screener. Writes/deletion stay in the account calendar. */
(() => {
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthOf=d=>d.slice(0,7);
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
window.AcademyInlineCalendar={mount(container,{readCalendar,openLogs,icon}){
 let today=localDay(),month=monthOf(today),chosen=today,rows=[],generation=0,manualSize=false,status='';
 const card=document.createElement('section');card.className='sic-card';card.setAttribute('aria-label','選股日曆');
 card.innerHTML='<header class="sic-head"><h3>'+icon('calendar')+' 選股日曆 <button type="button" class="sic-month-btn" data-sic-pick aria-haspopup="true" aria-expanded="false" aria-label="選擇年份與月份"><span data-sic-month></span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></button></h3><div><button type="button" data-sic-prev aria-label="日曆上一個月">‹</button><button type="button" data-sic-next aria-label="日曆下一個月">›</button><button type="button" data-sic-collapse aria-expanded="true" aria-label="收合日曆">'+icon('chevron')+'</button></div></header><div class="sic-resize" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="拖曳調整日曆高度" aria-valuemin="200" aria-valuemax="460" aria-valuenow="310"><span></span></div><div class="sic-body"><div class="sic-picker" role="dialog" aria-label="選擇年份與月份" hidden></div><div class="sic-week">'+['日','一','二','三','四','五','六'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="sic-grid" role="group" aria-label="選股紀錄日期"></div><div class="sic-status" role="status"></div><label class="sic-size">日曆高度 <input type="range" min="200" max="460" step="10" value="310" aria-label="調整日曆高度"><output aria-hidden="true">310 <span>px</span></output></label></div><button type="button" class="sic-selected" data-sic-open></button>';
 const summaryRow=container.querySelector('.sl-today-summary>summary'),popMode=!!summaryRow;
 let trigger=null;
 if(popMode){
  card.classList.add('sic-pop');card.hidden=true;card.setAttribute('role','dialog');card.querySelector('[data-sic-collapse]').hidden=true;
  trigger=document.createElement('button');trigger.type='button';trigger.className='sic-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const before=summaryRow.querySelector(':scope>span');summaryRow.insertBefore(trigger,before||null);
  document.body.append(card);
 }else container.append(card);
 function paintTrigger(){if(!trigger)return;const [y,m,d]=today.split('-').map(Number);trigger.innerHTML='<span class="sic-date-ico" aria-hidden="true"><small>'+m+'月</small><b>'+d+'</b></span><span class="sic-trigger-label">選股日曆</span>';trigger.setAttribute('aria-label','開啟選股日曆，今天 '+m+' 月 '+d+' 日');}
 function placePop(){if(!popMode||card.hidden)return;const r=trigger.getBoundingClientRect(),w=Math.min(330,innerWidth-16),h=card.offsetHeight||340;card.style.width=w+'px';let top=r.top-h-10;card.dataset.side='top';if(top<8){top=r.bottom+10;card.dataset.side='bottom';}let left=Math.min(r.right-w,innerWidth-w-8);left=Math.max(8,left);card.style.left=left+'px';card.style.top=Math.max(8,top)+'px';card.style.setProperty('--sic-arrow',Math.max(18,Math.min(w-18,r.left+r.width/2-left))+'px');}
 function openPop(){if(!popMode)return;card.hidden=false;trigger.setAttribute('aria-expanded','true');trigger.classList.add('is-on');placePop();requestAnimationFrame(()=>card.classList.add('is-in'));refresh();}
 function closePop(focus){if(!popMode||card.hidden)return;closePicker();card.classList.remove('is-in');trigger.setAttribute('aria-expanded','false');trigger.classList.remove('is-on');card.hidden=true;if(focus)trigger.focus();}
 if(popMode){
  trigger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();card.hidden?openPop():closePop();});
  trigger.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation();}});
  document.addEventListener('pointerdown',e=>{if(!card.hidden&&!card.contains(e.target)&&!trigger.contains(e.target)&&!popup.contains(e.target))closePop();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!card.hidden&&!popup.open&&card.querySelector('.sic-picker')?.hidden!==false)closePop(true);});
  addEventListener('resize',placePop);addEventListener('scroll',placePop,true);
 }
 const active=()=>popMode?trigger.isConnected:card.isConnected;
 /* 年月快速選擇：點標題的「2026 年 08 月」展開；年份左右切換、12 個月一次選 */
 const picker=card.querySelector('.sic-picker'),pickBtn=card.querySelector('[data-sic-pick]');let pickYear=0;
 const MINY=2015;
 function renderPicker(){const maxY=+today.slice(0,4)+1,curY=+month.slice(0,4),curM=+month.slice(5,7),tY=+today.slice(0,4),tM=+today.slice(5,7);
  picker.innerHTML='<div class="sic-picker-head"><button type="button" data-sic-py="-1" aria-label="上一年"'+(pickYear<=MINY?' disabled':'')+'>‹</button><b>'+pickYear+' 年</b><button type="button" data-sic-py="1" aria-label="下一年"'+(pickYear>=maxY?' disabled':'')+'>›</button></div><div class="sic-picker-grid">'+Array.from({length:12},(_,i)=>{const m=i+1;return '<button type="button" data-sic-pm="'+m+'" class="'+(pickYear===curY&&m===curM?'is-current ':'')+(pickYear===tY&&m===tM?'is-this':'')+'" aria-pressed="'+(pickYear===curY&&m===curM)+'">'+m+' 月</button>';}).join('')+'</div><button type="button" class="sic-picker-today" data-sic-pt>回到本月</button>';}
 function openPicker(){pickYear=+month.slice(0,4);renderPicker();picker.hidden=false;pickBtn.setAttribute('aria-expanded','true');card.classList.add('is-picking');requestAnimationFrame(()=>picker.classList.add('is-in'));picker.querySelector('.is-current')?.focus();}
 function closePicker(focus){if(picker.hidden)return;picker.classList.remove('is-in');picker.hidden=true;pickBtn.setAttribute('aria-expanded','false');card.classList.remove('is-picking');if(focus)pickBtn.focus();}
 function goMonth(m){month=m;chosen=monthOf(today)===month?today:month+'-01';closePicker(true);refresh();}
 card.addEventListener('keydown',e=>{if(e.key==='Escape'&&!picker.hidden){e.stopPropagation();closePicker(true);}});
 const popup=document.createElement('dialog');popup.className='sl-dialog sic-record-dialog';document.body.append(popup);let popupFocus=null,dataOwner=null;
 function renderPopup(){
  popup.setAttribute('aria-label',chosen+' 選股紀錄');
  const list=rows.filter(r=>r.record_date===chosen);
  const records=list.map(r=>'<article class="sic-record"><h3>'+esc((r.strategies||[]).join(' ＋ '))+'</h3><p class="sl-muted">行情日期 '+esc(r.market_date||r.record_date)+' · '+(r.stocks||[]).length+' 檔</p>'+(r.recorded_at?'<p class="sl-muted">儲存時間 '+esc(new Date(r.recorded_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))+'</p>':'')+((r.conditions||[]).length?'<p class="sic-record-conditions">'+(r.conditions||[]).map(esc).join(' · ')+'</p>':'')+(r.note?'<p>'+esc(r.note)+'</p>':'')+'<ul>'+(r.stocks||[]).map(stock=>'<li><span><b>'+esc(stock.code)+'</b> '+esc(stock.name)+'</span><span>紀錄價 '+esc(typeof stock.close==='number'?stock.close.toLocaleString('zh-TW'):'—')+'</span></li>').join('')+'</ul></article>').join('');
  popup.innerHTML='<header class="sl-head"><h2>'+esc(chosen.replaceAll('-','/'))+' 選股紀錄</h2><button type="button" class="sl-close" data-sic-close aria-label="關閉選股紀錄">×</button></header><div class="sl-body">'+(status?'<p role="status">'+esc(status)+'</p>':'<p class="sl-muted">'+list.length+' 筆紀錄</p>'+(records||'<p class="sic-record-empty">這一天尚無選股紀錄。</p>'))+'</div><footer><button type="button" data-sic-member>前往會員中心選股日曆 →</button></footer>';
 }
 function showPopup(){popupFocus=card.querySelector('[data-sic-date="'+chosen+'"]')||document.activeElement;renderPopup();if(!popup.open)popup.showModal();}
 popup.addEventListener('click',e=>{if(e.target===popup||e.target.closest('[data-sic-close]'))popup.close();else if(e.target.closest('[data-sic-member]')){const target={month,date:chosen};popup.close();openLogs(target);}});
 popup.addEventListener('close',()=>{if(popupFocus?.isConnected)popupFocus.focus();});

 function setHeight(value){
 if(popMode)return;
 const style=getComputedStyle(container),gap=parseFloat(style.rowGap)||0;
 const siblings=[...container.children].filter(el=>el!==card&&el.id!=='resultsArea'&&getComputedStyle(el).display!=='none');
 const used=siblings.reduce((n,el)=>n+el.getBoundingClientRect().height,0)+gap*(siblings.length+1)+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
 const maximum=460;
 const h=Math.max(260,Math.min(maximum,Number(value)||Math.max(260,Math.min(340,container.clientHeight-used-110))));card.querySelector('input').min=260;card.querySelector('input').max=maximum;card.querySelector('.sic-resize').setAttribute('aria-valuemin','260');card.querySelector('.sic-resize').setAttribute('aria-valuemax',String(maximum));card.style.setProperty('--sic-height',h+'px');card.querySelector('.sic-resize').setAttribute('aria-valuenow',String(h));card.querySelector('input').value=h;card.querySelector('.sic-size output').innerHTML=Math.round(h)+' <span>px</span>';card.querySelector('input').style.setProperty('--sic-fill',((h-260)/(maximum-260)*100)+'%');
 }
 function paint(){if(!active())return;paintTrigger();if(popMode)card.style.removeProperty('--sic-height');card.querySelector('[data-sic-month]').textContent=month.replace('-',' 年 ')+' 月';const first=new Date(month+'-01T00:00:00Z'),offset=first.getUTCDay(),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();let html='<span aria-hidden="true"></span>'.repeat(offset);
 for(let n=1;n<=count;n++){const date=month+'-'+String(n).padStart(2,'0'),items=rows.filter(r=>r.record_date===date);html+='<button type="button" data-sic-date="'+date+'" class="'+(date===today?'is-today ':'')+(date===chosen?'is-selected':'')+'" aria-pressed="'+(date===chosen)+'" aria-label="'+date+'，'+items.length+' 筆紀錄"><span>'+n+'</span>'+(items.length?'<i></i>':'')+'</button>';}
 if(popup.open)renderPopup();card.querySelector('.sic-grid').style.gridTemplateRows='repeat('+Math.ceil((offset+count)/7)+',minmax(0,1fr))';card.querySelector('.sic-grid').innerHTML=html;card.querySelector('.sic-status').textContent=status;const list=rows.filter(r=>r.record_date===chosen);card.querySelector('.sic-selected').innerHTML='<span>'+esc(chosen.replaceAll('-','/'))+'</span><strong>'+esc(list.length?list.map(r=>r.strategies.join(' ＋ ')).join('／'):'尚無選股紀錄')+'</strong>'+(list.length?'<small>'+list.reduce((n,r)=>n+r.stocks.length,0)+' 檔 · '+list.length+' 筆</small>':'');
 }
 async function refresh(){const seq=++generation,owner=localStorage.getItem('sb_token');if(owner!==dataOwner){rows=[];dataOwner=owner;if(popup.open)popup.close();}if(!owner){rows=[];status='登入後查看你的紀錄';paint();return;}status='正在讀取帳號日曆…';paint();try{const d=await readCalendar(month);if(!active()||seq!==generation||owner!==localStorage.getItem('sb_token'))return;today=d.today;rows=d.rows;status='';}catch(e){if(!active()||seq!==generation||owner!==localStorage.getItem('sb_token'))return;rows=[];status=e.message;}paint();}
 card.onclick=e=>{const b=e.target.closest('button');if(!b){if(!picker.hidden&&!e.target.closest('.sic-picker'))closePicker();return;}if(b.hasAttribute('data-sic-pick')){picker.hidden?openPicker():closePicker(true);return;}if(b.dataset.sicPy){pickYear+=+b.dataset.sicPy;renderPicker();return;}if(b.dataset.sicPm){goMonth(pickYear+'-'+String(b.dataset.sicPm).padStart(2,'0'));return;}if(b.hasAttribute('data-sic-pt')){goMonth(monthOf(today));return;}if(!picker.hidden)closePicker();if(b.hasAttribute('data-sic-collapse')){const collapsed=card.classList.toggle('is-collapsed');b.setAttribute('aria-expanded',String(!collapsed));b.setAttribute('aria-label',collapsed?'展開日曆':'收合日曆');}else if(b.dataset.sicDate){chosen=b.dataset.sicDate;paint();showPopup();}else if(b.hasAttribute('data-sic-open'))showPopup();else if(b.hasAttribute('data-sic-prev')||b.hasAttribute('data-sic-next')){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+(b.hasAttribute('data-sic-prev')?-1:1));month=d.toISOString().slice(0,7);chosen=monthOf(today)===month?today:month+'-01';refresh();}};
 const grip=card.querySelector('.sic-resize');let startY=0,startHeight=310;
 grip.onpointerdown=e=>{manualSize=true;startY=e.clientY;startHeight=parseFloat(card.style.getPropertyValue('--sic-height'))||310;grip.setPointerCapture(e.pointerId);e.preventDefault();};
 grip.onpointermove=e=>{if(grip.hasPointerCapture(e.pointerId))setHeight(startHeight+startY-e.clientY);};
 const stop=e=>{if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);};grip.onpointerup=stop;grip.onpointercancel=stop;
 grip.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;manualSize=true;const h=Number(grip.getAttribute('aria-valuenow'));setHeight(e.key==='Home'?260:e.key==='End'?460:h+(e.key==='ArrowUp'?10:-10));e.preventDefault();};
 card.querySelector('input').oninput=e=>{manualSize=true;setHeight(e.target.value);};const fit=()=>{if(!active()||!container.clientHeight)return;setHeight(manualSize?(parseFloat(card.style.getPropertyValue('--sic-height'))||320):0);};const sizeObserver=new ResizeObserver(fit);sizeObserver.observe(container);if(container.querySelector('#statusArea'))sizeObserver.observe(container.querySelector('#statusArea'));if(container.querySelector('.sl-today-summary'))sizeObserver.observe(container.querySelector('.sl-today-summary'));const refreshIfMounted=()=>{if(active())refresh();};window.addEventListener('academy-auth-changed',refreshIfMounted);window.addEventListener('storage',e=>{if(['sb_token','sb_user'].includes(e.key))refreshIfMounted();});window.addEventListener('resize',()=>{if(active()&&container.clientHeight)setHeight(parseFloat(card.style.getPropertyValue('--sic-height'))||310);});paint();refresh();return {refresh,resetLayout(){manualSize=false;fit();}};
}};
})();
