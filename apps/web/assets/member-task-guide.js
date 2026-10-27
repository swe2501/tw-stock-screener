/* Plain-language task contract. All rewards require server eligibility; this file never awards points. */
(() => {'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rules={};const add=(ids,where,how,kind='')=>ids.split(' ').forEach(id=>rules[id]={where,how,kind});
add('name','個人資料 → 研究暱稱','填寫暱稱後按「儲存」，只填在欄位裡還不算完成。');
add('preferences','右上角小鈴鐺「通知」→ 儲存通知偏好','選好接收方式與頻率，再按「儲存通知偏好」；選擇不接收通知也可以。');
add('learn learning3 learning5 learning10 learning20 learning30 daily-learn','學習中心 → 展開文章','閱讀至少 30 秒，完成全部小測驗並答對八成，再按「核驗並標記已讀」。只按個人已讀標記不計入獎勵；每日任務需今天首次核驗另一篇文章。');
add('watch watch5','我的自選 → 新增股票','加入股票並確認保存成功；系統計算帳號內不同股票的數量，不計重複新增。');
add('screen-first daily-screen weekly-screen screen20 strategies3','掏金篩選器 → 記錄今日選股','篩出股票後按「記錄今日選股」並保存成功。每天只計一個日期；每週任務計台北時間週一到週日；三種招式看正式保存的策略，不看本機草稿。');
add('note notes5 notes20','研究筆記 → 儲存；或下方「提交任務紀錄」','標題至少 2 字、內文至少 20 字（不含空白），保存後同步任務紀錄。不同筆記才累計；修改同一則或重複貼同內容不會增加篇數。','note');
add('daily-market','下方「提交任務紀錄」→ 今日市場觀察','寫下今天看到的市場現象與你準備如何確認，至少 20 字；提交成功才算今天完成。','market');
add('daily-risk','下方「提交任務紀錄」→ 今日風險條件','寫清楚什麼情況要重新評估，以及要核對的資料，至少 20 字；不需要實際交易。','risk');
add('daily-review','下方「提交任務紀錄」→ 回看舊筆記','選一則昨天以前保存的筆記，再寫至少 20 字的新觀察；只打開筆記不算完成。','review');
add('daily-check','我的自選；或下方「提交任務紀錄」','選帳號已加入自選的股票，保存至少 20 字的新觀察理由；相同文字重送不重複計算。','watch_reason');
add('weekly-notes','研究筆記 → 本週不同日期各保存一則','本週需有 3 個不同日期的有效筆記，日期採台北週一到週日。同一天寫三篇只算一天。','note');
add('weekly-summary weekly4','本週回顧；或下方「提交任務紀錄」','填寫本週觀察、學到的事、下週計畫，各至少 10 字並保存。每週只計一份；四份週回顧需跨四個不同週次。','summary');
add('weekly-plan','我的自選；或下方「提交任務紀錄」','選一檔已加入自選的股票，寫下至少 20 字的下週觀察計畫並保存；每週計一次。','plan');
add('weekly-screen-review','選股日曆；或下方「提交任務紀錄」','選擇上週正式保存的選股紀錄，寫至少 20 字的結果檢討並提交；只查看報酬不算完成。','screen_review');
add('simulate weekly-simulation reviews5','交易紀錄 → 手動模擬 → 已結束 → 完成覆盤；或下方提交','填寫股票、案例起訖日期、模擬進出價格及至少 20 字檢討。不同股票／起訖日期才是不同案例，不要求真實交易。','simulation');
add('weekly-learn challenge-first challenge4 challenge8','學習中心 → 本週學習挑戰','先核驗指定文章，再交週測驗，答對至少八成並保存成功。同週只計一次，跨週數依伺服器紀錄計算。');
add('streak7 streak15 streak30','任務與點數 → 每日觀察','每天至少領取一項每日研究任務的獎勵，連續達指定天數。單純登入、點開文章或未領取獎勵不計；日期採台北時間。');
add('invite1','邀請同行 → 專屬邀請碼','活動開放時，對方須完成註冊驗證並成功綁定你的邀請碼；只傳出邀請連結不算完成。');
add('invite3 share3','邀請同行 → 活動狀態','這兩項發放活動使用券，不是任務點數；依活動頁條件確認，未開放時不能領取。');
add('feedback event','使用回饋／學院活動 → 案件或活動狀態','須由管理端確認回饋有效或實際出席後發放，送出回饋或報名不代表已通過審核。');
add('ad-video','獎勵影片服務','目前影片服務尚未接通，不能完成或領點；不會要求你點廣告。');
add('birthday','個人資料 → 出生日期；生日當月回來領取','生日當月才符合資格，每年一次；變更生日不能重領同年度。');
add('anniversary','個人資料 → 註冊日期','註冊滿一年後才符合會員週年禮，每年一次，不是每次登入都會發放。');
const errors={TASK_WORK_INPUT_INVALID:'標題至少 2 字、內文至少 20 字（不含空白），請補完整後再保存。',TASK_WORK_SUMMARY_REQUIRED:'本週觀察、學到的事、下週計畫各需至少 10 字。',TASK_WORK_WATCH_REQUIRED:'請先到「我的自選」加入這檔股票，再提交觀察。',TASK_WORK_OLD_NOTE_REQUIRED:'請選擇帳號中昨天以前保存的筆記。',TASK_WORK_OLD_SCREEN_REQUIRED:'請選擇上週正式保存的選股紀錄。',TASK_WORK_CASE_REQUIRED:'請核對股票代號、起訖日期及正數價格；結束日期不能晚於今天。',TASK_WORK_ALREADY_SAVED:'相同內容或同一期間的這份紀錄已保存，不會重複累計。'};
const error=e=>errors[e.code]||e.message||'結果尚未確認，請稍後再試。';
let dialog;
async function open(id,{profile,root,onDone=()=>{}}){
 const rule=rules[id];if(!rule)return;const owner=localStorage.getItem('sb_token'),current=()=>root.isConnected&&owner&&owner===localStorage.getItem('sb_token');
 dialog?.remove();dialog=document.createElement('dialog');const d=dialog;d.className='mj-task-dialog';d.setAttribute('aria-label','任務完成指引');
 d.innerHTML='<header><div><small>一步一步完成</small><h2>任務完成指引</h2></div><button type="button" data-close aria-label="關閉任務指引">×</button></header><p><b>在哪裡做</b><br>'+esc(rule.where)+'</p><p><b>做到什麼程度</b><br>'+esc(rule.how)+'</p>'+(rule.kind?'<form><label>紀錄標題<input name="title" minlength="2" maxlength="80" required></label><div data-fields></div><label>內容（至少 20 字，不含空白）<textarea name="body" minlength="20" maxlength="3000" required rows="5"></textarea></label><p class="mj-task-privacy">這份任務內容會私下保存到本帳號，不公開。完成時間由伺服器記錄，不回填過去日期。</p><button class="mj-primary" type="submit">保存並確認任務資格</button></form>':'')+'<p role="status" aria-live="polite" data-work-message></p>';
 root.append(d);d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());if(!rule.kind)return;
 const form=d.querySelector('form'),host=d.querySelector('[data-fields]'),message=d.querySelector('[data-work-message]'),pendingKey='academy.task-work.'+profile.id+'.'+id;let pending;
 try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{message.textContent='待確認紀錄無法讀取，暫不送出新紀錄，請先確認瀏覽器儲存空間。';form.querySelector('button').disabled=true;return;}
 const select=(name,label,rows)=>'<label>'+label+'<select name="'+name+'" required><option value="">請選擇</option>'+rows.map(([v,t])=>'<option value="'+esc(v)+'">'+esc(t)+'</option>').join('')+'</select></label>';
 try{
  const ctx=await AcademyIdentity.taskWorkContext(rule.kind);if(!current()||!d.isConnected)return;
  if(rule.kind==='review')host.innerHTML=select('reference','要回看的舊筆記',(ctx.notes||[]).map(n=>[n.id,n.title]));
  else if(rule.kind==='screen_review')host.innerHTML=select('reference','上週選股紀錄',(ctx.screens||[]).map(n=>[n.id,n.record_date+' · '+n.strategies.join('／')]));
  else if(['watch_reason','plan'].includes(rule.kind))host.innerHTML=select('code','已加入自選的股票',(ctx.watchlist||[]).map(code=>[code,code]));
  else if(rule.kind==='summary')host.innerHTML=['observed','learned','next'].map((name,i)=>'<label>'+['本週觀察（至少 10 字）','學到的事（至少 10 字）','下週計畫（至少 10 字）'][i]+'<textarea name="'+name+'" minlength="10" maxlength="800" required rows="2"></textarea></label>').join('');
  else if(rule.kind==='simulation')host.innerHTML='<div class="mj-task-form-grid"><label>股票代號<input name="code" pattern="[0-9A-Z]{4,10}" required></label><label>案例開始日期<input name="start_date" type="date" required></label><label>案例結束日期<input name="end_date" type="date" required></label><label>模擬進場價<input name="entry" type="number" min="0.0001" step="0.0001" required></label><label>模擬出場價<input name="exit" type="number" min="0.0001" step="0.0001" required></label></div>';
  if(pending){form.elements.title.value=pending.p_title;form.elements.body.value=pending.p_body;for(const [k,v]of Object.entries(pending.p_context||{}))if(form.elements[k])form.elements[k].value=v;if(form.elements.reference)form.elements.reference.value=pending.p_reference;form.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);form.querySelector('button').textContent='確認上次保存結果';message.textContent='上次結果待確認，沿用原單號與內容，不會新增第二份紀錄。';}
 }catch(e){message.textContent=error(e);form.querySelector('button').disabled=true;return;}
 let busy=false;form.onsubmit=async e=>{e.preventDefault();if(busy||!current())return;busy=true;const button=form.querySelector('button');button.disabled=true;message.textContent='正在保存並確認資格…';
  try{
   if(!pending){const data=Object.fromEntries(new FormData(form)),context=Object.fromEntries(Object.entries(data).filter(([k])=>!['title','body','reference'].includes(k)));pending={p_request_id:crypto.randomUUID(),p_kind:rule.kind,p_reference:data.reference||'',p_title:data.title,p_body:data.body,p_context:context};localStorage.setItem(pendingKey,JSON.stringify(pending));}
   const r=await AcademyIdentity.submitTaskWork(pending);if(!current())return;if(!r?.id||r.kind!==rule.kind)throw Error('保存結果尚未確認，請沿用原單號再試');localStorage.removeItem(pendingKey);pending=null;
   form.querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=true);message.textContent='任務紀錄已保存。已重新確認資格，符合條件的獎勵可個別或一鍵領取。';await onDone();
  }catch(err){if(current()){if(errors[err.code]){localStorage.removeItem(pendingKey);pending=null;form.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=false);}else form.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);message.textContent=error(err);button.disabled=false;button.textContent=pending?'確認上次保存結果':'保存並確認任務資格';}}
  finally{busy=false;}
 };
}
async function recordNote(note,expectedUser){
 const owner=localStorage.getItem('sb_token');if(expectedUser){const user=await AcademyIdentity.getProfile();if(user.id!==expectedUser||owner!==localStorage.getItem('sb_token'))throw Error('帳號已切換，已取消任務同步');}
 if(!note||!note.id||note.body.replace(/\s/g,'').length<20)return {needsMore:true};
 const kind=['market','risk'].includes(note.task_kind)?note.task_kind:'note',key='academy.task-note.'+(expectedUser||'current')+'.'+note.id+'.'+kind;
 let data;try{data=JSON.parse(localStorage.getItem(key)||'null');}catch{throw Error('任務同步紀錄異常，請先保留筆記並聯絡客服');}
 if(!data){data={p_request_id:crypto.randomUUID(),p_kind:kind,p_reference:note.id,p_title:note.title,p_body:note.body,p_context:{}};localStorage.setItem(key,JSON.stringify(data));}
 try{const r=await AcademyIdentity.submitTaskWork(data);if(owner!==localStorage.getItem('sb_token'))throw Error('帳號已切換');if(!r?.id||r.kind!==kind)throw Error('任務同步結果尚未確認，請重試原紀錄');localStorage.removeItem(key);return r;}
 catch(e){if(errors[e.code])localStorage.removeItem(key);if(e.code==='TASK_WORK_ALREADY_SAVED')return {alreadySaved:true};throw e;}
}

const unit=id=>id==='weekly-notes'?'個不同日期':/^(learning|learn$|daily-learn)/.test(id)?'篇':/^(challenge|weekly-learn|weekly4)/.test(id)?'週':/^streak/.test(id)||/^(weekly-screen|screen20)$/.test(id)?'天':/^watch/.test(id)?'檔':id==='strategies3'?'種招式':/^(simulate|reviews5|weekly-simulation)$/.test(id)?'個案例':/^(notes|note$)/.test(id)?'篇':'項';
window.AcademyTaskGuide={rules,open,error,recordNote,unit};
})();
