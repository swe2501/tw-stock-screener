/* Deterministic metrics from recorded events; no model calls or inferred work. */
(function(root){
'use strict';
const millis=s=>{const n=Date.parse(s);return Number.isFinite(n)?n:null;};
const duration=(a,b)=>{const x=millis(a),y=millis(b);return x!=null&&y!=null&&y>=x?(y-x)/1000:null;};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
// Shared task-only classification for directory, rooms and workroom counters.
// Preserve existing running/overdue and AI-lease policy; this is not an executor change.
function taskState(t,now=Date.now()){
 if(['approved','cancelled'].includes(t.status))return 'done';
 const interrupted=t.status==='running'&&t.execution==='ai'&&millis(t.lease_until)!=null&&millis(t.lease_until)<now;
 if(t.status==='running'&&!interrupted)return 'work';
 const overdue=t.due_date&&t.due_date<new Date(now+8*3600000).toISOString().slice(0,10);
 if(overdue||interrupted||['blocked','failed'].includes(t.status)||!['queued','review'].includes(t.status))return 'stuck';
 return t.status;
}
function taskStats(tasks,id,now=Date.now()){
 const count={work:0,stuck:0,queued:0,review:0,done:0,total:0};
 tasks.forEach(t=>{if(id!=null&&t.department!==id)return;count[taskState(t,now)]++;count.total++;});
 return {...count,wait:count.queued+count.review};
}
function taskBadge(stats,roles=[],meta={}){
 const parts=[['work','工作中'],['stuck','需處理'],['queued','待執行'],['review','待驗收']].filter(([key])=>stats[key]).map(([key,label])=>label+' '+stats[key]);
 if(!parts.length)parts.push(stats.done?'已結束 '+stats.done:meta.incomplete?'任務列表未完整':meta.loading?'載入中':meta.error?'載入失敗':'無任務');
 if(roles.length){const active=roles.filter(r=>r.status==='work').length;parts.push('舊排程 '+roles.length+' 組'+(active?'（工作中 '+active+' 組）':''));}
 if(meta.incomplete&&parts[0]!=='任務列表未完整')parts.push('列表未完整');
 if(meta.error&&parts[0]!=='載入失敗')parts.push('載入失敗（保留上次資料）');
 return parts.join(' · ');
}
function metrics(roles,tasks,now=Date.now()){
 const steps=roles.flatMap(r=>Array.isArray(r.steps)?r.steps:[]),finished=steps.filter(s=>millis(s.end)!=null&&typeof s.ok==='boolean');
 const terminal=tasks.filter(t=>['approved','failed'].includes(t.status));
 const interrupted=t=>t.status==='running'&&t.execution==='ai'&&millis(t.lease_until)!=null&&millis(t.lease_until)<now;
 const known=['queued','running','blocked','review','failed','approved','cancelled'];
 const today=new Date(now+8*3600000).toISOString().slice(0,10);
 const overdue=t=>!!(t.due_date&&t.due_date<today&&!['approved','cancelled'].includes(t.status));
 const needsAttention=t=>['blocked','failed'].includes(t.status)||interrupted(t)||overdue(t)||!known.includes(t.status);
 const count={work:roles.filter(r=>r.status==='work').length+tasks.filter(t=>t.status==='running'&&!interrupted(t)&&!overdue(t)).length,wait:roles.filter(r=>r.status==='idle').length+tasks.filter(t=>['queued','review'].includes(t.status)&&!overdue(t)).length,done:roles.filter(r=>r.status==='done').length+tasks.filter(t=>t.status==='approved').length,attention:roles.filter(r=>['stuck','warn'].includes(r.status)).length+tasks.filter(needsAttention).length};
 const timed=finished.map(s=>typeof s.secs==='number'&&s.secs>=0?s.secs:duration(s.start,s.end)).filter(x=>x!=null);
 const waits=[],ontime=[];
 for(const t of tasks){const h=t.history||[],start=h.find(x=>x.status==='running'),end=h.filter(x=>x.status==='approved').at(-1);
  const w=duration(t.created_at,start?.at);if(w!=null)waits.push(w);
  if(t.due_date&&end&&millis(end.at)!=null){const local=new Date(millis(end.at)+8*3600000).toISOString().slice(0,10);ontime.push(local<=t.due_date);}
 }
 const ai=tasks.filter(t=>t.execution==='ai'),number=(t,k)=>typeof t[k]==='number'&&Number.isFinite(t[k])&&t[k]>=0?t[k]:0;
 return {count,taskCounts:taskStats(tasks,null,now),scheduledRoles:roles.filter(r=>!r.mapped).length,success:finished.length+terminal.length?(finished.filter(s=>s.ok).length+terminal.filter(t=>t.status==='approved').length)/(finished.length+terminal.length):null,sample:finished.length+terminal.length,average:avg(timed),waiting:avg(waits),ontime:ontime.length?ontime.filter(Boolean).length/ontime.length:null,ontimeSample:ontime.length,cost:ai.reduce((n,t)=>n+number(t,'cost_usd'),0),reserved:ai.reduce((n,t)=>n+number(t,'reserved_usd'),0),budget:ai.reduce((n,t)=>n+number(t,'budget_usd'),0),aiCount:ai.length,costUncertain:ai.some(t=>t.cost_uncertain),retries:tasks.reduce((n,t)=>n+Math.max(0,number(t,'attempts')-1),0),now};
}
root.ForesightWorkroomModel={metrics,duration,taskState,taskStats,taskBadge};if(typeof module!=='undefined')module.exports=root.ForesightWorkroomModel;
})(typeof window==='undefined'?globalThis:window);
