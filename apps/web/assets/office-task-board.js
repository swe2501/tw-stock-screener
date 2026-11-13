/* Department work orders: persistent records, actual executor reports, human acceptance. */
(() => {
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={queued:'待執行',running:'執行中',blocked:'卡住待處理',review:'待驗收',approved:'已驗收',cancelled:'已取消',failed:'執行失敗'};
const OFFICE_AGENT_OPTIONS=[{key:'ceo',name:'AI_stock CEO'},{key:'cto',name:'AI_stock CTO'},{key:'eng',name:'AI_stock 工程師'},{key:'qa',name:'AI_stock 測試工程師'},{key:'sec',name:'AI_stock 資安工程師'},{key:'mochi',name:'Mochi（PMO／協調）'}];
function execLabel(t){if(t.execution==='agent')return '研究室 Agent';if(t.execution==='ai')return t.executor==='grok'?'Grok':'Claude AI';return '人工執行';}
function assigneeLabel(t){const hit=OFFICE_AGENT_OPTIONS.find(a=>a.key===t.assignee);return hit?hit.name:'';}
function costCaption(t){
 const usage=t.usage_week==null||t.usage_week===''?'週用量未知':'週用量 '+t.usage_week;
 if(t.execution==='agent'||t.executor==='grok'){
  const money=(t.cost_uncertain||typeof t.cost_usd!=='number')?'費用未知（週用量）':'US$'+Number(t.cost_usd||0).toFixed(3);
  return usage+' · '+money;
 }
 if(t.execution==='ai')return '模型回報／保留費用 US$'+Number((t.cost_usd||0)+(t.reserved_usd||0)).toFixed(3)+' ／任務預算 US$'+Number(t.budget_usd||0).toFixed(2)+(t.cost_uncertain?' · 部分費用未確認，已按保留預算估計':'');
 return '';
}
function evidenceHtml(t){const items=Array.isArray(t.evidence)?t.evidence:t.evidence?[t.evidence]:[];if(!items.length)return '';return '<p class="ot-meta">證據：'+items.map(item=>/^https?:\/\//i.test(String(item))?'<a href="'+esc(item)+'" target="_blank" rel="noopener noreferrer">'+esc(item)+'</a>':esc(item)).join('、')+'</p>';}
const stamp=s=>s?new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
function report(text){return String(text||'').split('\n').map(line=>/^#{1,4}\s/.test(line)?'<h4>'+esc(line.replace(/^#+\s*/,''))+'</h4>':'<p>'+esc(line||' ').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')+'</p>').join('');}
window.OfficeTaskBoard={mount(root,post){
 let snapshotAt=null,snapshotFlight=null,listTotal=0;
 const POLL_MS=60000, SNAPSHOT_TTL_MS=30000;const workroomDetails=new Map(),latestTasks=new Map();
 function remember(t){const old=latestTasks.get(t.id);if(!old||(t.revision||0)>(old.revision||0))latestTasks.set(t.id,{...t});else if((t.revision||0)===(old.revision||0))latestTasks.set(t.id,{...old,...t});return latestTasks.get(t.id);}
 function invalidateSnapshot(){snapshotAt=null;request++;snapshotFlight=null;}
 function selectDepartment(id){filter=String(id);query='';root.querySelector('[data-ot-query]').value='';root.querySelector('[data-ot-department]').value=filter;}
 let tasks=[],departments=[],worker={},dependencies={},filter='',query='',selected=null,timer=null,active=false,request=0,creatingId=null,busy=false;
 const form=document.createElement('dialog'),detail=document.createElement('dialog');form.className=detail.className='ot-dialog';document.body.append(form,detail);
 root.classList.add('ot-board');
 root.innerHTML='<div class="ot-heading"><div><small>DEPARTMENT WORK ORDERS</small><h3>部門任務中心</h3><p>任務、執行回報、成果與驗收，集中追蹤。</p></div><button type="button" data-ot-new>建立任務 ＋</button></div><p class="ot-executor" data-ot-worker role="status">讀取執行端狀態…</p><div class="ot-toolbar"><label>部門<select data-ot-department aria-label="篩選負責部門"><option value="">所有部門</option></select></label><label>搜尋<input type="search" data-ot-query placeholder="任務名稱或內容"></label><button type="button" data-ot-refresh>重新整理</button></div><p data-ot-message role="status"></p><div class="ot-summary" data-ot-summary></div><div data-ot-list></div>';
 const contentFlow=window.OfficeContentFlow?.mount(root,post,async()=>{invalidateSnapshot();await refresh();[7,24,14,0].forEach(department=>window.dispatchEvent(new CustomEvent('foresight-office-task-updated',{detail:{department}})));});
 const msg=(s,error=false)=>{const e=root.querySelector('[data-ot-message]');e.textContent=s;e.classList.toggle('ot-error',error);};
 async function call(action,extra){const result=await post(action,extra);if(!result||result.error)throw Error(result?.error||'回應異常，請稍後重試');return result;}
 function title(t){return departments.find(d=>d.id===t.department)?.name||'部門資料讀取中';}
 function render(){
  const list=tasks.filter(t=>(filter===''||String(t.department)===filter)&&(!query||[t.title,t.brief].join(' ').toLowerCase().includes(query.toLowerCase())));
  const online=worker.at&&Date.now()-Date.parse(worker.at)<150000;
  root.querySelector('[data-ot-worker]').textContent=online?'● Claude 執行端在線 · '+(worker.pause_reason==='daily_budget'?'今日執行額度已達上限，任務保留待執行':worker.current_task?'處理任務中':'等待 AI 任務')+' · 最後回報 '+stamp(worker.at):'○ Claude 執行端離線或尚未啟動；AI 任務保留在待執行，人工任務可由管理者領取。';
  root.querySelector('[data-ot-worker]').classList.toggle('is-online',!!online);
  root.querySelector('[data-ot-summary]').innerHTML=['queued','running','blocked','review','approved','cancelled','failed'].map(s=>'<span><b>'+list.filter(t=>t.status===s).length+'</b>'+state[s]+'</span>').join('');
  root.querySelector('[data-ot-list]').innerHTML=list.length?'<div class="ot-grid">'+list.map(t=>{
   const waiting=(t.depends_on||[]).some(id=>!(tasks.some(x=>x.id===id&&x.status==='approved')||dependencies[id]?.status==='approved'));
   const overdue=t.due_date&&t.due_date<day()&&!['approved','cancelled'].includes(t.status);
   const stale=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();
   return '<button type="button" class="ot-card" data-ot-id="'+esc(t.id)+'"><div><span class="ot-state is-'+t.status+'">'+state[t.status]+(stale?' · 回報中斷':'')+(overdue?' · 逾期':'')+'</span><small>'+esc(execLabel(t))+(assigneeLabel(t)?' · '+assigneeLabel(t):'')+'</small></div><h4>'+esc(t.title)+'</h4><p>'+esc(title(t))+'</p><p class="ot-step">'+esc(waiting?'等待前置任務驗收':t.current_step)+'</p><footer><span>'+esc(t.due_date?(overdue?'逾期 · ':'期限 ')+t.due_date:'未設期限')+'</span><span>'+(t.criteria?.length||t.criteria_count||0)+' 項驗收條件</span></footer></button>';
  }).join('')+'</div>':'<div class="ot-empty">尚無符合條件的任務。先建立一項任務，指定部門與交付要求。</div>';
 }
 async function refresh(){
  const seq=++request;
  try{const j=await call('admin_office_tasks_list');if(seq!==request||!root.isConnected)return;tasks=j.tasks.map(remember);listTotal=Math.max(Number(j.total)||tasks.length,tasks.length);departments=j.departments;worker=j.worker||{};dependencies=j.dependencies||{};
   const options=root.querySelector('[data-ot-department]');options.innerHTML='<option value="">所有部門</option>'+departments.filter(d=>d.enabled).map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join('');options.value=filter;
   snapshotAt=Date.now();
   render();msg('更新時間 '+stamp(new Date().toISOString())+(listTotal>tasks.length?' · 任務列表未完整（已載入 '+tasks.length+'／'+listTotal+' 筆）':''));return true;
   
  }catch(e){if(seq===request)msg(e.message,true);return false;}
 }
 function create(department,parent){
  if(!departments.length){msg('請等待部門資料載入後再建立任務',true);return;}
  creatingId=crypto.randomUUID();
  form.setAttribute('aria-label','建立部門任務');
  form.innerHTML='<div class="ot-dialog-head"><h3>建立部門任務</h3><button type="button" data-ot-close aria-label="關閉建立任務">×</button></div><form class="ot-form"><label>任務名稱<input name="title" maxlength="120" required></label><label>負責部門<select name="department" required>'+departments.map(d=>'<option value="'+d.id+'"'+(!d.enabled?' disabled':'')+'>'+esc(d.name)+(!d.enabled?'（停用）':'')+'</option>').join('')+'</select></label><label>任務內容與交付要求<textarea name="brief" maxlength="10000" rows="5" required placeholder="目的、範圍、資料來源、希望收到的成果"></textarea></label><label>驗收條件（每行一項，最多 12 項）<textarea name="criteria" rows="3" maxlength="3600" required placeholder="例如：每項資料附可核對來源\n列出尚未確定的事項"></textarea></label><div class="ot-form-row"><label>截止日期<input type="date" name="due_date"></label><label>執行方式<select name="execution"><option value="manual">管理者／人員執行</option><option value="ai">Claude AI 研究／草稿</option><option value="agent">研究室 Agent</option></select></label></div><label>指定執行者（部門 6 必填）<select name="assignee"><option value="">尚未指定</option>'+OFFICE_AGENT_OPTIONS.filter(a=>a.key!=='mochi').map(a=>'<option value="'+a.key+'">'+esc(a.name)+'</option>').join('')+'</select></label><label data-ot-budget hidden>此任務 AI 總預算（美元）<input type="number" name="budget_usd" min="0.05" max="10" step="0.05" value="0.50"><small>沿用已登入的 Claude。研究／草稿可自動產出，完成後由管理者驗收；不會自動部署、寄信或付款。重派沿用剩餘預算。</small></label><label>等待哪項任務驗收後再執行？<select name="dependency"><option value="">沒有前置任務</option>'+tasks.filter(t=>t.status!=='cancelled').map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+' · '+state[t.status]+'</option>').join('')+'</select></label><p data-ot-form-message role="alert"></p><button type="submit">建立並派工</button></form>';
  const f=form.querySelector('form');f.elements.department.value=String(department??parent?.department??departments.find(d=>d.enabled).id);
  if(parent){f.elements.title.value=('交接：'+parent.title).slice(0,120);f.elements.brief.value=('前置任務：'+parent.title+'\n已驗收成果：\n'+parent.result).slice(0,10000);f.elements.dependency.value=parent.id;}
  f.elements.execution.onchange=()=>form.querySelector('[data-ot-budget]').hidden=f.elements.execution.value!=='ai';
  f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=f.querySelector('[type=submit]');b.disabled=true;
   try{const d=new FormData(f);const j=await call('admin_office_tasks_create',{id:creatingId,title:d.get('title'),department:Number(d.get('department')),brief:d.get('brief'),criteria:String(d.get('criteria')).split('\n').map(x=>x.trim()).filter(Boolean),due_date:d.get('due_date'),execution:d.get('execution'),budget_usd:Number(d.get('budget_usd')),assignee:d.get('assignee')||undefined,depends_on:d.get('dependency')?[d.get('dependency')]:[]});form.close();await refresh();selected=j.task.id;invalidateSnapshot();window.dispatchEvent(new CustomEvent('foresight-office-task-updated',{detail:{department:j.task.department}}));openDetail(j.task);}
   catch(err){form.querySelector('[data-ot-form-message]').textContent=err.message;}finally{busy=false;b.disabled=false;}
  };
  form.showModal();
 }
 function renderDetail(t){
  selected=t.id;detail.setAttribute('aria-label',t.title+' 任務詳情');
  const expired=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();
  const actions=[];
  if(t.status==='queued'&&t.execution==='manual')actions.push(['claim','領取並開始']);
  if(t.status==='running'&&t.execution==='manual')actions.push(['progress','回報進度'],['block','回報卡點'],['submit','提交成果驗收']);
  if(expired)actions.push(['recover','標記執行端中斷']);
  if(['blocked','failed','review'].includes(t.status))actions.push(['retry',t.status==='review'?'退回修改':'重新派工']);
  if(t.status==='review')actions.push(['approve','驗收通過']);
  if(!['approved','cancelled'].includes(t.status))actions.push(['cancel','取消任務']);
  detail.innerHTML='<div class="ot-dialog-head"><div><small>'+esc(title(t))+' · '+state[t.status]+'</small><h3>'+esc(t.title)+'</h3></div><button type="button" data-ot-close aria-label="關閉任務詳情">×</button></div><div class="ot-detail"><p class="ot-meta">'+esc(execLabel(t))+(assigneeLabel(t)?' · '+assigneeLabel(t):'')+' · 建立 '+stamp(t.created_at)+' · 期限 '+esc(t.due_date||'未設定')+'</p><h4>任務要求</h4><p class="ot-pre">'+esc(t.brief)+'</p><h4>執行回報</h4><p class="ot-pre">'+esc(t.current_step)+'</p>'+(t.blocker?'<p class="ot-blocker">'+esc(t.blocker)+'</p>':'')+(t.feedback?'<p class="ot-pre">上次退回：'+esc(t.feedback)+'</p>':'')+'<h4>驗收條件</h4><div data-ot-checks>'+t.criteria.map((c,i)=>'<label class="ot-check"><input type="checkbox" value="'+i+'"'+(t.checks[i]?' checked':'')+(t.status!=='review'?' disabled':'')+'>'+esc(c)+'</label>').join('')+'</div>'+(t.depends_on?.length?'<h4>前置任務</h4><ul>'+t.depends_on.map(id=>'<li>'+esc(tasks.find(x=>x.id===id)?.title||dependencies[id]?.title||id)+' · '+esc(state[tasks.find(x=>x.id===id)?.status||dependencies[id]?.status]||'未載入')+'</li>').join('')+'</ul>':'')+'<h4>交付成果</h4>'+(t.result?'<article class="ot-result">'+report(t.result)+'</article>':'<p class="ot-muted">尚未提交成果。</p>')+((t.execution==='ai'||t.execution==='agent')?'<p class="ot-meta">'+esc(costCaption(t)+(t.attempts!=null?' · 已領取 '+t.attempts+' 次':''))+'</p>':'')+evidenceHtml(t)+(t.status==='running'&&t.execution==='manual'?'<label>交付內容<textarea data-ot-result rows="7" maxlength="40000">'+esc(t.result)+'</textarea></label>':'')+(['approved','cancelled'].includes(t.status)?'':'<label>進度、卡點或退回原因<textarea data-ot-note rows="3" maxlength="2000"></textarea></label>')+'<div class="ot-actions"><button type="button" data-ot-reload>重新載入</button>'+actions.map(([op,name])=>'<button type="button" data-ot-operation="'+op+'">'+name+'</button>').join('')+(t.status==='approved'?'<button type="button" data-ot-handoff>交接給下一部門</button>':'')+'</div><p data-ot-detail-message role="alert"></p><h4>任務紀錄</h4><ol class="ot-history">'+(t.history||[]).slice().reverse().map(h=>'<li><time>'+stamp(h.at)+'</time><b>'+esc(state[h.status])+'</b><p>'+esc(h.message)+'</p></li>').join('')+'</ol></div>';
  detail.querySelector('[data-ot-reload]').onclick=()=>loadDetail(t.id);
  detail.querySelectorAll('[data-ot-operation]').forEach(b=>b.onclick=()=>update(t,b.dataset.otOperation));
  const handoff=detail.querySelector('[data-ot-handoff]');if(handoff)handoff.onclick=()=>{detail.close();create(undefined,t);};
 }
 async function loadDetail(id){try{const j=await call('admin_office_tasks_get',{id});if(j.task?.id!==id)throw Error('任務回應不符');const t=remember(j.task);tasks=tasks.map(x=>latestTasks.get(x.id)||x);selectDepartment(t.department);render();openDetail(t);}catch(e){if(detail.open)detail.querySelector('[data-ot-detail-message]').textContent=e.message;else msg(e.message,true);}}
 function openDetail(t){renderDetail(t);if(!detail.open)detail.showModal();}
 async function update(t,operation){
  if(busy)return;
  const note=detail.querySelector('[data-ot-note]')?.value||'',result=detail.querySelector('[data-ot-result]')?.value||'';
  busy=true;detail.querySelectorAll('.ot-actions button').forEach(b=>b.disabled=true);
  try{const j=await call('admin_office_tasks_update',{id:t.id,revision:t.revision,operation,note,result,checks:[...detail.querySelectorAll('[data-ot-checks] input')].map(e=>e.checked)});const current=remember(j.task);tasks=tasks.map(x=>x.id===current.id?current:x);invalidateSnapshot();window.dispatchEvent(new CustomEvent('foresight-office-task-updated',{detail:{department:j.task.department}}));render();renderDetail(current);}
  catch(e){detail.querySelector('[data-ot-detail-message]').textContent=e.message;detail.querySelectorAll('.ot-actions button').forEach(b=>b.disabled=false);}finally{busy=false;}
 }
 root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ot-new'))create();else if(b.hasAttribute('data-ot-refresh'))refresh();else if(b.dataset.otId){const t=tasks.find(t=>t.id===b.dataset.otId);if(t)loadDetail(t.id);}};
 root.querySelector('[data-ot-department]').onchange=e=>{filter=e.target.value;render();};root.querySelector('[data-ot-query]').oninput=e=>{query=e.target.value;render();};
 [form,detail].forEach(d=>d.onclick=e=>{if(e.target.closest('[data-ot-close]'))d.close();});
 return {open:loadDetail,async snapshot(department,force=false){
   if(force||snapshotAt===null||Date.now()-snapshotAt>=SNAPSHOT_TTL_MS){
    if(!snapshotFlight){const flight=refresh().finally(()=>{if(snapshotFlight===flight)snapshotFlight=null;});snapshotFlight=flight;}
    if(!await snapshotFlight)return {tasks:[],error:'任務資料暫時無法讀取，請稍後更新。',at:''};

   }
   // The list API already returns all available summaries (up to 200). Only expensive
   // detail reads are capped at 24; badges must never be derived from that detail slice.
   const summaries=tasks.slice(),total=listTotal,list=summaries.filter(t=>department==null||t.department===department),detailed=[];
   for(let i=0;i<Math.min(list.length,24);i+=3){
    const batch=await Promise.all(list.slice(i,i+3).map(async t=>{
     try{const current=remember(t),cached=workroomDetails.get(t.id);if(cached&&(cached.revision||0)>=(current.revision||0))return cached;
      const detail=(await call('admin_office_tasks_get',{id:t.id})).task;
      if(detail?.id!==t.id||detail.department!==t.department)throw Error('任務回應不符');
      if((detail.revision||0)<(current.revision||0))return {...current,detailsUnavailable:true};
      const newest=remember(detail),safe={...newest,detailsUnavailable:false,result:String(newest.result||'').slice(0,8000),history:(newest.history||[]).slice(-100)};
      workroomDetails.set(t.id,safe);return safe;
     }catch(_){return {...remember(t),detailsUnavailable:true};}
    }));detailed.push(...batch);
   }
   tasks=tasks.map(t=>latestTasks.get(t.id)||t);render();
   const summaryKeys=['id','title','department','execution','due_date','created_at','updated_at','revision','status','current_step','lease_until','assignee'];
   const summaryRows=summaries.map(t=>{const current=remember(t);return Object.fromEntries(summaryKeys.filter(k=>k in current).map(k=>[k,current[k]]));});
   return {tasks:detailed,summaries:summaryRows,summaryScope:'all',countsLimited:total>summaries.length,listTotal:total,listLoaded:summaries.length,total:list.length,limited:list.length>24,worker:{at:worker.at||'',pause_reason:worker.pause_reason||''},at:new Date().toISOString()};
  },async department(id){selectDepartment(id);if(!departments.length)await refresh();root.querySelector('[data-ot-department]').value=filter;render();},show(){active=true;refresh();if(!timer)timer=setInterval(()=>{if(active&&!document.hidden&&!form.open&&!detail.open&&(snapshotAt===null||Date.now()-snapshotAt>=SNAPSHOT_TTL_MS))refresh();},POLL_MS);},hide(){active=false;clearInterval(timer);timer=null;},async create(department){if(!departments.length)await refresh();create(department);},destroy(){contentFlow?.destroy();active=false;request++;workroomDetails.clear();latestTasks.clear();clearInterval(timer);form.close();detail.close();form.remove();detail.remove();}};
}};
})();
