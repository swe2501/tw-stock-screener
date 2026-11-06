/* Department workrooms. Reads existing reports; never starts an executor. */
(function(){
'use strict';
const permitted={news:17,chip:7,tech:7,macro:7,risk:14,etf:7,data:6,boss:0};
const OFFICE_AGENTS=[
 {key:'ceo',display:'AI_stock CEO',department:0,can_claim:true},
 {key:'cto',display:'AI_stock CTO',department:6,can_claim:true},
 {key:'eng',display:'AI_stock 工程師',department:6,can_claim:true},
 {key:'qa',display:'AI_stock 測試工程師',department:8,can_claim:true},
 {key:'sec',display:'AI_stock 資安工程師',department:9,can_claim:true},
 {key:'mochi',display:'Mochi',department:20,can_claim:false,role:'PMO／協調'}
];
function officeAgentsFor(id){
 return OFFICE_AGENTS.filter(a=>id===19||a.department===id).map(a=>({
  key:'office-'+a.key,department:a.department,name:a.display,
  status:'idle',statusText:a.key==='mochi'?'PMO／協調':(a.can_claim?'已對應':'尚未對應'),
  duty:a.key==='mochi'?'專案管理辦公室協調，不可領取執行任務。':'研究室對應執行者。',
  current:a.key==='mochi'?'PMO／協調':'',mapped:true
 }));
}
function evidenceList(value){
 if(Array.isArray(value))return value.filter(Boolean).map(String);
 if(value)return [String(value)];
 return [];
}
const names={queued:'等待執行',running:'工作中',blocked:'等待處理',review:'等待驗收',approved:'已驗收',cancelled:'已取消',failed:'執行失敗'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=s=>{const d=new Date(s);return s&&Number.isFinite(+d)?d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'尚無紀錄';};
const secs=n=>n==null?'尚無紀錄':n<60?Math.round(n)+' 秒':n<3600?(n/60).toFixed(1)+' 分鐘':(n/3600).toFixed(1)+' 小時';
const percent=n=>n==null?'尚無紀錄':Math.round(n*100)+'%';
let roles=[],snapshots=new Map(),request=0,pending=false,lastDepartment=-1,inflight=new Map();
const send=data=>{if(parent!==window)parent.postMessage(data,location.protocol==='file:'?'*':location.origin);};
function todayTW(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
function emitActivity(){
 const current=roles.map(r=>({department:r.department,status:r.status}));const latest=new Map();
 snapshots.forEach(s=>(s.tasks||[]).forEach(t=>{if(!latest.has(t.id)||(t.revision||0)>=(latest.get(t.id).revision||0))latest.set(t.id,t);}));
 const loadError=[...snapshots.values()].some(s=>s&&s.error);
 const loading=pending&&![...snapshots.values()].some(s=>s&&((s.tasks&&s.tasks.length)||s.error));
 latest.forEach(t=>{
  if(['approved','cancelled'].includes(t.status))return;
  const interrupted=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();
  const overdue=!!(t.due_date&&t.due_date<todayTW());
  const known=['queued','running','blocked','review','failed'];
  if(t.status==='running'&&!interrupted)current.push({department:t.department,status:'work'});
  else if(overdue||['blocked','failed'].includes(t.status)||interrupted||!known.includes(t.status))current.push({department:t.department,status:'stuck'});
  else if(['queued','review'].includes(t.status))current.push({department:t.department,status:'wait'});
 });
 const ev=new CustomEvent('foresight-office-activity',{detail:current});ev.meta={loading,loadError,snapshotCount:snapshots.size};dispatchEvent(ev);
}
function taskStats(id){const latest=new Map();snapshots.forEach(s=>(s.tasks||[]).forEach(t=>{if(t.department!==id)return;if(!latest.has(t.id)||(t.revision||0)>=(latest.get(t.id).revision||0))latest.set(t.id,t);}));let wait=0,work=0,stuck=0;latest.forEach(t=>{if(['approved','cancelled'].includes(t.status))return;const interrupted=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();const overdue=!!(t.due_date&&t.due_date<todayTW());const known=['queued','running','blocked','review','failed'];if(t.status==='running'&&!interrupted)work++;else if(overdue||['blocked','failed'].includes(t.status)||interrupted||!known.includes(t.status))stuck++;else if(['queued','review'].includes(t.status))wait++;});return {wait,work,stuck,total:latest.size};}
function decorate(){document.querySelectorAll('.department').forEach(b=>{
 b.querySelector('.existing-role-count')?.remove();const id=+b.dataset.department;const list=roles.filter(r=>r.department===id);const stats=taskStats(id);const snap=snapshots.get(id)||snapshots.get(19);
 if(!list.length&&!stats.total&&!(snap&&(snap.error||snap.tasks)))return;
 const badge=document.createElement('small');badge.className='existing-role-count';
 if(pending&&!snap)badge.textContent='載入中';
 else if(snap&&snap.error)badge.textContent='載入失敗';
 else if(stats.work)badge.textContent='工作中 '+stats.work;
 else if(stats.stuck)badge.textContent='需處理 '+stats.stuck;
 else if(stats.wait)badge.textContent='待執行 '+stats.wait;
 else if(stats.total)badge.textContent='待確認 '+stats.total;
 else if(list.length){const active=list.filter(r=>r.status==='work').length;badge.textContent=active?active+' 組工作中':list.length+' 組';}
 else badge.textContent='無任務';
 badge.title='真實任務／排程回報';b.append(badge);
});}
function roleCard(r){const current=r.current||r.report||r.summary||r.duty||'尚未回報工作內容';
 return '<article class="wr-person" data-status="'+esc(r.status)+'"><div class="wr-person-head"><span class="wr-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M5 21v-3c0-7 14-7 14 0v3M3 12h4m10 0h4"/></svg></span><div><b>'+esc(r.name)+'</b><span class="live-role-state" data-state="'+esc(r.status)+'">'+esc(r.statusText)+'</span></div></div><p class="wr-current">'+esc(current)+'</p><dl><div><dt>開始時間</dt><dd>'+esc(stamp(r.since))+'</dd></div><div><dt>已執行</dt><dd data-work-since="'+esc(r.status==='work'?r.since||'':'')+'">'+esc(r.status==='work'?secs(ForesightWorkroomModel.duration(r.since,new Date().toISOString())):'—')+'</dd></div><div><dt>最後回報</dt><dd>'+esc(stamp(r.updated))+'</dd></div></dl>'+(r.reason?'<p class="wr-alert">'+esc(r.reason)+'</p>':'')+'<details><summary>工作步驟與成果</summary><p>資料日期：'+esc(r.dataDate||'尚未回報')+' · 重試次數：'+esc(r.retries==null?'尚未回報':r.retries)+'</p><p>'+esc(r.duty||'')+'</p><ol class="wr-timeline">'+(r.steps||[]).slice().reverse().map(s=>'<li><div><b>'+esc(s.step)+'</b><span>'+(!s.end?'執行中':s.ok===true?'完成':s.ok===false?'失敗':'已結束')+'</span></div><small>'+esc(stamp(s.start))+' · '+esc(secs(s.secs??ForesightWorkroomModel.duration(s.start,s.end)))+'</small>'+(s.detail?'<p>'+esc(s.detail)+'</p>':'')+'</li>').join('')+'</ol>'+(!(r.steps||[]).length?'<p>尚未回報步驟。</p>':'')+(r.summary?'<p>'+esc(r.summary)+'</p>':'')+'</details></article>';
}
function taskButton(t){const interrupted=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();const overdue=!!(t.overdue||(t.due_date&&t.due_date<todayTW()&&!['approved','cancelled'].includes(t.status)));const label=interrupted?'回報中斷':(names[t.status]||'待確認')+(overdue?' · 逾期':'');const links=evidenceList(t.evidence).map(item=>/^https?:\/\//i.test(item)?'<a href="'+esc(item)+'" target="_blank" rel="noopener noreferrer">證據</a>':esc(item)).join(' · ');return '<button type="button" class="wr-task" data-workroom-task="'+esc(t.id)+'"><span><b>'+esc(t.title)+'</b><small>'+esc(t.current_step||'尚未回報步驟')+(t.status==='queued'?' · 已等待 '+esc(secs(ForesightWorkroomModel.duration(t.created_at,new Date().toISOString()))):'')+(overdue?' · 逾期':'')+(links?' · '+links:'')+'</small></span><span>'+esc(label)+' ↗</span></button>';}
function render(){
 const content=document.querySelector('#exploreContent');if(!content||!content.querySelector('.profile-heading'))return;
 const id=ForesightOffice.selectedDepartment;if(id<0)return;
 const prev=content.querySelector('.live-department-roles');const opened=prev?[...prev.querySelectorAll('details')].map(e=>e.open):[];prev?.remove();
 document.querySelector('#officeExploreDialog').classList.add('workroom-dialog');
 const all=id===19,items=officeAgentsFor(id).concat(roles.filter(r=>all||r.department===id)),snapshot=snapshotFor(id),tasks=snapshot?.tasks||[],m=ForesightWorkroomModel.metrics(items,tasks);
 const section=document.createElement('section');section.className='live-department-roles workroom';
 const metric=(label,value,sub)=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd><small>'+esc(sub||'')+'</small></div>';
 const flow=tasks.filter(t=>!['approved','cancelled'].includes(t.status));
 const outputs=tasks.filter(t=>t.result),handoffs=tasks.filter(t=>(t.depends_on||[]).length);
 const alerts=tasks.filter(t=>['blocked','failed'].includes(t.status)||(t.due_date&&t.due_date<new Date(Date.now()+8*3600000).toISOString().slice(0,10)&&!['approved','cancelled'].includes(t.status))||(t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now()));
 section.innerHTML='<header class="wr-heading"><div><span>DEPARTMENT WORKROOM</span><h3>'+ (all?'全公司工作總覽':'即時工作概況')+'</h3><p>狀態來自實際回報 · 人物走動為空間示意</p></div><button type="button" data-workroom-refresh>'+ (pending?'讀取中…':'更新狀態')+'</button></header>'+
 '<dl class="wr-overview">'+[['work','工作中'],['wait','等待中'],['done','已完成'],['attention','需處理']].map(([key,label])=>'<div data-kind="'+key+'"><dt>'+label+'</dt><dd>'+m.count[key]+'<small>項</small></dd></div>').join('')+'</dl><p class="wr-caption">計數為排程角色與已載入任務各自的狀態，並非人數。'+(snapshot?.limited?'顯示最近 24 筆任務；完整清單請至任務中心。':'')+'</p>'+
 '<h4>誰在做什麼</h4><div class="wr-people">'+(items.map(roleCard).join('')||'<p class="wr-empty">尚未對應</p>')+'</div>'+
 '<section class="wr-section"><h4>工作流程 <small>目前步驟與交接</small></h4>'+(flow.map(taskButton).join('')||'<p class="wr-empty">'+(snapshot?.error?'任務資料尚未取得。':snapshot?'目前沒有待辦任務。':'尚未載入任務資料。')+'</p>')+(handoffs.length?'<details><summary>跨部門交接 · '+handoffs.length+' 件</summary>'+handoffs.map(t=>'<p><b>'+esc(t.title)+'</b> ← '+esc(t.depends_on.map(x=>tasks.find(a=>a.id===x)?.title||'前置任務 '+x).join('、'))+'</p>').join('')+'<p>只顯示實際建立的依賴關係；未指定的下一部門不推測。</p></details>':'<p class="wr-caption">尚無指定的下一個交接部門。</p>')+'</section>'+
 '<section class="wr-section"><h4>交付成果 <small>更新內容與紀錄</small></h4>'+(outputs.map(t=>'<details><summary>'+esc(t.title)+' · '+esc(names[t.status])+'</summary><p>紀錄更新 '+esc(stamp(t.updated_at))+'；這不是資料本身的日期。</p><article class="wr-result">'+esc(String(t.result).slice(0,8000))+'</article>'+taskButton(t)+'</details>').join('')||'<p class="wr-empty">尚未提交任務成果。排程產出請展開上方「工作步驟與成果」。</p>')+'<p class="wr-caption">資料日期以成果原文為準；未回報時不推算。</p></section>'+
 '<section class="wr-section"><h4>效率觀察 <small>以實際紀錄計算</small></h4><dl class="wr-metrics">'+metric('準時完成率',percent(m.ontime),m.ontimeSample+' 件有期限且已驗收的任務')+metric('成功率',percent(m.success),m.sample+' 筆已結束步驟與已驗收／失敗任務')+metric('平均步驟耗時',secs(m.average),'有起訖或耗時的步驟')+metric('平均領取等待',secs(m.waiting),'任務建立至首次領取')+'</dl><p class="wr-caption">統計限目前載入紀錄；不同工作複雜度不同，不以單一分數排名。</p></section>'+
 '<section class="wr-section"><h4>異常提醒 <small>先看原因，再決定處理</small></h4>'+items.filter(r=>['warn','stuck'].includes(r.status)).map(r=>'<p class="wr-alert"><b>'+esc(r.name)+'</b> · '+esc(r.reason||r.current||r.statusText)+'</p>').join('')+alerts.map(t=>'<div class="wr-alert">'+taskButton(t)+'<p>'+esc(t.blocker||t.feedback||(t.status==='running'?'執行回報逾期，請確認執行端。':'期限已過或需人工確認。'))+'</p><small>重新領取 '+Math.max(0,(t.attempts||0)-1)+' 次</small></div>').join('')+(!alerts.length&&!items.some(r=>['warn','stuck'].includes(r.status))?'<p class="wr-empty">已載入紀錄中沒有待處理異常。</p>':'')+'<p class="wr-caption">未回報預期資料日期時，無法判斷資料延遲；工作心跳逾時另行標示。</p></section>'+
 '<section class="wr-section"><h4>成本管理 <small>不額外呼叫 AI 計算這些數字</small></h4><dl class="wr-metrics">'+metric('已回報費用',m.aiCount?'US$ '+m.cost.toFixed(3):(tasks.some(t=>t.execution==='agent'||t.cost_uncertain)?'費用未知（週用量）':'尚無紀錄'),m.costUncertain?'包含未確認費用的保守估計':'依執行端回報')+metric('Grok／Agent 週用量',tasks.some(t=>t.usage_week!=null&&t.usage_week!=='')?tasks.filter(t=>t.usage_week!=null&&t.usage_week!=='').map(t=>String(t.usage_week)).join('、'):'週用量未知','與美元費用分開列示，無資料時不推算')+metric('執行中保留',m.aiCount?'US$ '+m.reserved.toFixed(3):'—','保留額度不等同實際花費')+metric('任務預算合計',m.aiCount?'US$ '+m.budget.toFixed(2):'—','目前載入的 AI 任務')+metric('重新領取',m.retries+' 次','不代表全部都是錯誤重試')+'</dl><details><summary>節省成本與執行原則</summary><p>沿用排程與任務紀錄；只在開啟工作室時讀取，短時間重開使用快取。AI 任務沿用既有預算與執行次數上限，超限由管理者處理。</p><p>模型名稱、token 與每件驗收成本，待執行端提供對應明細後呈現。此介面不會自動更換模型、啟動排程或付費服務。</p></details></section>'+
 '<footer class="wr-caption">'+(snapshot?.error?esc(snapshot.error):snapshot?'任務資料更新 '+esc(stamp(snapshot.at)):'任務資料尚未讀取。')+'</footer>';
 section.querySelector('[data-workroom-refresh]').onclick=()=>requestData(id,true);
 section.querySelectorAll('[data-workroom-task]').forEach(b=>b.onclick=()=>{send({type:'foresight-office-open-task',id:b.dataset.workroomTask});document.querySelector('#officeExploreDialog').close();});
 content.append(section);section.querySelectorAll('details').forEach((e,i)=>e.open=!!opened[i]);
 section.querySelector('[data-workroom-refresh]').disabled=pending;
 const footer=content.querySelector('.profile-footer');if(footer)footer.textContent=id===0?'總管是既有排程協調角色，不代表執行長或總經理已自動化。':'此處彙整排程與任務回報；人物動作不代表已領取或完成任務。';
}
function requestData(id,force=false){if(parent===window)return;const snap=snapshots.get(id);const ttl=(!snap||(snap.tasks&&snap.tasks.length)||snap.error)?30000:2000;if(!force&&snap&&Date.now()-snap.received<ttl)return;const seq=++request;inflight.set(seq,id);pending=true;send({type:'foresight-office-workroom-request',department:id,request:seq,force});emitActivity();decorate();render();}
function preloadOverview(force=false){if(parent===window)return;requestData(19,force);}
function snapshotFor(id){const own=snapshots.get(id);if(own)return own;const all=snapshots.get(19);if(!all||id===19)return all;return {...all,tasks:(all.tasks||[]).filter(t=>t.department===id)};}
addEventListener('message',event=>{
 if(parent===window||event.source!==parent||(event.origin!==location.origin&&!(location.protocol==='file:'&&['null','file://'].includes(event.origin))))return;
 const msg=event.data;if(!msg)return;
 if(msg.type==='foresight-office-workroom-invalidated'){snapshots.delete(msg.department);snapshots.delete(19);emitActivity();if(document.querySelector('#officeExploreDialog').open&&(lastDepartment===msg.department||lastDepartment===19))requestData(lastDepartment,true);}
 if(msg.type==='foresight-office-departments'&&Array.isArray(msg.roles)){
  roles=msg.roles.filter(r=>r&&permitted[r.key]===r.department);decorate();render();
  emitActivity();
 preloadOverview();
 }
 if(msg.type==='foresight-office-workroom'&&inflight.has(msg.request)){inflight.delete(msg.request);pending=inflight.size>0;snapshots.set(msg.department,{...msg.snapshot,received:Date.now()});emitActivity();decorate();render();}
});
new MutationObserver(()=>{const content=document.querySelector('#exploreContent');if(content.querySelector('.profile-heading')&&!content.querySelector('.live-department-roles')){lastDepartment=ForesightOffice.selectedDepartment;render();requestData(lastDepartment);}}).observe(document.querySelector('#exploreContent'),{childList:true});
let visible=true;
addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='foresight-office-visibility'){visible=e.data.visible===true;if(visible)preloadOverview();}});
addEventListener('foresight-office-selection',()=>{if(!document.querySelector('#officeExploreDialog')?.open)preloadOverview();});
const elapsedTimer=setInterval(()=>{if(document.hidden||!visible)return;document.querySelectorAll('[data-work-since]').forEach(e=>{if(e.dataset.workSince)e.textContent=secs(ForesightWorkroomModel.duration(e.dataset.workSince,new Date().toISOString()));});},2000);
const refreshTimer=setInterval(()=>{if(document.hidden||!visible)return;if(document.querySelector('#officeExploreDialog').open&&document.querySelector('.workroom'))requestData(ForesightOffice.selectedDepartment);else preloadOverview();},60000);
addEventListener('pagehide',()=>{clearInterval(elapsedTimer);clearInterval(refreshTimer);});
if(parent!==window)send({type:'foresight-office-ready'});
})();
