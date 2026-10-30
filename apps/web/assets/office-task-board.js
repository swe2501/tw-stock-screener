/* Department work orders: persistent records, actual executor reports, human acceptance. */
(() => {
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={queued:'待執行',running:'執行中',blocked:'卡住待處理',review:'待驗收',approved:'已驗收',cancelled:'已取消',failed:'執行失敗'};
const stamp=s=>s?new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
function report(text){return String(text||'').split('\n').map(line=>/^#{1,4}\s/.test(line)?'<h4>'+esc(line.replace(/^#+\s*/,''))+'</h4>':'<p>'+esc(line||' ').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')+'</p>').join('');}
window.OfficeTaskBoard={mount(root,post){
 let tasks=[],departments=[],worker={},dependencies={},filter='',query='',selected=null,timer=null,active=false,request=0,creatingId=null,busy=false;
 const form=document.createElement('dialog'),detail=document.createElement('dialog');form.className=detail.className='ot-dialog';document.body.append(form,detail);
 root.classList.add('ot-board');
 root.innerHTML='<div class="ot-heading"><div><small>DEPARTMENT WORK ORDERS</small><h3>部門任務中心</h3><p>任務、執行回報、成果與驗收，集中追蹤。</p></div><button type="button" data-ot-new>建立任務 ＋</button></div><p class="ot-executor" data-ot-worker role="status">讀取執行端狀態…</p><div class="ot-toolbar"><label>部門<select data-ot-department aria-label="篩選負責部門"><option value="">所有部門</option></select></label><label>搜尋<input type="search" data-ot-query placeholder="任務名稱或內容"></label><button type="button" data-ot-refresh>重新整理</button></div><p data-ot-message role="status"></p><div class="ot-summary" data-ot-summary></div><div data-ot-list></div>';
 const msg=(s,error=false)=>{const e=root.querySelector('[data-ot-message]');e.textContent=s;e.classList.toggle('ot-error',error);};
 async function call(action,extra){const result=await post(action,extra);if(!result||result.error)throw Error(result?.error||'回應異常，請稍後重試');return result;}
 function title(t){return departments.find(d=>d.id===t.department)?.name||'部門資料讀取中';}
 function render(){
  const list=tasks.filter(t=>(filter===''||String(t.department)===filter)&&(!query||[t.title,t.brief].join(' ').toLowerCase().includes(query.toLowerCase())));
  const online=worker.at&&Date.now()-Date.parse(worker.at)<150000;
  root.querySelector('[data-ot-worker]').textContent=online?'● Claude 執行端在線 · '+(worker.pause_reason==='daily_budget'?'今日執行額度已達上限，任務保留待執行':worker.current_task?'處理任務中':'等待 AI 任務')+' · 最後回報 '+stamp(worker.at):'○ Claude 執行端離線或尚未啟動；AI 任務保留在待執行，人工任務可由管理者領取。';
  root.querySelector('[data-ot-worker]').classList.toggle('is-online',!!online);
  root.querySelector('[data-ot-summary]').innerHTML=['queued','running','blocked','review','approved','failed'].map(s=>'<span><b>'+list.filter(t=>t.status===s).length+'</b>'+state[s]+'</span>').join('');
  root.querySelector('[data-ot-list]').innerHTML=list.length?'<div class="ot-grid">'+list.map(t=>{
   const waiting=(t.depends_on||[]).some(id=>!(tasks.some(x=>x.id===id&&x.status==='approved')||dependencies[id]?.status==='approved'));
   const overdue=t.due_date&&t.due_date<day()&&!['approved','cancelled'].includes(t.status);
   const stale=t.status==='running'&&t.execution==='ai'&&Date.parse(t.lease_until)<Date.now();
   return '<button type="button" class="ot-card" data-ot-id="'+esc(t.id)+'"><div><span class="ot-state is-'+t.status+'">'+state[t.status]+(stale?' · 回報中斷':'')+'</span><small>'+esc(t.execution==='ai'?'Claude AI':'人工執行')+'</small></div><h4>'+esc(t.title)+'</h4><p>'+esc(title(t))+'</p><p class="ot-step">'+esc(waiting?'等待前置任務驗收':t.current_step)+'</p><footer><span>'+esc(t.due_date?(overdue?'逾期 · ':'期限 ')+t.due_date:'未設期限')+'</span><span>'+(t.criteria?.length||t.criteria_count||0)+' 項驗收條件</span></footer></button>';
  }).join('')+'</div>':'<div class="ot-empty">尚無符合條件的任務。先建立一項任務，指定部門與交付要求。</div>';
 }
 async function refresh(){
  const seq=++request;
  try{const j=await call('admin_office_tasks_list');if(seq!==request||!root.isConnected)return;tasks=j.tasks;departments=j.departments;worker=j.worker||{};dependencies=j.dependencies||{};
   const options=root.querySelector('[data-ot-department]');options.innerHTML='<option value="">所有部門</option>'+departments.filter(d=>d.enabled).map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join('');options.value=filter;
   render();msg('更新時間 '+stamp(new Date().toISOString()));
   
  }catch(e){if(seq===request)msg(e.message,true);}
 }
 function create(department,parent){
  if(!departments.length){msg('請等待部門資料載入後再建立任務',true);return;}
  creatingId=crypto.randomUUID();
  form.setAttribute('aria-label','建立部門任務');
  form.innerHTML='<div class="ot-dialog-head"><h3>建立部門任務</h3><button type="button" data-ot-close aria-label="關閉建立任務">×</button></div><form class="ot-form"><label>任務名稱<input name="title" maxlength="120" required></label><label>負責部門<select name="department" required>'+departments.map(d=>'<option value="'+d.id+'"'+(!d.enabled?' disabled':'')+'>'+esc(d.name)+(!d.enabled?'（停用）':'')+'</option>').join('')+'</select></label><label>任務內容與交付要求<textarea name="brief" maxlength="10000" rows="5" required placeholder="目的、範圍、資料來源、希望收到的成果"></textarea></label><label>驗收條件（每行一項，最多 12 項）<textarea name="criteria" rows="3" maxlength="3600" required placeholder="例如：每項資料附可核對來源\n列出尚未確定的事項"></textarea></label><div class="ot-form-row"><label>截止日期<input type="date" name="due_date"></label><label>執行方式<select name="execution"><option value="manual">管理者／人員執行</option><option value="ai">Claude AI 研究／草稿</option></select></label></div><label data-ot-budget hidden>此任務 AI 總預算（美元）<input type="number" name="budget_usd" min="0.05" max="10" step="0.05" value="0.50"><small>沿用已登入的 Claude。研究／草稿可自動產出，完成後由管理者驗收；不會自動部署、寄信或付款。重派沿用剩餘預算。</small></label><label>等待哪項任務驗收後再執行？<select name="dependency"><option value="">沒有前置任務</option>'+tasks.filter(t=>t.status!=='cancelled').map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+' · '+state[t.status]+'</option>').join('')+'</select></label><p data-ot-form-message role="alert"></p><button type="submit">建立並派工</button></form>';
  const f=form.querySelector('form');f.elements.department.value=String(department??parent?.department??departments.find(d=>d.enabled).id);
  if(parent){f.elements.title.value=('交接：'+parent.title).slice(0,120);f.elements.brief.value=('前置任務：'+parent.title+'\n已驗收成果：\n'+parent.result).slice(0,10000);f.elements.dependency.value=parent.id;}
  f.elements.execution.onchange=()=>form.querySelector('[data-ot-budget]').hidden=f.elements.execution.value!=='ai';
  f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=f.querySelector('[type=submit]');b.disabled=true;
   try{const d=new FormData(f);const j=await call('admin_office_tasks_create',{id:creatingId,title:d.get('title'),department:Number(d.get('department')),brief:d.get('brief'),criteria:String(d.get('criteria')).split('\n').map(x=>x.trim()).filter(Boolean),due_date:d.get('due_date'),execution:d.get('execution'),budget_usd:Number(d.get('budget_usd')),depends_on:d.get('dependency')?[d.get('dependency')]:[]});form.close();await refresh();selected=j.task.id;openDetail(j.task);}
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
  detail.innerHTML='<div class="ot-dialog-head"><div><small>'+esc(title(t))+' · '+state[t.status]+'</small><h3>'+esc(t.title)+'</h3></div><button type="button" data-ot-close aria-label="關閉任務詳情">×</button></div><div class="ot-detail"><p class="ot-meta">'+(t.execution==='ai'?'Claude AI 研究／草稿':'人工執行')+' · 建立 '+stamp(t.created_at)+' · 期限 '+esc(t.due_date||'未設定')+'</p><h4>任務要求</h4><p class="ot-pre">'+esc(t.brief)+'</p><h4>執行回報</h4><p class="ot-pre">'+esc(t.current_step)+'</p>'+(t.blocker?'<p class="ot-blocker">'+esc(t.blocker)+'</p>':'')+(t.feedback?'<p class="ot-pre">上次退回：'+esc(t.feedback)+'</p>':'')+'<h4>驗收條件</h4><div data-ot-checks>'+t.criteria.map((c,i)=>'<label class="ot-check"><input type="checkbox" value="'+i+'"'+(t.checks[i]?' checked':'')+(t.status!=='review'?' disabled':'')+'>'+esc(c)+'</label>').join('')+'</div>'+(t.depends_on?.length?'<h4>前置任務</h4><ul>'+t.depends_on.map(id=>'<li>'+esc(tasks.find(x=>x.id===id)?.title||dependencies[id]?.title||id)+' · '+esc(state[tasks.find(x=>x.id===id)?.status||dependencies[id]?.status]||'未載入')+'</li>').join('')+'</ul>':'')+'<h4>交付成果</h4>'+(t.result?'<article class="ot-result">'+report(t.result)+'</article>':'<p class="ot-muted">尚未提交成果。</p>')+(t.execution==='ai'?'<p class="ot-meta">模型回報／保留費用 US$'+Number(t.cost_usd+t.reserved_usd).toFixed(3)+' ／任務預算 US$'+Number(t.budget_usd).toFixed(2)+' · 已領取 '+t.attempts+' 次'+(t.cost_uncertain?' · 部分費用未確認，已按保留預算估計':'')+'</p>':'')+(t.status==='running'&&t.execution==='manual'?'<label>交付內容<textarea data-ot-result rows="7" maxlength="40000">'+esc(t.result)+'</textarea></label>':'')+(['approved','cancelled'].includes(t.status)?'':'<label>進度、卡點或退回原因<textarea data-ot-note rows="3" maxlength="2000"></textarea></label>')+'<div class="ot-actions"><button type="button" data-ot-reload>重新載入</button>'+actions.map(([op,name])=>'<button type="button" data-ot-operation="'+op+'">'+name+'</button>').join('')+(t.status==='approved'?'<button type="button" data-ot-handoff>交接給下一部門</button>':'')+'</div><p data-ot-detail-message role="alert"></p><h4>任務紀錄</h4><ol class="ot-history">'+(t.history||[]).slice().reverse().map(h=>'<li><time>'+stamp(h.at)+'</time><b>'+esc(state[h.status])+'</b><p>'+esc(h.message)+'</p></li>').join('')+'</ol></div>';
  detail.querySelector('[data-ot-reload]').onclick=()=>loadDetail(t.id);
  detail.querySelectorAll('[data-ot-operation]').forEach(b=>b.onclick=()=>update(t,b.dataset.otOperation));
  const handoff=detail.querySelector('[data-ot-handoff]');if(handoff)handoff.onclick=()=>{detail.close();create(undefined,t);};
 }
 async function loadDetail(id){try{const j=await call('admin_office_tasks_get',{id});openDetail(j.task);}catch(e){if(detail.open)detail.querySelector('[data-ot-detail-message]').textContent=e.message;else msg(e.message,true);}}
 function openDetail(t){renderDetail(t);if(!detail.open)detail.showModal();}
 async function update(t,operation){
  if(busy)return;
  const note=detail.querySelector('[data-ot-note]')?.value||'',result=detail.querySelector('[data-ot-result]')?.value||'';
  busy=true;detail.querySelectorAll('.ot-actions button').forEach(b=>b.disabled=true);
  try{const j=await call('admin_office_tasks_update',{id:t.id,revision:t.revision,operation,note,result,checks:[...detail.querySelectorAll('[data-ot-checks] input')].map(e=>e.checked)});tasks=tasks.map(x=>x.id===j.task.id?j.task:x);render();renderDetail(j.task);}
  catch(e){detail.querySelector('[data-ot-detail-message]').textContent=e.message;detail.querySelectorAll('.ot-actions button').forEach(b=>b.disabled=false);}finally{busy=false;}
 }
 root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ot-new'))create();else if(b.hasAttribute('data-ot-refresh'))refresh();else if(b.dataset.otId){const t=tasks.find(t=>t.id===b.dataset.otId);if(t)loadDetail(t.id);}};
 root.querySelector('[data-ot-department]').onchange=e=>{filter=e.target.value;render();};root.querySelector('[data-ot-query]').oninput=e=>{query=e.target.value;render();};
 [form,detail].forEach(d=>d.onclick=e=>{if(e.target.closest('[data-ot-close]'))d.close();});
 return {async department(id){filter=String(id);if(!departments.length)await refresh();root.querySelector("[data-ot-department]").value=filter;render();},show(){active=true;refresh();if(!timer)timer=setInterval(()=>{if(active&&!document.hidden&&!form.open&&!detail.open)refresh();},15000);},hide(){active=false;clearInterval(timer);timer=null;},async create(department){if(!departments.length)await refresh();create(department);},destroy(){active=false;request++;clearInterval(timer);form.close();detail.close();form.remove();detail.remove();}};
}};
})();
