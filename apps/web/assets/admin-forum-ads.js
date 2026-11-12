/* 後台：論壇活動（場次／現場 QR 簽到／補發代碼／名單）與站內廣告管理。
   資料由 /api/auth admin_forum_* / admin_ads_* 讀寫（lib/forum_ads.py），前端不碰資料庫。 */
(()=>{'use strict';
 const CITY={TPE:'台北',TXG:'台中',KHH:'高雄'},STATUS={draft:'草稿（不公開）',published:'公開',closed:'已結束'};
 const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let post=null,box=null,note=null,tab='forum',meta={slots:{},audiences:{}};
 const btn=(label,attr,cls='')=>`<button type="button" class="afa-btn ${cls}" ${attr}>${label}</button>`;
 const iconPaths={
  members:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  algo:'m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18',
  forum:'M3 6h18v15H3zM3 10h18M8 3v5m8-5v5',
  ads:'m3 10 15-5v14L3 14zm4 5 2 5m12-10v4',
  points:'M20 6c0 2-3.6 3-8 3S4 8 4 6s3.6-3 8-3 8 1 8 3v12c0 2-3.6 3-8 3s-8-1-8-3V6m0 6c0 2 3.6 3 8 3s8-1 8-3',
  office:'M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8',
  audit:'M9 5H5v16h14V5h-4M9 3h6v4H9zm0 11 2 2 4-4',
  health:'M2 12h4l3-7 4 14 3-7h6',
  usage:'M3 3v18h18M6 16l5-5 4 3 6-7',
  revenue:'M20 8V5H4a2 2 0 0 0 0 4h17v11H4a2 2 0 0 1-2-2V7m19 5h-5v5h5',
  tasks:'M4 4h16v16H4zm4 8 3 3 5-6',
  top_bar:'M3 4h18v16H3zm0 4h18',
  home_card:'m3 10 9-7 9 7v11H3zm5 11v-8h8v8',
  results_top:'M3 5h18v15H3zm0 5h18M8 10v10',
  member_center:'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  corner:'M3 4h18v16H3zm10 9h8v7h-8z',
  products:'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zm11 3v1m0 4v1'
 };
 const icon=name=>`<svg class="afa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;
 document.querySelectorAll('#admTabs button[data-t]').forEach(button=>{
  if(iconPaths[button.dataset.t])button.insertAdjacentHTML('afterbegin',icon(button.dataset.t));
 });
 function fail(j){return j&&j.error?j.error:'讀取失敗，請稍後再試';}
 function modal(title,html,wide){
  close();
  const m=document.createElement('dialog');m.className='afa-modal';m.setAttribute('aria-label',title);
  m.innerHTML=`<div class="afa-sheet${wide?' wide':''}"><div class="afa-sheet-hd"><b>${esc(title)}</b><button type="button" class="afa-x" data-close aria-label="關閉">×</button></div><div class="afa-sheet-bd">${html}</div></div>`;
  m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))close();});
  m.addEventListener('close',()=>m.remove());
  document.body.append(m);m.showModal();return m.querySelector('.afa-sheet-bd');
 }
 let qrTimer=null;
 function close(){clearTimeout(qrTimer);qrTimer=null;document.querySelectorAll('.afa-modal,.afa-qr').forEach(x=>{if(x.open)x.close();x.remove();});}
 function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
 function loadQrLib(){return window.qrcode?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='assets/vendor/qrcode-generator-1.4.4.js';s.onload=ok;s.onerror=no;document.head.append(s);});}
 function qrSvg(text,cell){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:cell||8,margin:2,scalable:true});}

 /* ═══ 論壇活動 ═══ */
 async function forum(){
  box.innerHTML='<div class="fc-empty">載入中…</div>';
  note.innerHTML='<b>流程</b> ① 新增場次並設為「公開」 ② 活動當天按「開啟現場簽到」，把畫面投到報到桌螢幕 ③ 會員用手機相機掃 QR → 登入 → 按簽到，1,000 點自動入帳 ④ 沒掃到的人，按「補發代碼」產生一次性代碼給他，到會員中心「活動兌換」輸入。<br>每位會員一生限領一次論壇點數；勾「測試場次」只跑流程、不發點數。';
  const j=await post('admin_forum_list').catch(()=>null);
  if(tab!=='forum')return;
  if(!j||j.error){box.innerHTML='<div class="fc-empty">'+esc(fail(j))+'</div>';return;}
  const rows=(j.events||[]).map(e=>`<tr><td><b>${esc(e.label)}</b>${e.test?' <span class="afa-tag warn">測試</span>':''}<div class="afa-sub">${esc(e.id)}${e.title?'｜'+esc(e.title):''}</div></td><td>${esc(e.venue||'—')}<div class="afa-sub">${esc(e.date)} ${esc(e.start)}–${esc(e.end)}</div></td><td><span class="afa-tag ${e.status}">${esc(STATUS[e.status]||e.status)}</span></td><td class="num"><b>${e.checked_in||0}</b>${e.capacity?` / ${e.capacity}`:''}</td><td class="afa-acts">${btn('開啟現場簽到',`data-qr="${esc(e.id)}"`,'primary')}${btn('補發代碼',`data-codes="${esc(e.id)}"`)}${btn('報名名單',`data-registers="${esc(e.id)}"`)}${btn('到場名單',`data-people="${esc(e.id)}"`)}${btn('編輯',`data-edit="${esc(e.id)}"`)}${e.checked_in?'':btn('刪除',`data-del="${esc(e.id)}"`,'ghost')}</td></tr>`).join('');
  box.innerHTML=`<div class="afa-bar">${btn('＋ 新增場次','data-new','primary')}<form class="afa-check" data-check><input name="code" placeholder="查詢補發代碼是否已使用" maxlength="24" autocomplete="off"><button class="afa-btn" type="submit">查詢</button><span data-check-out></span></form></div>`+
   (rows?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>場次</th><th>地點／時間</th><th>狀態</th><th class="num">已簽到</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="fc-empty">還沒有場次，按「＋ 新增場次」開始。</div>');
  const evs=Object.fromEntries((j.events||[]).map(e=>[e.id,e]));
  box.insertAdjacentHTML('beforeend','<div class="afa-voucher" data-voucher><span class="afa-sub">讀取到場贈券設定中…</span></div>');voucherBar();
  box.querySelector('[data-new]').onclick=()=>editEvent(null);
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editEvent(evs[b.dataset.edit]));
  box.querySelectorAll('[data-qr]').forEach(b=>b.onclick=()=>openQr(b.dataset.qr));
  box.querySelectorAll('[data-codes]').forEach(b=>b.onclick=()=>codes(evs[b.dataset.codes]));
  box.querySelectorAll('[data-registers]').forEach(button=>button.onclick=()=>registrations(evs[button.dataset.registers]));
  box.querySelectorAll('[data-people]').forEach(b=>b.onclick=()=>people(evs[b.dataset.people]));
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('刪除場次 '+b.dataset.del+'？'))return;const r=await post('admin_forum_delete',{id:b.dataset.del});if(r.error)alert(r.error);forum();});
  box.querySelector('[data-check]').onsubmit=async e=>{e.preventDefault();const out=box.querySelector('[data-check-out]');out.textContent='查詢中…';const r=await post('admin_forum_code_check',{code:e.target.elements.code.value}).catch(()=>({}));out.textContent=!r.valid?'不是有效代碼':r.revoked?'已作廢':r.used?`已使用（${new Date(r.used_at).toLocaleString('zh-TW')}）`:`有效、尚未使用（${r.event}）`;};
 }
 async function voucherBar(){
  const el=box.querySelector('[data-voucher]');if(!el)return;const r=await post('admin_forum_voucher_get').catch(()=>({error:'連線失敗'}));
  if(r.error){el.innerHTML='<span class="afa-err">'+esc(r.error)+'</span>';return;}
  const v=r.voucher,opts=Object.entries(r.options).map(([k,t])=>`<option value="${k}" ${v.definition===k?'selected':''}>${esc(t)}</option>`).join('');
  el.innerHTML=`<label class="afa-switch"><input type="checkbox" name="enabled" ${v.enabled?'checked':''}><span>到場加送使用券</span></label><select name="definition">${opts}</select><label class="afa-sub">天數 <input type="number" name="days" min="1" max="90" value="${v.days}" style="width:64px"></label>${btn('儲存','data-vsave')}<span class="afa-sub" data-vmsg>${v.enabled?'目前：開啟，所有場次到場都會加送。':'目前：關閉，到場只送 1,000 點。'}</span>`;
  el.querySelector('[data-vsave]').onclick=async()=>{const q=n=>el.querySelector(`[name="${n}"]`),m=el.querySelector('[data-vmsg]');const on=q('enabled').checked;
   if(on&&!confirm('開啟後，之後每位到場簽到或兌換補發代碼的會員，都會多拿一張「'+q('definition').selectedOptions[0].text+' '+q('days').value+' 天」使用券。確定開啟？')){q('enabled').checked=false;return;}
   m.textContent='儲存中…';const r2=await post('admin_forum_voucher_save',{enabled:on,definition:q('definition').value,days:+q('days').value}).catch(()=>({error:'連線失敗'}));
   m.textContent=r2.error||(r2.voucher.enabled?'已開啟：之後到場都會加送。':'已關閉：到場只送 1,000 點。');};
 }
 function editEvent(ev){
  const e=ev||{city:'TPE',date:'',start:'13:30',end:'17:30',status:'draft',code_days:14,capacity:0};
  const b=modal(ev?'編輯場次 '+ev.id:'新增論壇場次',`<form class="afa-form" data-f>
   <label>城市<select name="city" ${ev?'disabled':''}>${Object.entries(CITY).map(([k,v])=>`<option value="${k}" ${e.city===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label>日期<input type="date" name="date" required value="${esc(e.date)}" ${ev?'readonly':''}></label>
   <label>開始<input type="time" name="start" required value="${esc(e.start)}"></label>
   <label>結束<input type="time" name="end" required value="${esc(e.end)}"></label>
   <label class="full">地點<input name="venue" maxlength="120" placeholder="例：台北國際會議中心 201 室" value="${esc(e.venue||'')}"></label>
   <label class="full">活動名稱（選填）<input name="title" maxlength="80" placeholder="例：先見論壇・年終盤勢" value="${esc(e.title||'')}"></label>
   <label>名額（0＝不限）<input type="number" name="capacity" min="0" max="5000" value="${e.capacity||0}"></label>
   <label>補發代碼有效天數<input type="number" name="code_days" min="1" max="60" value="${e.code_days||14}"></label>
   <label class="full">報名連結（選填，https）<input name="signup_url" maxlength="300" placeholder="https://…" value="${esc(e.signup_url||'')}"></label>
   <label class="full">內部備註（選填）<textarea name="notes" rows="2" maxlength="1000" placeholder="例如：報到窗口、設備安排、補發原因；僅管理員可見">${esc(e.notes||'')}</textarea></label>
   <label>狀態<select name="status">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${e.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label class="chk"><input type="checkbox" name="test" ${e.test?'checked':''}> 測試場次（不發點數）</label>
   <p class="afa-sub full">現場簽到開放時間：開始前 60 分鐘到結束。代碼自動依城市＋日期命名（例 TPE1122）。</p>
   <div class="full afa-foot"><span data-err class="afa-err"></span>${btn('取消','data-close','ghost')}<button class="afa-btn primary" type="submit">儲存</button></div></form>`);
  b.querySelector('[data-f]').onsubmit=async f=>{f.preventDefault();const el=f.target.elements,data={id:ev?ev.id:'',city:ev?ev.city:el.city.value,date:el.date.value,start:el.start.value,end:el.end.value,venue:el.venue.value,title:el.title.value,notes:el.notes.value,capacity:+el.capacity.value,code_days:+el.code_days.value,signup_url:el.signup_url.value,status:el.status.value,test:el.test.checked};
   const r=await post('admin_forum_save',{event:data}).catch(()=>({error:'連線失敗'}));if(r.error){b.querySelector('[data-err]').textContent=r.error;return;}close();forum();};
 }
 async function openQr(id){
  close();await loadQrLib().catch(()=>{});
  const o=document.createElement('div');o.className='afa-qr';o.innerHTML=`<div class="afa-qr-in"><div class="afa-qr-top"><div><span class="afa-qr-k">FORESIGHT 論壇簽到</span><h2 data-label>載入中…</h2><p data-venue></p></div><div class="afa-qr-btns">${btn('全螢幕','data-fs')}${btn('關閉','data-close')}</div></div><div class="afa-qr-main"><div class="afa-qr-code" data-code></div><ol class="afa-qr-steps"><li><b>打開手機相機，對準 QR</b><span>Android 也可用 LINE 掃描</span></li><li><b>點開跳出的網址</b><span>先見 FORESIGHT 網站</span></li><li><b>登入會員</b><span>還沒有帳號可現場註冊</span></li><li><b>按「確認簽到」</b><span>1,000 活動點數立即入帳</span></li></ol></div><div class="afa-qr-foot"><span data-count></span><span data-tick></span></div></div>`;
  document.body.append(o);o.querySelector('[data-close]').onclick=close;o.querySelector('[data-fs]').onclick=()=>{document.fullscreenElement?document.exitFullscreen():o.requestFullscreen?.();};
  const tick=async()=>{const r=await post('admin_forum_qr',{id}).catch(()=>null);if(!document.body.contains(o))return;
   if(!r||r.error){o.querySelector('[data-label]').textContent=fail(r);qrTimer=setTimeout(tick,5000);return;}
   o.querySelector('[data-label]').textContent=r.label+(r.test?'（測試場次・不發點）':'');o.querySelector('[data-venue]').textContent=r.venue||'';
   o.querySelector('[data-count]').innerHTML='已簽到 <b>'+r.checked_in+'</b> 人';
   const url=location.origin+location.pathname+'?checkin='+encodeURIComponent(r.id+'.'+r.token);
   const c=o.querySelector('[data-code]');
   if(!r.open){c.innerHTML=`<div class="afa-qr-closed">簽到尚未開放<br><small>開放時間 ${esc(r.opens_at)}–${esc(r.closes_at)}</small></div>`;}
   else c.innerHTML=window.qrcode?qrSvg(url,10):`<div class="afa-qr-closed">QR 元件載入失敗<br><small>${esc(url)}</small></div>`;
   let left=r.refresh_in;const t=o.querySelector('[data-tick]');const step=()=>{t.textContent=r.open?`QR 每 60 秒自動更新・${left} 秒後換新`:'';if(left--<=0)return tick();qrTimer=setTimeout(step,1000);};clearTimeout(qrTimer);step();};
  tick();
 }
 async function codes(ev){
  const b=modal('補發代碼｜'+ev.label,`<p class="afa-sub">給當天到場、未掃 QR 的會員。代碼每組限用一次，每位會員限領一次論壇點數。</p><form class="afa-inline" data-f><label>產生幾組<input type="number" name="n" min="1" max="2000" value="50" required></label><button class="afa-btn primary" type="submit">產生並保存</button></form><p class="afa-sub">新產生的批次會保留，重新開啟可繼續查詢。舊版未保存的清單，請從下載檔找回代碼。兌換期限依此場次的有效天數設定。</p><div data-history></div><details><summary>作廢舊版代碼</summary><form data-revoke-old><label>貼上此場次代碼，每行一組<textarea name="codes" rows="3" class="afa-codes" required></textarea></label><button class="afa-btn" type="submit">作廢未使用代碼</button></form></details><p role="status" class="afa-sub" data-msg></p>`,true);
  let batches=[],page=0,selected='',busy=false;
  const host=b.querySelector('[data-history]'),msg=b.querySelector('[data-msg]');
  async function load(){
   const r=await post('admin_forum_codes_list',{id:ev.id}).catch(()=>({error:'連線失敗'}));
   if(!b.isConnected)return;
   if(r.error){msg.textContent=r.error;return;}
   batches=r.batches||[];if(!batches.some(x=>x.id===selected))selected=batches[0]?.id||'';paint();
  }
  function paint(){
   const batch=batches.find(x=>x.id===selected);
   if(!batch){host.innerHTML='<p class="afa-sub">目前沒有已保存的批次。</p>';return;}
   page=Math.min(page,Math.max(0,Math.ceil(batch.rows.length/10)-1));
   const rows=batch.rows.slice(page*10,page*10+10);
   host.innerHTML=`<label class="afa-code-batch">批次<select data-batch>${batches.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(new Date(x.at).toLocaleString('zh-TW'))}・${x.rows.length} 組</option>`).join('')}</select></label><div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>選取</th><th>代碼</th><th>狀態</th></tr></thead><tbody>${rows.map(x=>`<tr><td><input type="checkbox" data-code="${esc(x.code)}" ${x.status==='unused'?'':'disabled'} aria-label="選取 ${esc(x.code)}"></td><td><code>${esc(x.code)}</code></td><td>${({unused:'未使用',used:'已兌換',revoked:'已作廢'})[x.status]}</td></tr>`).join('')}</tbody></table></div><div class="afa-bar afa-code-pages">${btn('上一頁','data-prev')}<span>${page+1} / ${Math.ceil(batch.rows.length/10)} 頁・${batch.rows.length} 組</span>${btn('下一頁','data-next')}</div><div class="afa-bar">${btn('下載未使用 CSV','data-csv')}${btn('列印未使用','data-print')}${btn('複製未使用','data-copy')}${btn('作廢本頁勾選','data-revoke','ghost')}</div>`;
   host.querySelector('[data-batch]').onchange=e=>{selected=e.target.value;page=0;paint();};
   host.querySelector('[data-prev]').disabled=page===0;host.querySelector('[data-next]').disabled=(page+1)*10>=batch.rows.length;
   host.querySelector('[data-prev]').onclick=()=>{page--;paint();};host.querySelector('[data-next]').onclick=()=>{page++;paint();};
   const unused=()=>batch.rows.filter(x=>x.status==='unused').map(x=>x.code);
   host.querySelector('[data-csv]').onclick=()=>download('論壇補發代碼_'+ev.id+'.csv','代碼,場次\n'+unused().map(c=>c+','+ev.label).join('\n'));
   host.querySelector('[data-print]').onclick=()=>{const end=new Date(ev.date+'T00:00:00+08:00');end.setDate(end.getDate()+(ev.code_days||14));printCards({codes:unused(),label:ev.label,valid_to:end.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})+' 23:59'});};
   host.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(unused().join('\n'));msg.textContent='已複製此批次未使用代碼';}catch{msg.textContent='無法複製，請下載 CSV';}};
   host.querySelector('[data-revoke]').onclick=()=>revoke([...host.querySelectorAll('[data-code]:checked')].map(x=>x.dataset.code));
  }
  async function revoke(codes){
   if(busy||!codes.length)return;
   if(!confirm('作廢 '+codes.length+' 組代碼？作廢後不能再兌換，已兌換的紀錄會保留。'))return;
   busy=true;msg.textContent='處理中…';
   const r=await post('admin_forum_code_revoke',{id:ev.id,codes}).catch(()=>({error:'連線失敗，請重新載入清單核對'}));
   busy=false;msg.textContent=r.error||('已確認 '+r.revoked+' 組作廢，其餘為已兌換紀錄');await load();
  }
  b.querySelector('[data-revoke-old]').onsubmit=e=>{e.preventDefault();revoke(e.target.elements.codes.value.trim().split(/\s+/));};
  b.querySelector('[data-f]').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;msg.textContent='產生並保存中…';
   const r=await post('admin_forum_codes',{id:ev.id,count:+e.target.elements.n.value}).catch(()=>({error:'連線失敗，請先重新開啟清單，核對是否已保存'}));
   busy=false;button.disabled=false;msg.textContent=r.error||('已保存 '+r.codes.length+' 組，期限至 '+r.valid_to);if(!r.error){selected=r.batch_id;page=0;}await load();
  };
  await load();
 }
 function printCards(r){
  const w=open('','_blank');if(!w)return alert('請允許彈出視窗後再試');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>論壇補發代碼</title><style>body{font-family:system-ui,"Noto Sans TC",sans-serif;margin:8mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.c{border:1px dashed #999;border-radius:3mm;padding:4mm;break-inside:avoid}.k{font-size:9pt;letter-spacing:.12em;color:#555}.e{font-size:10pt;margin:1mm 0 2mm}.code{font:700 15pt ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em}.s{font-size:8pt;color:#444;line-height:1.5;margin-top:2mm}@media print{body{margin:6mm}}</style><div class="g">${r.codes.map(c=>`<div class="c"><div class="k">先見 FORESIGHT・論壇到場</div><div class="e">${esc(r.label)}</div><div class="code">${esc(c)}</div><div class="s">登入會員 → 會員中心 → 活動兌換，輸入代碼即可獲得 1,000 活動點數。每位會員限領一次，兌換期限至 ${esc(r.valid_to.slice(0,10))}。</div></div>`).join('')}</div><script>onload=()=>print()<\/script>`);
  w.document.close();
 }
 async function registrations(ev){
  const b=modal('報名名單｜'+ev.label,`<p class="afa-sub">每位會員一生限參加一次，現場掃描 1,000 點限領一次。三次報名未到場後暫停報名，管理員可填寫原因解除限制。</p><div class="afa-bar" data-filters role="group" aria-label="報名狀態"></div><div data-list></div><div class="afa-bar afa-code-pages" data-pages></div><p class="afa-sub" data-status role="status"></p>`,true);
  const labels={all:'全部',registered:'已報名',attended:'已報到',cancelled:'已取消',missed:'未到場'};
  let rows=[],filter='all',page=0;
  const status=b.querySelector('[data-status]');
  async function load(){const r=await post('admin_forum_registrations',{id:ev.id}).catch(()=>({error:'連線失敗'}));if(!b.isConnected)return;if(r.error){status.textContent=r.error;return;}rows=r.rows||[];paint();}
  function paint(){
   const list=rows.filter(r=>filter==='all'||r.status===filter);page=Math.min(page,Math.max(0,Math.ceil(list.length/8)-1));
   b.querySelector('[data-filters]').innerHTML=Object.entries(labels).map(([id,text])=>btn(text+' '+(id==='all'?rows:rows.filter(x=>x.status===id)).length,`data-filter="${id}" aria-pressed="${id===filter}"`)).join('');
   b.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;page=0;paint();});
   b.querySelector('[data-list]').innerHTML=list.length?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>會員</th><th>報名時間</th><th>狀態</th><th>管理</th></tr></thead><tbody>${list.slice(page*8,page*8+8).map(r=>`<tr><td>${esc(r.member)}</td><td>${esc(new Date(r.at).toLocaleString('zh-TW'))}</td><td>${labels[r.status]}</td><td>${r.status==='missed'?btn('查核／解除限制',`data-reset="${r.user_id}"`):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="afa-sub">此分類目前沒有名單。</p>';
   b.querySelectorAll('[data-reset]').forEach(button=>button.onclick=async()=>{const reason=prompt('請填寫解除未到場限制的原因（保留原紀錄，已參加過的會員仍無法再報名）');if(!reason)return;button.disabled=true;const r=await post('admin_forum_registration_reset',{user_id:button.dataset.reset,reason}).catch(()=>({error:'連線失敗'}));status.textContent=r.error||'已解除未到場限制，會員可重新選擇場次報名。';button.disabled=false;});
   b.querySelector('[data-pages]').innerHTML=`${btn('上一頁','data-prev')}<span>${page+1} / ${Math.max(1,Math.ceil(list.length/8))} 頁</span>${btn('下一頁','data-next')}`;
   b.querySelector('[data-prev]').disabled=page===0;b.querySelector('[data-next]').disabled=(page+1)*8>=list.length;b.querySelector('[data-prev]').onclick=()=>{page--;paint();};b.querySelector('[data-next]').onclick=()=>{page++;paint();};
  }
  await load();
 }
 async function people(ev){
  const b=modal('到場名單｜'+ev.label,'<div class="fc-empty">載入中…</div>',true);
  const r=await post('admin_forum_attendees',{id:ev.id}).catch(()=>({error:'連線失敗'}));
  if(r.error){b.innerHTML=esc(r.error);return;}
  const list=(r.attendees||[]).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  const via=x=>x.via==='code'?'補發代碼':'現場掃碼';
  b.innerHTML=`<div class="afa-bar"><span>共 <b>${list.length}</b> 人（現場 ${list.filter(x=>x.via!=='code').length}／補發 ${list.filter(x=>x.via==='code').length}）</span>${list.length?btn('下載 CSV','data-csv','primary'):''}</div>`+(list.length?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>時間</th><th>會員</th><th>方式</th><th>代碼</th></tr></thead><tbody>${list.map(x=>`<tr><td>${esc(new Date(x.at).toLocaleString('zh-TW'))}</td><td>${esc(x.email||x.phone||x.user)}</td><td>${via(x)}</td><td>${esc(x.code||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="fc-empty">尚無人簽到</div>');
  b.querySelector('[data-csv]')?.addEventListener('click',()=>download(`論壇到場名單_${ev.id}.csv`,'時間,Email,手機,方式,代碼,會員ID\n'+list.map(x=>[new Date(x.at).toLocaleString('zh-TW'),x.email||'',x.phone||'',via(x),x.code||'',x.user].join(',')).join('\n')));
 }

 /* ═══ 站內廣告 ═══ */
 const slotHelp={
  top_bar:'每頁頂端的細公告，可關閉',
  home_card:'首頁上方的公告卡片',
  results_top:'選股結果表格上方',
  member_center:'會員中心頁面上方',
  corner:'右下角浮動卡，同一則每天最多出現一次'
 };
 function chooseSlot(){
  const slots=Object.entries(meta.slots);
  if(!slots.length)return;
  const b=modal('選擇廣告版位',`<p class="afa-sub">先選廣告出現的位置，再編輯內容。這是站內版位示意，不會開啟新視窗或立即刊登。</p><div class="afa-slot-picker"><div role="group" aria-label="廣告版位">${slots.map(([id,label])=>
   btn(icon(id)+`<span><b>${esc(label)}</b><small>${esc(SiteAdMedia.specs[id]?.help||slotHelp[id]||'')}<br>${id==='top_bar'?'純文字':'文字・圖片・影片'}</small></span>`,`data-slot="${esc(id)}" aria-pressed="false"`)).join('')}</div>
   <div class="afa-slot-preview"><b data-slot-label></b><div class="afa-slot-layout" data-slot-layout aria-hidden="true"><i>先見 FORESIGHT・網站頁首</i><i>首頁市場摘要</i><i>選股結果表格</i><i>會員中心內容</i><i>浮動公告</i><span class="afa-slot-marker">廣告顯示位置</span></div><p class="afa-sub" data-slot-help></p></div></div>
   <div class="afa-foot">${btn('取消','data-close','ghost')}${btn('使用此版位 → 編輯內容','data-confirm-slot','primary')}</div>`,true);
  let selected;
  function select(id){
   selected=id;
   b.querySelectorAll('[data-slot]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.slot===id)));
   b.querySelector('[data-slot-label]').textContent=meta.slots[id];
   b.querySelector('[data-slot-help]').textContent=slotHelp[id]||'';
   b.querySelector('[data-slot-layout]').dataset.layout=id;
  }
  b.querySelectorAll('[data-slot]').forEach(button=>button.onclick=()=>select(button.dataset.slot));
  b.querySelector('[data-confirm-slot]').onclick=()=>editAd(null,selected);
  select(slots[0][0]);
 }
 async function ads(){
  box.innerHTML='<div class="fc-empty">載入中…</div>';
  note.innerHTML='<b>說明</b> 每個版位同時只顯示一則（優先度高者）。受眾選「尚未參加過論壇的會員」時，已到場領過點數的人自動看不到。連結填 <code>?forum=1</code> 會打開站內「論壇場次」視窗。點擊數為約略值。';
  const j=await post('admin_ads_list').catch(()=>null);
  if(tab!=='ads')return;
  if(!j||j.error){box.innerHTML='<div class="fc-empty">'+esc(fail(j))+'</div>';return;}
  meta={slots:j.slots||{},audiences:j.audiences||{}};
  const st=a=>a.live?'<span class="afa-tag published">播放中</span>':a.enabled?'<span class="afa-tag draft">已排程／已過期</span>':'<span class="afa-tag closed">關閉</span>';
  const guide=`<section class="afa-ad-guide"><h3>廣告要放在哪裡？</h3><p class="afa-sub">選擇版位開始製作，先預覽、儲存草稿，確認後再開啟刊登。</p><div class="afa-placement-cards">${Object.entries(meta.slots).map(([id,label])=>btn(icon(id)+`<span><b>${esc(label)}</b><small>${esc(SiteAdMedia.specs[id]?.help||'')}<br>${id==='top_bar'?'純文字':'文字・圖片・影片'} · ${esc(SiteAdMedia.specs[id]?.size||'')}</small></span>`,`data-create-slot="${esc(id)}"`)).join('')}</div></section>`;
  const rows=(j.ads||[]).map(a=>`<tr><td><b>${esc(a.name)}</b><div class="afa-sub">${esc(a.title)}</div></td><td>${esc(meta.slots[a.slot]||a.slot)}</td><td>${esc(meta.audiences[a.audience]||a.audience)}</td><td>${esc((a.starts||'即日').replace('T',' '))} ～ ${esc((a.ends||'不限').replace('T',' '))}</td><td>${st(a)}</td><td class="num">${a.priority}</td><td class="num">${a.clicks||0}</td><td class="afa-acts">${btn(a.enabled?'關閉':'開啟',`data-toggle="${a.id}"`)}${btn('編輯',`data-edit="${a.id}"`)}${btn('刪除',`data-del="${a.id}"`,'ghost')}</td></tr>`).join('');
  box.innerHTML=`<div class="afa-bar">${btn('＋ 新增廣告','data-new','primary')}${btn('預覽版位位置','data-slots')}</div>`+guide+(rows?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>廣告</th><th>版位</th><th>受眾</th><th>期間</th><th>狀態</th><th class="num">優先</th><th class="num">點擊</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="fc-empty">還沒有廣告。建議先建立一則「頁首公告條／尚未參加過論壇的會員／連結 ?forum=1」。</div>');
  const map=Object.fromEntries((j.ads||[]).map(a=>[a.id,a]));
  box.querySelectorAll('[data-create-slot]').forEach(button=>button.onclick=()=>editAd(null,button.dataset.createSlot));
  box.querySelector('[data-new]').onclick=chooseSlot;
  box.querySelector('[data-slots]').onclick=chooseSlot;
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editAd(map[b.dataset.edit]));
  box.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const a=Object.assign({},map[b.dataset.toggle]);a.enabled=!a.enabled;const r=await post('admin_ads_save',{ad:a});if(r.error)alert(r.error);ads();});
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('刪除這則廣告？'))return;await post('admin_ads_delete',{id:b.dataset.del});ads();});
 }
 function editAd(ad,slot){
  window.AdminAdEditor.open({ad,slot,meta,post,modal,close,onSaved:ads,icon,esc});
 }
 /* ═══ 點數與商品 ═══ */
 const rid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(16)+Math.random().toString(16).slice(2,18);
 async function points(){
  note.innerHTML='<b>說明</b> 手動加點／扣點會寫進會員的點數紀錄（會員看得到原因），並記在稽核日誌。扣點不能扣到負數。兌換商品的名稱、所需點數、上下架可在下方直接修改，會員端立即生效。';
  box.innerHTML=`<section class="afa-sec"><h3>手動調整點數</h3><form class="afa-inline" data-find><input name="q" placeholder="輸入會員 Email 或手機（至少 3 字）" autocomplete="off" style="min-width:260px"><button class="afa-btn primary" type="submit">查詢</button>${btn('清除搜尋','data-clear-search','ghost')}</form><div data-members></div></section><section class="afa-sec"><h3>最近的手動調整</h3><div data-recent class="fc-empty">載入中…</div></section><section class="afa-sec"><h3>點數任務</h3><div class="afa-bar">${btn('＋ 新增點數任務','data-tnew','primary')}<span class="afa-sub">新增的任務屬「人工發放」：會員在任務頁看得到，點數由你在這裡按「發放」給指定會員。系統任務只能改名稱、點數、開關。</span></div><div data-tasks class="fc-empty">載入中…</div></section><section class="afa-sec"><div class="afa-bar"><h3>點數兌換商品</h3>${btn('＋ 新增兌換商品','data-pnew','primary')}</div><div data-products class="fc-empty">載入中…</div></section>`;
  const [adjustments,history,taskPanel,productPanel]=box.children;
  const adjustmentPanel=document.createElement('details');
  adjustmentPanel.className='afa-adjustments';
  adjustmentPanel.innerHTML='<summary>手動調整點數與紀錄</summary>';
  adjustmentPanel.append(adjustments,history);
  taskPanel.prepend(adjustmentPanel);
  taskPanel.dataset.pointPanel='tasks';productPanel.dataset.pointPanel='products';
  box.insertAdjacentHTML('afterbegin',`<div class="ov-tabs afa-point-tabs" role="group" aria-label="點數與商品">
   <button class="on" type="button" data-point-tab="tasks" aria-pressed="true">${icon('tasks')}點數任務</button>
   <button type="button" data-point-tab="products" aria-pressed="false">${icon('products')}兌換商品</button>
  </div>`);
  const pointTabs=[...box.querySelectorAll('[data-point-tab]')];
  const pointNotes={
   tasks:'手動加點／扣點會寫入會員點數紀錄與稽核日誌。扣點後的餘額須大於或等於零。',
   products:'儲存後，商品名稱、所需點數及上架狀態會更新至會員端。'
  };
  let productsLoaded=false;
  function selectPointTab(selected){
   taskPanel.hidden=selected!=='tasks';productPanel.hidden=selected!=='products';
   for(const button of pointTabs){
    const active=button.dataset.pointTab===selected;
    button.classList.toggle('on',active);button.setAttribute('aria-pressed',String(active));
   }
   note.textContent=pointNotes[selected];
   if(selected==='products'&&!productsLoaded){
    productsLoaded=true;products();
   }
  }
  for(const button of pointTabs)button.onclick=()=>selectPointTab(button.dataset.pointTab);
  selectPointTab('tasks');
  const mBox=taskPanel.querySelector('[data-members]');
  let searchSequence=0;
  box.querySelector('[data-clear-search]').onclick=()=>{searchSequence++;box.querySelector('[data-find]').reset();mBox.replaceChildren();box.querySelector('[data-find] input').focus();};
  box.querySelector('[data-find]').onsubmit=async e=>{e.preventDefault();const ticket=++searchSequence;mBox.textContent='查詢中…';const r=await post('admin_points_find',{q:e.target.elements.q.value}).catch(()=>({error:'連線失敗'}));
   if(ticket!==searchSequence||!mBox.isConnected)return;
   if(r.error){mBox.textContent=r.error;return;}if(!r.members.length){mBox.textContent='找不到符合的會員';return;}
   mBox.innerHTML=r.members.map(m=>`<form class="afa-member" data-adj="${esc(m.id)}"><div><b>${esc(m.email||m.phone)}</b><div class="afa-sub">目前 <b data-bal>${m.balance.toLocaleString()}</b> 點${m.forum?'｜已參加過論壇':''}</div></div><select name="sign"><option value="1">加點</option><option value="-1">扣點</option></select><input type="number" name="pts" min="1" max="100000" placeholder="點數" required><input name="reason" maxlength="120" placeholder="原因（會員看得到）" required><button class="afa-btn primary" type="submit">送出</button><span class="afa-err" data-msg></span></form>`).join('');
   mBox.querySelectorAll('[data-adj]').forEach(f=>{let req=rid();f.onsubmit=async e=>{e.preventDefault();const el=f.elements,pts=+el.sign.value*+el.pts.value,msg=f.querySelector('[data-msg]');
    if(!confirm(`${pts>0?'加':'扣'} ${Math.abs(pts).toLocaleString()} 點？\n原因：${el.reason.value}`))return;msg.textContent='處理中…';
    const r=await post('admin_points_adjust',{user_id:f.dataset.adj,points:pts,reason:el.reason.value,request_id:req}).catch(()=>({error:'連線失敗'}));
    if(r.error){msg.textContent=r.error;return;}req=rid();dispatchEvent(new Event('academy-notifications-changed'));msg.textContent=r.duplicate?'已處理過':'已完成，會員通知隨點數紀錄更新';f.querySelector('[data-bal]').textContent=r.balance.toLocaleString();el.pts.value='';el.reason.value='';recent();};});};
  async function recent(){const el=taskPanel.querySelector('[data-recent]');const r=await post('admin_points_recent').catch(()=>({error:'連線失敗'}));
   if(r.error){el.textContent=r.error;return;}el.className='';el.innerHTML=r.rows.length?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>時間</th><th>會員</th><th>內容</th><th class="num">點數</th></tr></thead><tbody>${r.rows.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('zh-TW'))}</td><td>${esc(x.member)}</td><td>${esc(x.description)}</td><td class="num" style="color:${x.points>0?'var(--up,#d84545)':'var(--down,#208653)'}">${x.points>0?'+':''}${x.points.toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`:'<div class="afa-sub">尚無手動調整紀錄</div>';}
  async function products(){const el=productPanel.querySelector('[data-products]');el.textContent='載入中…';const r=await post('admin_products_list').catch(()=>({error:'連線失敗'}));
   if(r.error){productsLoaded=false;el.textContent=r.error;return;}el.className='';if(r.missing){el.innerHTML='<div class="afa-sub">兌換商品資料表尚未建立。</div>';return;}
   productPanel.querySelector('[data-pnew]').onclick=()=>{
    const b=modal('新增兌換商品',`<form class="afa-form" data-create-product><label class="full">商品角色<select name="definition">${Object.entries(r.types||{}).map(([id,title])=>`<option value="${esc(id)}">${esc(title)}</option>`).join('')}</select></label><label>使用天數<input name="days" type="number" min="1" max="366" value="7" required></label><label>所需點數<input name="points" type="number" min="1" max="1000000" value="1000" required></label><p class="afa-sub full" data-product-title></p><p class="afa-sub full">建立後先存為下架商品，確認內容後可在列表勾選上架並儲存。</p><div class="afa-foot full"><span class="afa-err" data-error role="status"></span>${btn('取消','data-close','ghost')}<button class="afa-btn primary" type="submit">建立商品</button></div></form>`);
    const f=b.querySelector('form'),preview=()=>b.querySelector('[data-product-title]').textContent='商品名稱：'+f.elements.definition.selectedOptions[0].text+' · '+f.elements.days.value+' 天';f.oninput=preview;preview();
    f.onsubmit=async event=>{event.preventDefault();const button=f.querySelector('[type=submit]');button.disabled=true;const out=await post('admin_products_create',{definition:f.elements.definition.value,days:+f.elements.days.value,points:+f.elements.points.value}).catch(()=>({error:'連線失敗'}));if(out.error){b.querySelector('[data-error]').textContent=out.error;button.disabled=false;return;}close();products();};
   };
   el.innerHTML=`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>商品名稱</th><th class="num">天數</th><th class="num">所需點數</th><th>上架</th><th></th></tr></thead><tbody>${r.products.map(p=>`<tr data-p="${esc(p.id)}"><td><input name="title" maxlength="40" value="${esc(p.title)}" style="min-width:200px"><div class="afa-sub">${esc(p.id)}</div></td><td class="num">${p.duration_days}</td><td class="num"><input type="number" name="points" min="1" max="1000000" value="${p.points}" style="width:100px;text-align:right"></td><td><label class="chk"><input type="checkbox" name="active" ${p.active?'checked':''}> 上架</label></td><td>${btn('儲存','data-save')}<span class="afa-err" data-msg></span></td></tr>`).join('')}</tbody></table></div><p class="afa-sub">新增商品可選角色與天數。修改既有商品名稱時，請將天數放在名稱後方。</p>`;
   el.querySelectorAll('[data-p]').forEach(tr=>tr.querySelector('[data-save]').onclick=async()=>{const q=n=>tr.querySelector(`[name="${n}"]`),msg=tr.querySelector('[data-msg]');msg.textContent='儲存中…';
    const r2=await post('admin_products_save',{id:tr.dataset.p,title:q('title').value,points:+q('points').value,active:q('active').checked}).catch(()=>({error:'連線失敗'}));msg.textContent=r2.error||'已儲存';});}
  const PER={once:'每人一次',daily:'每天一次',weekly:'每週一次',monthly:'每月一次',yearly:'每年一次'};
  async function tasks(){const el=taskPanel.querySelector('[data-tasks]');const r=await post('admin_tasks_list').catch(()=>({error:'連線失敗'}));
   if(r.error){el.textContent=r.error;return;}el.className='';const map=Object.fromEntries(r.tasks.map(t=>[t.id,t]));
   el.innerHTML=`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>任務</th><th>週期</th><th>類型</th><th class="num">點數</th><th>開啟</th><th>操作</th></tr></thead><tbody>${r.tasks.map(t=>`<tr data-t="${esc(t.id)}"><td><input name="title" maxlength="40" value="${esc(t.title)}" style="min-width:200px"><div class="afa-sub">${esc(t.id)}</div></td><td>${esc(PER[t.period]||t.period)}</td><td>${t.custom?'<span class="afa-tag warn">人工發放（自訂）</span>':t.manual?'<span class="afa-tag">人工發放</span>':'<span class="afa-tag">系統自動</span>'}</td><td class="num"><input type="number" name="points" min="1" max="${t.custom?1000:10000}" value="${t.points}" style="width:90px;text-align:right"></td><td><label class="chk"><input type="checkbox" name="active" ${t.active?'checked':''}> 開啟</label></td><td class="afa-acts">${btn('儲存','data-tsave')}${t.manual?btn('發放','data-award','primary'):''}${t.custom?btn('刪除','data-tdel','ghost'):''}<span class="afa-err" data-msg></span></td></tr>`).join('')}</tbody></table></div>`;
   el.querySelectorAll('[data-t]').forEach(tr=>{const id=tr.dataset.t,q=n=>tr.querySelector(`[name="${n}"]`),msg=tr.querySelector('[data-msg]');
    tr.querySelector('[data-tsave]').onclick=async()=>{msg.textContent='儲存中…';const r2=await post('admin_tasks_save',{id,title:q('title').value,points:+q('points').value,active:q('active').checked,period:map[id].period}).catch(()=>({error:'連線失敗'}));msg.textContent=r2.error||'已儲存';};
    tr.querySelector('[data-tdel]')?.addEventListener('click',async()=>{if(!confirm('刪除任務「'+map[id].title+'」？'))return;const r2=await post('admin_tasks_delete',{id});if(r2.error){msg.textContent=r2.error;return;}tasks();});
    tr.querySelector('[data-award]')?.addEventListener('click',()=>award(map[id]));});}
  function newTask(){const b=modal('新增點數任務',`<form class="afa-form" data-f><label class="full">任務名稱<input name="title" required maxlength="40" placeholder="例：直播互動抽獎、參加線上講座"></label><label>每次點數（1–1,000）<input type="number" name="points" min="1" max="1000" value="100" required></label><label>週期<select name="period">${Object.entries(PER).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="chk full"><input type="checkbox" name="active" checked> 建立後立即顯示在會員任務頁</label><p class="afa-sub full">會員看得到任務名稱與點數；點數不能自行領取，由你在列表按「發放」給指定會員。</p><div class="full afa-foot"><span data-err class="afa-err"></span>${btn('取消','data-close','ghost')}<button class="afa-btn primary" type="submit">建立</button></div></form>`);
   b.querySelector('[data-f]').onsubmit=async e=>{e.preventDefault();const el=e.target.elements;const r=await post('admin_tasks_save',{title:el.title.value,points:+el.points.value,period:el.period.value,active:el.active.checked}).catch(()=>({error:'連線失敗'}));if(r.error){b.querySelector('[data-err]').textContent=r.error;return;}close();tasks();};}
  function award(t){const b=modal('發放點數｜'+t.title,`<form class="afa-inline" data-find2><input name="q" placeholder="會員 Email 或手機" autocomplete="off" style="min-width:240px"><button class="afa-btn" type="submit">查詢</button></form><div data-who class="afa-sub"></div><form class="afa-form" data-f hidden><label>點數（1–1,000）<input type="number" name="points" min="1" max="1000" value="${t.points}" required></label><label>場次／批次<input name="reference" maxlength="80" placeholder="例：2026-11-10 晚場直播" required></label><label class="full">說明（會員看得到）<input name="reason" maxlength="120" placeholder="例：直播互動抽獎中獎" required></label><p class="afa-sub full">同一位會員、同一個任務、同一個場次只會發一次，重按不會重複入帳。</p><div class="full afa-foot"><span data-err class="afa-err"></span><button class="afa-btn primary" type="submit">發放</button></div></form>`);
   let who=null;const f=b.querySelector('[data-f]'),w=b.querySelector('[data-who]');
   b.querySelector('[data-find2]').onsubmit=async e=>{e.preventDefault();w.textContent='查詢中…';const r=await post('admin_points_find',{q:e.target.elements.q.value}).catch(()=>({error:'連線失敗'}));
    if(r.error||!r.members?.length){w.textContent=r.error||'找不到會員';f.hidden=true;return;}
    w.innerHTML=r.members.map((m,i)=>`<label class="chk" style="display:flex;gap:6px;padding:4px 0"><input type="radio" name="who" value="${i}" ${i?'':'checked'}> ${esc(m.email||m.phone)}（目前 ${m.balance.toLocaleString()} 點）</label>`).join('');
    who=r.members[0];w.querySelectorAll('[name=who]').forEach(x=>x.onchange=()=>who=r.members[+x.value]);f.hidden=false;};
   f.onsubmit=async e=>{e.preventDefault();const el=e.target.elements,err=b.querySelector('[data-err]');err.textContent='發放中…';
    const r=await post('admin_tasks_award',{user_id:who.id,task_id:t.id,points:+el.points.value,reference:el.reference.value,reason:el.reason.value}).catch(()=>({error:'連線失敗'}));
    err.textContent=r.error||(r.duplicate?'這位會員在這個場次已發過，未重複發放。':'已發放，目前 '+r.balance.toLocaleString()+' 點。');if(!r.error)recent();};}
  box.querySelector('[data-tnew]').onclick=newTask;
  adjustmentPanel.addEventListener('toggle',()=>{
   if(adjustmentPanel.open&&!adjustmentPanel.dataset.loaded){
    adjustmentPanel.dataset.loaded='true';recent();
   }
  });
  tasks();
 }
 window.AdminForumAds={show(t,b,n,p){tab=t;box=b;note=n;post=p;close();(t==='ads'?ads:t==='points'?points:forum)();},hide(){tab='';close();}};
})();
