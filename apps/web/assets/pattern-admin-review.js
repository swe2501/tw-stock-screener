/* UAT human review controls. Authorization and persistence are server enforced. */
(()=>{'use strict';
 const labels={forming:'形成中',breakout:'已突破',pending:'待複核',rejected:'不算 W'};
 const $=id=>document.getElementById(id);let payload=null,opened=false,filter='all',generation=0;
 const token=()=>localStorage.getItem('sb_token')||'';
 function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 async function api(body){const t=token();if(!t)throw Error('請先登入管理者帳號');const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(body)});let d;try{d=await r.json();}catch(_){throw Error('複核服務暫時無法使用');}if(t!==token())throw Error('登入帳號已變更，請重新載入');if(!r.ok)throw Error(d.error||'無法讀取複核紀錄');return d;}
 function mount(){if($('patternAdminToggle'))return;const hero=document.querySelector('#boxView .aps-hero');if(!hero)return;
  const toggle=el('button','管理者複核','par-toggle');toggle.id='patternAdminToggle';toggle.type='button';toggle.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>switchMode(!opened);hero.append(toggle);
  const panel=el('section',null,'par-panel');panel.id='patternAdminPanel';panel.hidden=true;panel.setAttribute('aria-label','管理者W型態複核');hero.after(panel);
 }
 function switchMode(on){opened=on;$('boxView').classList.toggle('pattern-admin-mode',on);$('patternAdminPanel').hidden=!on;$('patternAdminToggle').textContent=on?'返回型態清單':'管理者複核';$('patternAdminToggle').setAttribute('aria-expanded',String(on));
  for(const id of ['aiPatternTabs','aiPatternSavedPanel','aiPatternLegacyBox'])if($(id))$(id).hidden=on||id==='aiPatternLegacyBox';
  if(on)render();else originalShow?.();
 }
 function render(){const panel=$('patternAdminPanel');panel.replaceChildren();if(!payload)return;
  const market=el('a','開啟全市場候選複核（與本批4張佇列分開）','par-toggle');market.href='research/w-all-market/report.html';market.target='_blank';market.rel='noopener';panel.append(market);
  const counts={};for(const c of payload.cases){const s=payload.decisions[c.id]?.status||c.initial_status;counts[s]=(counts[s]||0)+1;}
  panel.append(el('h3','W 型態・管理者複核'),el('p','新增400檔複核佇列：'+payload.cases.length+' 個案例。形成中 '+(counts.forming||0)+' · 待複核 '+(counts.pending||0)+' · 已突破 '+(counts.breakout||0)+' · 不算W '+(counts.rejected||0)+'。不含舊100檔的歷史待複核樣本。選擇狀態後按「儲存判定」；本批兩張形成中候選已提供會員查看輪廓與頸線；儲存判定不會自動變更會員候選或發布為已確認W。行情終點：2026-10-22。','par-intro'));
  const controls=el('div',null,'par-controls');for(const [value,label] of [['all','全部'],...Object.entries(labels)]){const b=el('button',label+(value==='all'?' ('+payload.cases.length+')':' ('+(counts[value]||0)+')'),filter===value?'on':'');b.type='button';b.setAttribute('aria-pressed',String(filter===value));b.onclick=()=>{filter=value;render();};controls.append(b);}const reload=el('button','重新載入');reload.type='button';reload.onclick=()=>refresh(true);controls.append(reload);panel.append(controls);
  const rows=payload.cases.filter(c=>filter==='all'||(payload.decisions[c.id]?.status||c.initial_status)===filter);
  if(!rows.length)panel.append(el('p','此狀態目前沒有案例。','par-intro'));
  for(const c of rows){const d=payload.decisions[c.id],status=d?.status||c.initial_status,card=el('article',null,'par-card');card.dataset.case=c.id;
   const head=el('header');head.append(el('h4',c.code+' '+c.name),el('span',(c.timeframe==='weekly'?'週K':'日K')+' · '+labels[status],'par-status'));card.append(head,el('p',c.reason));
   const details=el('details');details.append(el('summary','查看原始 K 圖'));const img=el('img');img.src=c.image;img.alt=c.code+' '+(c.timeframe==='weekly'?'週K':'日K')+' 複核圖';img.loading='lazy';details.append(img);card.append(details);
   const chart=el('button',status==='forming'?'開啟 K 圖與形成中輔助線':'開啟網站互動 K 圖');chart.type='button';chart.onclick=()=>window._openSavedPatternChart?.(c.code,c.name,c.timeframe);card.append(chart);
   const form=el('div',null,'par-decision'),select=el('select');select.setAttribute('aria-label',c.code+' '+c.timeframe+' 判定狀態');for(const [v,l] of Object.entries(labels)){const o=el('option',l);o.value=v;select.append(o);}select.value=status;
   const save=el('button','儲存判定','par-save');save.type='button';const message=el('span',d?'已儲存 · '+new Date(d.reviewed_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未人工判定','par-message');message.setAttribute('role','status');
   save.onclick=async()=>{save.disabled=select.disabled=true;message.textContent='儲存中…';try{const result=await api({action:'admin_pattern_review_save',case_id:c.id,status:select.value,source_sha256:c.source_sha256,expected_revision:d?.revision||null});payload.decisions[c.id]=result.decision;render();}catch(e){message.textContent=e.message+'；請重新載入確認紀錄。';save.disabled=select.disabled=false;}};
   form.append(select,save,message);card.append(form);panel.append(card);
  }
 }
 async function refresh(showError=false){mount();if(!$('patternAdminToggle'))return;const turn=++generation;try{const d=await api({action:'admin_pattern_reviews'});if(turn!==generation)return;if(d.admin!==true||d.scope!=='uat'||!Array.isArray(d.cases))throw Error('未取得管理者權限');payload=d;$('patternAdminToggle').hidden=false;if(opened)render();}catch(e){if(turn!==generation)return;payload=null;$('patternAdminToggle').hidden=true;if(opened){switchMode(false);if(showError)$('aiPatternResults')?.prepend(el('p',e.message,'par-intro'));}}}
 const originalShow=window._boxShow;window._boxShow=function(){originalShow?.();mount();if(opened)switchMode(true);refresh();};
 window.addEventListener('academy-auth-changed',()=>{generation++;payload=null;if(opened)switchMode(false);if($('patternAdminToggle'))$('patternAdminToggle').hidden=true;refresh();});
 window.addEventListener('storage',e=>{if(e.key==='sb_token'){generation++;payload=null;if(opened)switchMode(false);if($('patternAdminToggle'))$('patternAdminToggle').hidden=true;}});
})();
