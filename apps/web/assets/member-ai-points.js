/* AI point：快捷選單與點數帳戶共用的轉換面板。
   規則（見 docs/database/member-ai-points.sql）：只有儲值點數能轉入，1 點＝1 AI point；AI 用多少扣多少（小數第 4 位，只捨不入）；
   轉回儲值點數只能整數；可開自動補充。扣點只在伺服器端，瀏覽器只能轉入、轉回、改設定。 */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // 顯示 AI point：最多 4 位小數，去掉尾端 0（不四捨五入，避免看起來比實際多）
 function format(v){const s=String(v??'0');if(!/^-?\d+(\.\d+)?$/.test(s))return '—';let [i,d='']=s.replace('-','').split('.');d=d.slice(0,4).replace(/0+$/,'');return (s.startsWith('-')?'-':'')+Number(i).toLocaleString('zh-TW')+(d?'.'+d:'');}
 const whole=v=>{const n=Math.floor(Number(String(v??'0')));return Number.isSafeInteger(n)&&n>0?n:0;};
 const state=w=>!w?'loading':w.ai_enabled!==true?'closed':w.stored_enabled!==true?'nostored':'open';
 const notes={loading:'正在確認 AI point 狀態…',closed:'AI 功能開放後即可使用。',nostored:'儲值開放後即可轉換。',open:''};
 /* opts.compact：快捷選單用的精簡版（只有轉入與自動補充）；完整版另有轉回。 opts.onChange(summary)：轉換成功後通知。 */
 function mount(el,opts={}){
  let w=null,busy=false;const compact=!!opts.compact;
  el.classList.add('ai-sheet');if(compact)el.classList.add('ai-sheet-compact');
  function paint(msg){
   const st=state(w),open=st==='open',stored=Number.isSafeInteger(w?.stored_points)?w.stored_points:0,ai=format(w?.ai_points),back=whole(w?.ai_points);
   el.innerHTML=(compact?'':'<div class="ai-sheet-head"><div><h3>轉換 AI point</h3><p>只能用儲值點數轉換，1 點＝1 AI point；任務點數不能轉。</p></div><span class="ai-badge">'+(open?'可轉換':st==='loading'?'確認中':'即將開放')+'</span></div>')+
    '<div class="ai-row"><span>可轉換的儲值點數</span><b>'+(st==='closed'||st==='nostored'?'—':stored.toLocaleString('zh-TW')+' 點')+'</b></div>'+
    '<form class="ai-form" data-ai-in><label class="ai-field"><span>轉入點數</span><input name="points" type="number" inputmode="numeric" min="1" max="100000" step="1" placeholder="輸入整數" '+(open?'':'disabled')+'></label>'+
    '<div class="ai-chips" role="group" aria-label="快速選擇">'+[100,500,1000].map(n=>'<button type="button" data-ai-chip="'+n+'" '+(open&&stored>=n?'':'disabled')+'>'+n.toLocaleString('zh-TW')+'</button>').join('')+'</div>'+
    '<button class="ai-primary" type="submit" '+(open&&!busy?'':'disabled')+'>轉入 AI point</button></form>'+
    (compact?'':'<form class="ai-form ai-form-back" data-ai-out><label class="ai-field"><span>轉回儲值點數（整數，目前最多 '+back.toLocaleString('zh-TW')+' 點）</span><input name="points" type="number" inputmode="numeric" min="1" max="'+Math.max(1,back)+'" step="1" placeholder="輸入整數" '+(open&&back?'':'disabled')+'></label><button type="submit" '+(open&&back&&!busy?'':'disabled')+'>轉回</button></form>')+
    '<form class="ai-auto" data-ai-auto><label class="ai-switch"><input type="checkbox" name="auto" '+(w?.ai_auto_topup?'checked':'')+' '+(open?'':'disabled')+'><span aria-hidden="true"></span>自動補充</label>'+
    '<div class="ai-auto-rule">'+(compact?'低於':'AI point 低於')+' <input name="below" type="number" min="0" max="10000" step="1" value="'+esc(Number.isFinite(Number(w?.ai_topup_below))&&w?.ai_topup_below!=null?Math.floor(Number(w.ai_topup_below)):5)+'" '+(open?'':'disabled')+' aria-label="低於多少時補充"> '+(compact?'時補':'時，從儲值點數補')+' <input name="points" type="number" min="10" max="10000" step="10" value="'+esc(w?.ai_topup_points||100)+'" '+(open?'':'disabled')+' aria-label="每次補充點數"> 點</div>'+
    '<button type="submit" '+(open&&!busy?'':'disabled')+'>儲存設定</button></form>'+
    '<p class="ai-status" role="status" aria-live="polite">'+esc(msg||notes[st])+'</p>'+
    (compact?'':'<p class="ai-fine">AI 每次用多少扣多少，算到小數第 4 位且只捨不入；每次查詢都有明細，查詢前會先顯示預估上限，實際扣點不會超過上限。</p>');
   if(compact)el.querySelector('.ai-row').insertAdjacentHTML('beforebegin','<div class="ai-row ai-row-balance"><span>AI point 餘額</span><b>'+(st==='closed'?'即將開放':ai)+'</b></div>');
  }
  async function load(){try{w=await window.AcademyIdentity.walletSummary();}catch{w={ai_enabled:false};}paint();}
  async function run(task,ok){if(busy)return;busy=true;paint('處理中…');try{const r=await task();w=await window.AcademyIdentity.walletSummary().catch(()=>w);busy=false;paint(ok(r));dispatchEvent(new Event('academy-wallet-changed'));opts.onChange?.(w);}catch(e){busy=false;paint(e.message);}}
  el.addEventListener('click',e=>{const c=e.target.closest('[data-ai-chip]');if(c){const i=el.querySelector('[data-ai-in] input');i.value=c.dataset.aiChip;i.focus();}});
  el.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
   if(f.matches('[data-ai-in]'))run(()=>window.AcademyIdentity.aiConvert(f.elements.points.value),r=>'已轉入 '+format(r.converted)+' AI point，目前 '+format(r.ai_points)+'。');
   else if(f.matches('[data-ai-out]'))run(()=>window.AcademyIdentity.aiConvertBack(f.elements.points.value),r=>'已轉回 '+Number(r.returned).toLocaleString('zh-TW')+' 點儲值點數，AI point 剩 '+format(r.ai_points)+'。');
   else if(f.matches('[data-ai-auto]'))run(()=>window.AcademyIdentity.aiSettings({auto:f.elements.auto.checked,topupPoints:f.elements.points.value,topupBelow:f.elements.below.value}),r=>r.ai_auto_topup?'已開啟自動補充。':'已關閉自動補充。');
  });
  paint();load();
  return {reload:load};
 }
 window.AcademyAiPoints={mount,format};
})();
