/* 後台：論壇活動（場次／現場 QR 簽到／補發代碼／名單）與站內廣告管理。
   資料由 /api/auth admin_forum_* / admin_ads_* 讀寫（lib/forum_ads.py），前端不碰資料庫。 */
(()=>{'use strict';
 const CITY={TPE:'台北',TXG:'台中',KHH:'高雄'},STATUS={draft:'草稿（不公開）',published:'公開',closed:'已結束'};
 const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let post=null,box=null,note=null,tab='forum',meta={slots:{},audiences:{}};
 const btn=(label,attr,cls='')=>`<button type="button" class="afa-btn ${cls}" ${attr}>${label}</button>`;
 function fail(j){return j&&j.error?j.error:'讀取失敗，請稍後再試';}
 function modal(title,html,wide){
  close();const m=document.createElement('div');m.className='afa-modal';m.innerHTML=`<div class="afa-sheet${wide?' wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="afa-sheet-hd"><b>${esc(title)}</b><button type="button" class="afa-x" data-close aria-label="關閉">×</button></div><div class="afa-sheet-bd">${html}</div></div>`;
  m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))close();});document.body.append(m);return m.querySelector('.afa-sheet-bd');}
 let qrTimer=null;
 function close(){clearTimeout(qrTimer);qrTimer=null;document.querySelectorAll('.afa-modal,.afa-qr').forEach(x=>x.remove());}
 function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
 function loadQrLib(){return window.qrcode?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='assets/vendor/qrcode-generator-1.4.4.js';s.onload=ok;s.onerror=no;document.head.append(s);});}
 function qrSvg(text,cell){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:cell||8,margin:2,scalable:true});}

 /* ═══ 論壇活動 ═══ */
 async function forum(){
  box.innerHTML='<div class="fc-empty">載入中…</div>';
  note.innerHTML='<b>流程</b> ① 新增場次並設為「公開」 ② 活動當天按「開啟現場簽到」，把畫面投到報到桌螢幕 ③ 會員用手機相機掃 QR → 登入 → 按簽到，1,000 點自動入帳 ④ 沒掃到的人，按「補發代碼」產生一次性代碼給他，到會員中心「活動兌換」輸入。<br>每位會員一生限領一次論壇點數；勾「測試場次」只跑流程、不發點數。';
  const j=await post('admin_forum_list').catch(()=>null);
  if(!j||j.error){box.innerHTML='<div class="fc-empty">'+esc(fail(j))+'</div>';return;}
  const rows=(j.events||[]).map(e=>`<tr><td><b>${esc(e.label)}</b>${e.test?' <span class="afa-tag warn">測試</span>':''}<div class="afa-sub">${esc(e.id)}${e.title?'｜'+esc(e.title):''}</div></td><td>${esc(e.venue||'—')}<div class="afa-sub">${esc(e.date)} ${esc(e.start)}–${esc(e.end)}</div></td><td><span class="afa-tag ${e.status}">${esc(STATUS[e.status]||e.status)}</span></td><td class="num"><b>${e.checked_in||0}</b>${e.capacity?` / ${e.capacity}`:''}</td><td class="afa-acts">${btn('開啟現場簽到',`data-qr="${esc(e.id)}"`,'primary')}${btn('補發代碼',`data-codes="${esc(e.id)}"`)}${btn('到場名單',`data-people="${esc(e.id)}"`)}${btn('編輯',`data-edit="${esc(e.id)}"`)}${e.checked_in?'':btn('刪除',`data-del="${esc(e.id)}"`,'ghost')}</td></tr>`).join('');
  box.innerHTML=`<div class="afa-bar">${btn('＋ 新增場次','data-new','primary')}<form class="afa-check" data-check><input name="code" placeholder="查詢補發代碼是否已使用" maxlength="24" autocomplete="off"><button class="afa-btn" type="submit">查詢</button><span data-check-out></span></form></div>`+
   (rows?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>場次</th><th>地點／時間</th><th>狀態</th><th class="num">已簽到</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="fc-empty">還沒有場次，按「＋ 新增場次」開始。</div>');
  const evs=Object.fromEntries((j.events||[]).map(e=>[e.id,e]));
  box.insertAdjacentHTML('beforeend','<div class="afa-voucher" data-voucher><span class="afa-sub">讀取到場贈券設定中…</span></div>');voucherBar();
  box.querySelector('[data-new]').onclick=()=>editEvent(null);
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editEvent(evs[b.dataset.edit]));
  box.querySelectorAll('[data-qr]').forEach(b=>b.onclick=()=>openQr(b.dataset.qr));
  box.querySelectorAll('[data-codes]').forEach(b=>b.onclick=()=>codes(evs[b.dataset.codes]));
  box.querySelectorAll('[data-people]').forEach(b=>b.onclick=()=>people(evs[b.dataset.people]));
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('刪除場次 '+b.dataset.del+'？'))return;const r=await post('admin_forum_delete',{id:b.dataset.del});if(r.error)alert(r.error);forum();});
  box.querySelector('[data-check]').onsubmit=async e=>{e.preventDefault();const out=box.querySelector('[data-check-out]');out.textContent='查詢中…';const r=await post('admin_forum_code_check',{code:e.target.elements.code.value}).catch(()=>({}));out.textContent=!r.valid?'不是有效代碼':r.used?`已使用（${new Date(r.used_at).toLocaleString('zh-TW')}）`:`有效、尚未使用（${r.event}）`;};
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
   <label>狀態<select name="status">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${e.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label class="chk"><input type="checkbox" name="test" ${e.test?'checked':''}> 測試場次（不發點數）</label>
   <p class="afa-sub full">現場簽到開放時間：開始前 60 分鐘到結束。代碼自動依城市＋日期命名（例 TPE1122）。</p>
   <div class="full afa-foot"><span data-err class="afa-err"></span>${btn('取消','data-close','ghost')}<button class="afa-btn primary" type="submit">儲存</button></div></form>`);
  b.querySelector('[data-f]').onsubmit=async f=>{f.preventDefault();const el=f.target.elements,data={id:ev?ev.id:'',city:ev?ev.city:el.city.value,date:el.date.value,start:el.start.value,end:el.end.value,venue:el.venue.value,title:el.title.value,capacity:+el.capacity.value,code_days:+el.code_days.value,signup_url:el.signup_url.value,status:el.status.value,test:el.test.checked};
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
 function codes(ev){
  const b=modal('補發代碼｜'+ev.label,`<p class="afa-sub">給「當天有到、但沒掃到 QR」的會員。每組只能用一次，每位會員一生限領一次論壇點數；可多產生備用，沒發出去的代碼不會有任何影響。</p><form class="afa-inline" data-f><label>產生幾組<input type="number" name="n" min="1" max="2000" value="50"></label><label>活動後幾天內要兌換完<input type="number" name="days" min="1" max="60" value="${ev.code_days||14}"></label><button class="afa-btn primary" type="submit">產生</button></form><p class="afa-sub">兌換天數是整個場次共用：改了之後，這一場所有已發出的代碼期限都會一起改。</p><div data-out></div>`,true);
  b.querySelector('[data-f]').onsubmit=async f=>{f.preventDefault();const out=b.querySelector('[data-out]');out.textContent='產生中…';const days=+f.target.elements.days.value;
   if(days!==(ev.code_days||14)){const s=await post('admin_forum_save',{event:Object.assign({},ev,{code_days:days})}).catch(()=>({error:'連線失敗'}));if(s.error){out.textContent=s.error;return;}ev.code_days=days;}
   const r=await post('admin_forum_codes',{id:ev.id,count:+f.target.elements.n.value}).catch(()=>({error:'連線失敗'}));
   if(r.error){out.textContent=r.error;return;}
   out.innerHTML=`<p class="afa-sub">共 ${r.codes.length} 組｜兌換期限 ${esc(r.valid_from)} ～ ${esc(r.valid_to)}｜請立即下載或列印保存（系統不保留未使用的清單）。</p><div class="afa-bar">${btn('下載 CSV','data-csv','primary')}${btn('列印小卡','data-print')}${btn('複製全部','data-copy')}</div><textarea readonly class="afa-codes">${r.codes.join('\n')}</textarea>`;
   out.querySelector('[data-csv]').onclick=()=>download(`論壇補發代碼_${ev.id}_${r.codes.length}組.csv`,'代碼,場次,兌換期限\n'+r.codes.map(c=>`${c},${r.label},${r.valid_to}`).join('\n'));
   out.querySelector('[data-copy]').onclick=()=>navigator.clipboard?.writeText(r.codes.join('\n'));
   out.querySelector('[data-print]').onclick=()=>printCards(r);};
 }
 function printCards(r){
  const w=open('','_blank');if(!w)return alert('請允許彈出視窗後再試');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>論壇補發代碼</title><style>body{font-family:system-ui,"Noto Sans TC",sans-serif;margin:8mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.c{border:1px dashed #999;border-radius:3mm;padding:4mm;break-inside:avoid}.k{font-size:9pt;letter-spacing:.12em;color:#555}.e{font-size:10pt;margin:1mm 0 2mm}.code{font:700 15pt ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em}.s{font-size:8pt;color:#444;line-height:1.5;margin-top:2mm}@media print{body{margin:6mm}}</style><div class="g">${r.codes.map(c=>`<div class="c"><div class="k">先見 FORESIGHT・論壇到場</div><div class="e">${esc(r.label)}</div><div class="code">${esc(c)}</div><div class="s">登入會員 → 會員中心 → 活動兌換，輸入代碼即可獲得 1,000 活動點數。每位會員限領一次，兌換期限至 ${esc(r.valid_to.slice(0,10))}。</div></div>`).join('')}</div><script>onload=()=>print()<\/script>`);
  w.document.close();
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
 async function ads(){
  box.innerHTML='<div class="fc-empty">載入中…</div>';
  note.innerHTML='<b>說明</b> 每個版位同時只顯示一則（優先度高者）。受眾選「尚未參加過論壇的會員」時，已到場領過點數的人自動看不到。連結填 <code>?forum=1</code> 會打開站內「論壇場次」視窗。點擊數為約略值。';
  const j=await post('admin_ads_list').catch(()=>null);
  if(!j||j.error){box.innerHTML='<div class="fc-empty">'+esc(fail(j))+'</div>';return;}
  meta={slots:j.slots||{},audiences:j.audiences||{}};
  const st=a=>a.live?'<span class="afa-tag published">播放中</span>':a.enabled?'<span class="afa-tag draft">已排程／已過期</span>':'<span class="afa-tag closed">關閉</span>';
  const rows=(j.ads||[]).map(a=>`<tr><td><b>${esc(a.name)}</b><div class="afa-sub">${esc(a.title)}</div></td><td>${esc(meta.slots[a.slot]||a.slot)}</td><td>${esc(meta.audiences[a.audience]||a.audience)}</td><td>${esc((a.starts||'即日').replace('T',' '))} ～ ${esc((a.ends||'不限').replace('T',' '))}</td><td>${st(a)}</td><td class="num">${a.priority}</td><td class="num">${a.clicks||0}</td><td class="afa-acts">${btn(a.enabled?'關閉':'開啟',`data-toggle="${a.id}"`)}${btn('編輯',`data-edit="${a.id}"`)}${btn('刪除',`data-del="${a.id}"`,'ghost')}</td></tr>`).join('');
  box.innerHTML=`<div class="afa-bar">${btn('＋ 新增廣告','data-new','primary')}${btn('預覽版位位置','data-slots')}</div>`+(rows?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>廣告</th><th>版位</th><th>受眾</th><th>期間</th><th>狀態</th><th class="num">優先</th><th class="num">點擊</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="fc-empty">還沒有廣告。建議先建立一則「頁首公告條／尚未參加過論壇的會員／連結 ?forum=1」。</div>');
  const map=Object.fromEntries((j.ads||[]).map(a=>[a.id,a]));
  box.querySelector('[data-new]').onclick=()=>editAd(null);
  box.querySelector('[data-slots]').onclick=()=>modal('廣告版位',`<ul class="afa-slots">${Object.entries(meta.slots).map(([k,v])=>`<li><b>${esc(v)}</b><span>${{top_bar:'每頁頂端一條細公告，可關閉',home_card:'首頁上方一張卡片',results_top:'按「篩選」後結果表格上方',member_center:'會員中心頁面上方',corner:'右下角小卡，可關閉，同一則每天最多出現一次'}[k]||''}</span></li>`).join('')}</ul>`);
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editAd(map[b.dataset.edit]));
  box.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const a=Object.assign({},map[b.dataset.toggle]);a.enabled=!a.enabled;const r=await post('admin_ads_save',{ad:a});if(r.error)alert(r.error);ads();});
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('刪除這則廣告？'))return;await post('admin_ads_delete',{id:b.dataset.del});ads();});
 }
 function editAd(ad){
  const a=ad||{slot:'top_bar',audience:'not_attended',cta:'查看場次',url:'?forum=1',priority:50,enabled:false};
  const opt=(o,v)=>Object.entries(o).map(([k,t])=>`<option value="${k}" ${v===k?'selected':''}>${esc(t)}</option>`).join('');
  const b=modal(ad?'編輯廣告':'新增站內廣告',`<form class="afa-form" data-f>
   <label class="full">內部名稱<input name="name" maxlength="60" placeholder="例：11月台北論壇・頁首" value="${esc(a.name||'')}"></label>
   <label>版位<select name="slot">${opt(meta.slots,a.slot)}</select></label>
   <label>受眾<select name="audience">${opt(meta.audiences,a.audience)}</select></label>
   <label class="full">標題（必填）<input name="title" required maxlength="60" placeholder="例：11/22 台北論壇，會員到場送 1,000 點" value="${esc(a.title||'')}"></label>
   <label class="full">說明<textarea name="text" maxlength="200" rows="2" placeholder="例：週六下午 1:30，台北場，名額有限">${esc(a.text||'')}</textarea></label>
   <label>按鈕文字<input name="cta" maxlength="20" value="${esc(a.cta||'')}"></label>
   <label>連結<input name="url" maxlength="400" placeholder="?forum=1 或 https://…" value="${esc(a.url||'')}"></label>
   <label>開始<input type="datetime-local" name="starts" value="${esc(a.starts&&a.starts.length===10?a.starts+'T00:00':a.starts||'')}"></label>
   <label>結束<input type="datetime-local" name="ends" value="${esc(a.ends&&a.ends.length===10?a.ends+'T23:59':a.ends||'')}"></label>
   <label>優先度（0–99）<input type="number" name="priority" min="0" max="99" value="${a.priority}"></label>
   <label class="chk"><input type="checkbox" name="enabled" ${a.enabled?'checked':''}> 開啟</label>
   <div class="full"><div class="afa-sub">預覽</div><div class="site-ad site-ad--preview" data-pv></div></div>
   <p class="afa-sub full">廣告文字請避免「保證獲利、必漲、穩賺」等用語，論壇宣傳以時間、地點、會員權益為主。</p>
   <div class="full afa-foot"><span data-err class="afa-err"></span>${btn('取消','data-close','ghost')}<button class="afa-btn primary" type="submit">儲存</button></div></form>`);
  const f=b.querySelector('[data-f]'),pv=b.querySelector('[data-pv]');
  const draw=()=>{const e=f.elements;pv.innerHTML=`<span class="site-ad-k">論壇</span><b>${esc(e.title.value||'標題')}</b><span class="site-ad-t">${esc(e.text.value)}</span><span class="site-ad-cta">${esc(e.cta.value||'了解更多')} →</span>`;};
  f.addEventListener('input',draw);draw();
  f.onsubmit=async ev=>{ev.preventDefault();const e=f.elements,data={id:ad?ad.id:'',name:e.name.value,slot:e.slot.value,audience:e.audience.value,title:e.title.value,text:e.text.value,cta:e.cta.value,url:e.url.value,starts:e.starts.value,ends:e.ends.value,priority:+e.priority.value,enabled:e.enabled.checked};
   const r=await post('admin_ads_save',{ad:data}).catch(()=>({error:'連線失敗'}));if(r.error){b.querySelector('[data-err]').textContent=r.error;return;}close();ads();};
 }
 /* ═══ 點數與商品 ═══ */
 const rid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(16)+Math.random().toString(16).slice(2,18);
 async function points(){
  note.innerHTML='<b>說明</b> 手動加點／扣點會寫進會員的點數紀錄（會員看得到原因），並記在稽核日誌。扣點不能扣到負數。兌換商品的名稱、所需點數、上下架可在下方直接修改，會員端立即生效。';
  box.innerHTML=`<section class="afa-sec"><h3>手動調整點數</h3><form class="afa-inline" data-find><input name="q" placeholder="輸入會員 Email 或手機（至少 3 字）" autocomplete="off" style="min-width:260px"><button class="afa-btn primary" type="submit">查詢</button></form><div data-members></div></section><section class="afa-sec"><h3>最近的手動調整</h3><div data-recent class="fc-empty">載入中…</div></section><section class="afa-sec"><h3>點數任務</h3><div class="afa-bar">${btn('＋ 新增點數任務','data-tnew','primary')}<span class="afa-sub">新增的任務屬「人工發放」：會員在任務頁看得到，點數由你在這裡按「發放」給指定會員。系統任務只能改名稱、點數、開關。</span></div><div data-tasks class="fc-empty">載入中…</div></section><section class="afa-sec"><h3>點數兌換商品</h3><div data-products class="fc-empty">載入中…</div></section>`;
  const mBox=box.querySelector('[data-members]');
  box.querySelector('[data-find]').onsubmit=async e=>{e.preventDefault();mBox.textContent='查詢中…';const r=await post('admin_points_find',{q:e.target.elements.q.value}).catch(()=>({error:'連線失敗'}));
   if(r.error){mBox.textContent=r.error;return;}if(!r.members.length){mBox.textContent='找不到符合的會員';return;}
   mBox.innerHTML=r.members.map(m=>`<form class="afa-member" data-adj="${esc(m.id)}"><div><b>${esc(m.email||m.phone)}</b><div class="afa-sub">目前 <b data-bal>${m.balance.toLocaleString()}</b> 點${m.forum?'｜已參加過論壇':''}</div></div><select name="sign"><option value="1">加點</option><option value="-1">扣點</option></select><input type="number" name="pts" min="1" max="100000" placeholder="點數" required><input name="reason" maxlength="120" placeholder="原因（會員看得到）" required><button class="afa-btn primary" type="submit">送出</button><span class="afa-err" data-msg></span></form>`).join('');
   mBox.querySelectorAll('[data-adj]').forEach(f=>{let req=rid();f.onsubmit=async e=>{e.preventDefault();const el=f.elements,pts=+el.sign.value*+el.pts.value,msg=f.querySelector('[data-msg]');
    if(!confirm(`${pts>0?'加':'扣'} ${Math.abs(pts).toLocaleString()} 點？\n原因：${el.reason.value}`))return;msg.textContent='處理中…';
    const r=await post('admin_points_adjust',{user_id:f.dataset.adj,points:pts,reason:el.reason.value,request_id:req}).catch(()=>({error:'連線失敗'}));
    if(r.error){msg.textContent=r.error;return;}req=rid();msg.textContent=r.duplicate?'已處理過':'完成';f.querySelector('[data-bal]').textContent=r.balance.toLocaleString();el.pts.value='';el.reason.value='';recent();};});};
  async function recent(){const el=box.querySelector('[data-recent]');const r=await post('admin_points_recent').catch(()=>({error:'連線失敗'}));
   if(r.error){el.textContent=r.error;return;}el.className='';el.innerHTML=r.rows.length?`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>時間</th><th>會員</th><th>內容</th><th class="num">點數</th></tr></thead><tbody>${r.rows.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('zh-TW'))}</td><td>${esc(x.member)}</td><td>${esc(x.description)}</td><td class="num" style="color:${x.points>0?'var(--up,#d84545)':'var(--down,#208653)'}">${x.points>0?'+':''}${x.points.toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`:'<div class="afa-sub">尚無手動調整紀錄</div>';}
  async function products(){const el=box.querySelector('[data-products]');const r=await post('admin_products_list').catch(()=>({error:'連線失敗'}));
   if(r.error){el.textContent=r.error;return;}el.className='';if(r.missing){el.innerHTML='<div class="afa-sub">兌換商品資料表尚未建立。</div>';return;}
   el.innerHTML=`<div class="afa-table-wrap"><table class="afa-table"><thead><tr><th>商品名稱</th><th class="num">天數</th><th class="num">所需點數</th><th>上架</th><th></th></tr></thead><tbody>${r.products.map(p=>`<tr data-p="${esc(p.id)}"><td><input name="title" maxlength="40" value="${esc(p.title)}" style="min-width:200px"><div class="afa-sub">${esc(p.id)}</div></td><td class="num">${p.duration_days}</td><td class="num"><input type="number" name="points" min="1" max="1000000" value="${p.points}" style="width:100px;text-align:right"></td><td><label class="chk"><input type="checkbox" name="active" ${p.active?'checked':''}> 上架</label></td><td>${btn('儲存','data-save')}<span class="afa-err" data-msg></span></td></tr>`).join('')}</tbody></table></div><p class="afa-sub">天數與券種綁定兌換規則，新增券種需另外建立兌換規則。</p>`;
   el.querySelectorAll('[data-p]').forEach(tr=>tr.querySelector('[data-save]').onclick=async()=>{const q=n=>tr.querySelector(`[name="${n}"]`),msg=tr.querySelector('[data-msg]');msg.textContent='儲存中…';
    const r2=await post('admin_products_save',{id:tr.dataset.p,title:q('title').value,points:+q('points').value,active:q('active').checked}).catch(()=>({error:'連線失敗'}));msg.textContent=r2.error||'已儲存';});}
  const PER={once:'每人一次',daily:'每天一次',weekly:'每週一次',monthly:'每月一次',yearly:'每年一次'};
  async function tasks(){const el=box.querySelector('[data-tasks]');const r=await post('admin_tasks_list').catch(()=>({error:'連線失敗'}));
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
  recent();tasks();products();
 }
 window.AdminForumAds={show(t,b,n,p){tab=t;box=b;note=n;post=p;close();(t==='ads'?ads:t==='points'?points:forum)();},hide:close};
})();
