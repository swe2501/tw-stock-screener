/* Manual content operations. Uses existing authenticated task APIs; no model or publishing calls. */
(()=>{
 'use strict';
 const stages=[
  {department:7,name:'資料研究',criteria:['附上可核對的來源連結、資料日期及引用範圍','區分已知事實、解釋與尚待確認事項'],brief:'整理公開資料、來源日期與素材授權。不得杜撰行情或將推論寫成事實。交付來源清單與研究摘要。'},
  {department:24,name:'教學草稿',criteria:['以通俗繁體中文交付完整教學草稿，保留來源及資料日期','不含個別買賣建議、保證獲利、誇大績效或誘導交易文字'],brief:'閱讀已驗收的資料研究成果，製作免費分享的教學草稿。交付標題、正文、圖說及適用限制；不提供個別交易指令或收益承諾。'},
  {department:14,name:'法遵初審',criteria:['逐項記錄宣稱、引用授權、個資及投資建議風險，附原文位置與修改建議','提交修訂稿及未解決事項；重大或不確定的法律事項交專業人士確認'],brief:'閱讀已驗收草稿，檢查來源引用、素材授權、個資、績效宣稱與推廣措辭。免費分享不代表無合規義務。這是內部初審，不是法律意見或合法保證；交付修訂稿、檢查紀錄及待確認事項。'},
  {department:0,name:'待你核准發布',criteria:['確認最終文案與初審紀錄，重要待確認事項已處理','記錄核准者、版本、預計渠道與時間；未核准不得發布'],brief:'整理前三階段的已驗收成果與待決策事項，提交給網站負責人核准。驗收只代表此版本獲准，不代表已發布；實際發布仍由有權人員另行操作並記錄連結及時間。'}
 ];
 window.OfficeContentFlow={mount(root,post,onCreated){
  const box=document.createElement('section');box.className='oc-flow';
  box.innerHTML='<div><small>CONTENT OPERATIONS</small><h4>免費內容營運</h4><p>資料研究 → 教學草稿 → 法遵初審 → 待你核准發布</p><span>人工執行 · AI 暫不啟動 · 各站驗收後交接</span></div><button type="button">建立內容流程</button>';root.querySelector('.ot-heading').after(box);
  const dialog=document.createElement('dialog');dialog.className='ot-dialog';dialog.setAttribute('aria-label','建立內容營運流程');document.body.append(dialog);
  let payloads=null,index=0,busy=false;
  function open(){
   if(!payloads){dialog.innerHTML='<div class="ot-dialog-head"><h3>建立內容營運流程</h3><button type="button" data-flow-close aria-label="關閉內容流程">×</button></div><form class="ot-form"><p class="ot-meta">建立四項相互依賴的人工任務，不呼叫 AI、不自動發布。每一站的成果需經管理者驗收，下一站才能領取。</p><label>內容主題<input name="topic" required maxlength="70" placeholder="例如：新手如何閱讀成交量"></label><label>讀者、用途與交付需求<textarea name="brief" required maxlength="3000" rows="4" placeholder="希望讀者了解什麼、使用哪些資料、預計分享渠道"></textarea></label><ol class="oc-stages">'+stages.map(s=>'<li><b>'+s.name+'</b><span>'+s.criteria[0]+'</span></li>').join('')+'</ol><p data-flow-message role="status"></p><button type="submit">建立四站人工流程</button></form>';
    const form=dialog.querySelector('form');form.onsubmit=submit;
    dialog.querySelector('[data-flow-close]').onclick=()=>dialog.close();
   }
   dialog.showModal();
  }
  async function submit(e){
   e.preventDefault();if(busy)return;const form=dialog.querySelector('form'),message=dialog.querySelector('[data-flow-message]');
   if(!payloads){const data=new FormData(form),topic=String(data.get('topic')).trim(),brief=String(data.get('brief')).trim();if(!topic||!brief)return;
    const ids=stages.map(()=>crypto.randomUUID()),tag=ids[0].slice(0,8);
    payloads=stages.map((s,i)=>({id:ids[i],department:s.department,title:'[內容 '+tag+'] '+topic+' · '+s.name,brief:'內容主題：'+topic+'\n需求：'+brief+'\n\n'+s.brief+(i?'\n前置任務：'+ids[i-1]+'。請在前置任務驗收後，開啟其詳情閱讀完整成果；摘要不取代原稿。':''),criteria:s.criteria,depends_on:i?[ids[i-1]]:[],execution:'manual',budget_usd:0,due_date:''}));
   }
   busy=true;form.querySelectorAll('input,textarea,button').forEach(b=>b.disabled=true);dialog.querySelector('[data-flow-close]').disabled=true;
   try{
    while(index<payloads.length){message.textContent='正在建立 '+(index+1)+' / 4：'+stages[index].name;const r=await post('admin_office_tasks_create',payloads[index]);if(!r?.task||r.error)throw Error(r?.error||'未取得任務回應');index++;}
    message.textContent='四站已建立。請領取「資料研究」開始，之後逐站提交及驗收。尚未發布任何內容。';form.querySelector('[type=submit]').textContent='流程已建立';payloads=null;index=0;
    await onCreated();
    dialog.querySelector('[data-flow-close]').disabled=false;
   }catch(err){message.textContent='已確認建立 '+index+' / 4 站。'+err.message+'。按「繼續建立」會沿用相同識別碼重試，避免重複任務。';form.querySelector('[type=submit]').textContent='繼續建立';form.querySelector('[type=submit]').disabled=false;dialog.querySelector('[data-flow-close]').disabled=false;}
   finally{busy=false;}
  }
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});box.querySelector('button').onclick=open;
  return {destroy(){box.remove();dialog.close();dialog.remove();}};
 }};
})();
