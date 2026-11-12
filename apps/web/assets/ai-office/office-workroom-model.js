/* Deterministic metrics from recorded events; no model calls or inferred work. */
(function(root){
'use strict';
const millis=s=>{const n=Date.parse(s);return Number.isFinite(n)?n:null;};
const duration=(a,b)=>{const x=millis(a),y=millis(b);return x!=null&&y!=null&&y>=x?(y-x)/1000:null;};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
// Shared task-only classification for directory, rooms and workroom counters.
// Presentation only: never renews a lease or starts/reassigns an executor.
function taskState(t,now=Date.now()){
 if(['approved','cancelled'].includes(t.status))return 'done';
 const interrupted=t.status==='running'&&!runningConfirmed(t,now);
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
 const parts=[['work','工作中'],['stuck','需處理'],['queued','排隊中'],['review','待驗收']].filter(([key])=>stats[key]).map(([key,label])=>label+' '+stats[key]);
 if(!parts.length)parts.push(stats.done?'已結束 '+stats.done:meta.incomplete?'任務列表未完整':meta.loading?'載入中':meta.error?'載入失敗':'無任務');
 if(roles.length){const active=roles.filter(r=>r.status==='work').length;parts.push('舊排程 '+roles.length+' 組'+(active?'（工作中 '+active+' 組）':''));}
 if(meta.incomplete&&parts[0]!=='任務列表未完整')parts.push('列表未完整');
 if(meta.error&&parts[0]!=='載入失敗')parts.push('載入失敗（保留上次資料）');
 return parts.join(' · ');
}
function metrics(roles,tasks,now=Date.now()){
 const steps=roles.flatMap(r=>Array.isArray(r.steps)?r.steps:[]),finished=steps.filter(s=>millis(s.end)!=null&&typeof s.ok==='boolean');
 const terminal=tasks.filter(t=>['approved','failed'].includes(t.status));
 const interrupted=t=>t.status==='running'&&!runningConfirmed(t,now);
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

// A successful list read is fresh for at most two polls + 30s cache (150s).
// received time is deliberately NOT a source timestamp: re-reading a cache is not an update.
const STALE_AFTER_MS=150000;
function isUatOnly(value){return Number(value?.httpStatus)===403&&[value?.error,value?.message].some(s=>typeof s==='string'&&s.includes('僅在 UAT 啟用'));}
function freshness(snapshot,now=Date.now()){
 const at=millis(snapshot?.at);
 return {at,stale:!snapshot||!!snapshot.error||!!snapshot.stale||at==null||now<at||now-at>=STALE_AFTER_MS};
}
function updateLabel(snapshot,now=Date.now()){
 if(isUatOnly(snapshot))return '任務中心僅 UAT 啟用 · 本頁已停止重試';
 const f=freshness(snapshot,now),clock=f.at==null?'尚未取得':new Date(f.at).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
 return '資料最後更新時間 '+clock+'（台北）／可能延遲約 1 分鐘'+(f.stale?' · 資料過舊':'');
}
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
function runningConfirmed(t,now=Date.now()){
 if(t.execution==='manual')return nonempty(t.worker);
 return ['agent','ai'].includes(t.execution)&&nonempty(t.worker)&&millis(t.lease_until)>now;
}
// Keep opaque worker IDs anonymous; never present a member/admin identifier as a person's name.
function opaque(s){let n=2166136261;for(const c of String(s)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(16);}
const agentKeys=['ceo','cto','eng','qa','sec','mochi'];
function actorKey(t){
 if(t.execution==='manual')return 'manual:'+opaque(t.worker||t.id);
 const worker=String(t.worker||''),key=worker.replace(/^agent[-:/]/,'');
 if(agentKeys.includes(key))return 'agent:'+key;
 if(agentKeys.includes(t.assignee))return 'agent:'+t.assignee;
 if(nonempty(worker))return 'worker:'+opaque(worker);
 return 'unassigned:'+opaque(t.id);
}
// Queue type describes routing, not executor liveness or dependency readiness.
function queueType(t){
 if(t.execution==='manual')return '人工';
 if(t.execution==='agent')return 'Agent';
 if(t.execution==='ai')return t.executor==='grok'?'Grok':!t.executor||t.executor==='claude-local'?'Claude AI':'未知類型';
 return '未知類型';
}
function taskVisual(t,{stale=false}={},now=Date.now()){
 if(stale)return {kind:'stale',pose:'alert',label:'資料過舊',actor:actorKey(t)};
 const result=(kind,pose,label)=>({kind,pose,label,actor:actorKey(t)});
 if(t.status==='running'){
  if(!runningConfirmed(t,now))return result('interrupted','alert','回報中斷／待確認');
  return result(t.execution==='manual'?'manual':'work','work',t.execution==='manual'?'人工執行中':'工作中');
 }
 if(t.status==='queued')return result('queued','walk','排隊中（'+queueType(t)+' 待領） · 尚未領取／無人執行');
 if(t.status==='review')return result('review','review','待驗收');
 if(t.status==='blocked')return result('blocked','alert','卡住待處理');
 if(t.status==='failed')return result('failed','alert','執行失敗');
 if(['approved','cancelled'].includes(t.status))return result('done','walk',t.status==='approved'?'已驗收':'已取消');
 return result('interrupted','alert','回報中斷／待確認');
}
// A chair's facing is derived from its desk-local transform. A person faces local +Z;
// a desk chair faces -Z. These same descriptors drive the meshes and avatar slots.
function chairSeat(x,z,rotation=0,computer=false){return {x,y:-.04,z,rotation:rotation+Math.PI,computer};}
function deskSeat(x,z,rotation=0){return chairSeat(x+Math.sin(rotation)*.7,z+Math.cos(rotation)*.7,rotation,true);}
function transformSeat(seat,origin={x:0,z:0,rotation:0}){
 const r=origin.rotation||0;
 return {...seat,x:origin.x+seat.x*Math.cos(r)+seat.z*Math.sin(r),z:origin.z-seat.x*Math.sin(r)+seat.z*Math.cos(r),rotation:seat.rotation+r};
}
// Stable slots survive task reordering and unrelated workers arriving; one actor, one avatar.
// Task counts stay task counts even when one actor has many tasks, or no desk is available.
function roomPlan(tasks,seats=[],{snapshot,roles=[],previous={}}={},now=Date.now()){
 if(isUatOnly(snapshot))return {stale:false,unavailable:true,badge:'僅 UAT 啟用',actors:[],bindings:{},overflow:0,counts:{},updated:updateLabel(snapshot,now)};
 const f=freshness(snapshot,now),groups=new Map(),counts={},queuedTypes={};
 for(const t of tasks){const v=taskVisual(t,f,now);counts[v.kind]=(counts[v.kind]||0)+1;
  if(t.status==='queued'){const type=queueType(t);queuedTypes[type]=(queuedTypes[type]||0)+1;}
  if(f.stale||v.pose==='walk')continue;
  if(!groups.has(v.actor))groups.set(v.actor,{key:v.actor,pose:v.pose,tasks:[],visual:v,execution:t.execution,assignee:t.assignee});
  const g=groups.get(v.actor);g.tasks.push(t.id);
  const rank={alert:3,work:2,review:1};if(rank[v.pose]>rank[g.pose]){g.pose=v.pose;g.visual=v;}
 }
 const actors=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)),used=new Set(),bindings={...previous};
 const fits=(a,i)=>Number.isInteger(i)&&!!seats[i]&&!used.has(i)&&(a.pose!=='work'||seats[i].computer);
 for(const a of actors)if(fits(a,previous[a.key])){a.slot=previous[a.key];used.add(a.slot);}
 for(const a of actors)if(a.slot==null){const i=seats.findIndex((_,i)=>fits(a,i));if(i>=0){a.slot=i;used.add(i);for(const key of Object.keys(bindings))if(key!==a.key&&bindings[key]===i)delete bindings[key];bindings[a.key]=i;}}
 const overflow=actors.filter(a=>a.slot==null).reduce((n,a)=>n+a.tasks.length,0),parts=[];
 if(f.stale)parts.push('資料過舊');else{
  for(const [key,label] of [['manual','人工執行中'],['work','工作中'],['interrupted','回報中斷／待確認'],['queued','排隊中'],['review','待驗收'],['blocked','卡住待處理'],['failed','執行失敗']])if(counts[key])parts.push(label+' '+counts[key]+(key==='queued'?'（'+['人工','Grok','Agent','Claude AI','未知類型'].filter(type=>queuedTypes[type]).map(type=>type+' 待領 '+queuedTypes[type]).join('、')+'）':''));
  if(counts.queued)parts.push('尚未領取／無人執行 '+counts.queued);
  if(!parts.length)parts.push(counts.done?'已結束 '+counts.done:snapshot?.countsLimited?'任務列表未完整':'無任務');
 }
 if(overflow)parts.push('工位不足／未展示 '+overflow);
 if(snapshot?.countsLimited&&!parts.includes('任務列表未完整'))parts.push('列表未完整');
 if(roles.length)parts.push('舊排程 '+roles.length+' 組');
 return {stale:f.stale,badge:parts.join(' · '),actors,bindings,overflow,counts,updated:updateLabel(snapshot,now)};
}
// No clock/global DOM/THREE dependency. Reduced motion changes movement, not meaning or seat.
function personPose({base,seat,pose='walk',phase=0,time=0,reduced=false}){
 const seated=!!seat&&['work','review'].includes(pose),alert=pose==='alert',cycle=(time*.001+phase*3)%24,walking=!reduced&&!seated&&!alert&&cycle>3&&cycle<16;
 const progress=walking?(cycle-3)/13:0,excursion=Math.pow(Math.sin(progress*Math.PI),2)*.9,target=seated?seat:base;
 const wave=reduced?0:Math.sin(time*.007+phase),typing=seated&&pose==='work'&&!reduced,resting=seated&&pose==='review';
 // Keep the rest silhouette readable from the default overhead camera: 31-degree
 // recline, nearly vertical upper arms in world space, hands drawn inward over thighs.
 // Arm angles are relative to the reclined torso, not the floor.
 return {x:target.x+(walking?(base.x>0?-1:1)*excursion:0),y:target.y+(walking?Math.abs(wave)*.025:0),z:target.z+(walking?excursion*.12:0),rotation:seated?seat.rotation:alert?Math.PI:walking?(progress<.5?(base.x>0?-Math.PI/2:Math.PI/2):(base.x>0?Math.PI/2:-Math.PI/2)):(base.x>0?-.45:.35),seated,walking,typing,alert,reviewBadge:resting,leg:seated?-Math.PI/2:walking?wave*.35:0,knee:seated?Math.PI/2:0,recline:resting?-.55:0,armInward:resting?.24:0,arm:seated?(pose==='work'?-1.1:.32):alert?-.4:walking?-wave*.3:0,elbow:seated?(pose==='work'?-.47:-1.25):-.15,handMotion:typing?Math.sin(time*.005+phase)*.035:0,lean:alert?.12:0};
}

root.ForesightWorkroomModel={metrics,duration,taskState,taskStats,taskBadge,isUatOnly,freshness,updateLabel,runningConfirmed,actorKey,queueType,taskVisual,chairSeat,deskSeat,transformSeat,roomPlan,personPose,STALE_AFTER_MS};if(typeof module!=='undefined')module.exports=root.ForesightWorkroomModel;
})(typeof window==='undefined'?globalThis:window);
